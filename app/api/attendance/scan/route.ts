import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatPHTime, getDateOnlyPH, getPHCalendarParts, nowInPH } from "@/lib/time";
import { getAttendanceBlockReason } from "@/lib/attendance-guard";
import { syncMembershipPenaltyInTx } from "@/lib/membership-penalty";

function normalizeQrCode(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  const directMatch = upper.match(/\bGYM-(MEM|NMB|WLK|WIR)-[A-Z0-9-]{5,30}\b/i)?.[0];
  if (directMatch) return directMatch.toUpperCase();

  try {
    const decoded = decodeURIComponent(trimmed).toUpperCase();
    const decodedMatch = decoded.match(/\bGYM-(MEM|NMB|WLK|WIR)-[A-Z0-9-]{5,30}\b/i)?.[0];
    if (decodedMatch) return decodedMatch.toUpperCase();
  } catch {
    // keep original when decode fails
  }

  return upper;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { qrCode?: string; userId?: string };
    const userId = body.userId?.trim();
    const qrCode = body.qrCode?.trim();
    if (!userId && !qrCode) {
      return NextResponse.json({ success: false, error: "qrCode or userId is required" }, { status: 400 });
    }

    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : await prisma.user.findUnique({ where: { qrCode: normalizeQrCode(qrCode ?? "") } });
    if (!user) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const now = nowInPH();
    const blockReason = getAttendanceBlockReason(
      {
        role: user.role,
        freezeStatus: user.freezeStatus,
        freezeEndsAt: user.freezeEndsAt,
        monthlyExpiryDate: user.monthlyExpiryDate,
      },
      now,
    );
    if (blockReason) return NextResponse.json({ success: false, error: blockReason }, { status: 403 });

    const todayPH = getDateOnlyPH(now);
    const phParts = getPHCalendarParts(now);

    // Time-out must run before duplicate-window checks, otherwise a quick manual second save / rescan
    // right after time-in hits "duplicate" instead of closing the open session.
    const openSession = await prisma.attendance.findFirst({
      where: { userId: user.id, date: todayPH, checkedOutAt: null },
      orderBy: { scannedAt: "desc" },
      select: { id: true, timeIn: true, scannedAt: true },
    });

    if (openSession) {
      const closed = await prisma.attendance.update({
        where: { id: openSession.id },
        data: {
          checkedOutAt: now,
          timeOut: formatPHTime(now),
          scannedAt: now,
        },
      });
      return NextResponse.json({
        success: true,
        action: "TIME_OUT",
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          timeIn: openSession.timeIn,
          timeOut: closed.timeOut,
          scannedAt: new Intl.DateTimeFormat("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: "Asia/Manila",
          }).format(now),
        },
      });
    }

    const DUPLICATE_WINDOW_MS = 4_000;
    const recentDuplicate = await prisma.attendance.findFirst({
      where: {
        userId: user.id,
        scannedAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
      },
      orderBy: { scannedAt: "desc" },
      select: { scannedAt: true, timeIn: true, timeOut: true },
    });
    if (recentDuplicate) {
      return NextResponse.json(
        {
          success: false,
          error: "Duplicate scan detected. Please wait a few seconds before rescanning.",
          lastScan: recentDuplicate.scannedAt,
          lastScanTime: recentDuplicate.timeOut ?? recentDuplicate.timeIn,
        },
        { status: 429 },
      );
    }

    const attendance = await prisma.$transaction(async (tx) => {
      const created = await tx.attendance.create({
        data: {
          userId: user.id,
          roleSnapshot: user.role,
          scannedAt: now,
          date: todayPH,
          timeIn: formatPHTime(now),
          dayOfWeek: phParts.weekday,
          month: phParts.month,
          year: phParts.year,
        },
      });
      if (user.role === "MEMBER") {
        await syncMembershipPenaltyInTx(tx, user.id);
      }
      return created;
    });

    return NextResponse.json({
      success: true,
      action: "TIME_IN",
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        timeIn: attendance.timeIn,
        timeOut: attendance.timeOut,
        scannedAt: new Intl.DateTimeFormat("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "Asia/Manila",
        }).format(attendance.scannedAt),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Scan failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

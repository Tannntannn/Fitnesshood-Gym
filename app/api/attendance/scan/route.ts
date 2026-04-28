import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatPHTime, getDateOnlyPH, getPHCalendarParts, nowInPH } from "@/lib/time";

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
    const todayPH = getDateOnlyPH(now);
    const phParts = getPHCalendarParts(now);
    const duplicate = await prisma.attendance.findFirst({
      // One attendance log per user per PH calendar day.
      where: { userId: user.id, date: todayPH },
      orderBy: { scannedAt: "desc" },
    });
    if (duplicate) {
      return NextResponse.json(
        { success: false, error: "Already scanned", lastScan: duplicate.scannedAt, lastScanTime: duplicate.timeIn },
        { status: 409 },
      );
    }

    const attendance = await prisma.attendance.create({
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

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        timeIn: attendance.timeIn,
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

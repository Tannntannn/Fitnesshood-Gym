import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatPHTime, getDateOnlyPH, nowInPH } from "@/lib/time";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { qrCode?: string };
    if (!body.qrCode) return NextResponse.json({ success: false, error: "qrCode is required" }, { status: 400 });
    const cleanedInput = body.qrCode.trim().toUpperCase();
    const extracted = cleanedInput.match(/GYM-(MEM|NMB|WLK|WIR)-[A-Z0-9-]{5,30}/)?.[0] ?? cleanedInput;

    const user = await prisma.user.findUnique({ where: { qrCode: extracted } });
    if (!user) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const now = nowInPH();
    const todayPH = getDateOnlyPH(now);
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
        dayOfWeek: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(now),
        month: now.getMonth() + 1,
        year: now.getFullYear(),
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

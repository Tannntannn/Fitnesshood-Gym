import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDateOnlyPH, nowInPH } from "@/lib/time";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const now = nowInPH();
    const todayPH = getDateOnlyPH(now);

    const [counts, activeCounts, recent, hourly] = await Promise.all([
      prisma.attendance.groupBy({
        by: ["roleSnapshot"],
        where: { date: todayPH },
        _count: { _all: true },
      }),
      prisma.attendance.groupBy({
        by: ["roleSnapshot"],
        where: { date: todayPH, checkedOutAt: null },
        _count: { _all: true },
      }),
      prisma.attendance.findMany({
        where: { date: todayPH },
        orderBy: { scannedAt: "desc" },
        take: 6,
        select: {
          id: true,
          scannedAt: true,
          timeIn: true,
          timeOut: true,
          roleSnapshot: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.attendance.groupBy({
        by: ["timeIn"],
        where: { date: todayPH },
        _count: { _all: true },
      }),
    ]);

    const totals = {
      MEMBER: 0,
      NON_MEMBER: 0,
      WALK_IN: 0,
      WALK_IN_REGULAR: 0,
    };
    for (const row of counts) {
      totals[row.roleSnapshot] = row._count._all;
    }
    const activeTotals = {
      MEMBER: 0,
      NON_MEMBER: 0,
      WALK_IN: 0,
      WALK_IN_REGULAR: 0,
    };
    for (const row of activeCounts) {
      activeTotals[row.roleSnapshot] = row._count._all;
    }

    const hourCounts = new Map<string, number>();
    for (const row of hourly) {
      const key = String(row.timeIn).split(":").slice(0, 1)[0] || "00";
      hourCounts.set(key, (hourCounts.get(key) ?? 0) + row._count._all);
    }
    const peakHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, count]) => ({ hour, count }));

    return NextResponse.json(
      {
        success: true,
        data: {
          date: todayPH,
          totals,
          activeTotals,
          totalAll: totals.MEMBER + totals.NON_MEMBER + totals.WALK_IN + totals.WALK_IN_REGULAR,
          currentPopulation: activeTotals.MEMBER + activeTotals.NON_MEMBER + activeTotals.WALK_IN + activeTotals.WALK_IN_REGULAR,
          peakHours,
          recent,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0, must-revalidate",
          Vary: "Cookie",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to load attendance summary.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}


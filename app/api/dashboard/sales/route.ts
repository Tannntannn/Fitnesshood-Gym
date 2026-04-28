import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDateOnlyPH, nowInPH } from "@/lib/time";

export async function GET() {
  try {
    const now = nowInPH();
    const todayStart = getDateOnlyPH(now);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [todayAgg, monthAgg, pendingAgg, memberStatusCounts] = await Promise.all([
      prisma.payment.aggregate({
        where: { paidAt: { gte: todayStart, lt: tomorrowStart } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { paidAt: { gte: monthStart, lt: nextMonthStart } },
        _sum: { amount: true },
      }),
      prisma.user.aggregate({
        where: { role: "MEMBER", remainingBalance: { gt: new Prisma.Decimal(0) } },
        _sum: { remainingBalance: true },
      }),
      prisma.user.groupBy({
        by: ["membershipStatus"],
        where: { role: "MEMBER" },
        _count: { _all: true },
      }),
    ]);

    const countMap = memberStatusCounts.reduce<Record<string, number>>((acc, row) => {
      acc[row.membershipStatus ?? "NO_EXPIRY"] = row._count._all;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        todaySales: Number(todayAgg._sum.amount ?? 0),
        monthSales: Number(monthAgg._sum.amount ?? 0),
        pendingBalance: Number(pendingAgg._sum.remainingBalance ?? 0),
        statusCounts: {
          active: countMap.ACTIVE ?? 0,
          warning: countMap.WARNING ?? 0,
          expired: countMap.EXPIRED ?? 0,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch dashboard sales metrics.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

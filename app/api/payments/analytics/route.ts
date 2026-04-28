import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { nowInPH } from "@/lib/time";

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeekMonday(date: Date): Date {
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = startOfDay(date);
  start.setDate(start.getDate() + diffToMonday);
  return start;
}

export async function GET() {
  try {
    const now = nowInPH();
    const todayStart = startOfDay(now);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const weekStart = startOfWeekMonday(now);
    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const yearStart = new Date(now.getFullYear(), 0, 1);
    const nextYearStart = new Date(now.getFullYear() + 1, 0, 1);

    const [todayAgg, weekAgg, monthAgg, yearAgg] = await Promise.all([
      prisma.payment.aggregate({
        where: { paidAt: { gte: todayStart, lt: tomorrowStart } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { paidAt: { gte: weekStart, lt: nextWeekStart } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { paidAt: { gte: monthStart, lt: nextMonthStart } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { paidAt: { gte: yearStart, lt: nextYearStart } },
        _sum: { amount: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        todayTotal: Number(todayAgg._sum.amount ?? 0),
        weekTotal: Number(weekAgg._sum.amount ?? 0),
        monthTotal: Number(monthAgg._sum.amount ?? 0),
        yearTotal: Number(yearAgg._sum.amount ?? 0),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch payment analytics.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { nowInPH } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const now = nowInPH();
    const horizon = addDays(now, 30);

    const y = now.getFullYear();
    const m = now.getMonth();
    const monthStart = new Date(y, m, 1);
    const monthEnd = new Date(y, m + 1, 1);

    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = addDays(dayStart, 1);

    const dow = dayStart.getDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() + diffToMonday);
    const weekEnd = addDays(weekStart, 7);

    const [
      totalActiveMemberships,
      expiringMembershipFees,
      expiredMembershipFees,
      monthlyRenewalCount,
      membershipContractRevenueMonth,
      monthlyFeeRevenueMonth,
      monthlySales,
      dailySales,
      weeklySales,
      revenuePerTierRows,
    ] = await Promise.all([
      prisma.user.count({
        where: {
          role: "MEMBER",
          OR: [{ fullMembershipExpiry: { gte: now } }, { fullMembershipExpiry: null, membershipStatus: { in: ["ACTIVE", "WARNING"] } }],
        },
      }),
      prisma.user.count({
        where: {
          role: "MEMBER",
          fullMembershipExpiry: { gte: now, lte: horizon },
        },
      }),
      prisma.user.count({
        where: {
          role: "MEMBER",
          OR: [{ fullMembershipExpiry: { lt: now } }, { membershipStatus: "EXPIRED" }],
        },
      }),
      prisma.payment.count({
        where: {
          transactionType: "MONTHLY_FEE",
          paidAt: { gte: monthStart, lt: monthEnd },
        },
      }),
      prisma.payment.aggregate({
        where: {
          paidAt: { gte: monthStart, lt: monthEnd },
          OR: [{ transactionType: "MEMBERSHIP_CONTRACT" }, { transactionType: "LEGACY", service: { name: "Membership" } }],
        },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          paidAt: { gte: monthStart, lt: monthEnd },
          transactionType: "MONTHLY_FEE",
        },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          paidAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          paidAt: { gte: dayStart, lt: dayEnd },
        },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { paidAt: { gte: weekStart, lt: weekEnd } },
        _sum: { amount: true },
      }),
      prisma.$queryRaw<Array<{ tier: string | null; amount: number | null }>>`
        SELECT
          s."tier" AS "tier",
          COALESCE(SUM(p."amount"), 0)::float8 AS "amount"
        FROM "Payment" p
        INNER JOIN "Service" s ON s."id" = p."serviceId"
        WHERE p."paidAt" >= ${monthStart}
          AND p."paidAt" < ${monthEnd}
          AND p."transactionType" IN ('MEMBERSHIP_CONTRACT', 'MONTHLY_FEE', 'LEGACY')
        GROUP BY s."tier"
        ORDER BY COALESCE(SUM(p."amount"), 0) DESC
      `,
    ]);

    const membershipContractRevenueMonthAmount = Number(membershipContractRevenueMonth._sum.amount ?? 0);
    const monthlyFeeRevenueMonthAmount = Number(monthlyFeeRevenueMonth._sum.amount ?? 0);

    return NextResponse.json({
      success: true,
      data: {
        asOf: now.toISOString(),
        totalActiveMemberships,
        expiringMembershipFees,
        expiredMembershipFees,
        monthlyRenewalCount,
        membershipContractRevenueMonth: membershipContractRevenueMonthAmount,
        monthlyFeeRevenueMonth: monthlyFeeRevenueMonthAmount,
        monthlySales: Number(monthlySales._sum.amount ?? 0),
        dailySales: Number(dailySales._sum.amount ?? 0),
        weeklySales: Number(weeklySales._sum.amount ?? 0),
        revenuePerTier: revenuePerTierRows.map((row) => ({
          tier: row.tier ?? "Unassigned",
          amount: Number(row.amount ?? 0),
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to load membership KPIs.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

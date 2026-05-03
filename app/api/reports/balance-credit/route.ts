import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const limit = Math.min(100, Math.max(10, Number(params.get("limit") ?? 25) || 25));
    const skip = (page - 1) * limit;
    const query = (params.get("q") ?? "").trim();
    const tier = (params.get("tier") ?? "").trim();
    const statusFilter = (params.get("statusFilter") ?? "").trim();
    const now = new Date();

    const where: Record<string, unknown> = {
      role: "MEMBER" as const,
      ...(tier ? { membershipTier: tier } : {}),
      ...(query
        ? {
            OR: [
              { firstName: { contains: query, mode: "insensitive" as const } },
              { lastName: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    if (statusFilter === "BOTH_ACTIVE") {
      where.fullMembershipExpiry = { gte: now };
      where.monthlyExpiryDate = { gte: now };
    } else if (statusFilter === "BOTH_EXPIRED") {
      where.fullMembershipExpiry = { lt: now };
      where.monthlyExpiryDate = { lt: now };
    } else if (statusFilter === "MEMBERSHIP_EXPIRED") {
      where.fullMembershipExpiry = { lt: now };
      where.monthlyExpiryDate = { gte: now };
    } else if (statusFilter === "MONTHLY_EXPIRED") {
      where.fullMembershipExpiry = { gte: now };
      where.monthlyExpiryDate = { lt: now };
    } else if (statusFilter === "OVERDUE") {
      where.AND = [
        { remainingBalance: { gt: 0 } },
        {
          OR: [{ monthlyExpiryDate: { lt: now } }, { fullMembershipExpiry: { lt: now } }],
        },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [
          { membershipTier: { sort: "asc", nulls: "last" } },
          { lastName: "asc" },
          { firstName: "asc" },
        ],
        skip,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          membershipTier: true,
          remainingBalance: true,
          totalContractPrice: true,
          fullMembershipExpiry: true,
          monthlyExpiryDate: true,
          membershipStatus: true,
          loyaltyStars: true,
          payments: {
            orderBy: { paidAt: "desc" },
            take: 1,
            select: { paidAt: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const enrichedRows = rows.map((row) => {
      const remainingBalance = Number(row.remainingBalance ?? 0);
      const dueDate = row.monthlyExpiryDate ?? row.fullMembershipExpiry ?? null;
      const dueAt = dueDate ? new Date(dueDate) : null;
      const overdue = remainingBalance > 0 && Boolean(dueAt && dueAt.getTime() < now.getTime());
      return {
        ...row,
        dueDate,
        lastPaymentDate: row.payments[0]?.paidAt ?? null,
        status: overdue ? "OVERDUE" : remainingBalance > 0 ? "WITH_BALANCE" : "CLEARED",
      };
    });

    const summary = enrichedRows.reduce(
      (acc, row) => {
        const remainingBalance = Number(row.remainingBalance ?? 0);
        acc.totalOutstanding += remainingBalance;
        if (remainingBalance > 0) acc.membersWithBalance += 1;
        if (remainingBalance <= 0) acc.membersCleared += 1;
        if (row.status === "OVERDUE") acc.overdueMembers += 1;
        acc.totalStars += row.loyaltyStars ?? 0;
        return acc;
      },
      { totalOutstanding: 0, membersWithBalance: 0, membersCleared: 0, overdueMembers: 0, totalStars: 0 },
    );

    return NextResponse.json({
      success: true,
      data: enrichedRows,
      summary,
      meta: { page, limit, total, hasNextPage: skip + enrichedRows.length < total },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to load balance/credit report.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}


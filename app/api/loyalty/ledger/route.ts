import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { expireLoyaltyStarsIfInactive } from "@/lib/loyalty-expiration";
import { loyaltyLedgerActiveWhere } from "@/lib/loyalty-void";
import { nowInPH } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const userId = params.get("userId")?.trim() || undefined;
    const q = (params.get("q") ?? "").trim();
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const limit = Math.min(50, Math.max(5, Number(params.get("limit") ?? 20) || 20));
    const skip = (page - 1) * limit;

    const nameTerms = q.split(/\s+/).filter(Boolean);
    const userNameWhere =
      nameTerms.length > 0
        ? {
            AND: nameTerms.map((term) => ({
              OR: [
                { firstName: { contains: term, mode: "insensitive" as const } },
                { lastName: { contains: term, mode: "insensitive" as const } },
              ],
            })),
          }
        : undefined;

    const where =
      userId && userNameWhere
        ? { userId, user: userNameWhere }
        : userId
          ? { userId }
          : userNameWhere
            ? { user: userNameWhere }
            : undefined;
    const whereNonVoid = loyaltyLedgerActiveWhere(where);
    const [rows, total, rankings, totals] = await Promise.all([
      prisma.loyaltyLedger.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          userId: true,
          points: true,
          pointsEarned: true,
          pointsDeducted: true,
          remainingBalance: true,
          reason: true,
          reasonDetail: true,
          transactionReference: true,
          adminApproval: true,
          adjustedBy: true,
          adjustedAt: true,
          amountBasis: true,
          rewardUsed: true,
          notes: true,
          createdAt: true,
          claimId: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.loyaltyLedger.count({ where }),
      prisma.user.findMany({
        where: { loyaltyStars: { gt: 0 } },
        orderBy: [{ loyaltyStars: "desc" }, { lastName: "asc" }],
        take: 10,
        select: { id: true, firstName: true, lastName: true, loyaltyStars: true, role: true },
      }),
      prisma.loyaltyLedger.groupBy({
        by: ["userId"],
        where: whereNonVoid,
        _sum: { pointsEarned: true, pointsDeducted: true },
      }),
    ]);
    const totalIssued = totals.reduce((sum, row) => sum + Math.max(0, row._sum.pointsEarned ?? 0), 0);
    const totalClaimed = totals.reduce((sum, row) => sum + Math.max(0, row._sum.pointsDeducted ?? 0), 0);

    return NextResponse.json({
      success: true,
      data: rows,
      rankings,
      summary: { totalIssued, totalClaimed },
      meta: {
        page,
        limit,
        total,
        hasNextPage: skip + rows.length < total,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to load loyalty ledger.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as {
      userId?: string;
      points?: number;
      reason?: string;
      notes?: string;
      rewardUsed?: boolean;
    };
    const userId = body.userId?.trim() ?? "";
    const points = Number(body.points ?? 0);
    const reason = (body.reason ?? "").trim().toUpperCase();
    const notes = (body.notes ?? "").trim();
    const rewardUsed = Boolean(body.rewardUsed);
    if (!userId || !Number.isFinite(points) || points === 0 || !reason) {
      return NextResponse.json({ success: false, error: "userId, non-zero points, and reason are required." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      await expireLoyaltyStarsIfInactive(tx, userId, nowInPH(), session.admin.email);
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, loyaltyStars: true, firstName: true, lastName: true },
      });
      if (!user) throw new Error("User not found.");
      const nextStars = Math.max(0, (user.loyaltyStars ?? 0) + points);
      const pointsEarned = points > 0 ? points : 0;
      const pointsDeducted = points < 0 ? Math.abs(points) : 0;

      const row = await tx.loyaltyLedger.create({
        data: {
          userId,
          points,
          pointsEarned,
          pointsDeducted,
          remainingBalance: nextStars,
          reason,
          reasonDetail: notes || null,
          transactionReference: null,
          adminApproval: "APPROVED",
          adjustedBy: session.admin.email,
          adjustedAt: new Date(),
          amountBasis: null,
          rewardUsed,
          notes: `${notes ? `${notes} | ` : ""}by:${session.admin.email}`,
        },
        select: {
          id: true,
          userId: true,
          points: true,
          pointsEarned: true,
          pointsDeducted: true,
          remainingBalance: true,
          reason: true,
          reasonDetail: true,
          transactionReference: true,
          adminApproval: true,
          adjustedBy: true,
          adjustedAt: true,
          amountBasis: true,
          rewardUsed: true,
          notes: true,
          createdAt: true,
          claimId: true,
          user: { select: { firstName: true, lastName: true } },
        },
      });
      await tx.user.update({ where: { id: userId }, data: { loyaltyStars: nextStars } });
      return row;
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create loyalty adjustment.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}


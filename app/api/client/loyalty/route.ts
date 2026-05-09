import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getClientSessionCookieName, verifyClientSession } from "@/lib/client-session";
import { expireLoyaltyStarsIfInactive } from "@/lib/loyalty-expiration";
import { loyaltyLedgerActiveWhere } from "@/lib/loyalty-void";
import { nowInPH } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const cookieValue = cookies().get(getClientSessionCookieName())?.value;
    const userId = verifyClientSession(cookieValue);
    if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const limit = Math.min(30, Math.max(5, Number(params.get("limit") ?? 10) || 10));
    const skip = (page - 1) * limit;

    const { rows, total, profile, totals } = await prisma.$transaction(async (tx) => {
      await expireLoyaltyStarsIfInactive(tx, userId, nowInPH(), "CLIENT_VIEW");
      const [rows, total, profile, totals] = await Promise.all([
        tx.loyaltyLedger.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          select: {
            id: true,
            points: true,
            pointsEarned: true,
            pointsDeducted: true,
            remainingBalance: true,
            reason: true,
            reasonDetail: true,
            transactionReference: true,
            adminApproval: true,
            amountBasis: true,
            rewardUsed: true,
            notes: true,
            createdAt: true,
          },
        }),
        tx.loyaltyLedger.count({ where: { userId } }),
        tx.user.findUnique({
          where: { id: userId },
          select: { loyaltyStars: true },
        }),
        tx.loyaltyLedger.aggregate({
          where: loyaltyLedgerActiveWhere({ userId }),
          _sum: { pointsEarned: true, pointsDeducted: true },
        }),
      ]);
      return { rows, total, profile, totals };
    });

    return NextResponse.json(
      {
        success: true,
        data: rows,
        summary: {
          currentPoints: profile?.loyaltyStars ?? 0,
          currentStars: profile?.loyaltyStars ?? 0,
          totalEarned: totals._sum.pointsEarned ?? 0,
          totalUsed: totals._sum.pointsDeducted ?? 0,
        },
        meta: {
          page,
          limit,
          total,
          hasNextPage: skip + rows.length < total,
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
      { success: false, error: "Failed to load loyalty history.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}


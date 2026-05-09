import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { expireLoyaltyStarsIfInactive } from "@/lib/loyalty-expiration";
import { nowInPH } from "@/lib/time";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { action?: "APPROVE" | "REJECT"; notes?: string };
    const action = (body.action ?? "").trim().toUpperCase();
    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ success: false, error: "action must be APPROVE or REJECT." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.loyaltyClaim.findUnique({
        where: { id: params.id },
        select: { id: true, userId: true, rewardName: true, pointsRequired: true, status: true, user: { select: { loyaltyStars: true } } },
      });
      if (!claim) throw new Error("Claim not found.");
      if (claim.status !== "PENDING") throw new Error("Claim already processed.");

      await expireLoyaltyStarsIfInactive(tx, claim.userId, nowInPH(), session.admin.email);

      if (action === "REJECT") {
        return tx.loyaltyClaim.update({
          where: { id: params.id },
          data: {
            status: "REJECTED",
            approvedBy: session.admin.email,
            approvedAt: new Date(),
            notes: body.notes?.trim() || null,
          },
          select: {
            id: true,
            status: true,
            approvedBy: true,
            approvedAt: true,
            notes: true,
            user: { select: { firstName: true, lastName: true, loyaltyStars: true } },
          },
        });
      }

      const freshStars = await tx.user.findUnique({
        where: { id: claim.userId },
        select: { loyaltyStars: true },
      });
      const currentStars = freshStars?.loyaltyStars ?? 0;
      if (currentStars < claim.pointsRequired) {
        throw new Error("Insufficient points.");
      }
      const nextStars = currentStars - claim.pointsRequired;
      await tx.user.update({ where: { id: claim.userId }, data: { loyaltyStars: nextStars } });
      await tx.loyaltyLedger.create({
        data: {
          userId: claim.userId,
          points: -claim.pointsRequired,
          pointsEarned: 0,
          pointsDeducted: claim.pointsRequired,
          remainingBalance: nextStars,
          reason: "CLAIM_APPROVED",
          reasonDetail: claim.rewardName,
          transactionReference: claim.id,
          adminApproval: "APPROVED",
          adjustedBy: session.admin.email,
          adjustedAt: new Date(),
          claimId: claim.id,
          rewardUsed: true,
          notes: body.notes?.trim() || `Reward approved: ${claim.rewardName}`,
        },
      });
      return tx.loyaltyClaim.update({
        where: { id: params.id },
        data: {
          status: "APPROVED",
          approvedBy: session.admin.email,
          approvedAt: new Date(),
          notes: body.notes?.trim() || null,
        },
        select: {
          id: true,
          status: true,
          approvedBy: true,
          approvedAt: true,
          notes: true,
          user: { select: { firstName: true, lastName: true, loyaltyStars: true } },
        },
      });
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    const status = details.includes("Insufficient") || details.includes("already processed") ? 409 : 500;
    return NextResponse.json({ success: false, error: "Failed to process claim.", details }, { status });
  }
}

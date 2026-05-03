import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { isLoyaltyLedgerVoidedReason, LOYALTY_VOID_REVERSAL_REASON } from "@/lib/loyalty-void";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { points?: number; reason?: string; notes?: string; rewardUsed?: boolean };
    const nextPoints = Number(body.points ?? 0);
    const reason = (body.reason ?? "").trim();
    const notes = (body.notes ?? "").trim();
    if (!Number.isFinite(nextPoints) || nextPoints === 0 || !reason) {
      return NextResponse.json({ success: false, error: "points and reason are required." }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.loyaltyLedger.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          userId: true,
          points: true,
          reason: true,
          user: { select: { loyaltyStars: true } },
        },
      });
      if (!current) throw new Error("Loyalty record not found.");
      if (isLoyaltyLedgerVoidedReason(current.reason)) throw new Error("Voided entries cannot be edited.");
      if (current.reason === LOYALTY_VOID_REVERSAL_REASON) throw new Error("Reversal entries cannot be edited.");
      const delta = nextPoints - current.points;
      const nextStars = Math.max(0, (current.user.loyaltyStars ?? 0) + delta);
      const nextEarned = nextPoints > 0 ? nextPoints : 0;
      const nextDeducted = nextPoints < 0 ? Math.abs(nextPoints) : 0;

      const row = await tx.loyaltyLedger.update({
        where: { id: params.id },
        data: {
          points: nextPoints,
          pointsEarned: nextEarned,
          pointsDeducted: nextDeducted,
          remainingBalance: nextStars,
          reason,
          reasonDetail: notes || null,
          adminApproval: "APPROVED",
          adjustedBy: session.admin.email,
          adjustedAt: new Date(),
          notes: `${notes ? `${notes} | ` : ""}edited-by:${session.admin.email}`,
          rewardUsed: typeof body.rewardUsed === "boolean" ? body.rewardUsed : undefined,
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
          user: { select: { firstName: true, lastName: true } },
        },
      });
      await tx.user.update({ where: { id: current.userId }, data: { loyaltyStars: nextStars } });
      return row;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update loyalty record.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/** Permanently removes the ledger row and reverses its effect on `User.loyaltyStars` (and reopens claims when applicable). */
export async function DELETE(request: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const deleteReason = (body.reason ?? "").trim();
    if (!deleteReason) {
      return NextResponse.json({ success: false, error: "A reason is required to delete this entry." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.loyaltyLedger.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          userId: true,
          points: true,
          reason: true,
          claimId: true,
        },
      });
      if (!entry) throw new Error("Loyalty record not found.");
      if (entry.reason === LOYALTY_VOID_REVERSAL_REASON) {
        throw new Error(
          "Reversal rows cannot be deleted alone. Delete the voided original entry to remove both lines, or void the original transaction instead.",
        );
      }

      const user = await tx.user.findUnique({
        where: { id: entry.userId },
        select: { loyaltyStars: true },
      });
      if (!user) throw new Error("Member not found.");

      let nextStars = user.loyaltyStars ?? 0;

      if (isLoyaltyLedgerVoidedReason(entry.reason)) {
        const reversals = await tx.loyaltyLedger.findMany({
          where: {
            transactionReference: entry.id,
            reason: LOYALTY_VOID_REVERSAL_REASON,
          },
          select: { id: true, points: true },
        });
        for (const r of reversals) {
          nextStars -= r.points;
        }
        nextStars = Math.max(0, nextStars);
        if (reversals.length) {
          await tx.loyaltyLedger.deleteMany({ where: { id: { in: reversals.map((x) => x.id) } } });
        }
        await tx.loyaltyLedger.delete({ where: { id: entry.id } });
        await tx.user.update({
          where: { id: entry.userId },
          data: { loyaltyStars: nextStars },
        });
        return { deletedId: entry.id, removedReversalIds: reversals.map((x) => x.id), loyaltyStars: nextStars };
      }

      nextStars = Math.max(0, nextStars - entry.points);

      if (entry.reason === "CLAIM_APPROVED" && entry.claimId) {
        const claim = await tx.loyaltyClaim.findUnique({
          where: { id: entry.claimId },
          select: { status: true, notes: true },
        });
        if (claim?.status === "APPROVED") {
          const prior = (claim.notes ?? "").trim();
          const suffix = `Reopened after ledger delete by ${session.admin.email}: ${deleteReason}`;
          await tx.loyaltyClaim.update({
            where: { id: entry.claimId },
            data: {
              status: "PENDING",
              approvedBy: null,
              approvedAt: null,
              notes: prior ? `${prior} | ${suffix}` : suffix,
            },
          });
        }
      }

      await tx.loyaltyLedger.delete({ where: { id: entry.id } });
      await tx.user.update({
        where: { id: entry.userId },
        data: { loyaltyStars: nextStars },
      });

      return { deletedId: entry.id, loyaltyStars: nextStars };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Loyalty record not found.") {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
    if (
      message.startsWith("Reversal rows cannot") ||
      message === "Member not found."
    ) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: "Failed to delete loyalty record.", details: message },
      { status: 500 },
    );
  }
}

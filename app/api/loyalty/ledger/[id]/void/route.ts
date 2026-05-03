import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  LOYALTY_VOIDED_ENTRY_REASON,
  LOYALTY_VOID_REVERSAL_REASON,
  isLoyaltyLedgerVoidedReason,
} from "@/lib/loyalty-void";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

/** POST body: { reason: string } — marks entry voided and restores member balance (inverse of entry.points). */
export async function POST(request: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { reason?: string };
    const voidReason = (body.reason ?? "").trim();
    if (!voidReason) {
      return NextResponse.json({ success: false, error: "A reason is required to void this entry." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.loyaltyLedger.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          userId: true,
          points: true,
          pointsEarned: true,
          pointsDeducted: true,
          reason: true,
          notes: true,
          paymentId: true,
          claimId: true,
        },
      });
      if (!entry) throw new Error("Loyalty record not found.");
      if (isLoyaltyLedgerVoidedReason(entry.reason)) throw new Error("This entry is already voided.");
      if (entry.reason === LOYALTY_VOID_REVERSAL_REASON) throw new Error("Reversal rows cannot be voided.");

      const user = await tx.user.findUnique({
        where: { id: entry.userId },
        select: { loyaltyStars: true, role: true },
      });
      if (!user || user.role !== "MEMBER") throw new Error("Member not found.");

      const reversalPoints = -entry.points;
      const nextBalance = Math.max(0, (user.loyaltyStars ?? 0) + reversalPoints);

      const voidStamp = new Date().toISOString();
      const priorNotes = (entry.notes ?? "").trim();
      const voidNotes = `[VOID:${voidReason}] was ${entry.reason} ${entry.points}pts (e${entry.pointsEarned}/d${entry.pointsDeducted}) at ${voidStamp} by ${session.admin.email}${priorNotes ? ` | prior:${priorNotes}` : ""}`;

      await tx.loyaltyLedger.update({
        where: { id: entry.id },
        data: {
          points: 0,
          pointsEarned: 0,
          pointsDeducted: 0,
          reason: LOYALTY_VOIDED_ENTRY_REASON,
          notes: voidNotes,
        },
      });

      const reversal = await tx.loyaltyLedger.create({
        data: {
          userId: entry.userId,
          paymentId: null,
          claimId: null,
          points: reversalPoints,
          pointsEarned: 0,
          pointsDeducted: 0,
          remainingBalance: nextBalance,
          reason: LOYALTY_VOID_REVERSAL_REASON,
          reasonDetail: `Reverses entry ${entry.id}`,
          transactionReference: entry.id,
          adminApproval: "APPROVED",
          adjustedBy: session.admin.email,
          adjustedAt: new Date(),
          amountBasis: null,
          rewardUsed: false,
          notes: `Void of ${entry.id} | ${voidReason} | by:${session.admin.email}`,
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
          notes: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true } },
        },
      });

      await tx.user.update({
        where: { id: entry.userId },
        data: { loyaltyStars: nextBalance },
      });

      return { voidedId: entry.id, reversal };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Loyalty record not found.") {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
    const clientErrors = [
      "This entry is already voided.",
      "Reversal rows cannot be voided.",
      "Member not found.",
    ];
    if (clientErrors.includes(message)) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

import { addMonths } from "date-fns";
import type { Prisma } from "@prisma/client";
import { LOYALTY_VOIDED_ENTRY_REASON } from "@/lib/loyalty-void";
import { nowInPH } from "@/lib/time";

/** Ledger rows with this reason zero out balance after inactivity (see `LOYALTY_INACTIVITY_EXPIRE_MONTHS`). */
export const LOYALTY_POINTS_EXPIRED_REASON = "POINTS_EXPIRED";

/** No earn/redemption (non-expiry, non-void ledger activity) for this many months → balance resets to 0. */
export const LOYALTY_INACTIVITY_EXPIRE_MONTHS = 6;

export function loyaltyReasonExcludedFromActivityClock(reason: string): boolean {
  return reason === LOYALTY_POINTS_EXPIRED_REASON || reason === LOYALTY_VOIDED_ENTRY_REASON;
}

/** Latest ledger activity that counts toward the inactivity clock (excludes expiry + void shells). */
export async function getLoyaltyLastActivityAt(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<Date | null> {
  const row = await tx.loyaltyLedger.findFirst({
    where: {
      userId,
      reason: { notIn: [LOYALTY_POINTS_EXPIRED_REASON, LOYALTY_VOIDED_ENTRY_REASON] },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

/**
 * If the member has a positive balance and their last qualifying ledger activity is older than
 * `LOYALTY_INACTIVITY_EXPIRE_MONTHS`, creates a `POINTS_EXPIRED` row and sets `loyaltyStars` to 0.
 */
export async function expireLoyaltyStarsIfInactive(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date = nowInPH(),
  adjustedByLabel = "SYSTEM",
): Promise<{ expired: boolean; pointsRemoved: number }> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, loyaltyStars: true },
  });
  if (!user || user.role !== "MEMBER") return { expired: false, pointsRemoved: 0 };

  const balance = Math.max(0, user.loyaltyStars ?? 0);
  if (balance <= 0) return { expired: false, pointsRemoved: 0 };

  const lastAt = await getLoyaltyLastActivityAt(tx, userId);
  if (!lastAt) return { expired: false, pointsRemoved: 0 };

  const deadline = addMonths(lastAt, LOYALTY_INACTIVITY_EXPIRE_MONTHS);
  if (deadline.getTime() > now.getTime()) return { expired: false, pointsRemoved: 0 };

  await tx.loyaltyLedger.create({
    data: {
      userId,
      paymentId: null,
      points: -balance,
      pointsEarned: 0,
      pointsDeducted: balance,
      remainingBalance: 0,
      reason: LOYALTY_POINTS_EXPIRED_REASON,
      reasonDetail: `Points expired: no earn or redemption for ${LOYALTY_INACTIVITY_EXPIRE_MONTHS} months.`,
      transactionReference: null,
      adminApproval: "APPROVED",
      adjustedBy: adjustedByLabel,
      adjustedAt: now,
      amountBasis: null,
      rewardUsed: false,
      notes: `Automatic inactivity expiration (deadline ${deadline.toISOString()}).`,
    },
  });
  await tx.user.update({ where: { id: userId }, data: { loyaltyStars: 0 } });
  return { expired: true, pointsRemoved: balance };
}

import type { Prisma } from "@prisma/client";

/** Stored in `LoyaltyLedger.reason` when an entry is voided (no extra DB columns). */
export const LOYALTY_VOIDED_ENTRY_REASON = "VOIDED_ENTRY";

/** Reversal row created when voiding; restores member balance. */
export const LOYALTY_VOID_REVERSAL_REASON = "VOID_REVERSAL";

export function isLoyaltyLedgerVoidedReason(reason: string): boolean {
  return reason === LOYALTY_VOIDED_ENTRY_REASON;
}

/** Admin reason text saved in notes as `[VOID:…]`. */
export function parseLoyaltyVoidAdminReason(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/^\[VOID:([^\]]+)\]/);
  return m?.[1]?.trim() ?? null;
}

/** Exclude voided originals from earned/deducted aggregates. */
export function loyaltyLedgerActiveWhere(
  base: Prisma.LoyaltyLedgerWhereInput | undefined,
): Prisma.LoyaltyLedgerWhereInput {
  const notVoided = { reason: { not: LOYALTY_VOIDED_ENTRY_REASON } };
  if (base === undefined) return notVoided;
  return { AND: [base, notVoided] };
}

import type { UserRole } from "@prisma/client";

/** ₱100 paid (after discount, final amount) = 1 loyalty point. */
export const PESO_PER_LOYALTY_POINT = 100;

const DEFAULT_EARNING_TYPES = new Set([
  "MONTHLY_FEE",
  "MEMBERSHIP_CONTRACT",
  "ADD_ON",
  "OTHER",
  "LEGACY",
]);

/**
 * Comma-separated PaymentTransactionType values, e.g.
 * `MONTHLY_FEE,MEMBERSHIP_CONTRACT,ADD_ON,OTHER,LEGACY`
 * If unset, defaults include all of the above (excludes WALK_IN).
 */
export function getLoyaltyEarningTransactionTypes(): Set<string> {
  const raw = process.env.LOYALTY_EARNING_TRANSACTION_TYPES?.trim();
  if (!raw) return new Set(DEFAULT_EARNING_TYPES);
  const set = new Set<string>();
  for (const part of raw.split(",")) {
    const t = part.trim().toUpperCase();
    if (t) set.add(t);
  }
  return set.size > 0 ? set : new Set(DEFAULT_EARNING_TYPES);
}

export function loyaltyPointsFromPesoAmount(finalAmountPaid: number): number {
  if (!Number.isFinite(finalAmountPaid) || finalAmountPaid <= 0) return 0;
  return Math.floor(finalAmountPaid / PESO_PER_LOYALTY_POINT);
}

export function memberPaymentEarnsLoyalty(role: UserRole, transactionType: string): boolean {
  if (role !== "MEMBER") return false;
  return getLoyaltyEarningTransactionTypes().has(transactionType.toUpperCase());
}

/** Human-readable source for ledger / receipts. */
export function describePaymentLoyaltySource(
  transactionType: string,
  serviceName: string,
  customAddOnLabel?: string | null,
): string {
  const custom = (customAddOnLabel ?? "").trim();
  switch (transactionType) {
    case "MONTHLY_FEE":
      return "Monthly payment";
    case "MEMBERSHIP_CONTRACT":
      return "Membership fee / contract payment";
    case "ADD_ON":
      return custom ? `Add-on: ${custom}` : "Add-on payment";
    case "WALK_IN":
      return "Walk-in payment";
    case "OTHER":
      if (custom) return `One-time add-on: ${custom}`;
      return serviceName ? `Service: ${serviceName}` : "Approved service payment";
    case "LEGACY":
      return "Recorded payment (legacy)";
    default:
      return serviceName ? `${transactionType} · ${serviceName}` : transactionType;
  }
}

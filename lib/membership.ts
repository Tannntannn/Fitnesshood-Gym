import { differenceInCalendarDays } from "date-fns";
import { nowInPH } from "@/lib/time";

export type MembershipStatus = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "NO_EXPIRY";

export function getMembershipDaysLeft(expiry: Date | string | null | undefined): number | null {
  if (!expiry) return null;
  return differenceInCalendarDays(new Date(expiry), nowInPH());
}

export function getMembershipStatus(expiry: Date | string | null | undefined): MembershipStatus {
  const daysLeft = getMembershipDaysLeft(expiry);
  if (daysLeft === null) return "NO_EXPIRY";
  if (daysLeft < 0) return "EXPIRED";
  if (daysLeft <= 7) return "EXPIRING_SOON";
  return "ACTIVE";
}

export function getTierDisplayName(tier: string | null | undefined): string {
  if (!tier || !tier.trim()) return "Unassigned";
  return tier;
}

export function inferMembershipTier(input: {
  membershipTier?: string | null;
  lockInLabel?: string | null;
  monthlyFeeLabel?: string | null;
  membershipFeeLabel?: string | null;
  membershipNotes?: string | null;
}): string {
  const direct = input.membershipTier?.replace(/\u00a0/g, " ").trim();
  if (direct) return direct;

  const lockIn = (input.lockInLabel ?? "").toLowerCase();
  const monthly = (input.monthlyFeeLabel ?? "").toLowerCase();
  const fee = (input.membershipFeeLabel ?? "").toLowerCase();
  const notes = (input.membershipNotes ?? "").toLowerCase();
  const blob = `${lockIn} ${monthly} ${fee} ${notes}`;

  if (blob.includes("founding")) return "Founding Member";
  if (blob.includes("student")) return "Students";
  if (lockIn.includes("12 months") && monthly.includes("900")) return "Platinum";
  if (lockIn.includes("3 months") && monthly.includes("900")) return "Students";
  if (monthly.includes("1200")) return "Bronze";
  if (monthly.includes("1000")) return "Silver";
  if (monthly.includes("950")) return "Gold";
  if (lockIn.includes("12 months")) return "Platinum";

  if (lockIn.includes("no lock")) return "Bronze";
  if (lockIn.includes("3 months")) return "Students";
  if (lockIn.includes("6 months")) return "Silver";
  if (lockIn.includes("12 months")) return "Platinum";

  return "Unassigned";
}

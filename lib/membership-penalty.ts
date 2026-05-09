import { Prisma, type MembershipPenaltySource, type User } from "@prisma/client";
import { getMembershipDaysLeft, getMembershipStatus, inferMembershipTier } from "@/lib/membership";
import { nowInPH } from "@/lib/time";

export type MembershipPenaltyUserSlice = Pick<
  User,
  | "role"
  | "membershipExpiry"
  | "membershipTier"
  | "lockInLabel"
  | "monthlyFeeLabel"
  | "membershipFeeLabel"
  | "membershipNotes"
  | "monthlyExpiryDate"
  | "remainingBalance"
  | "freezeStatus"
  | "freezeEndsAt"
  | "membershipPenalty"
  | "membershipPenaltySource"
>;

function isFreezeActiveForPenalty(user: Pick<User, "freezeStatus" | "freezeEndsAt">, now: Date): boolean {
  const st = (user.freezeStatus ?? "").trim().toUpperCase();
  if (st !== "ACTIVE") return false;
  if (!user.freezeEndsAt) return true;
  return user.freezeEndsAt.getTime() >= now.getTime();
}

/** Silver, Gold, Platinum contract tiers only (case-insensitive). */
export function isPenaltyEligibleTier(tierLabel: string | null | undefined): boolean {
  const t = (tierLabel ?? "").trim().toLowerCase();
  return t === "silver" || t === "gold" || t === "platinum";
}

export function resolveMemberTierLabel(user: MembershipPenaltyUserSlice): string {
  const direct = user.membershipTier?.replace(/\u00a0/g, " ").trim();
  if (direct) return direct;
  return inferMembershipTier({
    membershipTier: user.membershipTier,
    lockInLabel: user.lockInLabel,
    monthlyFeeLabel: user.monthlyFeeLabel,
    membershipFeeLabel: user.membershipFeeLabel,
    membershipNotes: user.membershipNotes,
  });
}

const BALANCE_EPSILON = 0.009;

function owesContractBalance(user: MembershipPenaltyUserSlice): boolean {
  return Number(user.remainingBalance ?? 0) > BALANCE_EPSILON;
}

/**
 * Same access horizon as Members Management roster: prefer `monthlyExpiryDate` (rolling monthly cycle),
 * not the full lock-in date on `membershipExpiry` when both exist.
 * Rule: expired access + money still owed on contract → auto penalty (all tiers).
 */
export function isMembershipExpiredForPenalty(user: MembershipPenaltyUserSlice): boolean {
  const accessExpiry = user.monthlyExpiryDate ?? user.membershipExpiry;
  return getMembershipStatus(accessExpiry) === "EXPIRED";
}

/**
 * Silver/Gold/Platinum: monthly cycle missed while contract balance remains (membership may still be active).
 * Uses the same calendar-day logic as days-left in the dashboard.
 */
export function isMonthlyCyclePastDueForPenalty(user: MembershipPenaltyUserSlice): boolean {
  const tier = resolveMemberTierLabel(user);
  if (!isPenaltyEligibleTier(tier)) return false;
  const daysLeft = user.monthlyExpiryDate ? getMembershipDaysLeft(user.monthlyExpiryDate) : null;
  return daysLeft !== null && daysLeft < 0;
}

/**
 * Auto penalty when not frozen and contract balance is owed, and either:
 * 1) Membership is expired (matches tier “Expired” sections + Penalty tab), or
 * 2) Silver/Gold/Platinum with monthly due date passed (calendar-based).
 */
export function shouldAutoApplyMembershipPenalty(user: MembershipPenaltyUserSlice, now: Date = nowInPH()): boolean {
  if (user.role !== "MEMBER") return false;
  if (isFreezeActiveForPenalty(user, now)) return false;
  if (!owesContractBalance(user)) return false;

  const expiredWithBalance = isMembershipExpiredForPenalty(user);
  const monthlyPastDue = isMonthlyCyclePastDueForPenalty(user);

  return expiredWithBalance || monthlyPastDue;
}

export function membershipPenaltySyncFromRules(user: MembershipPenaltyUserSlice): {
  membershipPenalty: boolean;
  membershipPenaltySource: MembershipPenaltySource | null;
} {
  const now = nowInPH();

  // Non-negotiable: expired membership + contract balance still owed → penalty (unless frozen).
  // Overrides a previous MANUAL "off" so admins do not have to re-open Members Management to refresh.
  if (
    user.role === "MEMBER" &&
    !isFreezeActiveForPenalty(user, now) &&
    owesContractBalance(user) &&
    isMembershipExpiredForPenalty(user)
  ) {
    return { membershipPenalty: true, membershipPenaltySource: "AUTO" };
  }

  if (user.membershipPenaltySource === "MANUAL") {
    return {
      membershipPenalty: user.membershipPenalty,
      membershipPenaltySource: "MANUAL",
    };
  }
  const should = shouldAutoApplyMembershipPenalty(user, now);
  return {
    membershipPenalty: should,
    membershipPenaltySource: should ? "AUTO" : null,
  };
}

/** Persist auto rules unless the row is under MANUAL admin control. */
export async function syncMembershipPenaltyInTx(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "MEMBER") return;
  const next = membershipPenaltySyncFromRules(user);
  if (
    next.membershipPenalty !== user.membershipPenalty ||
    next.membershipPenaltySource !== user.membershipPenaltySource
  ) {
    await tx.user.update({ where: { id: userId }, data: next });
  }
}

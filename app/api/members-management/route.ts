import { prisma } from "@/lib/prisma";
import { getMembershipDaysLeft, getMembershipStatus, inferMembershipTier, type MembershipStatus } from "@/lib/membership";
import { membershipPenaltySyncFromRules } from "@/lib/membership-penalty";
import { jsonNoStore } from "@/lib/http";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  effectiveLockInAnchorForDisplay,
  monthsFromMembershipPaymentRow,
  sumManualLockInMonthsAfterAnchor,
} from "@/lib/lock-in-cycle";

/** Vercel can otherwise cache GET handlers; this list must always reflect live DB. */
export const dynamic = "force-dynamic";

/** Paid toward contract when total is on file: total − remaining (never negative). */
function contractPaidToDateAmount(total: unknown, remaining: unknown): number | null {
  if (total == null || total === "") return null;
  const t = Number(total);
  if (!Number.isFinite(t)) return null;
  const r = Number(remaining ?? 0);
  return Math.max(0, t - (Number.isFinite(r) ? r : 0));
}

/** Roster "days left" / status use the rolling monthly due date when set (matches POS), not the full lock-in date on `membershipExpiry`. */
function accessExpiryForRoster(member: { monthlyExpiryDate: Date | null; membershipExpiry: Date | null }): Date | null {
  return member.monthlyExpiryDate ?? member.membershipExpiry ?? null;
}

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const members = await prisma.user.findMany({
      where: { role: "MEMBER" },
      orderBy: { lastName: "asc" },
      include: {
        addOnSubscriptions: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            addonName: true,
            dueDate: true,
            status: true,
            notes: true,
          },
        },
      },
    });
    const membershipServices = await prisma.service.findMany({
      where: { name: "Membership", isActive: true },
      select: { tier: true, contractMonths: true },
    });
    const tierLockInTemplateByTier = new Map(
      membershipServices.map((svc) => [svc.tier.trim().toLowerCase(), Math.max(0, Math.trunc(Number(svc.contractMonths) || 0))]),
    );

    const memberIds = members.map((m) => m.id);
    const fullPaidMembershipRows =
      memberIds.length > 0
        ? await prisma.payment.findMany({
            where: {
              userId: { in: memberIds },
              transactionType: "MONTHLY_FEE",
              collectionStatus: "FULLY_PAID",
              service: { name: "Membership" },
            },
            select: {
              userId: true,
              paidAt: true,
              grossAmount: true,
              amount: true,
              service: { select: { tier: true, monthlyRate: true } },
            },
          })
        : [];
    const manualLockRows =
      memberIds.length > 0
        ? await prisma.lockInManualEntry.findMany({
            where: { userId: { in: memberIds } },
            select: { userId: true, paidMonths: true, paidAt: true },
          })
        : [];
    const manualByUserId = new Map<string, Array<{ paidMonths: number; paidAt: Date }>>();
    for (const m of manualLockRows) {
      const list = manualByUserId.get(m.userId) ?? [];
      list.push({ paidMonths: m.paidMonths, paidAt: m.paidAt });
      manualByUserId.set(m.userId, list);
    }
    const lastScanRows =
      memberIds.length > 0
        ? await prisma.attendance.groupBy({
            by: ["userId"],
            where: { userId: { in: memberIds } },
            _max: { scannedAt: true },
          })
        : [];
    const lastAttendanceByUserId = new Map(
      lastScanRows.map((r) => [r.userId, r._max.scannedAt ? r._max.scannedAt.toISOString() : null]),
    );

    for (const member of members) {
      const next = membershipPenaltySyncFromRules(member);
      if (
        next.membershipPenalty !== member.membershipPenalty ||
        next.membershipPenaltySource !== member.membershipPenaltySource
      ) {
        await prisma.user.update({
          where: { id: member.id },
          data: next,
        });
        member.membershipPenalty = next.membershipPenalty;
        member.membershipPenaltySource = next.membershipPenaltySource;
      }
    }

    const data = members.map((member) => {
      const paid = contractPaidToDateAmount(member.totalContractPrice, member.remainingBalance);
      const inferredTier = inferMembershipTier({
        membershipTier: member.membershipTier,
        lockInLabel: member.lockInLabel,
        monthlyFeeLabel: member.monthlyFeeLabel,
        membershipFeeLabel: member.membershipFeeLabel,
        membershipNotes: member.membershipNotes,
      });
      return {
        ...member,
        totalContractPrice: member.totalContractPrice != null ? String(member.totalContractPrice) : null,
        tier: inferredTier,
        tierLockInTemplateMonths: tierLockInTemplateByTier.get(inferredTier.trim().toLowerCase()) ?? null,
        ...(() => {
          const template = tierLockInTemplateByTier.get(inferredTier.trim().toLowerCase());
          if (template == null || template <= 0) {
            return {
              tierLockInPaidMonths: null as number | null,
              tierLockInRosterStartAt: member.membershipStart ? member.membershipStart.toISOString() : null,
            };
          }
          const tierLower = inferredTier.trim().toLowerCase();
          const tierRows = fullPaidMembershipRows.filter(
            (row) => row.userId === member.id && row.service.tier.trim().toLowerCase() === tierLower,
          );
          const anchor = effectiveLockInAnchorForDisplay(
            (member as { lockInCycleAnchorAt?: Date | null }).lockInCycleAnchorAt,
            template,
            tierRows,
          );
          let sum = 0;
          const rosterStartCandidates: Date[] = [];
          if (member.membershipStart) rosterStartCandidates.push(member.membershipStart);
          for (const row of tierRows) {
            if (anchor && row.paidAt.getTime() <= anchor.getTime()) continue;
            sum += monthsFromMembershipPaymentRow(row);
            rosterStartCandidates.push(row.paidAt);
          }
          const manuals = manualByUserId.get(member.id) ?? [];
          sum += sumManualLockInMonthsAfterAnchor(manuals, anchor);
          for (const me of manuals) {
            if (anchor && me.paidAt.getTime() <= anchor.getTime()) continue;
            rosterStartCandidates.push(me.paidAt);
          }
          const paid = Math.max(0, Math.min(template, sum));
          let tierLockInRosterStartAt: string | null = null;
          if (rosterStartCandidates.length > 0) {
            const earliest = rosterStartCandidates.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
            tierLockInRosterStartAt = earliest.toISOString();
          }
          return { tierLockInPaidMonths: paid, tierLockInRosterStartAt };
        })(),
        daysLeft: getMembershipDaysLeft(accessExpiryForRoster(member)),
        membershipStatus: getMembershipStatus(accessExpiryForRoster(member)) as MembershipStatus,
        contractPaidToDate: paid != null ? String(paid) : null,
        lastAttendanceAt: lastAttendanceByUserId.get(member.id) ?? null,
      };
    });

    return jsonNoStore({ success: true, data });
  } catch (error) {
    return jsonNoStore(
      { success: false, error: "Failed to fetch members management data", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

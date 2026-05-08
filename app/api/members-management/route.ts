import { prisma } from "@/lib/prisma";
import { getMembershipDaysLeft, getMembershipStatus, inferMembershipTier } from "@/lib/membership";
import { membershipPenaltySyncFromRules } from "@/lib/membership-penalty";
import { jsonNoStore } from "@/lib/http";
import { requireAdminSession } from "@/lib/admin-auth";

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

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const members = await prisma.user.findMany({
      where: { role: "MEMBER" },
      orderBy: { lastName: "asc" },
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
              grossAmount: true,
              amount: true,
              service: { select: { tier: true, monthlyRate: true } },
            },
          })
        : [];
    const paidTierMonthsByUser = new Map<string, number>();
    for (const row of fullPaidMembershipRows) {
      const key = `${row.userId}::${row.service.tier.trim().toLowerCase()}`;
      const monthlyRate = Number(row.service.monthlyRate);
      const gross = Number(row.grossAmount ?? row.amount ?? 0);
      const paidMonths =
        monthlyRate > 0 && Number.isFinite(monthlyRate)
          ? Math.max(1, Math.trunc(Math.round(gross / monthlyRate) || 1))
          : 1;
      paidTierMonthsByUser.set(key, (paidTierMonthsByUser.get(key) ?? 0) + paidMonths);
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
        tierLockInPaidMonths: (() => {
          const template = tierLockInTemplateByTier.get(inferredTier.trim().toLowerCase());
          if (template == null || template <= 0) return null;
          const paid = paidTierMonthsByUser.get(`${member.id}::${inferredTier.trim().toLowerCase()}`) ?? 0;
          return Math.max(0, Math.min(template, paid));
        })(),
        daysLeft: getMembershipDaysLeft(member.membershipExpiry),
        membershipStatus: getMembershipStatus(member.membershipExpiry),
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

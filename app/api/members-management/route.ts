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
      return {
        ...member,
        totalContractPrice: member.totalContractPrice != null ? String(member.totalContractPrice) : null,
        tier: inferMembershipTier({
          membershipTier: member.membershipTier,
          lockInLabel: member.lockInLabel,
          monthlyFeeLabel: member.monthlyFeeLabel,
          membershipFeeLabel: member.membershipFeeLabel,
          membershipNotes: member.membershipNotes,
        }),
        daysLeft: getMembershipDaysLeft(member.membershipExpiry),
        membershipStatus: getMembershipStatus(member.membershipExpiry),
        contractPaidToDate: paid != null ? String(paid) : null,
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

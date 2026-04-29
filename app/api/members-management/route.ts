import { prisma } from "@/lib/prisma";
import { getMembershipDaysLeft, getMembershipStatus, inferMembershipTier } from "@/lib/membership";
import { jsonNoStore } from "@/lib/http";

/** Vercel can otherwise cache GET handlers; this list must always reflect live DB. */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const members = await prisma.user.findMany({
      where: { role: "MEMBER" },
      orderBy: { lastName: "asc" },
    });

    const data = members.map((member) => ({
      ...member,
      tier: inferMembershipTier({
        membershipTier: member.membershipTier,
        lockInLabel: member.lockInLabel,
        monthlyFeeLabel: member.monthlyFeeLabel,
        membershipFeeLabel: member.membershipFeeLabel,
        membershipNotes: member.membershipNotes,
      }),
      daysLeft: getMembershipDaysLeft(member.membershipExpiry),
      membershipStatus: getMembershipStatus(member.membershipExpiry),
    }));

    return jsonNoStore({ success: true, data });
  } catch (error) {
    return jsonNoStore(
      { success: false, error: "Failed to fetch members management data", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

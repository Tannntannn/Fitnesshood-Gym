import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMembershipDaysLeft, getMembershipStatus, inferMembershipTier } from "@/lib/membership";

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

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch members management data", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

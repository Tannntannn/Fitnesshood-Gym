import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getClientSessionCookieName, verifyClientSession } from "@/lib/client-session";
import { resolveProfileImageUrl } from "@/lib/profile-image";
import { fetchActiveClientAnnouncements } from "@/lib/announcement-db";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Vary: "Cookie",
} as const;

const dashboardUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  coachName: true,
  membershipStart: true,
  membershipExpiry: true,
  monthlyExpiryDate: true,
  fullMembershipExpiry: true,
  gracePeriodEnd: true,
  membershipTier: true,
  lockInLabel: true,
  monthlyFeeLabel: true,
  membershipFeeLabel: true,
  monthsPaid: true,
  remainingMonths: true,
  totalContractPrice: true,
  remainingBalance: true,
  membershipStatus: true,
  daysLeft: true,
  freezeStatus: true,
  freezeStartedAt: true,
  freezeEndsAt: true,
  freezeDaysTotal: true,
} as const;

const fullUserSelect = {
  ...dashboardUserSelect,
  contactNo: true,
  email: true,
  address: true,
  notes: true,
  qrCodeImage: true,
  profileImageUrl: true,
} as const;

export async function GET(request: Request) {
  try {
    const cookieValue = cookies().get(getClientSessionCookieName())?.value;
    const userId = verifyClientSession(cookieValue);
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const scope = new URL(request.url).searchParams.get("scope") ?? "full";
    const dashboardOnly = scope === "dashboard";

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: dashboardOnly ? dashboardUserSelect : fullUserSelect,
    });
    if (!user) {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
    }

    const [attendance, payments] = dashboardOnly
      ? [[], []]
      : await Promise.all([
          prisma.attendance.findMany({
            where: { userId },
            orderBy: { scannedAt: "desc" },
            take: 20,
            select: { id: true, timeIn: true, date: true },
          }),
          prisma.payment.findMany({
            where: { userId },
            orderBy: { paidAt: "desc" },
            take: 20,
            select: {
              id: true,
              amount: true,
              grossAmount: true,
              discountPercent: true,
              discountAmount: true,
              discountType: true,
              transactionType: true,
              paymentMethod: true,
              collectionStatus: true,
              paidAt: true,
              paymentReference: true,
              service: { select: { name: true, tier: true } },
              splitPayments: { select: { method: true, amount: true, reference: true } },
            },
          }),
        ]);

    const announcementRows = await fetchActiveClientAnnouncements(1);
    const rawAnnouncement = announcementRows[0] ?? null;
    const announcement = rawAnnouncement
      ? {
          ...rawAnnouncement,
          imageUrl: await resolveProfileImageUrl(rawAnnouncement.imageUrl),
        }
      : null;

    const imageUrl = dashboardOnly
      ? null
      : await resolveProfileImageUrl(
          (user as typeof user & { profileImageUrl?: string | null }).profileImageUrl ?? null,
        );
    return NextResponse.json(
      {
        success: true,
        data: {
          user: { ...user, profileImageUrl: imageUrl },
          ...(dashboardOnly ? {} : { attendance, payments }),
          announcement,
        },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch member dashboard", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const cookieValue = cookies().get(getClientSessionCookieName())?.value;
    const userId = verifyClientSession(cookieValue);
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { profileImageUrl?: string };
    const profileImageUrl = body.profileImageUrl?.trim() ?? "";
    if (!profileImageUrl) {
      return NextResponse.json({ success: false, error: "Profile image URL is required." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { profileImageUrl },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update profile", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

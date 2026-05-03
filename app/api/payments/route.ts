import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchPaymentExtrasByIds } from "@/lib/payment-custom-label";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const searchParams = new URL(request.url).searchParams;
    const userId = searchParams.get("userId") ?? undefined;
    const serviceId = searchParams.get("serviceId") ?? undefined;
    const role = searchParams.get("role") ?? undefined;
    const requestedLimit = Number(searchParams.get("limit") ?? 100);
    const limit = Math.min(500, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 100));

    const payments = await prisma.payment.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(serviceId ? { serviceId } : {}),
        ...(role ? { user: { role: role as never } } : {}),
      },
      orderBy: { paidAt: "desc" },
      take: limit,
      select: {
        id: true,
        amount: true,
        grossAmount: true,
        discountPercent: true,
        discountAmount: true,
        discountType: true,
        discountFixedAmount: true,
        discountReason: true,
        transactionType: true,
        paymentMethod: true,
        collectionStatus: true,
        paidAt: true,
        notes: true,
        paymentReference: true,
        user: { select: { id: true, firstName: true, lastName: true, role: true, remainingBalance: true, membershipTier: true } },
        service: { select: { id: true, name: true, tier: true } },
        addOnSubscription: { select: { id: true, addonName: true } },
        splitPayments: {
          select: { method: true, amount: true, reference: true },
        },
      },
    });

    const extras = await fetchPaymentExtrasByIds(prisma, payments.map((p) => p.id));
    const data = payments.map((p) => {
      const e = extras.get(p.id) ?? { customAddOnLabel: null, receiptGroupId: null };
      return { ...p, customAddOnLabel: e.customAddOnLabel, receiptGroupId: e.receiptGroupId };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch payments.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

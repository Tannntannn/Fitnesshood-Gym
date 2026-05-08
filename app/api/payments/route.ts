import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchPaymentExtrasByIds } from "@/lib/payment-custom-label";
import { getDateOnlyPH } from "@/lib/time";

/**
 * Parse `?date=YYYY-MM-DD` (PH locale) into a [gte, lt) range covering that calendar day
 * for `Payment.createdAt` filtering.
 * Returns null when no date is provided or the value is malformed.
 */
function parseCreatedAtDateRange(value: string | null): { gte: Date; lt: Date } | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [yStr, mStr, dStr] = trimmed.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  // Treat the supplied YYYY-MM-DD as a PH-local calendar date.
  const start = getDateOnlyPH(new Date(Date.UTC(y, m - 1, d)));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: start, lt: end };
}

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
    const dateRange = parseCreatedAtDateRange(searchParams.get("date"));

    const payments = await prisma.payment.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(serviceId ? { serviceId } : {}),
        ...(role ? { user: { role: role as never } } : {}),
        ...(dateRange ? { createdAt: { gte: dateRange.gte, lt: dateRange.lt } } : {}),
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
        createdAt: true,
        recordedBy: true,
        notes: true,
        paymentReference: true,
        orNumber: true,
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

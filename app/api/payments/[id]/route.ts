import { NextResponse } from "next/server";
import { PaymentMethod, Prisma } from "@prisma/client";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import {
  computeDaysLeft,
  extendMonthlyExpiry,
  formatPesoLabel,
  resolveMembershipStatus,
  sanitizePaymentReference,
  toMoney,
} from "@/lib/payment";
import { nowInPH } from "@/lib/time";

type Params = { params: { id: string } };

async function recomputeMemberMembership(tx: Prisma.TransactionClient, userId: string) {
  const member = await tx.user.findUnique({ where: { id: userId } });
  if (!member || member.role !== "MEMBER") return;

  const latestMembershipPayment = await tx.payment.findFirst({
    where: { userId, service: { name: "Membership" } },
    include: { service: true },
    orderBy: { paidAt: "desc" },
  });

  const totalsRows = await tx.$queryRaw<Array<{ totalPaid: unknown; totalDiscount: unknown }>>`
    SELECT
      COALESCE(SUM(p."amount"), 0) AS "totalPaid",
      COALESCE(SUM(COALESCE(p."discountAmount", 0)), 0) AS "totalDiscount"
    FROM "Payment" p
    INNER JOIN "Service" s ON s."id" = p."serviceId"
    WHERE p."userId" = ${userId}
      AND s."name" = 'Membership'
  `;
  const totals = totalsRows[0] ?? { totalPaid: 0, totalDiscount: 0 };
  const totalPaid = toMoney(String(totals.totalPaid ?? 0));
  const totalDiscount = toMoney(String(totals.totalDiscount ?? 0));
  const totalCovered = toMoney(Number(totalPaid) + Number(totalDiscount));

  if (!latestMembershipPayment) {
    await tx.user.update({
      where: { id: userId },
      data: {
        monthsPaid: 0,
        remainingMonths: 0,
        totalContractPrice: toMoney(0),
        remainingBalance: toMoney(0),
        membershipTier: null,
      },
    });
    return;
  }

  const service = latestMembershipPayment.service;
  const contractStart = member.membershipStart ?? latestMembershipPayment.paidAt ?? nowInPH();
  const fullMembershipExpiry = addDays(contractStart, service.contractMonths * 30);
  const daysLeft = computeDaysLeft(fullMembershipExpiry);
  const membershipStatus = resolveMembershipStatus(daysLeft);
  const monthlyRate = Number(service.monthlyRate);
  const contractMonths = service.contractMonths;
  const monthsPaid = monthlyRate > 0 ? Math.floor(Number(totalCovered) / monthlyRate) : 0;
  const remainingMonths = Math.max(contractMonths - monthsPaid, 0);
  const totalContractPrice = service.contractPrice;
  const remainingBalance = toMoney(Math.max(Number(totalContractPrice) - Number(totalCovered), 0));

  await tx.user.update({
    where: { id: userId },
    data: {
      membershipStart: contractStart,
      membershipExpiry: fullMembershipExpiry,
      monthlyExpiryDate: extendMonthlyExpiry(member.monthlyExpiryDate),
      fullMembershipExpiry,
      daysLeft,
      membershipStatus,
      monthsPaid,
      remainingMonths,
      totalContractPrice,
      remainingBalance,
      membershipTier: service.tier,
      lockInLabel: service.contractMonths > 1 ? `${service.contractMonths} Months Lock-In` : "No Lock-in",
      monthlyFeeLabel: formatPesoLabel(service.monthlyRate),
      membershipFeeLabel: formatPesoLabel(service.membershipFee),
      gracePeriodEnd: addDays(fullMembershipExpiry, 7),
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const body = (await request.json()) as {
      amount?: number;
      paymentMethod?: string;
      collectionStatus?: "FULLY_PAID" | "PARTIAL";
      paidAt?: string;
      paymentReference?: string | null;
      notes?: string | null;
      voidTransaction?: boolean;
      voidReason?: string;
    };

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { id: params.id },
        include: { service: true, user: true, splitPayments: true },
      });
      if (!existing) throw new Error("Payment not found.");

      const data: Record<string, unknown> = {};

      if (body.voidTransaction) {
        data.amount = toMoney(0);
        data.grossAmount = toMoney(0);
        data.discountPercent = 0;
        data.discountAmount = toMoney(0);
        data.paymentReference = null;
        data.isSplit = false;
        data.notes = `[VOID ${new Date().toISOString()}] ${body.voidReason?.trim() || "Voided by admin."}${
          existing.notes ? ` | prev: ${existing.notes}` : ""
        }`;
        await tx.splitPayment.deleteMany({ where: { paymentId: existing.id } });
      } else {
        if (existing.isSplit) {
          throw new Error("Split payments cannot be edited directly. Delete and re-create instead.");
        }
        if (body.amount !== undefined) {
          const amount = Number(body.amount);
          if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero.");
          data.amount = toMoney(amount);
          data.grossAmount = toMoney(amount);
          data.discountPercent = 0;
          data.discountAmount = toMoney(0);
        }
        if (body.paymentMethod !== undefined) {
          if (!Object.values(PaymentMethod).includes(body.paymentMethod as PaymentMethod)) {
            throw new Error("Invalid payment method.");
          }
          if (body.paymentMethod === "SPLIT") {
            throw new Error("Use new payment entry for split transactions.");
          }
          data.paymentMethod = body.paymentMethod;
        }
        if (body.collectionStatus !== undefined) data.collectionStatus = body.collectionStatus;
        if (body.paidAt !== undefined) {
          const paidAt = new Date(body.paidAt);
          if (Number.isNaN(paidAt.getTime())) throw new Error("Invalid payment timestamp.");
          data.paidAt = paidAt;
        }
        if (body.paymentReference !== undefined) data.paymentReference = sanitizePaymentReference(body.paymentReference);
        if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
      }

      const payment = await tx.payment.update({
        where: { id: params.id },
        data,
      });

      if (existing.user.role === "MEMBER" && existing.service.name === "Membership") {
        await recomputeMemberMembership(tx, existing.userId);
      }

      return payment;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update transaction.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { id: params.id },
        include: { service: true, user: true },
      });
      if (!existing) throw new Error("Payment not found.");

      await tx.payment.delete({ where: { id: params.id } });
      if (existing.user.role === "MEMBER" && existing.service.name === "Membership") {
        await recomputeMemberMembership(tx, existing.userId);
      }
      return existing;
    });

    return NextResponse.json({ success: true, data: { id: deleted.id } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to delete transaction.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

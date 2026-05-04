import { NextResponse } from "next/server";
import { PaymentMethod, Prisma } from "@prisma/client";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  computeDaysLeft,
  formatPesoLabel,
  resolveMembershipStatus,
  sanitizePaymentReference,
  toMoney,
} from "@/lib/payment";
import { nowInPH } from "@/lib/time";
import { syncMembershipPenaltyInTx } from "@/lib/membership-penalty";

type Params = { params: { id: string } };

async function recomputeMemberMembership(tx: Prisma.TransactionClient, userId: string) {
  const member = await tx.user.findUnique({ where: { id: userId } });
  if (!member || member.role !== "MEMBER") return;

  const latestMembershipPayment = await tx.payment.findFirst({
    where: {
      userId,
      OR: [{ transactionType: "MEMBERSHIP_CONTRACT" }, { transactionType: "LEGACY", service: { name: "Membership" } }],
    },
    include: { service: true },
    orderBy: { paidAt: "desc" },
  });

  const totalsRows = await tx.$queryRaw<Array<{ totalPaid: unknown; totalDiscount: unknown }>>`
    SELECT
      COALESCE(SUM(p."amount"), 0) AS "totalPaid",
      COALESCE(SUM(COALESCE(p."discountAmount", 0)), 0) AS "totalDiscount"
    FROM "Payment" p
    WHERE p."userId" = ${userId}
      AND (
        p."transactionType" = 'MEMBERSHIP_CONTRACT'
        OR (p."transactionType" = 'LEGACY' AND EXISTS (
          SELECT 1 FROM "Service" s WHERE s."id" = p."serviceId" AND s."name" = 'Membership'
        ))
      )
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
      monthlyExpiryDate: member.monthlyExpiryDate,
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
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      amount?: number;
      grossAmount?: number;
      discountType?: "NONE" | "PERCENT" | "FIXED";
      discountPercent?: number;
      discountFixedAmount?: number;
      discountReason?: string | null;
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
        data.discountType = "NONE";
        data.discountFixedAmount = toMoney(0);
        data.paymentReference = null;
        data.isSplit = false;
        data.notes = `[VOID ${nowInPH().toISOString()}] ${body.voidReason?.trim() || "Voided by admin."}${
          existing.notes ? ` | prev: ${existing.notes}` : ""
        }`;
        await tx.splitPayment.deleteMany({ where: { paymentId: existing.id } });
      } else {
        if (existing.isSplit) {
          throw new Error("Split payments cannot be edited directly. Delete and re-create instead.");
        }
        if (body.grossAmount !== undefined) {
          const gross = Number(body.grossAmount);
          if (!Number.isFinite(gross) || gross <= 0) throw new Error("Gross amount must be greater than zero.");
          const dtype = body.discountType ?? "NONE";
          if (!["NONE", "PERCENT", "FIXED"].includes(dtype)) throw new Error("Invalid discount type.");
          const pct = dtype === "PERCENT" ? Math.trunc(Number(body.discountPercent ?? 0)) : 0;
          const fixedRaw = dtype === "FIXED" ? Number(body.discountFixedAmount ?? 0) : 0;
          if (dtype === "PERCENT" && (pct < 0 || pct > 100)) throw new Error("Discount percent must be between 0 and 100.");
          if (dtype === "FIXED" && (!Number.isFinite(fixedRaw) || fixedRaw < 0)) throw new Error("Invalid fixed discount.");
          const fixedAmt = dtype === "FIXED" ? Math.min(fixedRaw, gross) : 0;
          const discAmt = dtype === "PERCENT" ? gross * (pct / 100) : fixedAmt;
          const finalAmt = Math.max(gross - discAmt, 0);
          if (finalAmt <= 0) throw new Error("Final amount must be greater than zero after discount.");
          data.amount = toMoney(finalAmt);
          data.grossAmount = toMoney(gross);
          data.discountPercent = pct;
          data.discountAmount = toMoney(discAmt);
          data.discountType = dtype;
          data.discountFixedAmount = toMoney(dtype === "FIXED" ? fixedAmt : 0);
          data.discountReason = body.discountReason?.trim() || null;
        } else if (body.amount !== undefined) {
          const amount = Number(body.amount);
          if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero.");
          data.amount = toMoney(amount);
          data.grossAmount = toMoney(amount);
          data.discountPercent = 0;
          data.discountAmount = toMoney(0);
          data.discountType = "NONE";
          data.discountFixedAmount = toMoney(0);
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

      if (
        existing.user.role === "MEMBER" &&
        (existing.transactionType === "MEMBERSHIP_CONTRACT" ||
          (existing.transactionType === "LEGACY" && existing.service.name === "Membership"))
      ) {
        await recomputeMemberMembership(tx, existing.userId);
      }
      if (existing.user.role === "MEMBER") {
        await syncMembershipPenaltyInTx(tx, existing.userId);
      }

      return payment;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const userInputPatterns = [
      "Payment not found",
      "Split payments cannot be edited",
      "Gross amount must be",
      "Invalid discount type",
      "Discount percent must be",
      "Invalid fixed discount",
      "Final amount must be",
      "Amount must be",
      "Invalid payment method",
      "Use new payment entry",
      "Invalid payment timestamp",
    ];
    if (userInputPatterns.some((p) => message.includes(p))) {
      const status = message.includes("Payment not found") ? 404 : 400;
      return NextResponse.json({ success: false, error: message }, { status });
    }
    return NextResponse.json(
      { success: false, error: "Failed to update transaction.", details: message },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { id: params.id },
        include: { service: true, user: true },
      });
      if (!existing) throw new Error("Payment not found.");

      await tx.payment.delete({ where: { id: params.id } });
      if (
        existing.user.role === "MEMBER" &&
        (existing.transactionType === "MEMBERSHIP_CONTRACT" ||
          (existing.transactionType === "LEGACY" && existing.service.name === "Membership"))
      ) {
        await recomputeMemberMembership(tx, existing.userId);
      }
      if (existing.user.role === "MEMBER") {
        await syncMembershipPenaltyInTx(tx, existing.userId);
      }
      return existing;
    });

    return NextResponse.json({ success: true, data: { id: deleted.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Payment not found")) {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
    return NextResponse.json(
      { success: false, error: "Failed to delete transaction.", details: message },
      { status: 500 },
    );
  }
}

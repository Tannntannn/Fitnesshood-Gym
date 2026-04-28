import { NextResponse } from "next/server";
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

type SplitInput = { method: string; amount: number; reference?: string | null };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      memberId?: string;
      serviceId?: string;
      amount?: number;
      grossAmount?: number;
      discountPercent?: number;
      paymentMethod?: string;
      collectionStatus?: "FULLY_PAID" | "PARTIAL";
      notes?: string;
      paymentReference?: string | null;
      splits?: SplitInput[];
    };

    if (!body.memberId || !body.serviceId || !body.paymentMethod) {
      return NextResponse.json({ success: false, error: "memberId, serviceId, and paymentMethod are required." }, { status: 400 });
    }
    const grossAmountNumber = Number(body.grossAmount ?? body.amount ?? 0);
    if (!Number.isFinite(grossAmountNumber) || grossAmountNumber <= 0) {
      return NextResponse.json({ success: false, error: "Gross amount must be greater than zero." }, { status: 400 });
    }
    const discountPercentRaw = Number(body.discountPercent ?? 0);
    if (!Number.isFinite(discountPercentRaw) || discountPercentRaw < 0 || discountPercentRaw > 100) {
      return NextResponse.json({ success: false, error: "Discount percent must be between 0 and 100." }, { status: 400 });
    }
    const discountPercent = Math.trunc(discountPercentRaw);
    const discountAmountNumber = grossAmountNumber * (discountPercent / 100);
    const amountNumber = Math.max(grossAmountNumber - discountAmountNumber, 0);
    if (amountNumber <= 0) {
      return NextResponse.json({ success: false, error: "Final amount must be greater than zero after discount." }, { status: 400 });
    }

    const splitRows = (body.splits ?? []).filter((split) => Number(split.amount) > 0);
    const isSplit = splitRows.length > 0;
    const splitTotal = splitRows.reduce((sum, row) => sum + Number(row.amount), 0);
    if (isSplit && Math.abs(splitTotal - amountNumber) > 0.001) {
      return NextResponse.json({ success: false, error: "Split payment total must equal amount paid." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const member = await tx.user.findUnique({ where: { id: body.memberId } });
      if (!member) {
        throw new Error("User not found.");
      }

      const service = await tx.service.findUnique({ where: { id: body.serviceId } });
      if (!service || !service.isActive) {
        throw new Error("Service not found or inactive.");
      }
      const isMembershipContractPayment = member.role === "MEMBER" && service.name === "Membership";
      const collectionStatus = isMembershipContractPayment ? (body.collectionStatus ?? "FULLY_PAID") : "FULLY_PAID";

      const paymentReference = isSplit ? null : sanitizePaymentReference(body.paymentReference);

      const payment = await tx.payment.create({
        data: {
          userId: member.id,
          serviceId: service.id,
          amount: toMoney(amountNumber),
          paymentMethod: isSplit ? "SPLIT" : (body.paymentMethod as never),
          collectionStatus: collectionStatus as never,
          paidAt: nowInPH(),
          isSplit,
          notes: body.notes?.trim() || null,
          paymentReference,
        },
      });

      await tx.$executeRaw`
        UPDATE "Payment"
        SET "grossAmount" = ${toMoney(grossAmountNumber)},
            "discountPercent" = ${discountPercent},
            "discountAmount" = ${toMoney(discountAmountNumber)}
        WHERE "id" = ${payment.id}
      `;

      if (isSplit) {
        await tx.splitPayment.createMany({
          data: splitRows.map((row) => ({
            paymentId: payment.id,
            method: row.method as never,
            amount: toMoney(row.amount),
            reference: sanitizePaymentReference(row.reference),
          })),
        });
      }

      let updatedMember = member;
      let rewardTriggered = false;

      if (member.role === "MEMBER" && service.name === "Membership") {
        const totalsRows = await tx.$queryRaw<Array<{ totalPaid: unknown; totalDiscount: unknown }>>`
          SELECT
            COALESCE(SUM(p."amount"), 0) AS "totalPaid",
            COALESCE(SUM(COALESCE(p."discountAmount", 0)), 0) AS "totalDiscount"
          FROM "Payment" p
          INNER JOIN "Service" s ON s."id" = p."serviceId"
          WHERE p."userId" = ${member.id}
            AND s."name" = 'Membership'
        `;
        const totals = totalsRows[0] ?? { totalPaid: 0, totalDiscount: 0 };
        const totalPaid = toMoney(String(totals.totalPaid ?? 0));
        const totalDiscount = toMoney(String(totals.totalDiscount ?? 0));
        // Discount reduces the payable contract amount, so coverage is paid + discount.
        const totalCovered = toMoney(Number(totalPaid) + Number(totalDiscount));

        const monthlyExpiryDate = extendMonthlyExpiry(member.monthlyExpiryDate);
        const contractStart = member.membershipStart ?? nowInPH();
        const fullMembershipExpiry = addDays(contractStart, service.contractMonths * 30);
        const daysLeft = computeDaysLeft(fullMembershipExpiry);
        const membershipStatus = resolveMembershipStatus(daysLeft);

        const monthlyRate = Number(service.monthlyRate);
        const contractMonths = service.contractMonths;
        const monthsPaid = monthlyRate > 0 ? Math.floor(Number(totalCovered) / monthlyRate) : 0;
        const remainingMonths = Math.max(contractMonths - monthsPaid, 0);
        const totalContractPrice = service.contractPrice;
        const remainingBalance = toMoney(Math.max(Number(totalContractPrice) - Number(totalCovered), 0));

        const earnedStars = (member.loyaltyStars ?? 0) + 1;
        rewardTriggered = earnedStars >= 7;
        const loyaltyStars = rewardTriggered ? 0 : earnedStars;

        updatedMember = await tx.user.update({
          where: { id: member.id },
          data: {
            membershipStart: contractStart,
            membershipExpiry: fullMembershipExpiry,
            monthlyExpiryDate,
            fullMembershipExpiry,
            daysLeft,
            membershipStatus,
            monthsPaid,
            remainingMonths,
            totalContractPrice,
            remainingBalance,
            loyaltyStars,
            membershipTier: service.tier,
            lockInLabel: service.contractMonths > 1 ? `${service.contractMonths} Months Lock-In` : "No Lock-in",
            monthlyFeeLabel: formatPesoLabel(service.monthlyRate),
            membershipFeeLabel: formatPesoLabel(service.membershipFee),
            gracePeriodEnd: addDays(fullMembershipExpiry, 7),
          },
        });
      }

      return { payment, updatedMember, rewardTriggered };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "Failed to confirm payment.", details: message },
      { status: 500 },
    );
  }
}

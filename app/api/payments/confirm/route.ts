import { NextResponse } from "next/server";
import { addDays, addMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  computeDaysLeft,
  extendMonthlyExpiry,
  formatPesoLabel,
  resolveMembershipStatus,
  sanitizePaymentReference,
  toMoney,
} from "@/lib/payment";
import { nowInPH } from "@/lib/time";
import {
  describePaymentLoyaltySource,
  loyaltyPointsFromPesoAmount,
  memberPaymentEarnsLoyalty,
} from "@/lib/loyalty-earn";
import { syncMembershipPenaltyInTx } from "@/lib/membership-penalty";

type SplitInput = { method: string; amount: number; reference?: string | null };
type PaymentDiscountTypeValue = "NONE" | "PERCENT" | "FIXED";
type PaymentTransactionTypeValue = "LEGACY" | "MEMBERSHIP_CONTRACT" | "MONTHLY_FEE" | "WALK_IN" | "ADD_ON" | "OTHER";

function parseOptionalAddOnDueDate(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid add-on next due / expiration date.");
  }
  return d;
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as {
      memberId?: string;
      serviceId?: string;
      amount?: number;
      grossAmount?: number;
      discountPercent?: number;
      discountType?: PaymentDiscountTypeValue;
      discountFixedAmount?: number;
      discountReason?: string;
      transactionType?: PaymentTransactionTypeValue;
      paymentMethod?: string;
      collectionStatus?: "FULLY_PAID" | "PARTIAL";
      notes?: string;
      paymentReference?: string | null;
      splits?: SplitInput[];
      addOnSubscriptionId?: string | null;
      /** One-time add-on (locker, Wi‑Fi, etc.): label; must use Add-on / Custom service. Posts as ADD_ON. Mutually exclusive with addOnSubscriptionId. */
      customAddOnLabel?: string | null;
      /** Same value on each line of a multi-item save — groups Payment Records + combined receipt. */
      receiptGroupId?: string | null;
      /** For custom POS add-on: optional next due / expiration (ISO or YYYY-MM-DD). Updates Add-on dashboard row. */
      addOnNextDueDate?: string | null;
    };

    if (!body.memberId || !body.serviceId || !body.paymentMethod) {
      return NextResponse.json({ success: false, error: "memberId, serviceId, and paymentMethod are required." }, { status: 400 });
    }
    const grossAmountNumber = Number(body.grossAmount ?? body.amount ?? 0);
    if (!Number.isFinite(grossAmountNumber) || grossAmountNumber <= 0) {
      return NextResponse.json({ success: false, error: "Gross amount must be greater than zero." }, { status: 400 });
    }
    const discountType: PaymentDiscountTypeValue = body.discountType ?? "PERCENT";
    if (!["NONE", "PERCENT", "FIXED"].includes(discountType)) {
      return NextResponse.json({ success: false, error: "Invalid discount type." }, { status: 400 });
    }
    const discountPercentRaw = Number(body.discountPercent ?? 0);
    const discountFixedRaw = Number(body.discountFixedAmount ?? 0);
    if (!Number.isFinite(discountPercentRaw) || discountPercentRaw < 0 || discountPercentRaw > 100) {
      return NextResponse.json({ success: false, error: "Discount percent must be between 0 and 100." }, { status: 400 });
    }
    if (!Number.isFinite(discountFixedRaw) || discountFixedRaw < 0) {
      return NextResponse.json({ success: false, error: "Fixed discount must be zero or higher." }, { status: 400 });
    }
    const discountPercent = discountType === "PERCENT" ? Math.trunc(discountPercentRaw) : 0;
    const discountFixedAmount = discountType === "FIXED" ? Math.min(discountFixedRaw, grossAmountNumber) : 0;
    const discountAmountNumber =
      discountType === "PERCENT" ? grossAmountNumber * (discountPercent / 100) : discountFixedAmount;
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
      const customLabelRaw = (body.customAddOnLabel ?? "").trim();
      const customLabel = customLabelRaw.length > 200 ? customLabelRaw.slice(0, 200) : customLabelRaw;
      const receiptGroupRaw = (body.receiptGroupId ?? "").trim();
      const receiptGroupId = receiptGroupRaw.length > 36 ? receiptGroupRaw.slice(0, 36) : receiptGroupRaw;

      const addOnIdEarly = (body.addOnSubscriptionId ?? "").trim();
      if (addOnIdEarly && member.role !== "MEMBER") {
        throw new Error("Add-on subscription link is only valid for members.");
      }
      if (customLabel && addOnIdEarly) {
        throw new Error("Use either a linked add-on subscription or a custom one-time add-on label — not both.");
      }

      const service = await tx.service.findUnique({ where: { id: body.serviceId } });
      if (!service || !service.isActive) {
        throw new Error("Service not found or inactive.");
      }
      if (customLabel) {
        const isCustomShell = service.name.trim() === "Add-on" && service.tier.trim() === "Custom";
        if (!isCustomShell) {
          throw new Error("Custom add-on payments must use the Add-on (Custom) product line from the payment screen.");
        }
      }

      const addOnId = (body.addOnSubscriptionId ?? "").trim();
      const linkedAddOn =
        addOnId && member.role === "MEMBER" && !customLabel
          ? await tx.addOnSubscription.findFirst({
              where: { id: addOnId, userId: member.id },
            })
          : null;
      if (addOnId && member.role === "MEMBER" && !linkedAddOn && !customLabel) {
        throw new Error("Add-on subscription not found for this member.");
      }
      const requestedType = body.transactionType;
      let transactionType: PaymentTransactionTypeValue =
        requestedType ??
        (member.role === "MEMBER" && service.name === "Membership" ? "MEMBERSHIP_CONTRACT" : "OTHER");
      if (linkedAddOn) {
        transactionType = "ADD_ON";
      }
      if (customLabel) {
        transactionType = "ADD_ON";
      }
      const isMembershipContractPayment = member.role === "MEMBER" && transactionType === "MEMBERSHIP_CONTRACT";
      const isMonthlyFeePayment = member.role === "MEMBER" && transactionType === "MONTHLY_FEE";
      const freezeStatus = (member.freezeStatus ?? "").trim().toUpperCase();
      const freezeEndsAt = (member as { freezeEndsAt?: Date | null }).freezeEndsAt ?? null;
      if (
        member.role === "MEMBER" &&
        (isMembershipContractPayment || isMonthlyFeePayment || transactionType === "ADD_ON") &&
        freezeStatus === "ACTIVE" &&
        (!freezeEndsAt || freezeEndsAt.getTime() >= nowInPH().getTime())
      ) {
        throw new Error(
          "FREEZE_BLOCK:Cannot process membership renewals, monthly fees, or add-on payments while account freeze is active.",
        );
      }
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
          addOnSubscriptionId: linkedAddOn ? linkedAddOn.id : null,
        },
      });

      await tx.$executeRaw`
        UPDATE "Payment"
        SET "grossAmount" = ${toMoney(grossAmountNumber)},
            "discountPercent" = ${discountPercent},
            "discountAmount" = ${toMoney(discountAmountNumber)},
            "transactionType" = ${transactionType}::"PaymentTransactionType",
            "discountType" = ${discountType}::"PaymentDiscountType",
            "discountFixedAmount" = ${toMoney(discountFixedAmount)},
            "discountReason" = ${body.discountReason?.trim() || null},
            "customAddOnLabel" = ${customLabel || null},
            "receiptGroupId" = ${receiptGroupId || null},
            "approvedBy" = ${discountAmountNumber > 0 ? session.admin.email : null},
            "recordedBy" = ${session.admin.email}
        WHERE "id" = ${payment.id}
      `;

      if (customLabel && transactionType === "ADD_ON" && !linkedAddOn) {
        const addonName = customLabel.slice(0, 120);
        const paid = nowInPH();
        const nextDue = parseOptionalAddOnDueDate(body.addOnNextDueDate);
        const existing = await tx.addOnSubscription.findFirst({
          where: {
            userId: member.id,
            addonName: { equals: addonName, mode: "insensitive" },
            status: "ACTIVE",
          },
        });
        let subId: string;
        if (existing) {
          await tx.addOnSubscription.update({
            where: { id: existing.id },
            data: {
              lastPaymentAt: paid,
              status: "ACTIVE",
              ...(nextDue !== null ? { dueDate: nextDue } : {}),
            },
          });
          subId = existing.id;
        } else {
          const created = await tx.addOnSubscription.create({
            data: {
              userId: member.id,
              serviceId: service.id,
              addonName,
              dueDate: nextDue,
              status: "ACTIVE",
              lastPaymentAt: paid,
              notes: "Registered from payment (POS add-on).",
            },
          });
          subId = created.id;
        }
        await tx.$executeRaw`
          UPDATE "Payment" SET "addOnSubscriptionId" = ${subId} WHERE "id" = ${payment.id}
        `;
      }

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

      if (member.role === "MEMBER" && isMonthlyFeePayment && !isMembershipContractPayment) {
        const monthlyExpiryDate = extendMonthlyExpiry(member.monthlyExpiryDate);
        updatedMember = await tx.user.update({
          where: { id: member.id },
          data: {
            monthlyExpiryDate,
            monthlyFeeLabel: formatPesoLabel(service.monthlyRate),
            membershipFeeLabel: formatPesoLabel(service.membershipFee),
          },
        });
      } else if (member.role === "MEMBER" && isMembershipContractPayment) {
        const totalsRows = await tx.$queryRaw<Array<{ totalPaid: unknown; totalDiscount: unknown }>>`
          SELECT
            COALESCE(SUM(p."amount"), 0) AS "totalPaid",
            COALESCE(SUM(COALESCE(p."discountAmount", 0)), 0) AS "totalDiscount"
          FROM "Payment" p
          WHERE p."userId" = ${member.id}
            AND p."transactionType" = 'MEMBERSHIP_CONTRACT'
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
            membershipTier: service.tier,
            lockInLabel: service.contractMonths > 1 ? `${service.contractMonths} Months Lock-In` : "No Lock-in",
            monthlyFeeLabel: formatPesoLabel(service.monthlyRate),
            membershipFeeLabel: formatPesoLabel(service.membershipFee),
            gracePeriodEnd: addDays(fullMembershipExpiry, 7),
          },
        });
      } else if (member.role === "MEMBER" && transactionType === "ADD_ON") {
        if (linkedAddOn) {
          const paid = nowInPH();
          const anchor =
            linkedAddOn.dueDate && linkedAddOn.dueDate.getTime() >= paid.getTime() ? linkedAddOn.dueDate : paid;
          const nextDue = addMonths(anchor, 1);
          await tx.addOnSubscription.update({
            where: { id: linkedAddOn.id },
            data: {
              lastPaymentAt: paid,
              dueDate: nextDue,
              status: "ACTIVE",
            },
          });
        }
      }

      const loyaltyPointsEarned =
        memberPaymentEarnsLoyalty(member.role, transactionType) ? loyaltyPointsFromPesoAmount(amountNumber) : 0;
      if (loyaltyPointsEarned > 0) {
        const prevBalance = updatedMember.loyaltyStars ?? 0;
        const newBalance = prevBalance + loyaltyPointsEarned;
        updatedMember = await tx.user.update({
          where: { id: member.id },
          data: { loyaltyStars: newBalance },
        });
        await tx.loyaltyLedger.create({
          data: {
            userId: member.id,
            paymentId: payment.id,
            points: loyaltyPointsEarned,
            pointsEarned: loyaltyPointsEarned,
            pointsDeducted: 0,
            remainingBalance: newBalance,
            reason: "PAYMENT_EARNED",
            reasonDetail: describePaymentLoyaltySource(transactionType, service.name, customLabel || null),
            transactionReference: payment.id,
            adminApproval: "APPROVED",
            adjustedBy: session.admin.email,
            adjustedAt: new Date(),
            amountBasis: toMoney(amountNumber),
            rewardUsed: false,
            notes: null,
          },
        });
      }

      if (member.role === "MEMBER") {
        await syncMembershipPenaltyInTx(tx, member.id);
      }

      return { payment, updatedMember };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.startsWith("FREEZE_BLOCK:")) {
      return NextResponse.json({ success: false, error: message.replace("FREEZE_BLOCK:", "") }, { status: 409 });
    }
    const userInputPatterns = [
      "Invalid add-on next due",
      "User not found",
      "Service not found",
      "Add-on subscription",
      "Custom add-on payments",
      "Use either a linked add-on",
    ];
    if (userInputPatterns.some((p) => message.includes(p))) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: "Failed to confirm payment.", details: message },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { addDays, addMonths, isAfter } from "date-fns";
import { prisma, PRISMA_INTERACTIVE_TX_OPTIONS } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  computeDaysLeft,
  extendMonthlyExpiry,
  formatPesoLabel,
  MAX_MEMBERSHIP_PAY_NOW_MONTHS,
  resolveMembershipStatus,
  sanitizePaymentReference,
  toMoney,
} from "@/lib/payment";
import { nowInPH } from "@/lib/time";
import {
  describePaymentLoyaltySource,
  loyaltyPointsFromPesoAmount,
  paymentEarnsLoyalty,
} from "@/lib/loyalty-earn";
import { syncMembershipPenaltyInTx } from "@/lib/membership-penalty";
import { expireLoyaltyStarsIfInactive } from "@/lib/loyalty-expiration";
import {
  ensureLockInCycleAnchorAndLoadMembershipPayments,
  monthsFromMembershipPaymentRow,
  safeSetUserLockInCycleAnchorAt,
  type LockInMembershipPaymentRow,
} from "@/lib/lock-in-cycle";

type SplitInput = { method: string; amount: number; reference?: string | null };
type PaymentDiscountTypeValue = "NONE" | "PERCENT" | "FIXED";
type PaymentTransactionTypeValue = "LEGACY" | "MEMBERSHIP_CONTRACT" | "MONTHLY_FEE" | "WALK_IN" | "ADD_ON" | "OTHER";
const BRONZE_TIER = "bronze";

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

/** Same convention as members management / POS: one line `Locker #: …` in add-on notes. */
function stripLockerNoteLines(text: string | null | undefined): string {
  if (!text?.trim()) return "";
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*Locker\s*#\s*:?\s*/i.test(line))
    .join("\n")
    .trim();
}

function mergeLockerLineIntoNotes(existingNotes: string | null | undefined, lockerNumber: string): string | null {
  const lock = lockerNumber.trim();
  const rest = stripLockerNoteLines(existingNotes);
  const parts: string[] = [];
  if (rest) parts.push(rest);
  if (lock) parts.push(`Locker #: ${lock}`);
  if (!parts.length) return null;
  return parts.join("\n");
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
      orNumber?: string | null;
      splits?: SplitInput[];
      addOnSubscriptionId?: string | null;
      /** One-time add-on (locker, Wi‑Fi, etc.): label; must use Add-on / Custom service. Posts as ADD_ON. Mutually exclusive with addOnSubscriptionId. */
      customAddOnLabel?: string | null;
      /** Same value on each line of a multi-item save — groups Payment Records + combined receipt. */
      receiptGroupId?: string | null;
      /** For custom POS add-on: optional next due / expiration (ISO or YYYY-MM-DD). Updates Add-on dashboard row. */
      addOnNextDueDate?: string | null;
      /**
       * When sent (including empty string), merged into linked `AddOnSubscription.notes` as `Locker #: …`.
       * Omit for non-locker add-ons so existing notes are left unchanged on renewals.
       */
      addOnLockerNumber?: string | null;
      /** Months paying toward access now (all Membership tiers except Bronze). */
      paymentMonths?: number;
    };

    if (!body.memberId || !body.serviceId || !body.paymentMethod) {
      return NextResponse.json({ success: false, error: "memberId, serviceId, and paymentMethod are required." }, { status: 400 });
    }
    const requestedCollectionStatus = body.collectionStatus ?? "FULLY_PAID";
    if (!["FULLY_PAID", "PARTIAL"].includes(requestedCollectionStatus)) {
      return NextResponse.json({ success: false, error: "Invalid collection status." }, { status: 400 });
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
      const isMembershipProduct = service.name.trim() === "Membership" && !linkedAddOn && !customLabel;
      const isBronzeTier = service.tier.trim().toLowerCase() === BRONZE_TIER;
      const isMembershipService = member.role === "MEMBER" && isMembershipProduct;
      const isBronzeNonMemberMembershipPayment = member.role === "NON_MEMBER" && isMembershipProduct && isBronzeTier;
      const isMonthlyMembershipPayment = isMembershipService || isBronzeNonMemberMembershipPayment;

      const requestedType = body.transactionType;
      let transactionType: PaymentTransactionTypeValue =
        requestedType ?? (isMembershipProduct ? "MONTHLY_FEE" : "OTHER");
      if (linkedAddOn) {
        transactionType = "ADD_ON";
      }
      if (customLabel) {
        transactionType = "ADD_ON";
      }
      if (isMembershipProduct && transactionType === "MEMBERSHIP_CONTRACT") {
        transactionType = "MONTHLY_FEE";
      }
      const isMembershipMonthlyPayment = transactionType === "MONTHLY_FEE" && isMonthlyMembershipPayment;
      const isMonthlyFeePayment = member.role === "MEMBER" && transactionType === "MONTHLY_FEE";
      const freezeStatus = (member.freezeStatus ?? "").trim().toUpperCase();
      const freezeEndsAt = (member as { freezeEndsAt?: Date | null }).freezeEndsAt ?? null;
      if (
        member.role === "MEMBER" &&
        (isMonthlyFeePayment || transactionType === "ADD_ON") &&
        freezeStatus === "ACTIVE" &&
        (!freezeEndsAt || freezeEndsAt.getTime() >= nowInPH().getTime())
      ) {
        throw new Error(
          "FREEZE_BLOCK:Cannot process membership renewals, monthly fees, or add-on payments while account freeze is active.",
        );
      }
      const collectionStatus = requestedCollectionStatus;

      const paymentReference = isSplit ? null : sanitizePaymentReference(body.paymentReference);
      const orNumber = isSplit ? null : sanitizePaymentReference(body.orNumber);

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
          orNumber,
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
        const lockerKeySent = Object.prototype.hasOwnProperty.call(body, "addOnLockerNumber");
        const lockerRaw = typeof body.addOnLockerNumber === "string" ? body.addOnLockerNumber : "";
        const existing = await tx.addOnSubscription.findFirst({
          where: {
            userId: member.id,
            addonName: { equals: addonName, mode: "insensitive" },
            status: "ACTIVE",
          },
        });
        let subId: string;
        if (existing) {
          const notePatch = lockerKeySent
            ? mergeLockerLineIntoNotes(existing.notes, lockerRaw)
            : undefined;
          await tx.addOnSubscription.update({
            where: { id: existing.id },
            data: {
              lastPaymentAt: paid,
              status: "ACTIVE",
              ...(nextDue !== null ? { dueDate: nextDue } : {}),
              ...(notePatch !== undefined ? { notes: notePatch } : {}),
            },
          });
          subId = existing.id;
        } else {
          const defaultNote = "Registered from payment (POS add-on).";
          const notes = lockerKeySent
            ? mergeLockerLineIntoNotes(defaultNote, lockerRaw) ?? defaultNote
            : defaultNote;
          const created = await tx.addOnSubscription.create({
            data: {
              userId: member.id,
              serviceId: service.id,
              addonName,
              dueDate: nextDue,
              status: "ACTIVE",
              lastPaymentAt: paid,
              notes,
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
      let membershipExpectedDue = 0;
      let lockInPaidMonthsForSummary: number | null = null;
      const sameTierAsMember =
        (member.membershipTier ?? "").trim().toLowerCase() === service.tier.trim().toLowerCase();
      const existingMemberBalance = Math.max(0, Number(member.remainingBalance ?? 0));
      const settleExistingBalanceOnly =
        isMembershipMonthlyPayment &&
        collectionStatus === "FULLY_PAID" &&
        sameTierAsMember &&
        existingMemberBalance > 0;

      if (isMembershipMonthlyPayment) {
        const monthlyRateNum = Number(service.monthlyRate);
        const tierLower = service.tier.trim().toLowerCase();
        const requestedPaymentMonths = Math.max(0, Math.trunc(Number(body.paymentMonths ?? 0)));
        const monthsFromGross =
          monthlyRateNum > 0 && Number.isFinite(monthlyRateNum)
            ? Math.max(
                1,
                Math.min(
                  MAX_MEMBERSHIP_PAY_NOW_MONTHS,
                  Math.round(grossAmountNumber / monthlyRateNum) || 1,
                ),
              )
            : 1;

        const isBronzeTier = tierLower === BRONZE_TIER;
        const monthsCharged = isBronzeTier
          ? Math.max(1, Math.min(36, monthsFromGross))
          : Math.max(1, Math.min(MAX_MEMBERSHIP_PAY_NOW_MONTHS, requestedPaymentMonths || monthsFromGross));
        membershipExpectedDue = Math.max(0, monthsCharged * Math.max(0, monthlyRateNum));
        const skipMonthlyExtensionForUnsettledSameTier =
          member.role === "MEMBER" && sameTierAsMember && existingMemberBalance > 0;
        const lockInTemplate = Math.max(0, Math.trunc(Number(service.contractMonths) || 0));
        const { activeAnchor: lockInAnchor, rows: fullPaidSameTierRows } =
          lockInTemplate > 0 && member.role === "MEMBER"
            ? await ensureLockInCycleAnchorAndLoadMembershipPayments(tx, member.id, service.tier, lockInTemplate)
            : { activeAnchor: null as Date | null, rows: [] as LockInMembershipPaymentRow[] };
        const rowsAfterAnchor = fullPaidSameTierRows.filter(
          (r) => !lockInAnchor || r.paidAt.getTime() > lockInAnchor.getTime(),
        );
        const rowsExclCurrent = fullPaidSameTierRows.filter((r) => r.id !== payment.id);
        const sumMonthsExclCurrent = rowsExclCurrent.reduce((sum, row) => sum + monthsFromMembershipPaymentRow(row), 0);
        const currentRow = fullPaidSameTierRows.find((r) => r.id === payment.id);
        const currentPaymentLockInMonths = currentRow
          ? monthsFromMembershipPaymentRow(currentRow)
          : Math.max(
              1,
              monthlyRateNum > 0 && Number.isFinite(monthlyRateNum)
                ? Math.trunc(Math.round(grossAmountNumber / monthlyRateNum) || 1)
                : 1,
            );
        let fullPaidSameTierMonths = rowsAfterAnchor.reduce((sum, row) => sum + monthsFromMembershipPaymentRow(row), 0);
        let priorMonthsInCurrentCycleExclCurrent = 0;
        if (lockInTemplate > 0 && member.role === "MEMBER") {
          priorMonthsInCurrentCycleExclCurrent = rowsExclCurrent
            .filter((r) => !lockInAnchor || r.paidAt.getTime() > lockInAnchor.getTime())
            .reduce((sum, row) => sum + monthsFromMembershipPaymentRow(row), 0);
          const manualPriorInCycle = await tx.lockInManualEntry.aggregate({
            where: {
              userId: member.id,
              paidAt: {
                lt: payment.paidAt,
                ...(lockInAnchor ? { gt: lockInAnchor } : {}),
              },
            },
            _sum: { paidMonths: true },
          });
          priorMonthsInCurrentCycleExclCurrent += Math.max(0, Math.trunc(Number(manualPriorInCycle._sum.paidMonths) || 0));
          const manualSum = await tx.lockInManualEntry.aggregate({
            where: {
              userId: member.id,
              ...(lockInAnchor ? { paidAt: { gt: lockInAnchor } } : {}),
            },
            _sum: { paidMonths: true },
          });
          fullPaidSameTierMonths += Math.max(0, Math.trunc(Number(manualSum._sum.paidMonths) || 0));
        }
        const isNewLockInCycleStart =
          lockInTemplate > 0 &&
          member.role === "MEMBER" &&
          collectionStatus === "FULLY_PAID" &&
          !settleExistingBalanceOnly &&
          sameTierAsMember &&
          monthsCharged > 0 &&
          sumMonthsExclCurrent >= lockInTemplate &&
          priorMonthsInCurrentCycleExclCurrent === 0;
        const lockInPaidMonths = lockInTemplate > 0 ? Math.min(lockInTemplate, fullPaidSameTierMonths) : 0;
        const lockInRemaining = Math.max(lockInTemplate - lockInPaidMonths, 0);
        lockInPaidMonthsForSummary = lockInTemplate > 0 ? lockInPaidMonths : null;
        const now = nowInPH();
        /**
         * Contract horizon for lock-in: "now + remaining obligation months" (not old `fullMembershipExpiry + remaining`,
         * which double-extended). When obligation is satisfied, clear the field so days-left fallbacks use rolling access only.
         */
        const fullMembershipExpiryAfterLockIn =
          lockInRemaining > 0 ? addMonths(now, lockInRemaining) : null;
        const lockInLabel = lockInRemaining > 0 ? `${lockInRemaining} Months Lock-In Left` : "No Lock-in";
        const lockInCycleJustCompleted = lockInTemplate > 0 && lockInRemaining === 0;

        if (settleExistingBalanceOnly) {
          const newBalance = Math.max(0, existingMemberBalance - Number(amountNumber));
          // Days-left / status follow rolling access; only fall back to contract horizon while lock-in months remain.
          const accessExpiry =
            member.monthlyExpiryDate ??
            member.membershipExpiry ??
            (lockInRemaining > 0 ? fullMembershipExpiryAfterLockIn : null) ??
            nowInPH();
          const daysLeft = computeDaysLeft(accessExpiry);
          const membershipStatus = resolveMembershipStatus(daysLeft);
          updatedMember = await tx.user.update({
            where: { id: member.id },
            data: {
              remainingBalance: toMoney(newBalance),
              fullMembershipExpiry: fullMembershipExpiryAfterLockIn,
              membershipExpiry: accessExpiry,
              daysLeft,
              membershipStatus,
              lockInLabel,
              remainingMonths: lockInRemaining,
              monthlyFeeLabel: formatPesoLabel(service.monthlyRate),
              membershipFeeLabel: formatPesoLabel(service.membershipFee),
              gracePeriodEnd: addDays(accessExpiry, 7),
            },
          });
        } else {
          let monthlyExpiryDate: Date | null = member.monthlyExpiryDate;
          if (!skipMonthlyExtensionForUnsettledSameTier) {
            const rollingRef: Date | null = member.monthlyExpiryDate ?? member.membershipExpiry ?? null;
            const restartRollingFromPayment =
              isNewLockInCycleStart ||
              rollingRef == null ||
              !isAfter(rollingRef, now);
            let monthlyExpiryCursor: Date | null = restartRollingFromPayment ? null : rollingRef;
            const cycleDays = Number(service.accessCycleDays) || 30;
            for (let i = 0; i < monthsCharged; i++) {
              monthlyExpiryCursor = extendMonthlyExpiry(monthlyExpiryCursor, cycleDays);
            }
            monthlyExpiryDate = monthlyExpiryCursor as Date;
          }
          // `fullMembershipExpiry` keeps the contract / lock-in end while months remain; `membershipExpiry` + daysLeft track the rolling cycle. No contract fallback after lock-in completes.
          const accessExpiry =
            monthlyExpiryDate ??
            member.monthlyExpiryDate ??
            member.membershipExpiry ??
            (lockInRemaining > 0 ? fullMembershipExpiryAfterLockIn : null) ??
            nowInPH();
          const daysLeft = computeDaysLeft(accessExpiry);
          const membershipStatus = resolveMembershipStatus(daysLeft);
          updatedMember = await tx.user.update({
            where: { id: member.id },
            data: {
              monthlyExpiryDate,
              membershipExpiry: accessExpiry,
              fullMembershipExpiry: fullMembershipExpiryAfterLockIn,
              daysLeft,
              membershipStatus,
              membershipTier: service.tier,
              lockInLabel,
              remainingMonths: lockInRemaining,
              monthlyFeeLabel: formatPesoLabel(service.monthlyRate),
              membershipFeeLabel: formatPesoLabel(service.membershipFee),
              gracePeriodEnd: addDays(accessExpiry, 7),
              ...(member.membershipStart ? {} : { membershipStart: nowInPH() }),
            },
          });
        }
        if (lockInCycleJustCompleted) {
          await safeSetUserLockInCycleAnchorAt(tx, member.id, payment.paidAt);
        }
      } else if (member.role === "MEMBER" && isMonthlyFeePayment && !isMembershipService) {
        const monthlyExpiryDate = extendMonthlyExpiry(member.monthlyExpiryDate);
        updatedMember = await tx.user.update({
          where: { id: member.id },
          data: {
            monthlyExpiryDate,
            monthlyFeeLabel: formatPesoLabel(service.monthlyRate),
            membershipFeeLabel: formatPesoLabel(service.membershipFee),
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

      if (member.role === "MEMBER" && isMembershipMonthlyPayment) {
        const outstanding =
          collectionStatus === "PARTIAL" ? Math.max(0, Number(membershipExpectedDue) - Number(amountNumber)) : 0;
        if (outstanding > 0) {
          const prevBalance = Number(updatedMember.remainingBalance ?? 0);
          updatedMember = await tx.user.update({
            where: { id: member.id },
            data: { remainingBalance: toMoney(Math.max(0, prevBalance + outstanding)) },
          });
        }
      }

      const loyaltyPointsEarned = paymentEarnsLoyalty(transactionType) ? loyaltyPointsFromPesoAmount(amountNumber) : 0;
      if (loyaltyPointsEarned > 0) {
        await expireLoyaltyStarsIfInactive(tx, member.id, nowInPH(), session.admin.email);
        const starsAfterInactivity = await tx.user.findUnique({
          where: { id: member.id },
          select: { loyaltyStars: true },
        });
        const prevBalance = starsAfterInactivity?.loyaltyStars ?? 0;
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

      return {
        payment,
        updatedMember: { ...updatedMember, lockInPaidMonths: lockInPaidMonthsForSummary },
      };
    }, PRISMA_INTERACTIVE_TX_OPTIONS);

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

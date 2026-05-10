import { prisma, PRISMA_INTERACTIVE_TX_OPTIONS } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonNoStore } from "@/lib/http";
import { inferMembershipTier } from "@/lib/membership";
import {
  recomputeMemberLockInFields,
  effectiveLockInAnchorForDisplay,
  monthsFromMembershipPaymentRow,
  sumManualLockInMonthsAfterAnchor,
} from "@/lib/lock-in-cycle";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      include: {
        lockInManualEntries: { orderBy: { paidAt: "desc" } },
      },
    });
    if (!user) return jsonNoStore({ success: false, error: "User not found" }, { status: 404 });

    const tier = inferMembershipTier({
      membershipTier: user.membershipTier,
      lockInLabel: user.lockInLabel,
      monthlyFeeLabel: user.monthlyFeeLabel,
      membershipFeeLabel: user.membershipFeeLabel,
      membershipNotes: user.membershipNotes,
    });
    const svc = await prisma.service.findFirst({
      where: { name: "Membership", tier, isActive: true },
      select: { contractMonths: true },
    });
    const templateMonths = Math.max(0, Math.trunc(Number(svc?.contractMonths) || 0));
    const fullTierPayments = await prisma.payment.findMany({
      where: {
        userId: params.id,
        transactionType: "MONTHLY_FEE",
        collectionStatus: "FULLY_PAID",
        service: { name: "Membership", tier },
      },
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        paidAt: true,
        grossAmount: true,
        amount: true,
        service: { select: { monthlyRate: true, tier: true } },
      },
    });
    const anchor = effectiveLockInAnchorForDisplay(
      (user as { lockInCycleAnchorAt?: Date | null }).lockInCycleAnchorAt,
      templateMonths,
      fullTierPayments,
    );
    const paymentsInCycle = fullTierPayments.filter(
      (p) => !anchor || p.paidAt.getTime() > anchor.getTime(),
    );

    let paymentMonthsTotal = 0;
    for (const p of paymentsInCycle) {
      paymentMonthsTotal += monthsFromMembershipPaymentRow(p);
    }
    const manualMonthsTotal = sumManualLockInMonthsAfterAnchor(
      user.lockInManualEntries.map((e) => ({ paidMonths: e.paidMonths, paidAt: e.paidAt })),
      anchor,
    );
    const paidMonthsTotal = paymentMonthsTotal + manualMonthsTotal;
    const paidMonthsCapped = templateMonths > 0 ? Math.min(templateMonths, paidMonthsTotal) : 0;
    const remainingMonths = templateMonths > 0 ? Math.max(0, templateMonths - paidMonthsCapped) : 0;

    return jsonNoStore({
      success: true,
      data: {
        tier,
        templateMonths,
        anchorAt: anchor?.toISOString() ?? null,
        paymentsInCycle,
        manualEntries: user.lockInManualEntries,
        paymentMonthsTotal,
        manualMonthsTotal,
        paidMonthsTotal,
        paidMonthsCapped,
        remainingMonths,
        userRemainingMonths: user.remainingMonths,
        userLockInLabel: user.lockInLabel,
      },
    });
  } catch (error) {
    return jsonNoStore(
      {
        success: false,
        error: "Failed to load lock-in entries",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { paidMonths?: number; paidAt?: string; notes?: string | null };
    const paidMonths = Math.max(1, Math.trunc(Number(body.paidMonths ?? 1)));
    const paidAtRaw = body.paidAt?.trim();
    if (!paidAtRaw) {
      return jsonNoStore({ success: false, error: "paidAt is required." }, { status: 400 });
    }
    const paidAt = new Date(paidAtRaw);
    if (Number.isNaN(paidAt.getTime())) {
      return jsonNoStore({ success: false, error: "Invalid paidAt date." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, role: true } });
    if (!user) return jsonNoStore({ success: false, error: "User not found" }, { status: 404 });
    if (user.role !== "MEMBER") {
      return jsonNoStore({ success: false, error: "Lock-in entries are only for members." }, { status: 400 });
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.lockInManualEntry.create({
          data: {
            userId: params.id,
            paidMonths,
            paidAt,
            notes: body.notes?.trim() || null,
            createdBy: session.admin.email,
          },
        });
        await recomputeMemberLockInFields(tx, params.id);
      },
      PRISMA_INTERACTIVE_TX_OPTIONS,
    );

    return jsonNoStore({ success: true });
  } catch (error) {
    return jsonNoStore(
      {
        success: false,
        error: "Failed to create lock-in entry",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

import type { Prisma } from "@prisma/client";
import { inferMembershipTier } from "@/lib/membership";

/** Months represented by one fully-paid membership row (gross / monthly rate, min 1). */
export function monthsFromMembershipPaymentRow(row: {
  grossAmount: Prisma.Decimal | null;
  amount: Prisma.Decimal | null;
  service: { monthlyRate: Prisma.Decimal | number; membershipFee?: Prisma.Decimal | number | null };
}): number {
  const monthlyRate = Number(row.service.monthlyRate);
  const gross = Number(row.grossAmount ?? row.amount ?? 0);
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  if (monthlyRate > 0 && Number.isFinite(monthlyRate)) {
    const fromGross = Math.max(1, Math.trunc(Math.round(gross / monthlyRate) || 1));
    const membershipFee = Number(row.service.membershipFee ?? 0);
    if (Number.isFinite(membershipFee) && membershipFee > 0 && gross > membershipFee) {
      const feeAdjustedRaw = (gross - membershipFee) / monthlyRate;
      const fromFeeAdjusted = Math.max(1, Math.trunc(Math.round(feeAdjustedRaw) || 1));
      const grossOnlyError = Math.abs(gross - fromGross * monthlyRate);
      const feeAdjustedError = Math.abs(gross - (fromFeeAdjusted * monthlyRate + membershipFee));
      // Prefer fee-adjusted months only when it better explains the recorded gross amount.
      if (feeAdjustedError + 0.01 < grossOnlyError) {
        return fromFeeAdjusted;
      }
    }
    return fromGross;
  }
  return 1;
}

export function sumManualLockInMonthsAfterAnchor(
  entries: Array<{ paidMonths: number; paidAt: Date; createdAt?: Date | null }>,
  anchor: Date | null,
): number {
  return entries
    .filter((e) => isManualEntryInActiveCycle(e, anchor))
    .reduce((sum, e) => sum + Math.max(0, Math.trunc(Number(e.paidMonths) || 0)), 0);
}

function toPhYmd(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/**
 * Manual credits are date-driven admin adjustments; treat the same PH calendar day as the anchor
 * as part of the active cycle to avoid accidental exclusion from midnight-vs-time mismatches.
 */
export function isManualEntryInActiveCycle(
  entry: { paidAt: Date; createdAt?: Date | null },
  anchor: Date | null,
): boolean {
  if (!anchor) return true;
  if (entry.paidAt.getTime() > anchor.getTime()) return true;
  if (toPhYmd(entry.paidAt) === toPhYmd(anchor)) return true;
  // Backdated manual credits should still count in current cycle when the admin added them
  // after anchor (recorded at createdAt), even if paidAt is historical.
  if (entry.createdAt && entry.createdAt.getTime() > anchor.getTime()) return true;
  return entry.createdAt ? toPhYmd(entry.createdAt) === toPhYmd(anchor) : false;
}

export function lockInLabelFromRemaining(remaining: number): string {
  return remaining > 0 ? `${remaining} Months Lock-In Left` : "No Lock-in";
}

/** Best-effort template months parsed from lock-in label text (e.g. "6 Months Lock-In"). */
export function lockInTemplateMonthsFromLabel(label: string | null | undefined): number | null {
  const text = (label ?? "").trim().toLowerCase();
  if (!text) return null;
  const m = text.match(/(\d+)\s*months?/i);
  if (!m) return null;
  const n = Math.max(0, Math.trunc(Number(m[1])));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type LockInMembershipPaymentRow = {
  id: string;
  paidAt: Date;
  grossAmount: Prisma.Decimal | null;
  amount: Prisma.Decimal | null;
  service: { monthlyRate: Prisma.Decimal | number; membershipFee?: Prisma.Decimal | number | null };
};

/**
 * First `paidAt` where cumulative paid months reach the tier lock-in template, if any later payment exists
 * (new cycle started). Used when DB `lockInCycleAnchorAt` is missing.
 */
export function inferredLockInCycleAnchorFromPayments(
  rows: Array<{
    paidAt: Date;
    grossAmount: Prisma.Decimal | null;
    amount: Prisma.Decimal | null;
    service: { monthlyRate: Prisma.Decimal | number; membershipFee?: Prisma.Decimal | number | null };
  }>,
  lockInTemplate: number,
): Date | null {
  if (lockInTemplate <= 0 || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  let cum = 0;
  let crossingPaidAt: Date | null = null;
  for (const p of sorted) {
    cum += monthsFromMembershipPaymentRow(p);
    if (cum >= lockInTemplate) {
      crossingPaidAt = p.paidAt;
      break;
    }
  }
  if (crossingPaidAt == null) return null;
  const hasAfter = sorted.some((p) => p.paidAt.getTime() > crossingPaidAt!.getTime());
  return hasAfter ? crossingPaidAt : null;
}

/** Read model: anchor stored on user, or inferred when a new cycle exists but anchor was never saved. */
export function effectiveLockInAnchorForDisplay(
  dbAnchor: Date | null | undefined,
  lockInTemplate: number,
  rows: Parameters<typeof inferredLockInCycleAnchorFromPayments>[0],
): Date | null {
  if (lockInTemplate <= 0) return dbAnchor ?? null;
  if (dbAnchor) return dbAnchor;
  return inferredLockInCycleAnchorFromPayments(rows, lockInTemplate);
}

/** Postgres 42703: `"User"."lockInCycleAnchorAt"` not migrated yet. */
export function isUserLockInAnchorColumnMissingError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("lockInCycleAnchorAt") &&
    (msg.includes("42703") || msg.includes("does not exist"))
  );
}

/**
 * Read `lockInCycleAnchorAt` via SQL so payment confirm works even when `npx prisma generate` was not run
 * after the field was added to `schema.prisma` (stale client rejects `select: { lockInCycleAnchorAt: true }`).
 * Returns null if the column is missing in the database (run `prisma/sql/add_lock_in_cycle_anchor.sql`).
 */
export async function fetchLockInCycleAnchorAtRaw(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<Date | null> {
  try {
    const rows = await tx.$queryRaw<Array<{ lockInCycleAnchorAt: Date | null }>>`
      SELECT "lockInCycleAnchorAt" FROM "User" WHERE "id" = ${userId} LIMIT 1
    `;
    return rows[0]?.lockInCycleAnchorAt ?? null;
  } catch (e) {
    if (isUserLockInAnchorColumnMissingError(e)) return null;
    throw e;
  }
}

/** Persist anchor; no-op if the DB column has not been created yet. */
export async function safeSetUserLockInCycleAnchorAt(
  tx: Prisma.TransactionClient,
  userId: string,
  at: Date | null,
): Promise<void> {
  try {
    if (at == null) {
      await tx.$executeRaw`
        UPDATE "User"
        SET "lockInCycleAnchorAt" = NULL
        WHERE "id" = ${userId}
      `;
    } else {
      await tx.$executeRaw`
        UPDATE "User"
        SET "lockInCycleAnchorAt" = ${at}
        WHERE "id" = ${userId}
      `;
    }
  } catch (e) {
    if (!isUserLockInAnchorColumnMissingError(e)) throw e;
  }
}

/**
 * When `lockInCycleAnchorAt` was never stored (e.g. failed write) but the member has started a new lock-in
 * cycle (payments after the tier minimum), persist the end-of-previous-cycle boundary so only post-cycle
 * payments count toward the current obligation.
 */
export async function ensureLockInCycleAnchorAndLoadMembershipPayments(
  tx: Prisma.TransactionClient,
  userId: string,
  tier: string,
  lockInTemplate: number,
): Promise<{ activeAnchor: Date | null; rows: LockInMembershipPaymentRow[] }> {
  const rows = await tx.payment.findMany({
    where: {
      userId,
      transactionType: "MONTHLY_FEE",
      collectionStatus: "FULLY_PAID",
      service: { name: "Membership", tier },
    },
    select: {
      id: true,
      paidAt: true,
      grossAmount: true,
      amount: true,
      service: { select: { monthlyRate: true, membershipFee: true } },
    },
    orderBy: { paidAt: "asc" },
  });

  if (lockInTemplate <= 0) {
    const activeAnchor = await fetchLockInCycleAnchorAtRaw(tx, userId);
    return { activeAnchor, rows };
  }

  let activeAnchor = await fetchLockInCycleAnchorAtRaw(tx, userId);

  if (!activeAnchor && rows.length > 0) {
    const crossingPaidAt = inferredLockInCycleAnchorFromPayments(rows, lockInTemplate);
    if (crossingPaidAt != null) {
      await safeSetUserLockInCycleAnchorAt(tx, userId, crossingPaidAt);
      activeAnchor = crossingPaidAt;
    }
  }

  return { activeAnchor, rows };
}

/** Recompute `remainingMonths` and `lockInLabel` from payments + manual entries after the member's cycle anchor. */
export async function recomputeMemberLockInFields(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    include: { lockInManualEntries: { select: { paidMonths: true, paidAt: true, createdAt: true } } },
  });
  if (!user || user.role !== "MEMBER") return;

  const tier = inferMembershipTier({
    membershipTier: user.membershipTier,
    lockInLabel: user.lockInLabel,
    monthlyFeeLabel: user.monthlyFeeLabel,
    membershipFeeLabel: user.membershipFeeLabel,
    membershipNotes: user.membershipNotes,
  });
  const svc = await tx.service.findFirst({
    where: { name: "Membership", tier, isActive: true },
    select: { contractMonths: true },
  });
  const fallbackTemplate = lockInTemplateMonthsFromLabel(user.lockInLabel);
  const template = Math.max(0, Math.trunc(Number(svc?.contractMonths) || fallbackTemplate || 0));
  if (template <= 0) {
    await tx.user.update({
      where: { id: userId },
      data: { remainingMonths: null, lockInLabel: "No Lock-in" },
    });
    return;
  }

  const { activeAnchor, rows: payments } = await ensureLockInCycleAnchorAndLoadMembershipPayments(
    tx,
    userId,
    tier,
    template,
  );

  let sum = 0;
  for (const p of payments) {
    if (activeAnchor && p.paidAt.getTime() <= activeAnchor.getTime()) continue;
    sum += monthsFromMembershipPaymentRow(p);
  }
  sum += sumManualLockInMonthsAfterAnchor(
    user.lockInManualEntries.map((e) => ({ paidMonths: e.paidMonths, paidAt: e.paidAt, createdAt: e.createdAt })),
    activeAnchor,
  );

  const paidCapped = Math.min(template, sum);
  const remaining = Math.max(0, template - paidCapped);
  await tx.user.update({
    where: { id: userId },
    data: {
      remainingMonths: remaining,
      lockInLabel: lockInLabelFromRemaining(remaining),
    },
  });
}

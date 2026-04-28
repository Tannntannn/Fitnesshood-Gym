import { MembershipLifecycleStatus, PaymentMethod, Prisma } from "@prisma/client";
import { addDays, differenceInCalendarDays, isAfter } from "date-fns";
import { nowInPH } from "@/lib/time";

export const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "GCASH", "CARD", "BANK_TRANSFER", "MAYA", "OTHER"];

/** Methods where we collect an optional transaction / reference number (GCash, Maya, bank, card). */
export function methodMayHaveReference(method: string): boolean {
  return method === "GCASH" || method === "MAYA" || method === "BANK_TRANSFER" || method === "CARD";
}

const PAYMENT_REF_MAX = 255;

export function sanitizePaymentReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.length > PAYMENT_REF_MAX ? t.slice(0, PAYMENT_REF_MAX) : t;
}

export function toMoney(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function formatPesoLabel(value: Prisma.Decimal | number): string {
  const amount = value instanceof Prisma.Decimal ? value.toNumber() : Number(value);
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
}

export function resolveMembershipStatus(daysLeft: number | null): MembershipLifecycleStatus {
  if (daysLeft === null) return "NO_EXPIRY";
  if (daysLeft < 0) return "EXPIRED";
  if (daysLeft <= 7) return "WARNING";
  return "ACTIVE";
}

export function computeDaysLeft(expiry: Date | null): number | null {
  if (!expiry) return null;
  return differenceInCalendarDays(expiry, nowInPH());
}

export function extendMonthlyExpiry(existing: Date | null): Date {
  const now = nowInPH();
  const base = existing && isAfter(existing, now) ? existing : now;
  return addDays(base, 30);
}

import { NextResponse } from "next/server";
import { PaymentMethod, PaymentTransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sanitizePaymentReference, toMoney } from "@/lib/payment";
import { requireAdminSession } from "@/lib/admin-auth";

type ImportSplit = {
  method?: string;
  amount?: number | string;
  reference?: string | null;
};

type ImportRow = {
  userId?: string;
  serviceId?: string;
  amount?: number | string;
  grossAmount?: number | string | null;
  discountPercent?: number | null;
  discountAmount?: number | string | null;
  paymentMethod?: string;
  collectionStatus?: "FULLY_PAID" | "PARTIAL";
  paidAt?: string;
  isSplit?: boolean;
  notes?: string | null;
  paymentReference?: string | null;
  orNumber?: string | null;
  splitPayments?: ImportSplit[];
  transactionType?: PaymentTransactionType | null;
};

const METHOD_SET = new Set<string>(Object.values(PaymentMethod));
const TRANSACTION_TYPE_SET = new Set<string>(Object.values(PaymentTransactionType));

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { data?: ImportRow[] };
    const rows = Array.isArray(body.data) ? body.data : [];
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "No payment records found in import file." }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ index: number; reason: string }> = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      try {
        if (!row.userId || !row.serviceId || !row.paymentMethod || !row.paidAt) {
          skipped += 1;
          continue;
        }
        if (!METHOD_SET.has(row.paymentMethod)) {
          skipped += 1;
          continue;
        }
        const paidAtDate = new Date(row.paidAt);
        if (Number.isNaN(paidAtDate.getTime())) {
          skipped += 1;
          continue;
        }
        const amountNumber = Number(row.amount ?? 0);
        if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
          skipped += 1;
          continue;
        }

        const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { id: true } });
        const service = await prisma.service.findUnique({
          where: { id: row.serviceId },
          select: { id: true, name: true },
        });
        if (!user || !service) {
          skipped += 1;
          continue;
        }
        const requestedTypeRaw = String(row.transactionType ?? "").trim().toUpperCase();
        if (requestedTypeRaw && !TRANSACTION_TYPE_SET.has(requestedTypeRaw)) {
          skipped += 1;
          continue;
        }
        const transactionType = (
          requestedTypeRaw ||
          (service.name === "Membership" ? "MONTHLY_FEE" : "LEGACY")
        ) as PaymentTransactionType;

        const existing = await prisma.payment.findFirst({
          where: {
            userId: row.userId,
            serviceId: row.serviceId,
            paidAt: paidAtDate,
            paymentMethod: row.paymentMethod as PaymentMethod,
            amount: toMoney(amountNumber),
          },
          select: { id: true },
        });
        if (existing) {
          skipped += 1;
          continue;
        }

        await prisma.$transaction(async (tx) => {
          const payment = await tx.payment.create({
            data: {
              userId: row.userId!,
              serviceId: row.serviceId!,
              amount: toMoney(amountNumber),
              paymentMethod: row.paymentMethod as PaymentMethod,
              collectionStatus: row.collectionStatus ?? "FULLY_PAID",
              paidAt: paidAtDate,
              isSplit: Boolean(row.isSplit),
              notes: row.notes?.trim() || null,
              paymentReference: sanitizePaymentReference(row.paymentReference),
              orNumber: sanitizePaymentReference(row.orNumber),
            },
          });

          if (
            row.grossAmount !== undefined ||
            row.discountPercent !== undefined ||
            row.discountAmount !== undefined ||
            transactionType
          ) {
            await tx.$executeRaw`
              UPDATE "Payment"
              SET "grossAmount" = ${row.grossAmount !== undefined && row.grossAmount !== null ? toMoney(Number(row.grossAmount)) : null},
                  "discountPercent" = ${row.discountPercent ?? null},
                  "discountAmount" = ${row.discountAmount !== undefined && row.discountAmount !== null ? toMoney(Number(row.discountAmount)) : null},
                  "transactionType" = ${transactionType}::"PaymentTransactionType"
              WHERE "id" = ${payment.id}
            `;
          }

          const splits = (row.splitPayments ?? []).filter((split) => Number(split.amount) > 0 && split.method && METHOD_SET.has(split.method));
          if (splits.length > 0) {
            await tx.splitPayment.createMany({
              data: splits.map((split) => ({
                paymentId: payment.id,
                method: split.method as PaymentMethod,
                amount: toMoney(Number(split.amount)),
                reference: sanitizePaymentReference(split.reference),
              })),
            });
          }
        });

        imported += 1;
      } catch (error) {
        failed += 1;
        errors.push({ index, reason: error instanceof Error ? error.message : "Unknown error" });
      }
    }

    return NextResponse.json({
      success: true,
      data: { total: rows.length, imported, skipped, failed, errors: errors.slice(0, 25) },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to import payments.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

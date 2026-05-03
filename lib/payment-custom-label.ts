import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

type DbLike = Pick<PrismaClient, "$queryRaw">;

export type PaymentExtras = { customAddOnLabel: string | null; receiptGroupId: string | null };

/**
 * Reads columns not guaranteed on older generated Prisma clients (raw SQL).
 * Falls back to `customAddOnLabel` only if `receiptGroupId` column is missing.
 */
export async function fetchPaymentExtrasByIds(db: DbLike, ids: string[]): Promise<Map<string, PaymentExtras>> {
  const map = new Map<string, PaymentExtras>();
  if (ids.length === 0) return map;
  try {
    const rows = await db.$queryRaw<Array<{ id: string; customAddOnLabel: string | null; receiptGroupId: string | null }>>(
      Prisma.sql`
        SELECT id, "customAddOnLabel", "receiptGroupId"
        FROM "Payment"
        WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}`))})
      `,
    );
    for (const row of rows) {
      map.set(row.id, { customAddOnLabel: row.customAddOnLabel, receiptGroupId: row.receiptGroupId });
    }
  } catch {
    try {
      const rows = await db.$queryRaw<Array<{ id: string; customAddOnLabel: string | null }>>(
        Prisma.sql`
          SELECT id, "customAddOnLabel"
          FROM "Payment"
          WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}`))})
        `,
      );
      for (const row of rows) {
        map.set(row.id, { customAddOnLabel: row.customAddOnLabel, receiptGroupId: null });
      }
    } catch {
      // ignore
    }
  }
  return map;
}

export async function fetchPaymentCustomAddOnLabelsByIds(db: DbLike, ids: string[]): Promise<Map<string, string | null>> {
  const extras = await fetchPaymentExtrasByIds(db, ids);
  const m = new Map<string, string | null>();
  extras.forEach((ex, id) => m.set(id, ex.customAddOnLabel));
  return m;
}

export async function fetchPaymentCustomAddOnLabelById(db: DbLike, id: string): Promise<string | null> {
  const ex = (await fetchPaymentExtrasByIds(db, [id])).get(id);
  return ex?.customAddOnLabel ?? null;
}

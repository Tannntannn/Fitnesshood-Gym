import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Active window: same rules as admin intent — visible when now is within [startsAt, endsAt] if those are set. */
export function activeClientAnnouncementWhere(at: Date): Prisma.ClientAnnouncementWhereInput {
  return {
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: at } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: at } }] },
    ],
  };
}

/** Member-facing list; uses Prisma dates (avoids SQL `CURRENT_TIMESTAMP` vs stored timestamp mismatches). */
export async function fetchActiveClientAnnouncements(take: number, at = new Date()) {
  const withImage = await hasAnnouncementImageColumn();
  if (withImage) {
    return prisma.clientAnnouncement.findMany({
      where: activeClientAnnouncementWhere(at),
      orderBy: { updatedAt: "desc" },
      take,
      select: { id: true, title: true, message: true, imageUrl: true, updatedAt: true },
    });
  }
  return prisma.$queryRaw<Array<{ id: string; title: string; message: string; imageUrl: string | null; updatedAt: Date }>>`
    SELECT "id", "title", "message", NULL::text AS "imageUrl", "updatedAt"
    FROM "ClientAnnouncement"
    WHERE "isActive" = true
      AND ("startsAt" IS NULL OR "startsAt" <= ${at})
      AND ("endsAt" IS NULL OR "endsAt" >= ${at})
    ORDER BY "updatedAt" DESC
    LIMIT ${take}
  `;
}

let cachedHasImageColumn: boolean | null = null;
let cachedAtMs = 0;
/** Schema probe is stable; long TTL avoids repeated information_schema hits. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function hasAnnouncementImageColumn(): Promise<boolean> {
  const now = Date.now();
  if (cachedHasImageColumn !== null && now - cachedAtMs < CACHE_TTL_MS) {
    return cachedHasImageColumn;
  }

  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ClientAnnouncement'
        AND column_name = 'imageUrl'
    ) AS "exists"
  `;
  cachedHasImageColumn = Boolean(rows[0]?.exists);
  cachedAtMs = now;
  return cachedHasImageColumn;
}


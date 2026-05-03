import { prisma } from "@/lib/prisma";
import { jsonNoStore } from "@/lib/http";
import { requireAdminSession } from "@/lib/admin-auth";
import { randomUUID } from "node:crypto";
import { hasAnnouncementImageColumn } from "@/lib/announcement-db";
import { resolveProfileImageUrl } from "@/lib/profile-image";

export const dynamic = "force-dynamic";

type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  imageUrl: string | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  updatedAt: Date;
};

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const withImage = await hasAnnouncementImageColumn();
    const data = withImage
      ? await prisma.$queryRaw<AnnouncementRow[]>`
          SELECT "id", "title", "message", "imageUrl", "isActive", "startsAt", "endsAt", "updatedAt"
          FROM "ClientAnnouncement"
          ORDER BY "isActive" DESC, "updatedAt" DESC
          LIMIT 20
        `
      : await prisma.$queryRaw<AnnouncementRow[]>`
          SELECT "id", "title", "message", NULL::text AS "imageUrl", "isActive", "startsAt", "endsAt", "updatedAt"
          FROM "ClientAnnouncement"
          ORDER BY "isActive" DESC, "updatedAt" DESC
          LIMIT 20
        `;
    const resolvedData = await Promise.all(
      data.map(async (row) => ({
        ...row,
        imageUrl: await resolveProfileImageUrl(row.imageUrl),
      })),
    );
    return jsonNoStore({ success: true, data: resolvedData });
  } catch (error) {
    return jsonNoStore(
      { success: false, error: "Failed to fetch announcements.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      title?: string;
      message?: string;
      imageUrl?: string | null;
      isActive?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
    };
    const title = body.title?.trim() ?? "";
    const message = body.message?.trim() ?? "";
    const imageUrl = body.imageUrl?.trim() || null;
    if (!title || !message) {
      return jsonNoStore({ success: false, error: "Title and message are required." }, { status: 400 });
    }
    const startsAt = body.startsAt ? new Date(body.startsAt) : null;
    const endsAt = body.endsAt ? new Date(body.endsAt) : null;
    if (startsAt && Number.isNaN(startsAt.getTime())) {
      return jsonNoStore({ success: false, error: "Invalid startsAt date." }, { status: 400 });
    }
    if (endsAt && Number.isNaN(endsAt.getTime())) {
      return jsonNoStore({ success: false, error: "Invalid endsAt date." }, { status: 400 });
    }
    if (startsAt && endsAt && endsAt < startsAt) {
      return jsonNoStore({ success: false, error: "End date must be after start date." }, { status: 400 });
    }

    const id = randomUUID();
    const withImage = await hasAnnouncementImageColumn();
    if (withImage) {
      await prisma.$executeRaw`
        INSERT INTO "ClientAnnouncement" ("id", "title", "message", "imageUrl", "isActive", "startsAt", "endsAt")
        VALUES (${id}, ${title}, ${message}, ${imageUrl}, ${body.isActive ?? true}, ${startsAt}, ${endsAt})
      `;
    } else {
      await prisma.$executeRaw`
        INSERT INTO "ClientAnnouncement" ("id", "title", "message", "isActive", "startsAt", "endsAt")
        VALUES (${id}, ${title}, ${message}, ${body.isActive ?? true}, ${startsAt}, ${endsAt})
      `;
    }
    const data = withImage
      ? await prisma.$queryRaw<AnnouncementRow[]>`
          SELECT "id", "title", "message", "imageUrl", "isActive", "startsAt", "endsAt", "updatedAt"
          FROM "ClientAnnouncement"
          WHERE "id" = ${id}
          LIMIT 1
        `
      : await prisma.$queryRaw<AnnouncementRow[]>`
          SELECT "id", "title", "message", NULL::text AS "imageUrl", "isActive", "startsAt", "endsAt", "updatedAt"
          FROM "ClientAnnouncement"
          WHERE "id" = ${id}
          LIMIT 1
        `;
    const created = data[0] ?? null;
    const resolvedCreated = created
      ? {
          ...created,
          imageUrl: await resolveProfileImageUrl(created.imageUrl),
        }
      : null;
    return jsonNoStore({ success: true, data: resolvedCreated });
  } catch (error) {
    return jsonNoStore(
      { success: false, error: "Failed to create announcement.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}


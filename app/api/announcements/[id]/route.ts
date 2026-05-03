import { prisma } from "@/lib/prisma";
import { jsonNoStore } from "@/lib/http";
import { requireAdminSession } from "@/lib/admin-auth";
import { hasAnnouncementImageColumn } from "@/lib/announcement-db";
import { resolveProfileImageUrl } from "@/lib/profile-image";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: Params) {
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
    const withImage = await hasAnnouncementImageColumn();
    const currentRows = withImage
      ? await prisma.$queryRaw<
      Array<{ id: string; title: string; message: string; imageUrl: string | null; isActive: boolean; startsAt: Date | null; endsAt: Date | null; updatedAt: Date }>
    >`
      SELECT "id", "title", "message", "imageUrl", "isActive", "startsAt", "endsAt", "updatedAt"
      FROM "ClientAnnouncement"
      WHERE "id" = ${params.id}
      LIMIT 1
    `
      : await prisma.$queryRaw<
          Array<{ id: string; title: string; message: string; imageUrl: string | null; isActive: boolean; startsAt: Date | null; endsAt: Date | null; updatedAt: Date }>
        >`
          SELECT "id", "title", "message", NULL::text AS "imageUrl", "isActive", "startsAt", "endsAt", "updatedAt"
          FROM "ClientAnnouncement"
          WHERE "id" = ${params.id}
          LIMIT 1
        `;
    const current = currentRows[0];
    if (!current) {
      return jsonNoStore({ success: false, error: "Announcement not found." }, { status: 404 });
    }
    const nextTitle = body.title !== undefined ? body.title.trim() : current.title;
    const nextMessage = body.message !== undefined ? body.message.trim() : current.message;
    const nextImageUrl = body.imageUrl !== undefined ? (body.imageUrl?.trim() || null) : current.imageUrl;
    const nextIsActive = body.isActive !== undefined ? body.isActive : current.isActive;
    const nextStartsAt = body.startsAt !== undefined ? (body.startsAt ? new Date(body.startsAt) : null) : current.startsAt;
    const nextEndsAt = body.endsAt !== undefined ? (body.endsAt ? new Date(body.endsAt) : null) : current.endsAt;

    if (withImage) {
      await prisma.$executeRaw`
        UPDATE "ClientAnnouncement"
        SET "title" = ${nextTitle},
            "message" = ${nextMessage},
            "imageUrl" = ${nextImageUrl},
            "isActive" = ${nextIsActive},
            "startsAt" = ${nextStartsAt},
            "endsAt" = ${nextEndsAt},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${params.id}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE "ClientAnnouncement"
        SET "title" = ${nextTitle},
            "message" = ${nextMessage},
            "isActive" = ${nextIsActive},
            "startsAt" = ${nextStartsAt},
            "endsAt" = ${nextEndsAt},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${params.id}
      `;
    }
    const rows = withImage
      ? await prisma.$queryRaw<
      Array<{ id: string; title: string; message: string; imageUrl: string | null; isActive: boolean; startsAt: Date | null; endsAt: Date | null; updatedAt: Date }>
    >`
      SELECT "id", "title", "message", "imageUrl", "isActive", "startsAt", "endsAt", "updatedAt"
      FROM "ClientAnnouncement"
      WHERE "id" = ${params.id}
      LIMIT 1
    `
      : await prisma.$queryRaw<
          Array<{ id: string; title: string; message: string; imageUrl: string | null; isActive: boolean; startsAt: Date | null; endsAt: Date | null; updatedAt: Date }>
        >`
          SELECT "id", "title", "message", NULL::text AS "imageUrl", "isActive", "startsAt", "endsAt", "updatedAt"
          FROM "ClientAnnouncement"
          WHERE "id" = ${params.id}
          LIMIT 1
        `;
    const updated = rows[0] ?? null;
    const resolvedUpdated = updated
      ? {
          ...updated,
          imageUrl: await resolveProfileImageUrl(updated.imageUrl),
        }
      : null;
    return jsonNoStore({ success: true, data: resolvedUpdated });
  } catch (error) {
    return jsonNoStore(
      { success: false, error: "Failed to update announcement.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    await prisma.$executeRaw`DELETE FROM "ClientAnnouncement" WHERE "id" = ${params.id}`;
    return jsonNoStore({ success: true, data: { id: params.id } });
  } catch (error) {
    return jsonNoStore(
      { success: false, error: "Failed to delete announcement.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}


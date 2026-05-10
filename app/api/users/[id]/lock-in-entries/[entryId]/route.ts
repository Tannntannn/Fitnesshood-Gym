import { prisma, PRISMA_INTERACTIVE_TX_OPTIONS } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonNoStore } from "@/lib/http";
import { recomputeMemberLockInFields } from "@/lib/lock-in-cycle";

type Params = { params: { id: string; entryId: string } };

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { paidMonths?: number; paidAt?: string; notes?: string | null };
    const existing = await prisma.lockInManualEntry.findFirst({
      where: { id: params.entryId, userId: params.id },
    });
    if (!existing) return jsonNoStore({ success: false, error: "Entry not found." }, { status: 404 });

    const paidMonths =
      body.paidMonths !== undefined ? Math.max(1, Math.trunc(Number(body.paidMonths))) : existing.paidMonths;
    let paidAt = existing.paidAt;
    if (body.paidAt !== undefined) {
      const d = new Date(body.paidAt);
      if (Number.isNaN(d.getTime())) {
        return jsonNoStore({ success: false, error: "Invalid paidAt date." }, { status: 400 });
      }
      paidAt = d;
    }
    const notes = body.notes !== undefined ? (body.notes?.trim() || null) : existing.notes;

    await prisma.$transaction(
      async (tx) => {
        await tx.lockInManualEntry.update({
          where: { id: params.entryId },
          data: { paidMonths, paidAt, notes },
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
        error: "Failed to update lock-in entry",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const existing = await prisma.lockInManualEntry.findFirst({
      where: { id: params.entryId, userId: params.id },
    });
    if (!existing) return jsonNoStore({ success: false, error: "Entry not found." }, { status: 404 });

    await prisma.$transaction(
      async (tx) => {
        await tx.lockInManualEntry.delete({ where: { id: params.entryId } });
        await recomputeMemberLockInFields(tx, params.id);
      },
      PRISMA_INTERACTIVE_TX_OPTIONS,
    );

    return jsonNoStore({ success: true });
  } catch (error) {
    return jsonNoStore(
      {
        success: false,
        error: "Failed to delete lock-in entry",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as {
      addonName?: string;
      dueDate?: string | null;
      status?: string;
      notes?: string | null;
      markPaidNow?: boolean;
    };
    let addonName: string | undefined;
    if (body.addonName !== undefined) {
      const t = body.addonName.trim();
      if (!t) {
        return NextResponse.json({ success: false, error: "Add-on name cannot be empty." }, { status: 400 });
      }
      if (t.length > 120) {
        return NextResponse.json({ success: false, error: "Add-on name is too long." }, { status: 400 });
      }
      addonName = t;
    }
    const updated = await prisma.addOnSubscription.update({
      where: { id: params.id },
      data: {
        addonName,
        dueDate: body.dueDate === undefined ? undefined : body.dueDate ? new Date(body.dueDate) : null,
        status: body.status ? body.status.trim().toUpperCase() : undefined,
        notes: body.notes === undefined ? undefined : body.notes?.trim() || null,
        lastPaymentAt: body.markPaidNow ? new Date() : undefined,
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update add-on.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const deleted = await prisma.addOnSubscription.delete({ where: { id: params.id }, select: { id: true } });
    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to delete add-on.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

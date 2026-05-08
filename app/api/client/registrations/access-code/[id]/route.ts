import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

  try {
    const body = (await request.json()) as {
      maxUses?: number;
      expiresAt?: string | null;
      isActive?: boolean;
    };

    const data: { maxUses?: number; expiresAt?: Date | null; isActive?: boolean } = {};
    if (body.maxUses !== undefined) {
      data.maxUses = Math.max(1, Math.trunc(Number(body.maxUses)));
    }
    if (body.expiresAt !== undefined) {
      data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    }
    if (body.isActive !== undefined) {
      data.isActive = Boolean(body.isActive);
    }

    const updated = await prisma.walkInAccessCode.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update access code.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

  try {
    const linkedCount = await prisma.walkInRegistration.count({
      where: { accessCodeId: params.id },
    });
    if (linkedCount > 0) {
      return NextResponse.json(
        { success: false, error: "Cannot delete this code because it already has registration records. Deactivate it instead." },
        { status: 409 },
      );
    }

    await prisma.walkInAccessCode.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to delete access code.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

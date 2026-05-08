import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      name?: string;
      tier?: string;
      monthlyRate?: number;
      contractMonths?: number;
      accessCycleDays?: number;
      membershipFee?: number;
      contractPrice?: number;
      isActive?: boolean;
    };

    const updateData: {
      name?: string;
      tier?: string;
      monthlyRate?: number;
      contractMonths?: number;
      accessCycleDays?: number;
      membershipFee?: number;
      contractPrice?: number;
      isActive?: boolean;
    } = {};

    if (typeof body.name === "string") updateData.name = body.name.trim();
    if (typeof body.tier === "string") updateData.tier = body.tier.trim();
    if (body.monthlyRate !== undefined) updateData.monthlyRate = Number(body.monthlyRate);
    if (body.contractMonths !== undefined) updateData.contractMonths = Math.max(0, Math.trunc(Number(body.contractMonths)));
    if (body.accessCycleDays !== undefined) {
      updateData.accessCycleDays = Math.max(1, Math.trunc(Number(body.accessCycleDays)));
    }
    if (body.membershipFee !== undefined) updateData.membershipFee = Number(body.membershipFee);
    if (body.contractPrice !== undefined) updateData.contractPrice = Number(body.contractPrice);
    if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);

    const updated = await prisma.service.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update service.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const deleted = await prisma.service.delete({
      where: { id: params.id },
      select: { id: true, name: true, tier: true },
    });
    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot delete service.",
          details: "This service has existing payment records. Disable it instead.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to delete service.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

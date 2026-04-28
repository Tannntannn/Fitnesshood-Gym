import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const body = (await request.json()) as { name?: string; isActive?: boolean };
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; isActive: boolean }>>`
      UPDATE "Coach"
      SET
        "name" = COALESCE(${body.name?.trim()}, "name"),
        "isActive" = COALESCE(${body.isActive !== undefined ? Boolean(body.isActive) : null}, "isActive"),
        "updatedAt" = NOW()
      WHERE "id" = ${params.id}
      RETURNING "id", "name", "isActive"
    `;
    const updated = rows[0] ?? null;
    if (!updated) {
      return NextResponse.json({ success: false, error: "Coach not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update coach.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const coachRows = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT "id", "name"
      FROM "Coach"
      WHERE "id" = ${params.id}
      LIMIT 1
    `;
    const coach = coachRows[0] ?? null;
    if (!coach) {
      return NextResponse.json({ success: false, error: "Coach not found." }, { status: 404 });
    }

    const assignedCountRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS "count"
      FROM "User"
      WHERE "coachName" = ${coach.name}
    `;
    const assignedCount = Number(assignedCountRows[0]?.count ?? 0);
    if (assignedCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot delete coach.",
          details: `Unassign ${assignedCount} member(s) from ${coach.name} first.`,
        },
        { status: 409 },
      );
    }

    const deletedRows = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      DELETE FROM "Coach"
      WHERE "id" = ${params.id}
      RETURNING "id", "name"
    `;
    const deleted = deletedRows[0] ?? null;
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Coach not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: deleted });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to delete coach.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

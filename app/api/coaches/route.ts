import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const searchParams = new URL(request.url).searchParams;
    const includeInactive = searchParams.get("includeInactive") === "true";
    const coaches = includeInactive
      ? await prisma.$queryRaw<Array<{ id: string; name: string; isActive: boolean }>>`
          SELECT "id", "name", "isActive"
          FROM "Coach"
          ORDER BY "name" ASC
        `
      : await prisma.$queryRaw<Array<{ id: string; name: string; isActive: boolean }>>`
          SELECT "id", "name", "isActive"
          FROM "Coach"
          WHERE "isActive" = true
          ORDER BY "name" ASC
        `;
    return NextResponse.json({ success: true, data: coaches });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch coaches.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { name?: string; isActive?: boolean };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ success: false, error: "Coach name is required." }, { status: 400 });
    }

    const coachId = crypto.randomUUID();
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; isActive: boolean }>>`
      INSERT INTO "Coach" ("id", "name", "isActive")
      VALUES (${coachId}, ${name}, ${body.isActive ?? true})
      RETURNING "id", "name", "isActive"
    `;
    const created = rows[0];

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Unique constraint")) {
      return NextResponse.json({ success: false, error: "Coach name already exists." }, { status: 409 });
    }
    return NextResponse.json(
      { success: false, error: "Failed to create coach.", details: message },
      { status: 500 },
    );
  }
}

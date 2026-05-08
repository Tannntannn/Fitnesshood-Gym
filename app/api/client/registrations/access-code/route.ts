import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

function generateCode(): string {
  return `WALK-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  const data = await prisma.walkInAccessCode.findMany({
    where: {},
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

  try {
    const body = (await request.json()) as { maxUses?: number; expiresInDays?: number; isActive?: boolean };
    const maxUses = Number.isFinite(body.maxUses) ? Math.max(1, Math.trunc(Number(body.maxUses))) : 1;
    const expiresInDays = Number.isFinite(body.expiresInDays)
      ? Math.max(1, Math.trunc(Number(body.expiresInDays)))
      : 7;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    const isActive = body.isActive ?? true;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateCode();
      try {
        const created = await prisma.walkInAccessCode.create({
          data: {
            code,
            maxUses,
            expiresAt,
            isActive,
          },
        });
        return NextResponse.json({ success: true, data: created }, { status: 201 });
      } catch {
        if (attempt === 4) throw new Error("Could not generate a unique code.");
      }
    }

    return NextResponse.json({ success: false, error: "Could not create access code." }, { status: 500 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create access code.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

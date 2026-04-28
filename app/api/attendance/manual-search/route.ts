import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = (params.get("q") ?? "").trim();
    const role = (params.get("role") ?? "").trim();
    if (query.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        ...(role ? { role: role as never } : {}),
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 12,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to search members.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

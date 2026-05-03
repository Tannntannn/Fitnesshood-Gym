import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { nowInPH } from "@/lib/time";
import { getAttendanceBlockReason } from "@/lib/attendance-guard";
import { requireAdminSession } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
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
        freezeStatus: true,
        freezeEndsAt: true,
        monthlyExpiryDate: true,
      },
    });

    const now = nowInPH();
    const data = users.map((user) => {
      const blockReason = getAttendanceBlockReason(
        {
          role: user.role,
          freezeStatus: user.freezeStatus,
          freezeEndsAt: user.freezeEndsAt,
          monthlyExpiryDate: user.monthlyExpiryDate,
        },
        now,
      );
      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        canScan: !blockReason,
        blockReason,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to search members.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

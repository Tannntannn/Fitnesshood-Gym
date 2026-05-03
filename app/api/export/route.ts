import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateExcel } from "@/lib/excel";
import type { AttendanceWithUser } from "@/types";
import { requireAdminSession } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const params = new URL(request.url).searchParams;
    const role = (params.get("role") as UserRole | "all" | null) ?? "all";
    const date = params.get("date");

    const where: Record<string, unknown> = {};
    if (role !== "all") where.roleSnapshot = role;
    if (date) where.date = new Date(date);

    const data = (await prisma.attendance.findMany({
      where,
      include: { user: true },
      orderBy: { scannedAt: "desc" },
    })) as AttendanceWithUser[];

    const buffer = generateExcel(data, role === "all" ? "Attendance" : role);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${role}_records.xlsx"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to export", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const role = (searchParams.get("role") as UserRole | null) ?? undefined;
    const date = searchParams.get("date") ?? undefined;
    const search = searchParams.get("search")?.trim() ?? "";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.max(1, Number(searchParams.get("limit") ?? 50));

    const where: Record<string, unknown> = {};
    if (role) where.roleSnapshot = role;
    if (date) {
      // Use explicit PH (+08:00) day boundaries for accurate date filtering.
      const [yearStr, monthStr, dayStr] = date.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);
      if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
        const dayStartPH = new Date(Date.UTC(year, month - 1, day, 0 - 8, 0, 0));
        const nextDayStartPH = new Date(Date.UTC(year, month - 1, day + 1, 0 - 8, 0, 0));
        where.date = { gte: dayStartPH, lt: nextDayStartPH };
      }
    }
    if (search) {
      const terms = search.split(/\s+/).filter(Boolean);
      where.user = {
        AND: terms.map((term) => ({
          OR: [
            { firstName: { contains: term, mode: "insensitive" } },
            { lastName: { contains: term, mode: "insensitive" } },
          ],
        })),
      };
    }

    const [data, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        include: { user: true },
        orderBy: { scannedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.attendance.count({ where }),
    ]);

    return NextResponse.json({ success: true, data, total, page, limit });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch attendance", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

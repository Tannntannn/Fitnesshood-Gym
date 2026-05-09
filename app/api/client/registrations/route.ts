import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { resolveProfileImageUrl } from "@/lib/profile-image";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

  const searchParams = new URL(request.url).searchParams;
  const status = (searchParams.get("status") ?? "REGISTERED").toUpperCase();
  const take = Number(searchParams.get("take") ?? 25);
  const safeTake = Number.isFinite(take) ? Math.min(100, Math.max(1, Math.trunc(take))) : 25;
  const isValidStatus = status === "REGISTERED" || status === "APPROVED" || status === "DECLINED";

  const rows = await prisma.walkInRegistration.findMany({
    where: isValidStatus ? { status: status as "REGISTERED" | "APPROVED" | "DECLINED" } : undefined,
    orderBy: { createdAt: "desc" },
    take: safeTake,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      contactNo: true,
      address: true,
      notes: true,
      role: true,
      profileImageUrl: true,
      status: true,
      reviewedBy: true,
      reviewedAt: true,
      reviewNotes: true,
      createdAt: true,
      accessCode: { select: { code: true } },
      createdUser: {
        select: { id: true, firstName: true, lastName: true, role: true, createdAt: true },
      },
    },
  });

  const data = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      profileImageUrl: (await resolveProfileImageUrl(row.profileImageUrl)) ?? row.profileImageUrl,
    })),
  );

  return NextResponse.json({ success: true, data });
}

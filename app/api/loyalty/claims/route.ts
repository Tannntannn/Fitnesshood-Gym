import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const status = (params.get("status") ?? "").trim().toUpperCase();
    const where = status ? { status: status as "PENDING" | "APPROVED" | "REJECTED" } : undefined;
    const rows = await prisma.loyaltyClaim.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 80,
      select: {
        id: true,
        userId: true,
        rewardName: true,
        pointsRequired: true,
        status: true,
        approvedBy: true,
        approvedAt: true,
        notes: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true, loyaltyStars: true } },
      },
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to load loyalty claims.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as {
      userId?: string;
      rewardName?: string;
      pointsRequired?: number;
      notes?: string;
    };
    const userId = body.userId?.trim() ?? "";
    const rewardName = body.rewardName?.trim() ?? "";
    const pointsRequired = Math.max(1, Math.trunc(Number(body.pointsRequired ?? 0)));
    if (!userId || !rewardName || !pointsRequired) {
      return NextResponse.json({ success: false, error: "userId, rewardName, and pointsRequired are required." }, { status: 400 });
    }
    const claim = await prisma.loyaltyClaim.create({
      data: {
        userId,
        rewardName,
        pointsRequired,
        status: "PENDING",
        notes: body.notes?.trim() || null,
      },
      select: {
        id: true,
        userId: true,
        rewardName: true,
        pointsRequired: true,
        status: true,
        approvedBy: true,
        approvedAt: true,
        notes: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true, loyaltyStars: true } },
      },
    });
    return NextResponse.json({ success: true, data: claim });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create loyalty claim.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

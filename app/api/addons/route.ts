import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("namesOnly") === "true") {
      const grouped = await prisma.addOnSubscription.groupBy({
        by: ["addonName"],
        orderBy: { addonName: "asc" },
        take: 200,
      });
      return NextResponse.json({ success: true, data: grouped.map((g) => g.addonName) });
    }
    const q = (params.get("q") ?? "").trim();
    const forUserId = (params.get("userId") ?? "").trim();
    const rows = await prisma.addOnSubscription.findMany({
      where: {
        ...(forUserId ? { userId: forUserId } : {}),
        ...(q
          ? {
              OR: [
                { addonName: { contains: q, mode: "insensitive" } },
                { user: { firstName: { contains: q, mode: "insensitive" } } },
                { user: { lastName: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 120,
      select: {
        id: true,
        userId: true,
        serviceId: true,
        addonName: true,
        dueDate: true,
        status: true,
        lastPaymentAt: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        service: { select: { name: true, tier: true } },
        user: { select: { firstName: true, lastName: true } },
        payments: {
          orderBy: { paidAt: "desc" },
          take: 10,
          select: { id: true, paidAt: true, amount: true, paymentMethod: true, transactionType: true },
        },
      },
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to load add-ons.", details: error instanceof Error ? error.message : "Unknown error" },
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
      serviceId?: string | null;
      addonName?: string;
      dueDate?: string | null;
      status?: string;
      notes?: string | null;
    };
    const userId = body.userId?.trim() ?? "";
    const addonName = body.addonName?.trim() ?? "";
    if (!userId || !addonName) {
      return NextResponse.json({ success: false, error: "userId and addonName are required." }, { status: 400 });
    }
    const created = await prisma.addOnSubscription.create({
      data: {
        userId,
        serviceId: body.serviceId?.trim() || null,
        addonName,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        status: (body.status?.trim() || "ACTIVE").toUpperCase(),
        notes: body.notes?.trim() || null,
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create add-on.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

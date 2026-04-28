import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const userId = searchParams.get("userId") ?? undefined;
    const serviceId = searchParams.get("serviceId") ?? undefined;
    const role = searchParams.get("role") ?? undefined;
    const requestedLimit = Number(searchParams.get("limit") ?? 100);
    const limit = Math.min(500, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 100));

    const payments = await prisma.payment.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(serviceId ? { serviceId } : {}),
        ...(role ? { user: { role: role as never } } : {}),
      },
      orderBy: { paidAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true, remainingBalance: true, membershipTier: true } },
        service: { select: { id: true, name: true, tier: true } },
        splitPayments: {
          select: { method: true, amount: true, reference: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: payments });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch payments.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

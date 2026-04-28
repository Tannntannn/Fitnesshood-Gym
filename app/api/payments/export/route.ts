import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const requestedLimit = Number(params.get("limit") ?? 1000);
    const limit = Math.min(5000, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 1000));

    const payments = await prisma.payment.findMany({
      orderBy: { paidAt: "desc" },
      take: limit,
      select: {
        id: true,
        userId: true,
        serviceId: true,
        amount: true,
        grossAmount: true,
        discountPercent: true,
        discountAmount: true,
        paymentMethod: true,
        collectionStatus: true,
        paidAt: true,
        isSplit: true,
        notes: true,
        paymentReference: true,
        splitPayments: {
          select: {
            method: true,
            amount: true,
            reference: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      exportedAt: new Date().toISOString(),
      count: payments.length,
      data: payments,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to export payments.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

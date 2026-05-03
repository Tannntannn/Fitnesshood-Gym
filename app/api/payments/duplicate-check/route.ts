import { NextResponse } from "next/server";
import { subMinutes } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function toNumber(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const params = new URL(request.url).searchParams;
    const userId = params.get("userId")?.trim() ?? "";
    const serviceId = params.get("serviceId")?.trim() ?? "";
    const method = params.get("paymentMethod")?.trim() ?? "";
    const amount = toNumber(params.get("amount"));
    const paymentReference = params.get("paymentReference")?.trim() ?? "";
    const minutes = Math.min(60, Math.max(2, Number(params.get("windowMinutes") ?? 10) || 10));

    if (!userId || !serviceId || !amount || !method) {
      return NextResponse.json({ success: false, error: "userId, serviceId, paymentMethod, and amount are required." }, { status: 400 });
    }

    const since = subMinutes(new Date(), minutes);
    const rows = await prisma.payment.findMany({
      where: {
        userId,
        serviceId,
        paidAt: { gte: since },
        OR: [
          { amount: amount as never, paymentMethod: method as never },
          ...(paymentReference ? [{ paymentReference }] : []),
        ],
      },
      orderBy: { paidAt: "desc" },
      take: 3,
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paidAt: true,
        paymentReference: true,
      },
    });

    return NextResponse.json({
      success: true,
      duplicate: rows.length > 0,
      data: rows,
      windowMinutes: minutes,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to check duplicates.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}


import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonNoStore } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const coachId = searchParams.get("coachId")?.trim() || undefined;
    const paidAfter = searchParams.get("paidAfter");
    const paidBefore = searchParams.get("paidBefore");
    const summaryOnly = searchParams.get("fields") === "summary";
    const limitRaw = Number(searchParams.get("limit") ?? "400");
    const take = Math.min(800, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 400));

    const where = {
      ...(coachId ? { coachId } : {}),
      ...(paidAfter || paidBefore
        ? {
            paidAt: {
              ...(paidAfter ? { gte: new Date(paidAfter) } : {}),
              ...(paidBefore ? { lte: new Date(paidBefore) } : {}),
            },
          }
        : {}),
    };

    const aggregates = await prisma.coachCommissionRemittance.aggregate({
      where,
      _sum: { amount: true },
      _count: true,
    });
    const total = Number(aggregates._sum.amount ?? 0);

    if (summaryOnly) {
      return jsonNoStore({
        success: true,
        data: [],
        summary: { count: aggregates._count, totalAmount: String(total) },
      });
    }

    const rows = await prisma.coachCommissionRemittance.findMany({
      where,
      orderBy: { paidAt: "desc" },
      take,
      include: { coach: { select: { id: true, name: true } } },
    });

    return jsonNoStore({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        coachId: r.coachId,
        coachName: r.coach.name,
        amount: String(r.amount),
        paidAt: r.paidAt.toISOString(),
        paymentMethod: r.paymentMethod,
        paymentReference: r.paymentReference,
        notes: r.notes,
        recordedBy: r.recordedBy,
        createdAt: r.createdAt.toISOString(),
      })),
      summary: { count: aggregates._count, totalAmount: String(total) },
    });
  } catch (error) {
    return jsonNoStore(
      {
        success: false,
        error: "Failed to fetch coach remittances.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

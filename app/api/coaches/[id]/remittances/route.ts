import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonNoStore } from "@/lib/http";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

const METHODS = new Set<string>(Object.values(PaymentMethod));

export async function POST(request: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      amount?: number;
      paidAt?: string;
      paymentMethod?: string;
      paymentReference?: string | null;
      notes?: string | null;
    };

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonNoStore({ success: false, error: "Amount must be greater than zero." }, { status: 400 });
    }

    const paidAtRaw = body.paidAt?.trim();
    if (!paidAtRaw) {
      return jsonNoStore({ success: false, error: "Payment date is required." }, { status: 400 });
    }
    const paidAt = new Date(paidAtRaw);
    if (Number.isNaN(paidAt.getTime())) {
      return jsonNoStore({ success: false, error: "Invalid payment date." }, { status: 400 });
    }

    const methodRaw = (body.paymentMethod ?? "CASH").trim().toUpperCase();
    if (methodRaw === "SPLIT") {
      return jsonNoStore({ success: false, error: "Split is not valid for coach remittances." }, { status: 400 });
    }
    if (!METHODS.has(methodRaw)) {
      return jsonNoStore({ success: false, error: "Invalid payment method." }, { status: 400 });
    }

    const coach = await prisma.coach.findUnique({ where: { id: params.id } });
    if (!coach) {
      return jsonNoStore({ success: false, error: "Coach not found." }, { status: 404 });
    }

    const row = await prisma.coachCommissionRemittance.create({
      data: {
        coachId: coach.id,
        amount,
        paidAt,
        paymentMethod: methodRaw as PaymentMethod,
        paymentReference: body.paymentReference?.trim() || null,
        notes: body.notes?.trim() || null,
        recordedBy: session.admin.email ?? null,
      },
      include: { coach: { select: { id: true, name: true } } },
    });

    return jsonNoStore({
      success: true,
      data: {
        id: row.id,
        coachId: row.coachId,
        coachName: row.coach.name,
        amount: String(row.amount),
        paidAt: row.paidAt.toISOString(),
        paymentMethod: row.paymentMethod,
        paymentReference: row.paymentReference,
        notes: row.notes,
        recordedBy: row.recordedBy,
        createdAt: row.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return jsonNoStore(
      {
        success: false,
        error: "Failed to save remittance.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function GET(_: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await prisma.coachCommissionRemittance.findMany({
      where: { coachId: params.id },
      orderBy: { paidAt: "desc" },
      take: 50,
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
    });
  } catch (error) {
    return jsonNoStore(
      {
        success: false,
        error: "Failed to fetch remittances.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

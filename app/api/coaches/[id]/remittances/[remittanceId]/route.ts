import { PaymentMethod } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonNoStore } from "@/lib/http";

type Params = { params: { id: string; remittanceId: string } };

export const dynamic = "force-dynamic";

const METHODS = new Set<string>(Object.values(PaymentMethod));

type RemittanceWithCoach = {
  id: string;
  coachId: string;
  amount: Decimal;
  paidAt: Date;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: Date;
  coach: { id: string; name: string };
};

function mapRow(row: RemittanceWithCoach) {
  return {
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
  };
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const existing = await prisma.coachCommissionRemittance.findFirst({
      where: { id: params.remittanceId, coachId: params.id },
    });
    if (!existing) {
      return jsonNoStore({ success: false, error: "Remittance not found." }, { status: 404 });
    }

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

    const row = await prisma.coachCommissionRemittance.update({
      where: { id: params.remittanceId },
      data: {
        amount,
        paidAt,
        paymentMethod: methodRaw as PaymentMethod,
        paymentReference: body.paymentReference?.trim() || null,
        notes: body.notes?.trim() || null,
      },
      include: { coach: { select: { id: true, name: true } } },
    });

    return jsonNoStore({ success: true, data: mapRow(row) });
  } catch (error) {
    return jsonNoStore(
      {
        success: false,
        error: "Failed to update remittance.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const existing = await prisma.coachCommissionRemittance.findFirst({
      where: { id: params.remittanceId, coachId: params.id },
    });
    if (!existing) {
      return jsonNoStore({ success: false, error: "Remittance not found." }, { status: 404 });
    }

    await prisma.coachCommissionRemittance.delete({ where: { id: params.remittanceId } });
    return jsonNoStore({ success: true });
  } catch (error) {
    return jsonNoStore(
      {
        success: false,
        error: "Failed to delete remittance.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

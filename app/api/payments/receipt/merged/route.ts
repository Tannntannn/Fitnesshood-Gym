import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchPaymentCustomAddOnLabelsByIds } from "@/lib/payment-custom-label";
import { escReceipt } from "@/lib/receipt-escape";

export const dynamic = "force-dynamic";

const MAX_IDS = 25;

function itemLabelForRow(
  row: {
    service: { name: string; tier: string };
    addOnSubscription: { addonName: string } | null;
  },
  customLabel: string | null,
): string {
  const custom = (customLabel ?? "").trim();
  if (custom) return `Add-on: ${custom}`;
  if (row.addOnSubscription?.addonName) return `Add-on: ${row.addOnSubscription.addonName}`;
  const nm = row.service.name;
  const tier = row.service.tier;
  return tier ? `${nm} (${tier})` : nm;
}

function discountCell(
  gross: number,
  discountAmount: number,
  discountType: string | null,
  discountPercent: number | null,
): string {
  if (!Number.isFinite(discountAmount) || discountAmount <= 0) return "—";
  if (discountType === "FIXED") return `₱${discountAmount.toFixed(2)}`;
  const pct = gross > 0 ? (discountAmount / gross) * 100 : Number(discountPercent ?? 0);
  return `${pct.toFixed(1)}%`;
}

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const raw = new URL(request.url).searchParams.get("ids") ?? "";
    const requested = Array.from(
      new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ).slice(0, MAX_IDS);
    if (requested.length < 1) {
      return NextResponse.json({ success: false, error: "Provide at least one payment id in ids=." }, { status: 400 });
    }

    const payments = await prisma.payment.findMany({
      where: { id: { in: requested } },
      select: {
        id: true,
        userId: true,
        amount: true,
        grossAmount: true,
        discountPercent: true,
        discountAmount: true,
        discountType: true,
        paymentMethod: true,
        collectionStatus: true,
        paidAt: true,
        paymentReference: true,
        notes: true,
        approvedBy: true,
        recordedBy: true,
        splitPayments: { select: { method: true, amount: true, reference: true } },
        loyaltyLedger: {
          where: { reason: "PAYMENT_EARNED" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { points: true, remainingBalance: true },
        },
        user: { select: { firstName: true, lastName: true, role: true, loyaltyStars: true, remainingBalance: true } },
        service: { select: { name: true, tier: true } },
        addOnSubscription: { select: { addonName: true } },
      },
    });

    if (payments.length === 0) {
      return NextResponse.json({ success: false, error: "No matching payments." }, { status: 404 });
    }
    if (payments.length !== requested.length) {
      return NextResponse.json({ success: false, error: "One or more payment ids were not found." }, { status: 400 });
    }

    const userId = payments[0].userId;
    if (payments.some((p) => p.userId !== userId)) {
      return NextResponse.json(
        { success: false, error: "Merged receipt is only for payments belonging to the same client." },
        { status: 400 },
      );
    }

    const orderIdx = new Map(requested.map((id, i) => [id, i]));
    const ordered = [...payments].sort((a, b) => (orderIdx.get(a.id) ?? 0) - (orderIdx.get(b.id) ?? 0));

    const labelMap = await fetchPaymentCustomAddOnLabelsByIds(prisma, ordered.map((p) => p.id));

    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const memberName = `${first.user.firstName} ${first.user.lastName}`;
    const esc = escReceipt;
    const invoiceNo = `Merged · ${ordered.length} line(s)`;
    const dateEarliest = new Date(
      Math.min(...ordered.map((p) => new Date(p.paidAt).getTime())),
    ).toLocaleString();
    const dateLatest = new Date(Math.max(...ordered.map((p) => new Date(p.paidAt).getTime()))).toLocaleString();
    const anyPartial = ordered.some((p) => p.collectionStatus === "PARTIAL");
    const statusLabel = anyPartial ? "Includes partial / mixed" : "Paid";

    const tableRows = ordered
      .map((p) => {
        const gross = Number(p.grossAmount ?? p.amount);
        const discAmt = Number(p.discountAmount ?? 0);
        const item = itemLabelForRow(p, labelMap.get(p.id) ?? null);
        const splitNote =
          p.splitPayments.length > 0
            ? `<div class="muted" style="font-size:9px;margin-top:2px;">Split: ${esc(
                p.splitPayments.map((s) => `${s.method} ${Number(s.amount).toFixed(2)}`).join(" · "),
              )}</div>`
            : "";
        return `<tr>
          <td>${esc(item)}${splitNote}</td>
          <td class="num">1</td>
          <td class="num">PHP ${gross.toFixed(2)}</td>
          <td class="num">${esc(discountCell(gross, discAmt, p.discountType, p.discountPercent))}</td>
          <td class="num">PHP ${Number(p.amount).toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    const totalPaid = ordered.reduce((s, p) => s + Number(p.amount), 0);
    const methods = Array.from(new Set(ordered.map((p) => p.paymentMethod)));
    const methodLabel =
      methods.length === 1
        ? methods[0] === "BANK_TRANSFER"
          ? "Bank Transfer"
          : methods[0]
        : methods.join(" + ");
    const refs = ordered.map((p) => p.paymentReference?.trim()).filter(Boolean);
    const refLine = refs.length ? esc(refs.join(" · ")) : "-";

    const loyaltyPointsSum = ordered.reduce((s, p) => s + (p.loyaltyLedger[0]?.points ?? 0), 0);
    const balanceAfter = last.loyaltyLedger[0]?.remainingBalance ?? last.user.loyaltyStars ?? 0;

    const notesCombined = ordered
      .map((p) => (p.notes?.trim() ? `${p.id.slice(0, 8)}… ${p.notes.trim()}` : null))
      .filter(Boolean)
      .join(" | ");

    const computedAmountDue = anyPartial ? Math.max(Number(last.user.remainingBalance ?? 0), 0) : 0;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(invoiceNo)}</title>
  <style>
    @page { size: 80mm auto; margin: 0 10mm 0 0; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 12px auto; padding: 0 10mm 0 0; max-width: 80mm; color: #0f172a; background: #fff; }
    .top-actions { max-width: 80mm; margin: 0 auto 8px; padding: 0 10mm 0 0; display: flex; justify-content: flex-end; gap: 8px; }
    button { border: 1px solid #94a3b8; background: #fff; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
    .receipt { max-width: 80mm; width: 100%; margin: 0 auto; border: 1px solid #cbd5e1; padding: 8px 0 10px 0; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; flex-wrap: wrap; }
    .gym-name { margin: 0; font-size: 15px; letter-spacing: .2px; line-height: 1.2; }
    .muted { color: #475569; font-size: 10px; margin: 0; line-height: 1.35; }
    .title { margin: 8px 0 10px; font-size: 14px; font-weight: 700; text-transform: uppercase; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; margin-bottom: 10px; font-size: 11px; }
    .lbl { font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: .35px; }
    .value { margin-top: 2px; font-weight: 600; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 5px; text-align: left; }
    th { background: #f8fafc; font-size: 9px; }
    .num { text-align: right; }
    .totals { margin-top: 8px; width: 100%; max-width: 100%; border: 1px solid #cbd5e1; }
    .totals .row { display: flex; justify-content: space-between; gap: 8px; padding: 5px 6px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
    .totals .row:last-child { border-bottom: 0; font-weight: 700; background: #f8fafc; }
    .foot-note { margin-top: 12px; font-size: 11px; color: #334155; }
    .foot-hours { margin-top: 10px; font-size: 10px; color: #334155; line-height: 1.45; white-space: pre-line; }
    .signature { margin-top: 18px; text-align: center; font-size: 10px; color: #334155; }
    .signature-line { width: 100%; max-width: 55mm; margin: 0 auto 6px; border-top: 1px solid #64748b; height: 1px; }
    .extra { margin-top: 8px; font-size: 10px; color: #334155; line-height: 1.4; }
    .extra > div { margin-bottom: 3px; }
    @media print {
      .top-actions { display: none; }
      body { margin: 0; padding: 0; max-width: none; }
      .receipt { border: none; padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="top-actions">
    <button type="button" onclick="window.print()">Print</button>
    <button type="button" onclick="window.close()">Close</button>
  </div>
  <div class="receipt">
    <div class="head">
      <div>
        <p class="gym-name">Fitnesshood Gym Candelaria</p>
        <p class="muted">Gonzales St. Poblacion 9147, Candelaria</p>
        <p class="muted">Tax No.: 644-498-833-00000</p>
        <p class="muted">Phone: 09393987482</p>
        <p class="muted">Email: Fitnesshood@gmail.com</p>
      </div>
      <img src="/logo.png" alt="FitnessHood Logo" style="height:40px;width:40px;object-fit:contain;border:1px solid #cbd5e1;border-radius:6px;padding:2px;flex-shrink:0;" />
    </div>
    <div class="title">Acknowledgment Receipt (combined)</div>
    <div class="meta">
      <div>
        <div class="lbl">Bill to</div>
        <div class="value">${esc(memberName)}</div>
      </div>
      <div>
        <div class="lbl">Invoice / ref</div>
        <div class="value">${esc(invoiceNo)}</div>
      </div>
      <div>
        <div class="lbl">Date (earliest)</div>
        <div class="value">${esc(dateEarliest)}</div>
      </div>
      <div>
        <div class="lbl">Date (latest)</div>
        <div class="value">${esc(dateLatest)}</div>
      </div>
      <div>
        <div class="lbl">Payment status</div>
        <div class="value">${esc(statusLabel)}</div>
      </div>
      <div>
        <div class="lbl">Membership role</div>
        <div class="value">${esc(first.user.role)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="num">Qty</th>
          <th class="num">Unit price</th>
          <th class="num">Discount</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Combined total</span><span>PHP ${totalPaid.toFixed(2)}</span></div>
      <div class="row"><span>Payment method(s)</span><span>${esc(methodLabel)}</span></div>
      <div class="row"><span>Total paid (this receipt)</span><span>PHP ${totalPaid.toFixed(2)}</span></div>
      <div class="row"><span>Amount due (account)</span><span>PHP ${computedAmountDue.toFixed(2)}</span></div>
    </div>

    <div class="extra">
      <div><strong>Lines included:</strong> ${ordered.length}</div>
      <div><strong>Reference(s):</strong> ${refLine}</div>
      <div><strong>Loyalty points (sum on these lines):</strong> ${loyaltyPointsSum >= 0 ? "+" : ""}${loyaltyPointsSum} (Balance after last line: ${balanceAfter})</div>
      <div><strong>Notes:</strong> ${notesCombined ? esc(notesCombined) : "-"}</div>
      <div><strong>Recorded by (last line):</strong> ${esc(last.recordedBy ?? "-")}</div>
    </div>

    <p class="foot-note">Thank you for choosing FitnessHood Gym! Have a GREATFUL DAY!</p>
    <p class="foot-hours">Operating Hours:
Monday to Thursday: 8am - 10pm
Friday: 2pm - 10pm</p>
    <div class="signature">
      <div class="signature-line"></div>
      <div>FitnessHood Gym Representative</div>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to generate merged receipt.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

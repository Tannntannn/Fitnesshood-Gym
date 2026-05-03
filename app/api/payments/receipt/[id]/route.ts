import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchPaymentCustomAddOnLabelById } from "@/lib/payment-custom-label";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      select: {
        id: true,
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
      },
    });

    if (!payment) {
      return NextResponse.json({ success: false, error: "Payment not found." }, { status: 404 });
    }

    const customAddOnLabel = await fetchPaymentCustomAddOnLabelById(prisma, payment.id);

    const paidAt = new Date(payment.paidAt);
    const dueDate = paidAt;
    const memberName = `${payment.user.firstName} ${payment.user.lastName}`;
    const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const invoiceNo = payment.paymentReference?.trim() || payment.id;
    const grossAmount = Number(payment.grossAmount ?? payment.amount);
    const discountAmount = Number(payment.discountAmount ?? 0);
    const discountPercentValue = grossAmount > 0 ? (discountAmount / grossAmount) * 100 : 0;
    const computedAmountDue =
      payment.collectionStatus === "PARTIAL" ? Math.max(Number(payment.user.remainingBalance ?? 0), 0) : 0;
    const paymentMethodLabel = payment.paymentMethod === "BANK_TRANSFER" ? "Bank Transfer" : payment.paymentMethod;
    const discountLabel =
      Number(payment.discountAmount ?? 0) > 0
        ? payment.discountType === "FIXED"
          ? `Fixed PHP ${Number(payment.discountAmount).toFixed(2)}`
          : `${Number(payment.discountPercent ?? 0)}% (PHP ${Number(payment.discountAmount).toFixed(2)})`
        : "None";
    const splitRows = payment.splitPayments.length
      ? payment.splitPayments
          .map(
            (row) =>
              `<tr><td>${row.method}</td><td>PHP ${Number(row.amount).toFixed(2)}</td><td>${row.reference ?? "-"}</td></tr>`,
          )
          .join("")
      : "";
    const loyaltyRow = payment.loyaltyLedger[0] ?? null;
    const itemLabel = (() => {
      const custom = customAddOnLabel?.trim();
      if (custom) return `Add-on: ${custom}`;
      const nm = payment.service.name;
      const tier = payment.service.tier;
      return tier ? `${nm} (${tier})` : nm;
    })();

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${esc(invoiceNo)}</title>
  <style>
    /* Match thermal driver: 80mm paper; margins top/right/bottom/left = 0 / 10mm / 0 / 0 */
    @page {
      size: 80mm auto;
      margin: 0 10mm 0 0;
    }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      margin: 12px auto;
      padding: 0 10mm 0 0;
      max-width: 80mm;
      color: #0f172a;
      background: #fff;
    }
    .top-actions {
      max-width: 80mm;
      margin: 0 auto 8px;
      padding: 0 10mm 0 0;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    button { border: 1px solid #94a3b8; background: #fff; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
    .receipt {
      max-width: 80mm;
      width: 100%;
      margin: 0 auto;
      border: 1px solid #cbd5e1;
      padding: 8px 0 10px 0;
    }
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
    <button onclick="window.print()">Print</button>
    <button onclick="window.close()">Close</button>
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
    <div class="title">Acknowledgment Receipt</div>
    <div class="meta">
      <div>
        <div class="lbl">Bill to</div>
        <div class="value">${esc(memberName)}</div>
      </div>
      <div>
        <div class="lbl">Invoice No.</div>
        <div class="value">${esc(invoiceNo)}</div>
      </div>
      <div>
        <div class="lbl">Date</div>
        <div class="value">${paidAt.toLocaleDateString()}</div>
      </div>
      <div>
        <div class="lbl">Due date</div>
        <div class="value">${dueDate.toLocaleDateString()}</div>
      </div>
      <div>
        <div class="lbl">Payment status</div>
        <div class="value">${payment.collectionStatus === "FULLY_PAID" ? "Paid" : "Partially Paid"}</div>
      </div>
      <div>
        <div class="lbl">Membership role</div>
        <div class="value">${esc(payment.user.role)}</div>
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
        <tr>
          <td>${esc(itemLabel)}</td>
          <td class="num">1</td>
          <td class="num">PHP ${grossAmount.toFixed(2)}</td>
          <td class="num">${discountPercentValue.toFixed(2)}%</td>
          <td class="num">PHP ${Number(payment.amount).toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Total</span><span>PHP ${Number(payment.amount).toFixed(2)}</span></div>
      <div class="row"><span>Payment method</span><span>${esc(paymentMethodLabel)}</span></div>
      <div class="row"><span>Paid amount</span><span>PHP ${Number(payment.amount).toFixed(2)}</span></div>
      <div class="row"><span>Amount due</span><span>PHP ${computedAmountDue.toFixed(2)}</span></div>
    </div>

    <div class="extra">
      <div><strong>Encoder/Admin:</strong> ${esc(payment.recordedBy ?? "-")}</div>
      <div><strong>Discount:</strong> ${esc(discountLabel)}</div>
      <div><strong>Reference:</strong> ${esc(payment.paymentReference ?? "-")}</div>
      <div><strong>Loyalty points (this payment / balance):</strong> ${loyaltyRow ? `${loyaltyRow.points >= 0 ? "+" : ""}${loyaltyRow.points}` : "0"} (Balance after: ${loyaltyRow?.remainingBalance ?? payment.user.loyaltyStars ?? 0})</div>
      <div><strong>Notes:</strong> ${payment.notes ? esc(payment.notes) : "-"}</div>
      <div><strong>Discount approved by:</strong> ${esc(payment.approvedBy ?? "-")}</div>
    </div>
    ${
      splitRows
        ? `<table>
      <thead><tr><th>Split Method</th><th>Amount</th><th>Reference</th></tr></thead>
      <tbody>${splitRows}</tbody>
    </table>`
        : ""
    }
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
      { success: false, error: "Failed to generate receipt.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}


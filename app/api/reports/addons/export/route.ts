import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchPaymentCustomAddOnLabelsByIds } from "@/lib/payment-custom-label";

export const dynamic = "force-dynamic";
const EXPORT_MAX_ROWS = 500;

function buildPdfBuffer(rows: Array<Record<string, string | number>>): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(16).text("Add-on sales (linked subscriptions + one-time custom)", { align: "left" });
    doc.moveDown(0.4);
    doc.fontSize(9).text(`Rows: ${rows.length} (max ${EXPORT_MAX_ROWS})`);
    doc.moveDown(0.8);

    doc.fontSize(8).text("Date", 36, doc.y, { continued: true, width: 72 });
    doc.text("Member", { continued: true, width: 120 });
    doc.text("Add-on", { continued: true, width: 100 });
    doc.text("Service", { continued: true, width: 80 });
    doc.text("Amount", { continued: true, width: 56 });
    doc.text("Method", { width: 56 });
    doc.moveTo(36, doc.y).lineTo(560, doc.y).stroke();

    rows.forEach((row) => {
      if (doc.y > 780) doc.addPage();
      doc
        .fontSize(8)
        .text(String(row.Date), 36, doc.y + 4, { continued: true, width: 72 });
      doc.text(String(row.Member), { continued: true, width: 120 });
      doc.text(String(row["Add-on"]), { continued: true, width: 100 });
      doc.text(String(row.Service), { continued: true, width: 80 });
      doc.text(String(row.Amount), { continued: true, width: 56 });
      doc.text(String(row.Method), { width: 56 });
    });

    doc.end();
  });
}

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const format = (params.get("format") ?? "xlsx").toLowerCase();

    const takeLimit = Math.min(2000, Math.max(EXPORT_MAX_ROWS * 4, 500));
    let orderedIds: string[] = [];
    try {
      const idRows = await prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT p.id
          FROM "Payment" p
          WHERE p."transactionType"::text = 'ADD_ON'
             OR (p."customAddOnLabel" IS NOT NULL AND length(trim(p."customAddOnLabel")) > 0)
          ORDER BY p."paidAt" DESC
          LIMIT ${takeLimit}
        `,
      );
      orderedIds = idRows.map((r) => r.id);
    } catch {
      const fallback = await prisma.payment.findMany({
        where: { transactionType: "ADD_ON" },
        orderBy: { paidAt: "desc" },
        take: takeLimit,
        select: { id: true },
      });
      orderedIds = fallback.map((p) => p.id);
    }

    const payments =
      orderedIds.length === 0
        ? []
        : await prisma.payment.findMany({
            where: { id: { in: orderedIds } },
            select: {
              id: true,
              paidAt: true,
              amount: true,
              paymentMethod: true,
              transactionType: true,
              addOnSubscription: { select: { addonName: true } },
              user: { select: { firstName: true, lastName: true } },
              service: { select: { name: true, tier: true } },
            },
          });

    const labelMap = await fetchPaymentCustomAddOnLabelsByIds(prisma, orderedIds);
    const orderIdx = new Map(orderedIds.map((id, i) => [id, i]));
    const merged = payments
      .map((p) => ({
        ...p,
        customAddOnLabel: labelMap.get(p.id) ?? null,
      }))
      .sort((a, b) => (orderIdx.get(a.id) ?? 0) - (orderIdx.get(b.id) ?? 0));

    const capped = merged
      .filter((row) => row.transactionType === "ADD_ON" || (row.customAddOnLabel ?? "").trim().length > 0)
      .slice(0, EXPORT_MAX_ROWS);

    const normalized = capped.map((row, idx) => {
      const custom = (row.customAddOnLabel ?? "").trim();
      const addonCol = custom || row.addOnSubscription?.addonName || "—";
      return {
        "#": idx + 1,
        Date: new Date(row.paidAt).toLocaleString(),
        Member: `${row.user.firstName} ${row.user.lastName}`,
        "Add-on": addonCol,
        Service: `${row.service.name}${row.service.tier ? ` (${row.service.tier})` : ""}`,
        Amount: Number(row.amount).toFixed(2),
        Method: row.paymentMethod,
      };
    });

    if (format === "pdf") {
      const pdfBuffer = await buildPdfBuffer(normalized as Array<Record<string, string | number>>);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="addon-sales-report.pdf"`,
          "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        },
      });
    }

    const ws = XLSX.utils.json_to_sheet(normalized);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AddonSales");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="addon-sales-report.xlsx"`,
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to export add-on report.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

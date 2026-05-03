import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
const EXPORT_MAX_ROWS = 500;

function buildPdfBuffer(rows: Array<Record<string, string | number>>): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(16).text("Balance/Credit Report", { align: "left" });
    doc.moveDown(0.4);
    doc.fontSize(9).text(`Rows: ${rows.length} (max ${EXPORT_MAX_ROWS})`);
    doc.moveDown(0.8);

    doc.fontSize(8).text("Name", 36, doc.y, { continued: true, width: 110 });
    doc.text("Tier", { continued: true, width: 70 });
    doc.text("Remaining", { continued: true, width: 70 });
    doc.text("Contract", { continued: true, width: 70 });
    doc.text("Membership", { continued: true, width: 70 });
    doc.text("Monthly", { continued: true, width: 70 });
    doc.text("Pts", { width: 36 });
    doc.moveTo(36, doc.y).lineTo(560, doc.y).stroke();

    rows.forEach((row) => {
      if (doc.y > 780) doc.addPage();
      doc.fontSize(8).text(String(row.Name), 36, doc.y + 4, { continued: true, width: 110 });
      doc.text(String(row.Tier), { continued: true, width: 70 });
      doc.text(String(row["Remaining Balance"]), { continued: true, width: 70 });
      doc.text(String(row["Contract Price"]), { continued: true, width: 70 });
      doc.text(String(row["Membership Expiry"]), { continued: true, width: 70 });
      doc.text(String(row["Monthly Expiry"]), { continued: true, width: 70 });
      doc.text(String(row["Loyalty Stars"]), { width: 30 });
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
    const tier = (params.get("tier") ?? "").trim();
    const query = (params.get("q") ?? "").trim();
    const statusFilter = (params.get("statusFilter") ?? "").trim();
    const now = new Date();

    const where: Record<string, unknown> = {
      role: "MEMBER",
      ...(tier ? { membershipTier: tier } : {}),
      ...(query
        ? {
            OR: [
              { firstName: { contains: query, mode: "insensitive" } },
              { lastName: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    if (statusFilter === "BOTH_ACTIVE") {
      where.fullMembershipExpiry = { gte: now };
      where.monthlyExpiryDate = { gte: now };
    } else if (statusFilter === "BOTH_EXPIRED") {
      where.fullMembershipExpiry = { lt: now };
      where.monthlyExpiryDate = { lt: now };
    } else if (statusFilter === "MEMBERSHIP_EXPIRED") {
      where.fullMembershipExpiry = { lt: now };
      where.monthlyExpiryDate = { gte: now };
    } else if (statusFilter === "MONTHLY_EXPIRED") {
      where.fullMembershipExpiry = { gte: now };
      where.monthlyExpiryDate = { lt: now };
    }

    const rows = await prisma.user.findMany({
      where,
      orderBy: [
        { membershipTier: { sort: "asc", nulls: "last" } },
        { lastName: "asc" },
        { firstName: "asc" },
      ],
      take: EXPORT_MAX_ROWS,
      select: {
        firstName: true,
        lastName: true,
        membershipTier: true,
        remainingBalance: true,
        totalContractPrice: true,
        fullMembershipExpiry: true,
        monthlyExpiryDate: true,
        loyaltyStars: true,
      },
    });

    const normalized = rows.map((row, idx) => ({
      "#": idx + 1,
      Name: `${row.firstName} ${row.lastName}`,
      Tier: row.membershipTier ?? "Unassigned",
      "Remaining Balance": Number(row.remainingBalance ?? 0).toFixed(2),
      "Contract Price": Number(row.totalContractPrice ?? 0).toFixed(2),
      "Membership Expiry": row.fullMembershipExpiry ? new Date(row.fullMembershipExpiry).toLocaleDateString() : "N/A",
      "Monthly Expiry": row.monthlyExpiryDate ? new Date(row.monthlyExpiryDate).toLocaleDateString() : "N/A",
      "Loyalty points": row.loyaltyStars ?? 0,
    }));

    if (format === "print") {
      const bodyRows = normalized
        .map(
          (row) =>
            `<tr><td>${row["#"]}</td><td>${row.Name}</td><td>${row.Tier}</td><td>${row["Remaining Balance"]}</td><td>${row["Contract Price"]}</td><td>${row["Membership Expiry"]}</td><td>${row["Monthly Expiry"]}</td><td>${row["Loyalty points"]}</td></tr>`,
        )
        .join("");
      const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Balance Credit Report</title><style>body{font-family:Arial,sans-serif;margin:20px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}.actions{margin-bottom:12px}@media print{.actions{display:none}}</style></head><body><div class="actions"><button onclick="window.print()">Print</button></div><h2>Balance/Credit Report</h2><p>Rows: ${normalized.length} (max ${EXPORT_MAX_ROWS})</p><table><thead><tr><th>#</th><th>Name</th><th>Tier</th><th>Remaining Balance</th><th>Contract Price</th><th>Membership Expiry</th><th>Monthly Expiry</th><th>Loyalty points</th></tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
      return new NextResponse(html, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
      });
    }
    if (format === "pdf") {
      const pdfBuffer = await buildPdfBuffer(normalized as Array<Record<string, string | number>>);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="balance-credit-report.pdf"`,
          "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        },
      });
    }

    const ws = XLSX.utils.json_to_sheet(normalized);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BalanceCredit");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="balance-credit-report.xlsx"`,
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to export report.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}


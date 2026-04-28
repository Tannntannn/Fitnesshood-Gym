"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PaymentRow = {
  id: string;
  amount: string;
  grossAmount?: string | null;
  discountPercent?: number | null;
  discountAmount?: string | null;
  paymentMethod: string;
  paidAt: string;
  paymentReference?: string | null;
  splitPayments?: Array<{ method: string; amount: string; reference?: string | null }>;
  user: { id: string; firstName: string; lastName: string; role: string; remainingBalance: string | null };
  service: { id: string; name: string; tier: string };
};

const roleTables = [
  { role: "MEMBER", title: "Members", headerClass: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  { role: "NON_MEMBER", title: "Non-members", headerClass: "bg-blue-50 border-blue-200 text-blue-800" },
  { role: "WALK_IN", title: "Walk-in (Student)", headerClass: "bg-amber-50 border-amber-200 text-amber-800" },
  { role: "WALK_IN_REGULAR", title: "Walk-in (Regular)", headerClass: "bg-purple-50 border-purple-200 text-purple-800" },
];

export default function PaymentRecordsPage() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const res = await fetch("/api/payments?limit=500");
    const json = (await res.json()) as { success: boolean; data?: PaymentRow[] };
    if (json.success && json.data) setRows(json.data);
  };

  useEffect(() => {
    load();
    const onFocus = () => load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const grouped = useMemo(() => {
    return roleTables.reduce<Record<string, PaymentRow[]>>((acc, item) => {
      acc[item.role] = rows.filter((row) => row.user.role === item.role);
      return acc;
    }, {});
  }, [rows]);

  return (
    <div className="space-y-4 px-1 sm:px-0">
      {notice ? (
        <div
          className={`fixed left-3 right-3 top-16 z-50 rounded-lg border px-3 py-2 text-xs font-medium shadow-lg sm:left-auto sm:right-4 ${
            notice.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {notice.message}
        </div>
      ) : null}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Payment Records</h1>
            <p className="text-sm text-slate-500">Role-based payment history for members and walk-ins.</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              variant="outline"
              className="border-slate-300 bg-white hover:bg-slate-100"
              onClick={() => load()}
            >
              Refresh
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                  setImporting(true);
                  const text = await file.text();
                  const parsed = JSON.parse(text) as { data?: unknown[] };
                  if (!Array.isArray(parsed.data)) {
                    setNotice({ type: "error", message: "Invalid import file format." });
                    return;
                  }
                  const res = await fetch("/api/payments/import", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ data: parsed.data }),
                  });
                  const json = (await res.json()) as {
                    success?: boolean;
                    error?: string;
                    details?: string;
                    data?: { imported: number; skipped: number; failed: number };
                  };
                  if (!json.success) {
                    setNotice({ type: "error", message: json.details || json.error || "Import failed." });
                    return;
                  }
                  const imported = json.data?.imported ?? 0;
                  const skipped = json.data?.skipped ?? 0;
                  const failed = json.data?.failed ?? 0;
                  setNotice({
                    type: failed > 0 ? "error" : "success",
                    message: `Import done. Added ${imported}, skipped ${skipped}, failed ${failed}.`,
                  });
                  await load();
                } catch {
                  setNotice({ type: "error", message: "Failed to parse import file." });
                } finally {
                  setImporting(false);
                }
              }}
            />
            <Button
              variant="outline"
              className="border-slate-300 bg-white hover:bg-slate-100"
              disabled={exporting}
              onClick={async () => {
                try {
                  setExporting(true);
                  const res = await fetch("/api/payments/export?limit=5000");
                  const json = (await res.json()) as { success?: boolean; error?: string; details?: string; count?: number };
                  if (!json.success) {
                    setNotice({ type: "error", message: json.details || json.error || "Export failed." });
                    return;
                  }
                  const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = `payment-records-${new Date().toISOString().slice(0, 10)}.json`;
                  document.body.appendChild(anchor);
                  anchor.click();
                  document.body.removeChild(anchor);
                  URL.revokeObjectURL(url);
                  setNotice({ type: "success", message: "Payment records exported successfully." });
                } catch {
                  setNotice({ type: "error", message: "Failed to export payment records." });
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? "Exporting..." : "Export"}
            </Button>
            <Button
              className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? "Importing..." : "Import"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {roleTables.map((roleItem) => {
          const data = grouped[roleItem.role] ?? [];
          return (
            <Card key={roleItem.role} className="overflow-hidden border border-slate-200 bg-white">
              <div className={`border-b px-4 py-3 ${roleItem.headerClass}`}>
                <p className="text-sm font-semibold">{roleItem.title}</p>
                <p className="text-xs">{data.length} payment(s)</p>
              </div>
              <div className="max-h-[560px] overflow-auto p-2.5">
                <div className="space-y-2">
                  {data.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-xs text-slate-500">
                      No payment records yet.
                    </div>
                  ) : (
                    data.map((row) => (
                      <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                          <p className="font-semibold text-slate-800">{row.user.firstName} {row.user.lastName}</p>
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{row.paymentMethod}</span>
                        </div>
                        <p className="mt-1 text-slate-600">{row.service.name} - {row.service.tier}</p>
                        <div className="mt-1 flex flex-col gap-0.5 text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                          <span>Paid: {Number(row.amount).toFixed(2)}</span>
                          <span>{format(new Date(row.paidAt), "MMM d, hh:mm a")}</span>
                        </div>
                        {Number(row.discountPercent ?? 0) > 0 ? (
                          <p className="mt-1 text-[10px] text-slate-500">
                            Discount {Number(row.discountPercent)}% ({Number(row.discountAmount ?? 0).toFixed(2)}) from gross{" "}
                            {Number(row.grossAmount ?? row.amount).toFixed(2)}
                          </p>
                        ) : null}
                        {row.paymentMethod === "SPLIT" && row.splitPayments?.length ? (
                          <p className="mt-1 font-mono text-[10px] text-slate-500">
                            {row.splitPayments
                              .map((sp) => `${sp.method}${sp.reference ? ` · ${sp.reference}` : ""}`)
                              .join(" · ")}
                          </p>
                        ) : row.paymentReference ? (
                          <p className="mt-1 font-mono text-[10px] text-slate-500">Ref: {row.paymentReference}</p>
                        ) : null}
                        {roleItem.role === "MEMBER" ? (
                          <p className="mt-1 text-[11px] text-red-600">Pending: {Number(row.user.remainingBalance ?? 0).toFixed(2)}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

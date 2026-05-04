"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashboardConfirmDialog } from "@/components/dashboard-confirm-dialog";

const REMITTANCE_METHODS = ["CASH", "GCASH", "CARD", "BANK_TRANSFER", "MAYA", "OTHER"] as const;

function methodMayHaveReference(method: string): boolean {
  return method === "GCASH" || method === "MAYA" || method === "BANK_TRANSFER" || method === "CARD";
}

function toDateTimeLocalValue(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

type CoachOption = { id: string; name: string };
type RemittanceRow = {
  id: string;
  coachId: string;
  coachName: string;
  amount: string;
  paidAt: string;
  paymentMethod: string;
  paymentReference: string | null;
  notes: string | null;
  recordedBy: string | null;
};

export default function CoachRemittancesPage() {
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [rows, setRows] = useState<RemittanceRow[]>([]);
  const [summary, setSummary] = useState<{ count: number; totalAmount: string }>({ count: 0, totalAmount: "0" });
  const [coachFilter, setCoachFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<RemittanceRow | null>(null);
  const [editForm, setEditForm] = useState({
    amount: "",
    paidAtLocal: "",
    paymentMethod: "CASH",
    paymentReference: "",
    notes: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<RemittanceRow | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const peso = (n: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number.isFinite(n) ? n : 0);

  const loadCoaches = async () => {
    const res = await fetch("/api/coaches?includeInactive=true");
    const json = (await res.json()) as { success?: boolean; data?: CoachOption[] };
    if (json.success && json.data) setCoaches(json.data);
  };

  const loadRemittances = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "800");
    if (coachFilter.trim()) params.set("coachId", coachFilter.trim());
    if (dateFrom) params.set("paidAfter", new Date(`${dateFrom}T00:00:00`).toISOString());
    if (dateTo) params.set("paidBefore", new Date(`${dateTo}T23:59:59.999`).toISOString());
    const res = await fetch(`/api/coaches/remittances?${params.toString()}`);
    const json = (await res.json()) as {
      success?: boolean;
      data?: RemittanceRow[];
      summary?: { count: number; totalAmount: string };
    };
    setLoading(false);
    if (json.success) {
      setRows(json.data ?? []);
      setSummary(json.summary ?? { count: 0, totalAmount: "0" });
    }
  }, [coachFilter, dateFrom, dateTo]);

  useEffect(() => {
    void loadCoaches();
  }, []);

  useEffect(() => {
    void loadRemittances();
  }, [loadRemittances]);

  const totalNum = useMemo(() => Number(summary.totalAmount ?? 0), [summary.totalAmount]);

  useEffect(() => {
    if (!editingRow) return;
    setEditForm({
      amount: String(editingRow.amount),
      paidAtLocal: toDateTimeLocalValue(new Date(editingRow.paidAt)),
      paymentMethod: editingRow.paymentMethod,
      paymentReference: editingRow.paymentReference ?? "",
      notes: editingRow.notes ?? "",
    });
  }, [editingRow]);

  const openEdit = (row: RemittanceRow) => {
    setEditingRow(row);
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingRow(null);
  };

  return (
    <div className="space-y-4 px-1 sm:px-0">
      {notice ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <Card className="surface-card space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Coach remittance records</h1>
            <p className="text-sm text-slate-500">
              Commission payments from coaches to the gym. Enter new remittances on the{" "}
              <Link href="/coaches" className="font-semibold text-[#1e3a5f] underline">
                Coach roster
              </Link>
              .
            </p>
          </div>
          <Link
            href="/coaches"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#1e3a5f] hover:bg-slate-50"
          >
            Back to coaches
          </Link>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Coach</label>
            <select
              className="h-10 min-w-[200px] rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={coachFilter}
              onChange={(e) => setCoachFilter(e.target.value)}
            >
              <option value="">All coaches</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">From (date)</label>
            <Input type="date" className="h-10 w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">To (date)</label>
            <Input type="date" className="h-10 w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <Button
            type="button"
            className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
            disabled={loading}
            onClick={() => void loadRemittances()}
          >
            {loading ? "Loading…" : "Apply filters"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-slate-300"
            onClick={async () => {
              setCoachFilter("");
              setDateFrom("");
              setDateTo("");
              setLoading(true);
              const res = await fetch("/api/coaches/remittances?limit=800");
              const json = (await res.json()) as {
                success?: boolean;
                data?: RemittanceRow[];
                summary?: { count: number; totalAmount: string };
              };
              setLoading(false);
              if (json.success) {
                setRows(json.data ?? []);
                setSummary(json.summary ?? { count: 0, totalAmount: "0" });
              }
            }}
          >
            Clear
          </Button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium text-slate-600">Filtered total</p>
          <p className="text-2xl font-bold text-slate-900">{peso(totalNum)}</p>
          <p className="text-xs text-slate-500">{summary.count} record(s) — table shows up to 800 rows (use date filters to narrow)</p>
        </div>
      </Card>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (!open) closeEdit();
        }}
      >
        <DialogContent
          className="flex max-h-[min(90vh,680px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
          showCloseButton
        >
          <div className="shrink-0 border-b border-slate-200 px-4 pb-3 pt-4 pr-14">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-base">Edit remittance</DialogTitle>
              <DialogDescription className="text-xs text-slate-600">
                {editingRow ? (
                  <>
                    Coach: <span className="font-medium text-slate-900">{editingRow.coachName}</span>
                  </>
                ) : (
                  "Open a record from the table to edit."
                )}
              </DialogDescription>
            </DialogHeader>
          </div>

          {editingRow ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-4 py-3">
                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-600" htmlFor={`remit-amt-${editingRow.id}`}>
                      Amount (PHP)
                    </label>
                    <Input
                      id={`remit-amt-${editingRow.id}`}
                      type="number"
                      min={0}
                      step={0.01}
                      value={editForm.amount}
                      onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                      className="h-9 bg-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">Paid at</label>
                    <Input
                      type="datetime-local"
                      value={editForm.paidAtLocal}
                      onChange={(e) => setEditForm((f) => ({ ...f, paidAtLocal: e.target.value }))}
                      className="h-9 bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">Method</label>
                    <select
                      id={`remit-method-${editingRow.id}`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs"
                      value={editForm.paymentMethod}
                      onChange={(e) => {
                        const next = e.target.value;
                        setEditForm((f) => ({
                          ...f,
                          paymentMethod: next,
                          paymentReference: methodMayHaveReference(next) ? f.paymentReference : "",
                        }));
                      }}
                    >
                      {REMITTANCE_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  {methodMayHaveReference(editForm.paymentMethod) ? (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-600" htmlFor={`remit-ref-${editingRow.id}`}>
                        Reference
                      </label>
                      <Input
                        id={`remit-ref-${editingRow.id}`}
                        value={editForm.paymentReference}
                        onChange={(e) => setEditForm((f) => ({ ...f, paymentReference: e.target.value }))}
                        className="h-9 bg-white font-mono text-xs"
                      />
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-600" htmlFor={`remit-notes-${editingRow.id}`}>
                      Notes
                    </label>
                    <Input
                      id={`remit-notes-${editingRow.id}`}
                      value={editForm.notes}
                      onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                      className="h-9 bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" className="border-slate-300 bg-white" onClick={() => closeEdit()}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
                  disabled={editSaving}
                  onClick={async () => {
                    if (!editingRow) return;
                    const amt = Number(editForm.amount);
                    if (!Number.isFinite(amt) || amt <= 0) {
                      setNotice({ type: "error", message: "Enter a valid amount." });
                      return;
                    }
                    if (!editForm.paidAtLocal) {
                      setNotice({ type: "error", message: "Choose date and time." });
                      return;
                    }
                    setEditSaving(true);
                    const res = await fetch(`/api/coaches/${editingRow.coachId}/remittances/${editingRow.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        amount: amt,
                        paidAt: new Date(editForm.paidAtLocal).toISOString(),
                        paymentMethod: editForm.paymentMethod,
                        paymentReference: editForm.paymentReference.trim() || null,
                        notes: editForm.notes.trim() || null,
                      }),
                    });
                    const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                    setEditSaving(false);
                    if (!json.success) {
                      setNotice({ type: "error", message: json.details || json.error || "Update failed." });
                      return;
                    }
                    closeEdit();
                    await loadRemittances();
                    setNotice({ type: "success", message: "Remittance updated." });
                  }}
                >
                  {editSaving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </>
          ) : (
            <div className="bg-white px-4 py-8 text-center text-sm text-slate-500">Select a row to edit.</div>
          )}
        </DialogContent>
      </Dialog>

      <DashboardConfirmDialog
        open={Boolean(pendingDeleteRow)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteRow(null);
        }}
        title="Delete remittance?"
        description={
          pendingDeleteRow ? (
            <>
              Remove this {peso(Number(pendingDeleteRow.amount))} record for{" "}
              <span className="font-semibold text-slate-800">{pendingDeleteRow.coachName}</span> (
              {new Date(pendingDeleteRow.paidAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}). This
              cannot be undone.
            </>
          ) : null
        }
        tone="danger"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={Boolean(pendingDeleteRow && deletingId === pendingDeleteRow.id)}
        onConfirm={async () => {
          const row = pendingDeleteRow;
          if (!row) return;
          setDeletingId(row.id);
          const res = await fetch(`/api/coaches/${row.coachId}/remittances/${row.id}`, { method: "DELETE" });
          const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
          setDeletingId(null);
          if (!json.success) {
            setNotice({ type: "error", message: json.details || json.error || "Delete failed." });
            return;
          }
          if (editingRow?.id === row.id) closeEdit();
          await loadRemittances();
          setNotice({ type: "success", message: "Remittance deleted." });
        }}
      />

      <Card className="surface-card overflow-hidden p-0">
        <div className="max-h-[min(70vh,720px)] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-2">Paid at</th>
                <th className="px-3 py-2">Coach</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Recorded by</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No remittances match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="bg-white hover:bg-slate-50/80">
                    <td className="px-3 py-2 text-slate-800">
                      {new Date(r.paidAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">{r.coachName}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{peso(Number(r.amount))}</td>
                    <td className="px-3 py-2 text-slate-700">{r.paymentMethod}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.paymentReference ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{r.recordedBy ?? "—"}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-xs text-slate-600" title={r.notes ?? ""}>
                      {r.notes ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 border-slate-300 text-xs"
                          disabled={Boolean(deletingId) || editSaving}
                          onClick={() => openEdit(r)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 border-red-200 text-xs text-red-700 hover:bg-red-50"
                          disabled={Boolean(deletingId) || editSaving}
                          onClick={() => setPendingDeleteRow(r)}
                        >
                          {deletingId === r.id ? "…" : "Delete"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

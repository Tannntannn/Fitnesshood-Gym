"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardConfirmDialog } from "@/components/dashboard-confirm-dialog";

const REMITTANCE_METHODS = ["CASH", "GCASH", "CARD", "BANK_TRANSFER", "MAYA", "OTHER"] as const;

function methodMayHaveReference(method: string): boolean {
  return method === "GCASH" || method === "MAYA" || method === "BANK_TRANSFER" || method === "CARD";
}

function toDateTimeLocalValue(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

type RemittanceRow = {
  id: string;
  amount: string;
  paidAt: string;
  paymentMethod: string;
  paymentReference: string | null;
  notes: string | null;
  recordedBy: string | null;
};

type CoachRow = {
  id: string;
  name: string;
  isActive: boolean;
};
type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  coachName?: string | null;
};

// Names in the DB sometimes carry stray whitespace from older imports/registrations.
// Normalise for display + comparisons so matches don't silently fail on a trailing space.
function cleanName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}
function fullName(member: { firstName: string; lastName: string }): string {
  return cleanName(`${member.firstName} ${member.lastName}`);
}
function nameKey(value: string | null | undefined): string {
  return cleanName(value).toLowerCase();
}

export default function CoachesPage() {
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rows, setRows] = useState<CoachRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [name, setName] = useState("");
  const [memberInputByCoach, setMemberInputByCoach] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [assigningCoachId, setAssigningCoachId] = useState<string | null>(null);
  const [unassigningCoachId, setUnassigningCoachId] = useState<string | null>(null);
  const [deletingCoachId, setDeletingCoachId] = useState<string | null>(null);
  const [remittanceRowsByCoach, setRemittanceRowsByCoach] = useState<Record<string, RemittanceRow[]>>({});
  const [remittanceLoadingId, setRemittanceLoadingId] = useState<string | null>(null);
  const [remittanceSavingId, setRemittanceSavingId] = useState<string | null>(null);
  const [remittanceDeletingId, setRemittanceDeletingId] = useState<string | null>(null);
  const [editingRemittanceIdByCoach, setEditingRemittanceIdByCoach] = useState<Record<string, string>>({});
  const [remittanceFormByCoach, setRemittanceFormByCoach] = useState<
    Record<string, { amount: string; paidAtLocal: string; paymentMethod: string; paymentReference: string; notes: string }>
  >({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [coachPendingDelete, setCoachPendingDelete] = useState<CoachRow | null>(null);
  const [remittancePendingDelete, setRemittancePendingDelete] = useState<{ coachId: string; coachName: string; row: RemittanceRow } | null>(
    null,
  );

  const showNotice = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2600);
  };

  const load = async () => {
    const [coachRes, memberRes] = await Promise.all([
      fetch("/api/coaches?includeInactive=true"),
      fetch("/api/users?view=assignment&role=MEMBER"),
    ]);
    const coachJson = (await coachRes.json()) as { success: boolean; data?: CoachRow[] };
    const memberJson = (await memberRes.json()) as { success: boolean; data?: MemberRow[] };
    if (coachJson.success) setRows(coachJson.data ?? []);
    if (memberJson.success) setMembers((memberJson.data ?? []).filter((member) => member.role === "MEMBER"));
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
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const sorted = useMemo(
    () => rows.slice().sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)),
    [rows],
  );
  const activeCoaches = useMemo(() => sorted.filter((coach) => coach.isActive), [sorted]);
  const assignedCountByCoach = useMemo(() => {
    return members.reduce<Record<string, number>>((acc, member) => {
      const coach = nameKey(member.coachName);
      if (!coach) return acc;
      acc[coach] = (acc[coach] ?? 0) + 1;
      return acc;
    }, {});
  }, [members]);
  const assignedMembersByCoach = useMemo(() => {
    return members.reduce<Record<string, Array<{ id: string; fullName: string }>>>((acc, member) => {
      const coach = nameKey(member.coachName);
      if (!coach) return acc;
      const current = acc[coach] ?? [];
      current.push({ id: member.id, fullName: fullName(member) });
      acc[coach] = current;
      return acc;
    }, {});
  }, [members]);
  const unassignedMembers = useMemo(
    () =>
      members
        .filter((member) => !nameKey(member.coachName))
        .slice()
        .sort((a, b) =>
          cleanName(`${a.lastName} ${a.firstName}`).localeCompare(cleanName(`${b.lastName} ${b.firstName}`)),
        ),
    [members],
  );

  const defaultRemittanceForm = () => ({
    amount: "",
    paidAtLocal: toDateTimeLocalValue(new Date()),
    paymentMethod: "CASH",
    paymentReference: "",
    notes: "",
  });

  const getRemittanceForm = (coachId: string) => remittanceFormByCoach[coachId] ?? defaultRemittanceForm();

  const loadRemittancesForCoach = async (coachId: string) => {
    setRemittanceLoadingId(coachId);
    const res = await fetch(`/api/coaches/${coachId}/remittances`);
    const json = (await res.json()) as { success?: boolean; data?: RemittanceRow[] };
    setRemittanceLoadingId(null);
    if (json.success && json.data) {
      setRemittanceRowsByCoach((prev) => ({ ...prev, [coachId]: json.data ?? [] }));
    }
  };

  const peso = (n: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number.isFinite(n) ? n : 0);

  return (
    <div className="space-y-4">
      {notice ? (
        <div
          className={`fixed right-4 top-16 z-50 rounded-lg border px-3 py-2 text-xs font-medium shadow-lg ${
            notice.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {notice.message}
        </div>
      ) : null}
      <Card className="surface-card space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Coach Section</h1>
            <p className="text-sm text-slate-500">Add coach names manually, then assign members beside each coach row.</p>
          </div>
          <Link
            href="/coaches/remittances"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#1e3a5f] hover:bg-slate-50"
          >
            View all remittance records
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Coach name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coach Mark" />
          </div>
          <div className="self-end flex gap-2">
            <Button
              variant="outline"
              className="border-slate-300 bg-white hover:bg-slate-100"
              onClick={() => load()}
            >
              Refresh
            </Button>
            <Button
              className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
              disabled={saving}
              onClick={async () => {
                setError("");
                if (!name.trim()) {
                  setError("Coach name is required.");
                  return;
                }
                setSaving(true);
                const res = await fetch("/api/coaches", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: name.trim() }),
                });
                const json = (await res.json()) as { success: boolean; error?: string; details?: string };
                setSaving(false);
                if (!json.success) {
                  setError(json.error || json.details || "Failed to add coach.");
                  showNotice("error", json.error || json.details || "Failed to add coach.");
                  return;
                }
                setName("");
                await load();
                showNotice("success", "Coach added successfully.");
              }}
            >
              {saving ? "Adding..." : "Add Coach"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="surface-card p-5">
        <h2 className="text-base font-semibold text-slate-900">Coach List</h2>
        <div className="mt-3 space-y-2">
          {activeCoaches.map((coach) => {
            const rf = getRemittanceForm(coach.id);
            const remRows = remittanceRowsByCoach[coach.id] ?? [];
            const editingRemittanceId = editingRemittanceIdByCoach[coach.id];
            return (
              <div key={coach.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="grid gap-2 md:grid-cols-[1fr_1.3fr_auto_auto_auto] md:items-center">
                  <div>
                    <p className="font-medium text-slate-800">{cleanName(coach.name)}</p>
                    <p className="text-[11px] text-slate-500">Assigned members: {assignedCountByCoach[nameKey(coach.name)] ?? 0}</p>
                    <div className="mt-2 max-h-24 overflow-auto space-y-1">
                      {(assignedMembersByCoach[nameKey(coach.name)] ?? []).length === 0 ? (
                        <p className="rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500">
                          No assigned members yet.
                        </p>
                      ) : (
                        (assignedMembersByCoach[nameKey(coach.name)] ?? [])
                          .slice()
                          .sort((a, b) => a.fullName.localeCompare(b.fullName))
                          .map((member) => (
                            <p
                              key={`${coach.id}-${member.id}`}
                              className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold tracking-wide text-blue-900"
                            >
                              {member.fullName}
                            </p>
                          ))
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Input
                      value={memberInputByCoach[coach.id] ?? ""}
                      onChange={(e) => setMemberInputByCoach((prev) => ({ ...prev, [coach.id]: e.target.value }))}
                      list={`coach-member-options-${coach.id}`}
                      placeholder="Type member name to assign"
                    />
                    <datalist id={`coach-member-options-${coach.id}`}>
                      {members.map((member) => (
                        <option key={`${coach.id}-${member.id}`} value={fullName(member)} />
                      ))}
                    </datalist>
                  </div>
                  <Button
                    className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
                    disabled={assigningCoachId === coach.id}
                    onClick={async () => {
                      setError("");
                      const typedKey = nameKey(memberInputByCoach[coach.id]);
                      if (!typedKey) {
                        setError("Please type and select an existing member name from suggestions.");
                        showNotice("error", "Please type and select an existing member.");
                        return;
                      }
                      const matches = members.filter((m) => nameKey(fullName(m)) === typedKey);
                      const member = matches[0] ?? null;
                      if (!member) {
                        setError("Please type and select an existing member name from suggestions.");
                        showNotice("error", "Please type and select an existing member.");
                        return;
                      }
                      if (matches.length > 1) {
                        setError("Multiple members share that name — please rename one before assigning.");
                        showNotice("error", "Multiple members share that name — rename first.");
                        return;
                      }
                      setAssigningCoachId(coach.id);
                      const res = await fetch(`/api/users/${member.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ coachName: cleanName(coach.name) }),
                      });
                      const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                      if (!json.success) {
                        setAssigningCoachId(null);
                        setError(json.details || json.error || "Failed to assign coach.");
                        showNotice("error", json.details || json.error || "Failed to assign coach.");
                        return;
                      }
                      setAssigningCoachId(null);
                      setMemberInputByCoach((prev) => ({ ...prev, [coach.id]: "" }));
                      await load();
                      showNotice("success", `${fullName(member)} assigned to ${cleanName(coach.name)}.`);
                    }}
                  >
                    {assigningCoachId === coach.id ? "Assigning..." : "Assign Member"}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-red-300 bg-white text-red-700 hover:bg-red-50"
                    disabled={unassigningCoachId === coach.id}
                    onClick={async () => {
                      setError("");
                      const typedKey = nameKey(memberInputByCoach[coach.id]);
                      if (!typedKey) {
                        setError("Type/select the member name first, then click Unassign.");
                        showNotice("error", "Type/select the member name first.");
                        return;
                      }
                      const member = members.find((m) => nameKey(fullName(m)) === typedKey) ?? null;
                      if (!member) {
                        setError("Type/select the member name first, then click Unassign.");
                        showNotice("error", "Type/select the member name first.");
                        return;
                      }
                      if (nameKey(member.coachName) !== nameKey(coach.name)) {
                        setError(`${fullName(member)} is not currently assigned to ${cleanName(coach.name)}.`);
                        showNotice("error", `${fullName(member)} is not assigned to ${cleanName(coach.name)}.`);
                        return;
                      }
                      setUnassigningCoachId(coach.id);
                      const res = await fetch(`/api/users/${member.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ coachName: null }),
                      });
                      const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                      if (!json.success) {
                        setUnassigningCoachId(null);
                        setError(json.details || json.error || "Failed to unassign member.");
                        showNotice("error", json.details || json.error || "Failed to unassign member.");
                        return;
                      }
                      setUnassigningCoachId(null);
                      setMemberInputByCoach((prev) => ({ ...prev, [coach.id]: "" }));
                      await load();
                      showNotice("success", `${fullName(member)} unassigned from ${cleanName(coach.name)}.`);
                    }}
                  >
                    {unassigningCoachId === coach.id ? "Unassigning..." : "Unassign Member"}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-red-300 bg-white text-red-700 hover:bg-red-50"
                    disabled={deletingCoachId === coach.id}
                    onClick={() => {
                      setError("");
                      setCoachPendingDelete(coach);
                    }}
                  >
                    {deletingCoachId === coach.id ? "Deleting..." : "Delete Coach"}
                  </Button>
                </div>

                <details
                  className="mt-3 rounded-md border border-emerald-200 bg-white"
                  onToggle={(e) => {
                    const el = e.currentTarget;
                    if (el.open) void loadRemittancesForCoach(coach.id);
                  }}
                >
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-emerald-900">
                    Commission remittance (coach pays gym) — record payment
                  </summary>
                  <div className="space-y-3 border-t border-emerald-100 px-3 py-3">
                    <p className="text-[11px] text-slate-600">
                      Same idea as recording a client payment: amount, date/time, and method. Appears on{" "}
                      <Link href="/payments" className="font-medium text-[#1e3a5f] underline">
                        Payments → Sales
                      </Link>{" "}
                      for the matching period.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-slate-600">Amount (PHP)</label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={rf.amount}
                          onChange={(e) =>
                            setRemittanceFormByCoach((prev) => ({
                              ...prev,
                              [coach.id]: { ...getRemittanceForm(coach.id), amount: e.target.value },
                            }))
                          }
                          placeholder="0.00"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-slate-600">Paid at</label>
                        <Input
                          type="datetime-local"
                          value={rf.paidAtLocal}
                          onChange={(e) =>
                            setRemittanceFormByCoach((prev) => ({
                              ...prev,
                              [coach.id]: { ...getRemittanceForm(coach.id), paidAtLocal: e.target.value },
                            }))
                          }
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-slate-600">Method</label>
                        <select
                          className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs"
                          value={rf.paymentMethod}
                          onChange={(e) => {
                            const next = e.target.value;
                            setRemittanceFormByCoach((prev) => ({
                              ...prev,
                              [coach.id]: {
                                ...getRemittanceForm(coach.id),
                                paymentMethod: next,
                                paymentReference: methodMayHaveReference(next)
                                  ? getRemittanceForm(coach.id).paymentReference
                                  : "",
                              },
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
                      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end">
                        {editingRemittanceId ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 w-full border-slate-300"
                            disabled={remittanceSavingId === coach.id}
                            onClick={() => {
                              setEditingRemittanceIdByCoach((prev) => {
                                const next = { ...prev };
                                delete next[coach.id];
                                return next;
                              });
                              setRemittanceFormByCoach((prev) => ({
                                ...prev,
                                [coach.id]: defaultRemittanceForm(),
                              }));
                            }}
                          >
                            Cancel edit
                          </Button>
                        ) : null}
                        <Button
                          className="h-9 w-full bg-emerald-700 text-white hover:bg-emerald-800"
                          disabled={remittanceSavingId === coach.id}
                          onClick={async () => {
                            setError("");
                            const amt = Number(rf.amount);
                            if (!Number.isFinite(amt) || amt <= 0) {
                              showNotice("error", "Enter a valid amount.");
                              return;
                            }
                            if (!rf.paidAtLocal) {
                              showNotice("error", "Choose date and time.");
                              return;
                            }
                            setRemittanceSavingId(coach.id);
                            const payload = {
                              amount: amt,
                              paidAt: new Date(rf.paidAtLocal).toISOString(),
                              paymentMethod: rf.paymentMethod,
                              paymentReference: rf.paymentReference.trim() || null,
                              notes: rf.notes.trim() || null,
                            };
                            const res = editingRemittanceId
                              ? await fetch(`/api/coaches/${coach.id}/remittances/${editingRemittanceId}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify(payload),
                                })
                              : await fetch(`/api/coaches/${coach.id}/remittances`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify(payload),
                                });
                            const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                            setRemittanceSavingId(null);
                            if (!json.success) {
                              setError(json.details || json.error || "Failed to save.");
                              showNotice("error", json.details || json.error || "Failed to save.");
                              return;
                            }
                            setEditingRemittanceIdByCoach((prev) => {
                              const next = { ...prev };
                              delete next[coach.id];
                              return next;
                            });
                            setRemittanceFormByCoach((prev) => ({
                              ...prev,
                              [coach.id]: {
                                amount: "",
                                paidAtLocal: toDateTimeLocalValue(new Date()),
                                paymentMethod: rf.paymentMethod,
                                paymentReference: "",
                                notes: "",
                              },
                            }));
                            await loadRemittancesForCoach(coach.id);
                            showNotice("success", editingRemittanceId ? "Remittance updated." : "Commission remittance saved.");
                          }}
                        >
                          {remittanceSavingId === coach.id
                            ? "Saving…"
                            : editingRemittanceId
                              ? "Update remittance"
                              : "Save remittance"}
                        </Button>
                      </div>
                    </div>
                    {methodMayHaveReference(rf.paymentMethod) ? (
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-slate-600">Reference (optional)</label>
                        <Input
                          value={rf.paymentReference}
                          onChange={(e) =>
                            setRemittanceFormByCoach((prev) => ({
                              ...prev,
                              [coach.id]: { ...getRemittanceForm(coach.id), paymentReference: e.target.value },
                            }))
                          }
                          className="h-9 font-mono text-xs"
                          placeholder="Txn ID / ref #"
                        />
                      </div>
                    ) : null}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-600">Notes (optional)</label>
                      <Input
                        value={rf.notes}
                        onChange={(e) =>
                          setRemittanceFormByCoach((prev) => ({
                            ...prev,
                            [coach.id]: { ...getRemittanceForm(coach.id), notes: e.target.value },
                          }))
                        }
                        className="h-9"
                        placeholder="Internal note"
                      />
                    </div>

                    <div>
                      <p className="mb-1 text-[11px] font-semibold text-slate-700">Recent remittances (this coach)</p>
                      {remittanceLoadingId === coach.id ? (
                        <p className="text-xs text-slate-500">Loading…</p>
                      ) : remRows.length === 0 ? (
                        <p className="text-xs text-slate-500">None yet — save one above.</p>
                      ) : (
                        <div className="max-h-40 overflow-auto rounded border border-slate-200 bg-slate-50">
                          <table className="w-full text-[11px]">
                            <thead className="sticky top-0 bg-slate-100 text-slate-600">
                              <tr>
                                <th className="px-2 py-1.5 text-left font-semibold">Date</th>
                                <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
                                <th className="px-2 py-1.5 text-left font-semibold">Method</th>
                                <th className="px-2 py-1.5 text-left font-semibold">Ref</th>
                                <th className="px-2 py-1.5 text-right font-semibold">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {remRows.map((r) => (
                                <tr key={r.id} className="border-t border-slate-100">
                                  <td className="px-2 py-1 text-slate-800">
                                    {new Date(r.paidAt).toLocaleString(undefined, {
                                      dateStyle: "short",
                                      timeStyle: "short",
                                    })}
                                  </td>
                                  <td className="px-2 py-1 text-right tabular-nums font-medium">{peso(Number(r.amount))}</td>
                                  <td className="px-2 py-1 text-slate-700">{r.paymentMethod}</td>
                                  <td className="px-2 py-1 text-slate-600">{r.paymentReference ?? "—"}</td>
                                  <td className="px-2 py-1 text-right">
                                    <div className="flex flex-wrap justify-end gap-1">
                                      <button
                                        type="button"
                                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-[#1e3a5f] hover:bg-slate-50 disabled:opacity-50"
                                        disabled={Boolean(remittanceSavingId) || remittanceDeletingId === r.id}
                                        onClick={() => {
                                          setEditingRemittanceIdByCoach((prev) => ({ ...prev, [coach.id]: r.id }));
                                          setRemittanceFormByCoach((prev) => ({
                                            ...prev,
                                            [coach.id]: {
                                              amount: String(r.amount),
                                              paidAtLocal: toDateTimeLocalValue(new Date(r.paidAt)),
                                              paymentMethod: r.paymentMethod,
                                              paymentReference: r.paymentReference ?? "",
                                              notes: r.notes ?? "",
                                            },
                                          }));
                                        }}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded border border-red-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                        disabled={Boolean(remittanceSavingId) || remittanceDeletingId === r.id}
                                        onClick={() =>
                                          setRemittancePendingDelete({ coachId: coach.id, coachName: coach.name, row: r })
                                        }
                                      >
                                        {remittanceDeletingId === r.id ? "…" : "Delete"}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              </div>
            );
          })}
          {activeCoaches.length === 0 ? <p className="text-sm text-slate-500">No active coaches yet.</p> : null}
        </div>
      </Card>
      <Card className="surface-card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Unassigned Members</h2>
          <span className="text-xs text-slate-500">{unassignedMembers.length} member(s)</span>
        </div>
        <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
          {unassignedMembers.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-3 text-xs text-slate-500">
              All members have an assigned coach.
            </p>
          ) : (
            <div className="space-y-1.5">
              {unassignedMembers.map((member) => (
                <div
                  key={member.id}
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
                >
                  {fullName(member)}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <DashboardConfirmDialog
        open={Boolean(coachPendingDelete)}
        onOpenChange={(open) => {
          if (!open) setCoachPendingDelete(null);
        }}
        title="Delete coach?"
        description={
          coachPendingDelete ? (
            <>
              Remove <span className="font-semibold text-slate-800">{coachPendingDelete.name}</span> from the roster. You cannot
              delete if members are still assigned or remittance history exists.
            </>
          ) : null
        }
        tone="danger"
        confirmLabel="Delete coach"
        cancelLabel="Cancel"
        loading={Boolean(coachPendingDelete && deletingCoachId === coachPendingDelete.id)}
        onConfirm={async () => {
          const c = coachPendingDelete;
          if (!c) return;
          setDeletingCoachId(c.id);
          const res = await fetch(`/api/coaches/${c.id}`, { method: "DELETE" });
          const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
          setDeletingCoachId(null);
          if (!json.success) {
            setError(json.details || json.error || "Failed to delete coach.");
            showNotice("error", json.details || json.error || "Failed to delete coach.");
            return;
          }
          await load();
          showNotice("success", `${c.name} deleted.`);
        }}
      />

      <DashboardConfirmDialog
        open={Boolean(remittancePendingDelete)}
        onOpenChange={(open) => {
          if (!open) setRemittancePendingDelete(null);
        }}
        title="Delete remittance record?"
        description={
          remittancePendingDelete ? (
            <>
              Delete this commission remittance for{" "}
              <span className="font-semibold text-slate-800">{remittancePendingDelete.coachName}</span>
              {" — "}
              {peso(Number(remittancePendingDelete.row.amount))} paid{" "}
              {new Date(remittancePendingDelete.row.paidAt).toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short",
              })}
              . This cannot be undone.
            </>
          ) : null
        }
        tone="danger"
        confirmLabel="Delete remittance"
        cancelLabel="Keep"
        loading={Boolean(remittancePendingDelete && remittanceDeletingId === remittancePendingDelete.row.id)}
        onConfirm={async () => {
          const ctx = remittancePendingDelete;
          if (!ctx) return;
          const { coachId, row } = ctx;
          const editingRemittanceId = editingRemittanceIdByCoach[coachId];
          setRemittanceDeletingId(row.id);
          const res = await fetch(`/api/coaches/${coachId}/remittances/${row.id}`, { method: "DELETE" });
          const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
          setRemittanceDeletingId(null);
          if (!json.success) {
            showNotice("error", json.details || json.error || "Failed to delete.");
            return;
          }
          if (editingRemittanceId === row.id) {
            setEditingRemittanceIdByCoach((prev) => {
              const next = { ...prev };
              delete next[coachId];
              return next;
            });
            setRemittanceFormByCoach((prev) => ({
              ...prev,
              [coachId]: defaultRemittanceForm(),
            }));
          }
          await loadRemittancesForCoach(coachId);
          showNotice("success", "Remittance deleted.");
        }}
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

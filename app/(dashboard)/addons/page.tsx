"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardConfirmDialog } from "@/components/dashboard-confirm-dialog";

type AddonRow = {
  id: string;
  userId: string;
  addonName: string;
  dueDate?: string | null;
  status: string;
  lastPaymentAt?: string | null;
  notes?: string | null;
  user: { firstName: string; lastName: string };
  payments?: Array<{ id: string; paidAt: string; amount: string; paymentMethod: string }>;
};

type PaymentMemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
};

export default function AddonsPage() {
  const [rows, setRows] = useState<AddonRow[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ userId: "", addonName: "", dueDate: "", notes: "" });
  const [members, setMembers] = useState<PaymentMemberRow[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [addonNameSuggestions, setAddonNameSuggestions] = useState<string[]>([]);
  const [pendingDeleteAddon, setPendingDeleteAddon] = useState<AddonRow | null>(null);
  const [deletingAddonId, setDeletingAddonId] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState("");

  const load = async () => {
    const res = await fetch(`/api/addons?q=${encodeURIComponent(q.trim())}`);
    const json = (await res.json()) as { success?: boolean; data?: AddonRow[] };
    if (json.success) setRows(json.data ?? []);
  };

  const memberPickList = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    return members
      .filter((m) => m.role === "MEMBER")
      .filter((m) => {
        if (!query) return true;
        const full = `${m.firstName} ${m.lastName}`.toLowerCase();
        const rev = `${m.lastName} ${m.firstName}`.toLowerCase();
        return full.includes(query) || rev.includes(query);
      })
      .slice()
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  }, [members, memberSearch]);

  useEffect(() => {
    load();
    void (async () => {
      const [userRes, namesRes] = await Promise.all([
        fetch("/api/users?view=payment"),
        fetch("/api/addons?namesOnly=true"),
      ]);
      const userJson = (await userRes.json()) as { data?: PaymentMemberRow[] };
      const namesJson = (await namesRes.json()) as { success?: boolean; data?: string[] };
      setMembers(userJson.data ?? []);
      if (namesJson.success) setAddonNameSuggestions(namesJson.data ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveMemberIdFromSearchValue = (value: string): string => {
    const m = members.find((u) => u.role === "MEMBER" && `${u.firstName} ${u.lastName}` === value);
    return m?.id ?? "";
  };

  return (
    <div className="space-y-4 px-1 sm:px-0">
      <Card className="surface-card space-y-3 p-3 sm:p-5">
        <h1 className="text-xl font-semibold text-slate-900">Add-ons (locker, Wi‑Fi, extras)</h1>
        <p className="text-sm text-slate-600">
          One place to register extras per client and see when each is <span className="font-medium text-slate-800">due again</span>.{" "}
          <span className="font-medium text-slate-800">POS add-on sales</span> (Payments → custom add-on with optional next due
          date) also create or update a row here automatically for that person.
        </p>

        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
          <h2 className="text-sm font-semibold text-slate-800">Register a new add-on</h2>
          <p className="mb-3 text-[11px] text-slate-500">All fields except member and add-on name are optional.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-5">
              <label className="text-xs font-medium text-slate-600" htmlFor="addons-member-search">
                Member
              </label>
              <Input
                id="addons-member-search"
                value={memberSearch}
                onChange={(e) => {
                  const value = e.target.value;
                  setMemberSearch(value);
                  setForm((p) => ({ ...p, userId: resolveMemberIdFromSearchValue(value) }));
                }}
                placeholder="Type name, then pick from list"
                list="addons-member-pick"
                autoComplete="off"
              />
              <datalist id="addons-member-pick">
                {memberPickList.map((m) => (
                  <option key={m.id} value={`${m.firstName} ${m.lastName}`} />
                ))}
              </datalist>
              {form.userId ? (
                <p className="text-[11px] text-slate-500">Member linked — continue with add-on name and dates below.</p>
              ) : memberSearch.trim() ? (
                <p className="text-[11px] text-amber-700">Choose the full name from the browser suggestions so the member is linked.</p>
              ) : (
                <p className="text-[11px] text-slate-500">Manual register: pick a member from the list (walk-ins stay on Payments only unless you register them as users).</p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
              <label className="text-xs font-medium text-slate-600" htmlFor="addons-new-name">
                Add-on name
              </label>
              <Input
                id="addons-new-name"
                value={form.addonName}
                onChange={(e) => setForm((p) => ({ ...p, addonName: e.target.value }))}
                placeholder="e.g. Locker 12, Wi‑Fi"
                list="addons-name-suggestions"
                autoComplete="off"
              />
              <datalist id="addons-name-suggestions">
                {addonNameSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <p className="text-[11px] text-slate-500">Suggestions come from names already used in the gym; you can type a new one.</p>
            </div>
            <div className="space-y-1.5 lg:col-span-3">
              <label className="text-xs font-medium text-slate-600" htmlFor="addons-next-due">
                Next due date <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <Input
                id="addons-next-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
              />
              <p className="text-[11px] text-slate-500">
                When this add-on should renew or be paid again — <span className="font-medium text-slate-600">not</span> gym membership start/end.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-7">
              <label className="text-xs font-medium text-slate-600" htmlFor="addons-new-notes">
                Notes <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <Input
                id="addons-new-notes"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Key number, plan details, etc."
              />
            </div>
            <div className="flex items-end lg:col-span-5">
              <Button
                className="w-full sm:w-auto"
                onClick={async () => {
                  if (!form.userId.trim()) {
                    return;
                  }
                  await fetch("/api/addons", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      userId: form.userId.trim(),
                      addonName: form.addonName.trim(),
                      dueDate: form.dueDate || null,
                      notes: form.notes.trim() || null,
                    }),
                  });
                  setForm({ userId: "", addonName: "", dueDate: "", notes: "" });
                  setMemberSearch("");
                  load();
                  const namesRes = await fetch("/api/addons?namesOnly=true");
                  const namesJson = (await namesRes.json()) as { success?: boolean; data?: string[] };
                  if (namesJson.success) setAddonNameSuggestions(namesJson.data ?? []);
                }}
                disabled={!form.userId.trim() || !form.addonName.trim()}
              >
                Add Add-on
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600" htmlFor="addons-list-search">
            Search the list below
          </label>
          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <Input
              id="addons-list-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Member name or add-on name"
            />
            <Button variant="outline" className="border-slate-300 hover:bg-slate-100" onClick={() => load()}>
              Search
            </Button>
            <Button variant="outline" className="border-slate-300 hover:bg-slate-100" onClick={() => { setQ(""); load(); }}>
              Reset
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">Filters the list below; does not change the add form.</p>
        </div>
      </Card>

      <Card className="surface-card space-y-2 p-3 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">All add-ons</h2>
        <p className="text-[11px] text-slate-500">Use the search box above to narrow this list by member or add-on name.</p>
        {deleteMessage ? <p className="text-sm text-red-600">{deleteMessage}</p> : null}
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">
                {row.user.firstName} {row.user.lastName} · {row.addonName}
              </p>
              <p>
                <span className="font-medium text-slate-600">Status:</span> {row.status}
                {" · "}
                <span className="font-medium text-slate-600">Next due (renewal):</span>{" "}
                {row.dueDate ? new Date(row.dueDate).toLocaleDateString() : "Not set"}
              </p>
              <p>
                <span className="font-medium text-slate-600">Last paid (recorded):</span>{" "}
                {row.lastPaymentAt ? new Date(row.lastPaymentAt).toLocaleString() : "No payment yet"}
              </p>
              {row.payments?.length ? (
                <p className="text-[11px] text-slate-600">
                  Linked payment history:{" "}
                  {row.payments
                    .slice(0, 5)
                    .map((p) => `${new Date(p.paidAt).toLocaleDateString()} ₱${Number(p.amount).toFixed(2)} ${p.paymentMethod}`)
                    .join(" | ")}
                </p>
              ) : null}
              {row.notes ? <p>Notes: {row.notes}</p> : null}
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  className="h-7 border-slate-300 px-2 text-[11px]"
                  onClick={async () => {
                    await fetch(`/api/addons/${row.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ markPaidNow: true, status: "ACTIVE" }),
                    });
                    load();
                  }}
                >
                  Mark Paid
                </Button>
                <Button
                  variant="outline"
                  className="h-7 border-slate-300 px-2 text-[11px]"
                  onClick={async () => {
                    await fetch(`/api/addons/${row.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
                    });
                    load();
                  }}
                >
                  {row.status === "ACTIVE" ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  variant="outline"
                  className="h-7 border-red-300 px-2 text-[11px] text-red-700"
                  disabled={deletingAddonId === row.id}
                  onClick={() => {
                    setDeleteMessage("");
                    setPendingDeleteAddon(row);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {rows.length === 0 ? <p className="text-xs text-slate-500">No add-ons found.</p> : null}
        </div>
      </Card>

      <DashboardConfirmDialog
        open={Boolean(pendingDeleteAddon)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteAddon(null);
        }}
        title="Delete this add-on?"
        description={
          pendingDeleteAddon ? (
            <>
              Remove{" "}
              <span className="font-semibold text-slate-800">{pendingDeleteAddon.addonName}</span> for{" "}
              <span className="font-semibold text-slate-800">
                {pendingDeleteAddon.user.firstName} {pendingDeleteAddon.user.lastName}
              </span>
              . This cannot be undone. Linked payments in history stay on file; only this add-on row is removed.
            </>
          ) : null
        }
        tone="danger"
        confirmLabel="Delete add-on"
        cancelLabel="Cancel"
        loading={Boolean(pendingDeleteAddon && deletingAddonId === pendingDeleteAddon.id)}
        onConfirm={async () => {
          const addon = pendingDeleteAddon;
          if (!addon) return;
          setDeletingAddonId(addon.id);
          setDeleteMessage("");
          try {
            const res = await fetch(`/api/addons/${addon.id}`, { method: "DELETE" });
            const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
            if (!json.success) {
              setDeleteMessage(json.details || json.error || "Failed to delete add-on.");
              return;
            }
            await load();
          } finally {
            setDeletingAddonId(null);
          }
        }}
      />
    </div>
  );
}

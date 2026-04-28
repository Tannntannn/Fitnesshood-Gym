"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ManagedMember = {
  id: string;
  firstName: string;
  lastName: string;
  contactNo: string;
  membershipStart: string | null;
  membershipExpiry: string | null;
  membershipTier: string | null;
  lockInLabel: string | null;
  monthlyFeeLabel: string | null;
  membershipFeeLabel: string | null;
  gracePeriodEnd: string | null;
  freezeStatus: string | null;
  membershipNotes: string | null;
  tier: string;
  daysLeft: number | null;
  membershipStatus: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "NO_EXPIRY";
};

const TIER_ORDER = ["Bronze", "Silver", "Gold", "Platinum", "Students", "Founding Member", "Unassigned"];
const TIER_ACCENT: Record<string, string> = {
  Bronze: "from-amber-50 to-amber-100 border-amber-200",
  Silver: "from-slate-100 to-slate-200 border-slate-300",
  Gold: "from-yellow-50 to-yellow-100 border-yellow-200",
  Platinum: "from-cyan-50 to-blue-100 border-cyan-200",
  Students: "from-violet-50 to-fuchsia-100 border-violet-200",
  "Founding Member": "from-emerald-50 to-green-100 border-emerald-200",
  Unassigned: "from-slate-50 to-slate-100 border-slate-200",
};
const TIER_TAB_STYLE: Record<string, { active: string; inactive: string }> = {
  Bronze: {
    active: "border-amber-700 bg-amber-700 text-white",
    inactive: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  },
  Silver: {
    active: "border-slate-600 bg-slate-600 text-white",
    inactive: "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200",
  },
  Gold: {
    active: "border-yellow-600 bg-yellow-600 text-white",
    inactive: "border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100",
  },
  Platinum: {
    active: "border-cyan-700 bg-cyan-700 text-white",
    inactive: "border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100",
  },
  Students: {
    active: "border-violet-700 bg-violet-700 text-white",
    inactive: "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100",
  },
  "Founding Member": {
    active: "border-emerald-700 bg-emerald-700 text-white",
    inactive: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  },
  Unassigned: {
    active: "border-slate-700 bg-slate-700 text-white",
    inactive: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  },
};

export default function MembersManagementPage() {
  const [rows, setRows] = useState<ManagedMember[]>([]);
  const [editing, setEditing] = useState<ManagedMember | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTier, setActiveTier] = useState<string>("Unassigned");
  const [searchName, setSearchName] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = async () => {
    const res = await fetch("/api/members-management");
    const json = (await res.json()) as { success: boolean; data?: ManagedMember[] };
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
    const tiers = new Map<string, ManagedMember[]>();
    rows.forEach((row) => {
      const list = tiers.get(row.tier) ?? [];
      list.push(row);
      tiers.set(row.tier, list);
    });
    return tiers;
  }, [rows]);

  const tierList = useMemo(() => {
    const present = Array.from(grouped.keys()).sort();
    const ordered = TIER_ORDER.filter((tier) => present.includes(tier));
    const others = present.filter((tier) => !TIER_ORDER.includes(tier));
    return [...ordered, ...others];
  }, [grouped]);

  useEffect(() => {
    if (tierList.length === 0) {
      setActiveTier("Unassigned");
      return;
    }
    if (!tierList.includes(activeTier)) {
      setActiveTier(tierList[0]);
    }
  }, [tierList, activeTier]);

  const renderTable = (title: string, data: ManagedMember[], kind: "active" | "soon" | "expired") => {
    const compact = kind !== "active";
    const sorted = data
      .slice()
      .sort((a, b) => {
        const aDays = a.daysLeft ?? 99999;
        const bDays = b.daysLeft ?? 99999;
        if (kind === "expired") return bDays - aDays;
        return aDays - bDays;
      });

    return (
      <Card className="surface-card overflow-hidden border border-slate-200 p-0">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h4 className="text-xs font-semibold tracking-wide text-slate-700">{title}</h4>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">{sorted.length} members</span>
        </div>
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Name</th>
                {!compact ? <th className="px-3 py-2 font-semibold">Contact</th> : null}
                {!compact ? <th className="px-3 py-2 font-semibold">Days Left</th> : null}
                <th className="px-3 py-2 font-semibold">Expiry</th>
                <th className="px-3 py-2 font-semibold">Lock-in</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={compact ? 4 : 6} className="px-3 py-6 text-center text-slate-400">
                    No records.
                  </td>
                </tr>
              ) : (
                sorted.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-medium text-slate-800">{member.firstName} {member.lastName}</td>
                    {!compact ? <td className="px-3 py-2 text-slate-600">{member.contactNo || "N/A"}</td> : null}
                    {!compact ? (
                      <td className="px-3 py-2 text-slate-700">
                        <span
                          className={
                            member.daysLeft !== null && member.daysLeft < 0
                              ? "rounded bg-red-100 px-1.5 py-0.5 text-red-700"
                              : member.daysLeft !== null && member.daysLeft <= 7
                                ? "rounded bg-amber-100 px-1.5 py-0.5 text-amber-700"
                                : "rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700"
                          }
                        >
                          {member.daysLeft ?? "N/A"}
                        </span>
                      </td>
                    ) : null}
                    <td className="px-3 py-2 text-slate-700">{member.membershipExpiry ? format(new Date(member.membershipExpiry), "MMM d, yyyy") : "N/A"}</td>
                    <td className="px-3 py-2 text-slate-700">{member.lockInLabel || "N/A"}</td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        className="h-7 bg-[#1e3a5f] px-2.5 text-[11px] text-white hover:bg-[#1e3a5f]/90"
                        onClick={() => setEditing(member)}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6 px-1 sm:px-0">
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
      <Card className="surface-card border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-3 sm:p-4">
        <h1 className="text-xl font-semibold text-slate-900">Members Management</h1>
        <p className="text-sm text-slate-500">Use tier navigation to quickly review active, expiring soon (&lt;= 7 days), and expired members.</p>
      </Card>

      <Card className="surface-card border border-slate-200 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-slate-300 text-slate-700 hover:bg-slate-100"
            onClick={() => load()}
          >
            Refresh
          </Button>
          {tierList.map((tier) => {
            const count = (grouped.get(tier) ?? []).length;
            const isActiveTier = tier === activeTier;
            return (
              <button
                key={tier}
                type="button"
                onClick={() => setActiveTier(tier)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  isActiveTier
                    ? (TIER_TAB_STYLE[tier]?.active ?? TIER_TAB_STYLE.Unassigned.active)
                    : (TIER_TAB_STYLE[tier]?.inactive ?? TIER_TAB_STYLE.Unassigned.inactive)
                }`}
              >
                {tier} ({count})
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Search member name</label>
            <Input
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Type first or last name"
              className="border-slate-300 bg-white text-slate-800"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-slate-300 text-slate-700 hover:bg-slate-100"
            onClick={() => setSearchName("")}
          >
            Clear
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Tip: Unassigned helps you quickly find members with no tier yet.</p>
      </Card>

      {(() => {
        const tier = activeTier;
        const query = searchName.trim().toLowerCase();
        const tierRows = (grouped.get(tier) ?? []).filter((member) => {
          if (!query) return true;
          const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
          const reverseName = `${member.lastName} ${member.firstName}`.toLowerCase();
          return fullName.includes(query) || reverseName.includes(query);
        });
        const active = tierRows.filter((r) => r.membershipStatus === "ACTIVE" || r.membershipStatus === "NO_EXPIRY");
        const soon = tierRows.filter((r) => r.membershipStatus === "EXPIRING_SOON");
        const expired = tierRows.filter((r) => r.membershipStatus === "EXPIRED");

        return (
          <section key={tier} className="space-y-3">
            <div className={`rounded-xl border bg-gradient-to-r px-4 py-3 ${TIER_ACCENT[tier] ?? TIER_ACCENT.Unassigned}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-800">{tier}</h2>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-700">
                  <span className="rounded bg-white/80 px-2 py-0.5">Total: {tierRows.length}</span>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700">Active: {active.length}</span>
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">Expiring: {soon.length}</span>
                  <span className="rounded bg-red-100 px-2 py-0.5 text-red-700">Expired: {expired.length}</span>
                </div>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {renderTable(`${tier} Active`, active, "active")}
              {renderTable(`${tier} Expiring Soon`, soon, "soon")}
              {renderTable(`${tier} Expired`, expired, "expired")}
            </div>
          </section>
        );
      })()}

      {editing ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-[2px]">
          <Card className="max-h-[92vh] w-full max-w-3xl space-y-4 overflow-y-auto border border-slate-300 bg-white p-4 sm:p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">
                Edit Membership: {editing.firstName} {editing.lastName}
              </h3>
              <Button variant="outline" className="border-slate-300 hover:bg-slate-100" onClick={() => setEditing(null)}>
                Close
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Tier</label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                  value={editing.membershipTier ?? "Unassigned"}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEditing({ ...editing, membershipTier: next === "Unassigned" ? null : next, tier: next });
                  }}
                >
                  <option value="Bronze">Bronze</option>
                  <option value="Silver">Silver</option>
                  <option value="Gold">Gold</option>
                  <option value="Platinum">Platinum</option>
                  <option value="Students">Students</option>
                  <option value="Founding Member">Founding Member</option>
                  <option value="Unassigned">Unassigned</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Lock-in</label>
                <Input className="border-slate-300 bg-white text-slate-800" value={editing.lockInLabel ?? ""} onChange={(e) => setEditing({ ...editing, lockInLabel: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Membership Start</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={editing.membershipStart ? new Date(editing.membershipStart).toISOString().slice(0, 10) : ""}
                  onChange={(e) => setEditing({ ...editing, membershipStart: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Membership Expiry</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={editing.membershipExpiry ? new Date(editing.membershipExpiry).toISOString().slice(0, 10) : ""}
                  onChange={(e) => setEditing({ ...editing, membershipExpiry: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Grace Period End</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={editing.gracePeriodEnd ? new Date(editing.gracePeriodEnd).toISOString().slice(0, 10) : ""}
                  onChange={(e) => setEditing({ ...editing, gracePeriodEnd: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Freeze Status</label>
                <Input className="border-slate-300 bg-white text-slate-800" value={editing.freezeStatus ?? ""} onChange={(e) => setEditing({ ...editing, freezeStatus: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Monthly Fee</label>
                <Input className="border-slate-300 bg-white text-slate-800" value={editing.monthlyFeeLabel ?? ""} onChange={(e) => setEditing({ ...editing, monthlyFeeLabel: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Membership Fee</label>
                <Input className="border-slate-300 bg-white text-slate-800" value={editing.membershipFeeLabel ?? ""} onChange={(e) => setEditing({ ...editing, membershipFeeLabel: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-slate-600">Notes</label>
                <Input className="border-slate-300 bg-white text-slate-800" value={editing.membershipNotes ?? ""} onChange={(e) => setEditing({ ...editing, membershipNotes: e.target.value })} />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
              <Button
                variant="outline"
                className="border-slate-300 text-slate-700 hover:bg-slate-100"
                disabled={loading}
                onClick={async () => {
                  if (!editing.membershipExpiry) return;
                  setLoading(true);
                  const expiry = new Date(editing.membershipExpiry);
                  expiry.setDate(expiry.getDate() + 30);
                  const res = await fetch(`/api/users/${editing.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ membershipExpiry: expiry.toISOString() }),
                  });
                  const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                  setLoading(false);
                  if (!json.success) {
                    setNotice({ type: "error", message: json.details || json.error || "Failed to renew membership." });
                    return;
                  }
                  setEditing(null);
                  await load();
                  setNotice({ type: "success", message: "Membership renewed successfully." });
                }}
              >
                Renew +30 days
              </Button>
              <Button
                disabled={loading}
                className="bg-[#1e3a5f] text-white shadow-sm hover:bg-[#1e3a5f]/90"
                onClick={async () => {
                  setLoading(true);
                  const res = await fetch(`/api/users/${editing.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      membershipTier: editing.membershipTier,
                      lockInLabel: editing.lockInLabel,
                      membershipStart: editing.membershipStart,
                      membershipExpiry: editing.membershipExpiry,
                      gracePeriodEnd: editing.gracePeriodEnd,
                      freezeStatus: editing.freezeStatus,
                      monthlyFeeLabel: editing.monthlyFeeLabel,
                      membershipFeeLabel: editing.membershipFeeLabel,
                      membershipNotes: editing.membershipNotes,
                    }),
                  });
                  const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                  setLoading(false);
                  if (!json.success) {
                    setNotice({ type: "error", message: json.details || json.error || "Failed to save membership changes." });
                    return;
                  }
                  setEditing(null);
                  await load();
                  setNotice({ type: "success", message: "Membership tier and details saved." });
                }}
              >
                Save Changes
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

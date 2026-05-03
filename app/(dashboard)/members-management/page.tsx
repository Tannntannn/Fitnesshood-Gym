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
  freezeStartedAt: string | null;
  freezeEndsAt: string | null;
  freezeDaysTotal: number | null;
  membershipNotes: string | null;
  monthlyExpiryDate: string | null;
  remainingBalance: string | null;
  totalContractPrice: string | null;
  contractPaidToDate: string | null;
  membershipPenalty: boolean;
  membershipPenaltySource: "AUTO" | "MANUAL" | null;
  membershipPenaltyNotes: string | null;
  tier: string;
  daysLeft: number | null;
  membershipStatus: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "NO_EXPIRY";
};

/** Synthetic tab: all members with penalty (any tier). */
const PENALTY_TAB = "__penalty__";

function computeContractPaidToDateStr(total: string | null, remaining: string | null): string | null {
  if (total == null || total === "") return null;
  const t = Number(total);
  if (!Number.isFinite(t)) return null;
  const r = Number(remaining ?? 0);
  return String(Math.max(0, t - (Number.isFinite(r) ? r : 0)));
}

function formatMoneyOrNA(raw: string | null): string {
  if (raw == null || raw === "") return "N/A";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function membershipStatusLabel(status: ManagedMember["membershipStatus"]): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "EXPIRING_SOON":
      return "Expiring soon";
    case "EXPIRED":
      return "Expired";
    case "NO_EXPIRY":
      return "No expiry";
    default:
      return status;
  }
}

function PenaltyNameTag({ member }: { member: ManagedMember }) {
  if (!member.membershipPenalty) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm"
      title={member.membershipPenaltySource === "MANUAL" ? "Manual" : "Automatic"}
    >
      Penalty
    </span>
  );
}

const TIER_ORDER = ["Bronze", "Silver", "Gold", "Platinum", "Students", "Founding Member", "Unassigned"];

/** Shown in this page only; stored `membershipTier` / API values stay canonical (e.g. Bronze). */
function tierDisplayLabel(tierKey: string): string {
  return tierKey === "Bronze" ? "Non-members" : tierKey;
}

/** Prefer stored membershipTier; if empty, use inferred tab tier so the edit form matches the list. */
function memberForEdit(member: ManagedMember): ManagedMember {
  const explicit = member.membershipTier?.trim() || null;
  const fromInference = member.tier !== "Unassigned" ? member.tier : null;
  return {
    ...member,
    membershipTier: explicit ?? fromInference,
  };
}
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
  [PENALTY_TAB]: {
    active: "border-rose-700 bg-rose-700 text-white",
    inactive: "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100",
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
    const res = await fetch("/api/members-management", { cache: "no-store" });
    const json = (await res.json()) as { success: boolean; data?: ManagedMember[] };
    if (json.success && json.data) {
      setRows(
        json.data.map((m) => {
          const remainingBalance = m.remainingBalance != null ? String(m.remainingBalance) : null;
          const totalContractPrice = m.totalContractPrice != null ? String(m.totalContractPrice) : null;
          const contractPaidToDate =
            m.contractPaidToDate != null
              ? String(m.contractPaidToDate)
              : computeContractPaidToDateStr(totalContractPrice, remainingBalance);
          return {
            ...m,
            membershipPenalty: Boolean(m.membershipPenalty),
            membershipPenaltySource: m.membershipPenaltySource ?? null,
            membershipPenaltyNotes: m.membershipPenaltyNotes ?? null,
            monthlyExpiryDate: m.monthlyExpiryDate ?? null,
            remainingBalance,
            totalContractPrice,
            contractPaidToDate,
          };
        }),
      );
    }
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

  const penaltyCount = useMemo(() => rows.filter((r) => r.membershipPenalty).length, [rows]);

  const tierList = useMemo(() => {
    const present = Array.from(grouped.keys()).sort();
    const ordered = TIER_ORDER.filter((tier) => present.includes(tier));
    const others = present.filter((tier) => !TIER_ORDER.includes(tier));
    return [...ordered, ...others];
  }, [grouped]);

  const tierNavItems = useMemo(() => {
    const items = tierList.map((tier) => ({ key: tier, label: tierDisplayLabel(tier), count: (grouped.get(tier) ?? []).length }));
    const fmIdx = items.findIndex((i) => i.key === "Founding Member");
    const insertAt = fmIdx >= 0 ? fmIdx + 1 : items.length;
    items.splice(insertAt, 0, { key: PENALTY_TAB, label: "Penalty", count: penaltyCount });
    return items;
  }, [tierList, grouped, penaltyCount]);

  useEffect(() => {
    if (activeTier === PENALTY_TAB) return;
    if (tierList.length === 0) {
      setActiveTier("Unassigned");
      return;
    }
    if (!tierList.includes(activeTier)) {
      setActiveTier(tierList[0]);
    }
  }, [tierList, activeTier]);

  const renderTable = (
    title: string,
    data: ManagedMember[],
    kind: "active" | "soon" | "expired",
    opts?: { showTierUnderName?: boolean },
  ) => {
    const compact = kind !== "active";
    const colCount = compact ? 5 : 9;
    const showTierUnderName = opts?.showTierUnderName ?? false;
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
                {!compact ? <th className="px-3 py-2 font-semibold">Monthly due</th> : null}
                {!compact ? <th className="px-3 py-2 font-semibold">Owed</th> : null}
                <th className="px-3 py-2 font-semibold">Penalty detail</th>
                <th className="px-3 py-2 font-semibold">Expiry</th>
                <th className="px-3 py-2 font-semibold">Lock-in</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-3 py-6 text-center text-slate-400">
                    No records.
                  </td>
                </tr>
              ) : (
                sorted.map((member) => (
                  <tr
                    key={member.id}
                    className={`hover:bg-slate-50/70 ${member.membershipPenalty ? "bg-rose-50/40" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-800">
                          {member.firstName} {member.lastName}
                        </span>
                        <PenaltyNameTag member={member} />
                      </div>
                      {showTierUnderName ? (
                        <p className="mt-0.5 text-[10px] font-medium text-slate-500">Tier: {tierDisplayLabel(member.tier)}</p>
                      ) : null}
                    </td>
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
                    {!compact ? (
                      <td className="px-3 py-2 text-slate-700">
                        {member.monthlyExpiryDate ? format(new Date(member.monthlyExpiryDate), "MMM d, yyyy") : "N/A"}
                      </td>
                    ) : null}
                    {!compact ? (
                      <td className="px-3 py-2 tabular-nums text-slate-700">
                        {Number(member.remainingBalance ?? 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    ) : null}
                    <td className="px-3 py-2 text-slate-700">
                      {member.membershipPenalty ? (
                        <span className="text-[10px] font-medium text-slate-600">
                          {member.membershipPenaltySource === "MANUAL" ? "Manual" : "Automatic"}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {member.membershipExpiry ? format(new Date(member.membershipExpiry), "MMM d, yyyy") : "N/A"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{member.lockInLabel || "N/A"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          size="sm"
                          className="h-7 bg-[#1e3a5f] px-2.5 text-[11px] text-white hover:bg-[#1e3a5f]/90"
                          onClick={() => setEditing(memberForEdit(member))}
                        >
                          Edit
                        </Button>
                        {member.membershipPenalty ? (
                          <span className="rounded border border-rose-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                            Penalty
                          </span>
                        ) : null}
                      </div>
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

  /** One full-width table for the Penalty tab (all flagged members). */
  const renderPenaltyListTable = (data: ManagedMember[]) => {
    const sorted = data
      .slice()
      .sort((a, b) => {
        const rank = (m: ManagedMember) =>
          m.membershipStatus === "EXPIRED" ? 0 : m.membershipStatus === "EXPIRING_SOON" ? 1 : m.membershipStatus === "ACTIVE" ? 2 : 3;
        const d = rank(a) - rank(b);
        if (d !== 0) return d;
        return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, undefined, { sensitivity: "base" });
      });
    const colCount = 12;

    return (
      <Card className="surface-card overflow-hidden border border-slate-200 p-0">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h4 className="text-xs font-semibold tracking-wide text-slate-700">All members with penalty</h4>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">{sorted.length} members</span>
        </div>
        <div className="max-h-[min(70vh,720px)] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Tier</th>
                <th className="px-3 py-2 font-semibold">Contact</th>
                <th className="px-3 py-2 font-semibold">Days left</th>
                <th className="px-3 py-2 font-semibold">Monthly due</th>
                <th className="px-3 py-2 font-semibold">Owed</th>
                <th className="px-3 py-2 font-semibold">Paid (contract)</th>
                <th className="px-3 py-2 font-semibold">Penalty</th>
                <th className="px-3 py-2 font-semibold">Expiry</th>
                <th className="px-3 py-2 font-semibold">Lock-in</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-3 py-6 text-center text-slate-400">
                    No members with penalty.
                  </td>
                </tr>
              ) : (
                sorted.map((member) => (
                  <tr key={member.id} className="bg-rose-50/40 hover:bg-rose-50/70">
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-800">
                          {member.firstName} {member.lastName}
                        </span>
                        <PenaltyNameTag member={member} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{tierDisplayLabel(member.tier)}</td>
                    <td className="px-3 py-2 text-slate-600">{member.contactNo || "N/A"}</td>
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
                    <td className="px-3 py-2 text-slate-700">
                      {member.monthlyExpiryDate ? format(new Date(member.monthlyExpiryDate), "MMM d, yyyy") : "N/A"}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-700">
                      {Number(member.remainingBalance ?? 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-700">{formatMoneyOrNA(member.contractPaidToDate)}</td>
                    <td className="px-3 py-2 text-slate-700">
                      <span className="text-[10px] font-medium text-slate-600">
                        {member.membershipPenaltySource === "MANUAL" ? "Manual" : "Automatic"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {member.membershipExpiry ? format(new Date(member.membershipExpiry), "MMM d, yyyy") : "N/A"}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{member.lockInLabel || "N/A"}</td>
                    <td className="px-3 py-2 text-slate-700">
                      <span
                        className={
                          member.membershipStatus === "EXPIRED"
                            ? "rounded bg-red-100 px-1.5 py-0.5 text-red-800"
                            : member.membershipStatus === "EXPIRING_SOON"
                              ? "rounded bg-amber-100 px-1.5 py-0.5 text-amber-800"
                              : "rounded bg-slate-100 px-1.5 py-0.5 text-slate-700"
                        }
                      >
                        {membershipStatusLabel(member.membershipStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          size="sm"
                          className="h-7 bg-[#1e3a5f] px-2.5 text-[11px] text-white hover:bg-[#1e3a5f]/90"
                          onClick={() => setEditing(memberForEdit(member))}
                        >
                          Edit
                        </Button>
                        <span className="rounded border border-rose-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                          Penalty
                        </span>
                      </div>
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
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
          <span className="font-semibold">Automatic penalty (two rules):</span> (1){" "}
          <span className="font-medium">Expired membership</span> and <span className="font-medium">contract balance owed</span> — flagged for{" "}
          <span className="font-medium">every tier</span>, listed on the <span className="font-medium">Penalty</span> tab, and highlighted on their tier table with the Penalty badge. (2){" "}
          <span className="font-medium">Silver / Gold / Platinum</span> with <span className="font-medium">monthly due</span> passed (calendar) and balance still owed. Frozen accounts are skipped.{" "}
          Expired + balance owed is always re-flagged as automatic penalty (even if someone turned it off manually); extend membership or clear the balance to remove it. Other cases keep your <span className="font-medium">Manual</span> choice until you use &quot;Re-apply automatic penalty rules&quot;.
        </p>
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
          {tierNavItems.map((item) => {
            const isActiveTier = item.key === activeTier;
            const style = TIER_TAB_STYLE[item.key] ?? TIER_TAB_STYLE.Unassigned;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTier(item.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  isActiveTier ? style.active : style.inactive
                }`}
              >
                {item.label} ({item.count})
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
        <p className="mt-2 text-[11px] text-slate-500">
          Tip: Unassigned helps you quickly find members with no tier yet. <span className="font-semibold text-rose-800">Penalty</span> (after Founding Member) opens{" "}
          <span className="font-medium">one table</span> listing every flagged member.
        </p>
      </Card>

      {(() => {
        const query = searchName.trim().toLowerCase();
        const nameMatch = (member: ManagedMember) => {
          if (!query) return true;
          const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
          const reverseName = `${member.lastName} ${member.firstName}`.toLowerCase();
          return fullName.includes(query) || reverseName.includes(query);
        };
        const tierRows =
          activeTier === PENALTY_TAB
            ? rows.filter((member) => member.membershipPenalty && nameMatch(member))
            : (grouped.get(activeTier) ?? []).filter(nameMatch);
        const active = tierRows.filter((r) => r.membershipStatus === "ACTIVE" || r.membershipStatus === "NO_EXPIRY");
        const soon = tierRows.filter((r) => r.membershipStatus === "EXPIRING_SOON");
        const expired = tierRows.filter((r) => r.membershipStatus === "EXPIRED");
        const sectionTitle =
          activeTier === PENALTY_TAB ? "Penalty (all tiers)" : tierDisplayLabel(activeTier);
        const headerAccent =
          activeTier === PENALTY_TAB
            ? "from-rose-50 to-red-50 border-rose-200"
            : TIER_ACCENT[activeTier] ?? TIER_ACCENT.Unassigned;

        return (
          <section key={activeTier} className="space-y-3">
            <div className={`rounded-xl border bg-gradient-to-r px-4 py-3 ${headerAccent}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-800">{sectionTitle}</h2>
                  {activeTier === PENALTY_TAB ? (
                    <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                      Penalty list
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-700">
                  <span className="rounded bg-white/80 px-2 py-0.5">Total: {tierRows.length}</span>
                  {activeTier === PENALTY_TAB ? null : (
                    <>
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700">Active: {active.length}</span>
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">Expiring: {soon.length}</span>
                      <span className="rounded bg-red-100 px-2 py-0.5 text-red-700">Expired: {expired.length}</span>
                    </>
                  )}
                </div>
              </div>
              {activeTier === PENALTY_TAB ? (
                <p className="mt-2 text-xs text-slate-600">
                  Single list of every member with a penalty flag. Rows are sorted by membership status (expired first), then name. Edit to clear or override, or use
                  &quot;Re-apply automatic penalty rules&quot; in the editor.
                </p>
              ) : null}
            </div>
            {activeTier === PENALTY_TAB ? (
              renderPenaltyListTable(tierRows)
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {renderTable(`${sectionTitle} · Active`, active, "active")}
                {renderTable(`${sectionTitle} · Expiring Soon`, soon, "soon")}
                {renderTable(`${sectionTitle} · Expired`, expired, "expired")}
              </div>
            )}
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
                  value={
                    editing.membershipTier?.trim()
                      ? editing.membershipTier.trim()
                      : editing.tier !== "Unassigned"
                        ? editing.tier
                        : "Unassigned"
                  }
                  onChange={(e) => {
                    const next = e.target.value;
                    const tierValue = next === "Unassigned" ? null : next;
                    setEditing({
                      ...editing,
                      membershipTier: tierValue,
                      tier: tierValue ?? "Unassigned",
                    });
                  }}
                >
                  <option value="Bronze">Non-members</option>
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
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                  value={(editing.freezeStatus ?? "").toUpperCase()}
                  onChange={(e) => setEditing({ ...editing, freezeStatus: e.target.value || null })}
                >
                  <option value="">None</option>
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Freeze Start</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={editing.freezeStartedAt ? new Date(editing.freezeStartedAt).toISOString().slice(0, 10) : ""}
                  onChange={(e) => setEditing({ ...editing, freezeStartedAt: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Freeze End</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={editing.freezeEndsAt ? new Date(editing.freezeEndsAt).toISOString().slice(0, 10) : ""}
                  onChange={(e) => setEditing({ ...editing, freezeEndsAt: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Freeze Days</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="number"
                  min={0}
                  value={editing.freezeDaysTotal ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      freezeDaysTotal: e.target.value === "" ? null : Math.max(0, Math.trunc(Number(e.target.value))),
                    })
                  }
                />
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

            <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
              <p className="text-xs font-semibold text-rose-900">Membership penalty</p>
              <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-700">
                <p>
                  <span className="font-medium text-slate-600">Membership expires:</span>{" "}
                  {editing.membershipExpiry ? format(new Date(editing.membershipExpiry), "MMM d, yyyy") : "N/A"}
                </p>
                <p>
                  <span className="font-medium text-slate-600">Monthly due:</span>{" "}
                  {editing.monthlyExpiryDate ? format(new Date(editing.monthlyExpiryDate), "MMM d, yyyy") : "N/A"}
                </p>
                <p>
                  <span className="font-medium text-slate-600">Tier contract price:</span> {formatMoneyOrNA(editing.totalContractPrice)}
                </p>
                <p>
                  <span className="font-medium text-slate-600">Paid toward contract:</span> {formatMoneyOrNA(editing.contractPaidToDate)}
                </p>
                <p className="sm:col-span-2">
                  <span className="font-medium text-slate-600">Still owed on contract:</span>{" "}
                  {Number(editing.remainingBalance ?? 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="sm:col-span-2">
                  <span className="font-medium text-slate-600">Source:</span>{" "}
                  {editing.membershipPenaltySource === "MANUAL"
                    ? "Manual (admin)"
                    : editing.membershipPenaltySource === "AUTO"
                      ? "Automatic (rules)"
                      : "—"}
                </p>
              </div>
              <p className="text-[11px] text-slate-600">
                Contract figures follow Payments: the tier’s package price is the full contract amount; membership contract payments (and discounts on those payments) reduce what is owed. Auto penalty: expired membership + balance owed (all tiers), or Silver/Gold/Platinum with monthly due passed + balance. Flagged members appear on the Penalty tab and show the badge on their tier. You can always override below.
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={editing.membershipPenalty}
                  onChange={(e) => setEditing({ ...editing, membershipPenalty: e.target.checked })}
                />
                <span>Member is under penalty</span>
              </label>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Penalty notes (optional)</label>
                <textarea
                  className="min-h-[72px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                  value={editing.membershipPenaltyNotes ?? ""}
                  onChange={(e) => setEditing({ ...editing, membershipPenaltyNotes: e.target.value })}
                  placeholder="Internal note (e.g. spoke with member, payment plan)…"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-amber-400 bg-white text-amber-900 hover:bg-amber-50"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  const res = await fetch(`/api/users/${editing.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ membershipPenaltyUseAuto: true }),
                  });
                  const json = (await res.json()) as {
                    success?: boolean;
                    error?: string;
                    details?: string;
                    data?: ManagedMember & { monthlyExpiryDate?: string | Date | null; remainingBalance?: unknown };
                  };
                  setLoading(false);
                  if (!json.success) {
                    setNotice({ type: "error", message: json.details || json.error || "Could not re-apply rules." });
                    return;
                  }
                  if (json.data) {
                    const u = json.data;
                    const totalContractPrice = u.totalContractPrice != null ? String(u.totalContractPrice) : null;
                    const remainingBalance = u.remainingBalance != null ? String(u.remainingBalance) : null;
                    setEditing({
                      ...editing,
                      membershipPenalty: Boolean(u.membershipPenalty),
                      membershipPenaltySource: u.membershipPenaltySource ?? null,
                      membershipPenaltyNotes: u.membershipPenaltyNotes ?? null,
                      monthlyExpiryDate: u.monthlyExpiryDate != null ? String(u.monthlyExpiryDate) : null,
                      remainingBalance,
                      totalContractPrice,
                      contractPaidToDate: computeContractPaidToDateStr(totalContractPrice, remainingBalance),
                    });
                  }
                  await load();
                  setNotice({ type: "success", message: "Penalty recalculated from automatic rules." });
                }}
              >
                Re-apply automatic penalty rules
              </Button>
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
                      membershipTier: editing.membershipTier?.trim() || null,
                      lockInLabel: editing.lockInLabel,
                      membershipStart: editing.membershipStart,
                      membershipExpiry: editing.membershipExpiry,
                      gracePeriodEnd: editing.gracePeriodEnd,
                      freezeStatus: editing.freezeStatus,
                      freezeStartedAt: editing.freezeStartedAt,
                      freezeEndsAt: editing.freezeEndsAt,
                      freezeDaysTotal: editing.freezeDaysTotal,
                      monthlyFeeLabel: editing.monthlyFeeLabel,
                      membershipFeeLabel: editing.membershipFeeLabel,
                      membershipNotes: editing.membershipNotes,
                      membershipPenalty: editing.membershipPenalty,
                      membershipPenaltyNotes: editing.membershipPenaltyNotes?.trim() || null,
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

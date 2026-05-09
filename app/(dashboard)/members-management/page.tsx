"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { differenceInCalendarDays, format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nowInPH } from "@/lib/time";

type ManagedMember = {
  id: string;
  firstName: string;
  lastName: string;
  contactNo: string;
  membershipStart: string | null;
  membershipExpiry: string | null;
  membershipTierStart?: string | null;
  membershipTierExpiry?: string | null;
  membershipJoinedStart?: string | null;
  membershipJoinedExpiry?: string | null;
  fullMembershipExpiry?: string | null;
  createdAt?: string | null;
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
  tierLockInTemplateMonths?: number | null;
  tierLockInPaidMonths?: number | null;
  membershipPenalty: boolean;
  membershipPenaltySource: "AUTO" | "MANUAL" | null;
  membershipPenaltyNotes: string | null;
  tier: string;
  daysLeft: number | null;
  membershipStatus: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "NO_EXPIRY";
  /** Latest attendance scan (any role snapshot) for inactivity rules. */
  lastAttendanceAt?: string | null;
  addOnSubscriptions?: Array<{
    id: string;
    addonName: string;
    dueDate?: string | null;
    status?: string | null;
    notes?: string | null;
  }>;
};

/** Synthetic tab: all members with penalty (any tier). */
const PENALTY_TAB = "__penalty__";
/** Expired members with no visit or last visit 30+ days ago (any tier). */
const NOT_ACTIVE_TAB = "__not_active__";
const FROZEN_TAB = "__frozen__";
/** All members in one spreadsheet (any tier). */
const OVERALL_TAB = "__overall__";

type OutwardStatus = "Active" | "Expiring soon" | "Expired" | "Not active";

type MmSortKey =
  | "name"
  | "contact"
  | "status"
  | "lockIn"
  | "tier"
  | "daysLeft"
  | "start"
  | "expiry"
  | "join"
  | "membershipEnds"
  | "grace"
  | "monthlyFee"
  | "membershipFee"
  | "freeze"
  | "notes"
  | "lastVisit";

function getOutwardStatus(member: ManagedMember): OutwardStatus {
  const s = member.membershipStatus;
  if (s === "ACTIVE" || s === "NO_EXPIRY") return "Active";
  if (s === "EXPIRING_SOON") return "Expiring soon";
  if (s === "EXPIRED") {
    const raw = member.lastAttendanceAt;
    if (!raw) return "Not active";
    const daysSince = differenceInCalendarDays(nowInPH(), new Date(raw));
    if (daysSince >= 30) return "Not active";
    return "Expired";
  }
  return "Active";
}

/** Roster order: Active (top) → Expiring soon → Expired → Not active (bottom). */
function rosterStatusGroupRank(member: ManagedMember): number {
  const o = getOutwardStatus(member);
  if (o === "Active") return 0;
  if (o === "Expiring soon") return 1;
  if (o === "Expired") return 2;
  return 3;
}

function lockInPillClass(label: string | null | undefined): string {
  const t = (label ?? "").toLowerCase();
  if (t.includes("12 month")) return "bg-rose-600/90 text-white ring-1 ring-rose-500/50";
  if (t.includes("6 month")) return "bg-sky-600/90 text-white ring-1 ring-sky-500/50";
  if (t.includes("3 month")) return "bg-amber-500/90 text-white ring-1 ring-amber-400/50";
  if (t.includes("no lock")) return "bg-slate-500/90 text-white ring-1 ring-slate-400/50";
  return "bg-slate-600/90 text-white ring-1 ring-slate-500/50";
}

function extractLockInLeftMonths(label: string | null | undefined): number | null {
  const txt = (label ?? "").trim().toLowerCase();
  if (!txt || txt.includes("no lock")) return 0;
  const m = txt.match(/(\d+)\s*months?/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
}

function lockInPaidMonths(left: number | null, template: number | null): number | null {
  if (left == null || template == null) return null;
  const t = Math.max(0, Math.trunc(template));
  const l = Math.max(0, Math.min(t, Math.trunc(left)));
  return Math.max(0, t - l);
}

function tierPillClass(tierKey: string): string {
  switch (tierKey) {
    case "Silver":
      return "bg-slate-300 text-slate-900 ring-1 ring-slate-400/80";
    case "Gold":
      return "bg-yellow-400 text-yellow-950 ring-1 ring-yellow-500/60";
    case "Platinum":
      return "bg-cyan-200 text-cyan-950 ring-1 ring-cyan-400/70";
    case "Bronze":
      return "bg-amber-700 text-white ring-1 ring-amber-600/60";
    case "Students":
      return "bg-indigo-600 text-white ring-1 ring-indigo-500/50";
    case "Founding Member":
      return "bg-rose-600 text-white ring-1 ring-rose-500/50";
    default:
      return "bg-slate-500 text-white ring-1 ring-slate-400/50";
  }
}

function statusPillClass(status: OutwardStatus): string {
  switch (status) {
    case "Active":
      return "bg-emerald-600 text-white ring-1 ring-emerald-500/50";
    case "Expiring soon":
      return "bg-amber-500 text-white ring-1 ring-amber-400/50";
    case "Expired":
      return "bg-red-600 text-white ring-1 ring-red-500/50";
    case "Not active":
      return "bg-slate-600 text-white ring-1 ring-slate-500/50";
    default:
      return "bg-slate-500 text-white";
  }
}

function formatLongDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMMM d, yyyy");
}

/** `type="date"` value; avoids throwing on invalid ISO from the API. */
function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatDateSafe(iso: string | null | undefined, pattern: string, empty: string): string {
  if (!iso) return empty;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return empty;
  return format(d, pattern);
}

/** Matches the add-on name "Locker" only (case-insensitive). */
function isLockerAddonName(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === "locker";
}

/** Remove lines that store locker assignment (same convention as payments: `Locker #: …`). */
function stripLockerNoteLines(text: string | null | undefined): string {
  if (!text?.trim()) return "";
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*Locker\s*#\s*:?\s*/i.test(line))
    .join("\n")
    .trim();
}

function parseLockerNumberFromNotes(text: string | null | undefined): string {
  if (!text) return "";
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*Locker\s*#\s*:\s*(.*)$/i);
    if (m) return m[1].trim();
  }
  return "";
}

function mergeLockerIntoNotes(otherNotes: string, lockerNumber: string): string | null {
  const rest = otherNotes.trim();
  const lock = lockerNumber.trim();
  const parts: string[] = [];
  if (rest) parts.push(rest);
  if (lock) parts.push(`Locker #: ${lock}`);
  if (!parts.length) return null;
  return parts.join("\n");
}

/** Value for the roster “Locker” column: first `Locker #:` found on member add-ons (ACTIVE and name↔locker preferred). */
function memberLockerNumberLabel(member: ManagedMember): string {
  const subs = member.addOnSubscriptions ?? [];
  if (subs.length === 0) return "";
  const statusRank = (s: string | null | undefined) => ((s ?? "").toUpperCase() === "ACTIVE" ? 0 : 1);
  const nameRank = (name: string) => {
    const n = name.trim().toLowerCase();
    if (n === "locker") return 0;
    if (n.includes("locker")) return 1;
    return 2;
  };
  const sorted = subs.slice().sort((a, b) => {
    const ds = statusRank(a.status) - statusRank(b.status);
    if (ds !== 0) return ds;
    return nameRank(a.addonName) - nameRank(b.addonName);
  });
  for (const sub of sorted) {
    const num = parseLockerNumberFromNotes(sub.notes);
    if (num) return num;
  }
  return "";
}

/** Matches members-management API: monthly due drives roster expiry when set (not full lock-in horizon). */
function rosterAccessExpiryIso(member: ManagedMember): string | null {
  const m = member.monthlyExpiryDate?.trim();
  if (m) return m;
  return member.membershipExpiry ?? null;
}

const EDIT_MODAL_TIER_VALUES = new Set([
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Students",
  "Founding Member",
  "Unassigned",
]);

function editModalTierSelectValue(member: ManagedMember): string {
  const raw = member.membershipTier?.trim() || (member.tier !== "Unassigned" ? member.tier : "Unassigned");
  return EDIT_MODAL_TIER_VALUES.has(raw) ? raw : "Unassigned";
}

function freezeStatusSelectFormValue(status: string | null | undefined): string {
  const fs = (status ?? "").toUpperCase();
  return fs === "ACTIVE" || fs === "COMPLETED" ? fs : "";
}

function mmSortCompare(a: ManagedMember, b: ManagedMember, key: MmSortKey, dir: number): number {
  const str = (v: string | null | undefined) => (v ?? "").trim();
  const numOr = (n: number | null | undefined, empty: number) =>
    n == null || !Number.isFinite(n) ? empty : n;
  let cmp = 0;
  switch (key) {
    case "name":
      cmp = `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, undefined, { sensitivity: "base" });
      break;
    case "contact":
      cmp = str(a.contactNo).localeCompare(str(b.contactNo), undefined, { numeric: true });
      break;
    case "status": {
      const rank = (m: ManagedMember) => {
        const o = getOutwardStatus(m);
        if (o === "Active") return 0;
        if (o === "Expiring soon") return 1;
        if (o === "Expired") return 2;
        return 3;
      };
      cmp = rank(a) - rank(b);
      if (cmp === 0) cmp = numOr(a.daysLeft, 99999) - numOr(b.daysLeft, 99999);
      break;
    }
    case "lockIn":
      cmp = str(a.lockInLabel).localeCompare(str(b.lockInLabel), undefined, { sensitivity: "base" });
      break;
    case "tier":
      cmp = tierDisplayLabel(a.tier).localeCompare(tierDisplayLabel(b.tier), undefined, { sensitivity: "base" });
      break;
    case "daysLeft":
      cmp = numOr(a.daysLeft, 99999) - numOr(b.daysLeft, 99999);
      break;
    case "start":
      cmp = (a.membershipStart ? new Date(a.membershipStart).getTime() : 0) - (b.membershipStart ? new Date(b.membershipStart).getTime() : 0);
      break;
    case "expiry": {
      const ae = rosterAccessExpiryIso(a);
      const be = rosterAccessExpiryIso(b);
      cmp = (ae ? new Date(ae).getTime() : 0) - (be ? new Date(be).getTime() : 0);
      break;
    }
    case "join":
      cmp = (a.createdAt ? new Date(a.createdAt).getTime() : 0) - (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      break;
    case "membershipEnds":
      cmp =
        (a.fullMembershipExpiry ? new Date(a.fullMembershipExpiry).getTime() : 0) -
        (b.fullMembershipExpiry ? new Date(b.fullMembershipExpiry).getTime() : 0);
      break;
    case "grace":
      cmp = (a.gracePeriodEnd ? new Date(a.gracePeriodEnd).getTime() : 0) - (b.gracePeriodEnd ? new Date(b.gracePeriodEnd).getTime() : 0);
      break;
    case "monthlyFee":
      cmp = str(a.monthlyFeeLabel).localeCompare(str(b.monthlyFeeLabel), undefined, { numeric: true });
      break;
    case "membershipFee":
      cmp = str(a.membershipFeeLabel).localeCompare(str(b.membershipFeeLabel), undefined, { numeric: true });
      break;
    case "freeze":
      cmp = str(a.freezeStatus).localeCompare(str(b.freezeStatus), undefined, { sensitivity: "base" });
      break;
    case "notes":
      cmp = str(a.membershipNotes).localeCompare(str(b.membershipNotes), undefined, { sensitivity: "base" });
      break;
    case "lastVisit":
      cmp =
        (a.lastAttendanceAt ? new Date(a.lastAttendanceAt).getTime() : 0) -
        (b.lastAttendanceAt ? new Date(b.lastAttendanceAt).getTime() : 0);
      break;
    default:
      cmp = 0;
  }
  if (cmp !== 0) return cmp * dir;
  return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, undefined, { sensitivity: "base" }) * dir;
}

function MmSortTh({
  label,
  column,
  sort,
  onToggle,
  align = "left",
  className = "",
}: {
  label: string;
  column: MmSortKey;
  sort: { key: MmSortKey; dir: "asc" | "desc" };
  onToggle: (k: MmSortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === column;
  const arrow = !active ? "↕" : sort.dir === "asc" ? "▲" : "▼";
  const ariaSort: "ascending" | "descending" | "none" = active
    ? sort.dir === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const ta = align === "right" ? "text-right" : "text-left";
  const just = align === "right" ? "justify-end" : "justify-start";
  return (
    <th scope="col" className={`border-b border-slate-300 bg-slate-100 px-2.5 py-2 ${ta} ${className}`} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onToggle(column)}
        className={`flex w-full items-center gap-1 ${just} text-[10px] font-bold uppercase tracking-wide text-slate-700 hover:text-slate-900`}
      >
        <span>{label}</span>
        <span className={`text-[9px] ${active ? "text-sky-600" : "text-slate-400"}`} aria-hidden="true">
          {arrow}
        </span>
      </button>
    </th>
  );
}

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
  [NOT_ACTIVE_TAB]: "from-slate-100 to-zinc-100 border-slate-300",
  [FROZEN_TAB]: "from-cyan-50 to-sky-100 border-cyan-200",
  [OVERALL_TAB]: "from-slate-100 to-slate-200 border-slate-300",
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
  [NOT_ACTIVE_TAB]: {
    active: "border-slate-700 bg-slate-700 text-white",
    inactive: "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200",
  },
  [FROZEN_TAB]: {
    active: "border-cyan-700 bg-cyan-700 text-white",
    inactive: "border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100",
  },
  [OVERALL_TAB]: {
    active: "border-[#1e3a5f] bg-[#1e3a5f] text-white",
    inactive: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  },
};

export default function MembersManagementPage() {
  const [rows, setRows] = useState<ManagedMember[]>([]);
  const [editing, setEditing] = useState<ManagedMember | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTier, setActiveTier] = useState<string>(OVERALL_TAB);
  const [searchName, setSearchName] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [mmSort, setMmSort] = useState<{ key: MmSortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [savingAddonId, setSavingAddonId] = useState<string | null>(null);
  const toggleMmSort = useCallback((key: MmSortKey) => {
    setMmSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }, []);

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

  useEffect(() => {
    if (!editing) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [editing]);

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

  const notActiveCount = useMemo(
    () => rows.filter((r) => getOutwardStatus(r) === "Not active").length,
    [rows],
  );

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
    items.splice(insertAt, 0, { key: PENALTY_TAB, label: "Penalty", count: penaltyCount }, { key: NOT_ACTIVE_TAB, label: "Not Active", count: notActiveCount });
    return [{ key: OVERALL_TAB, label: "Overall", count: rows.length }, ...items];
  }, [tierList, grouped, penaltyCount, notActiveCount, rows.length]);

  const filteredManagementRows = useMemo(() => {
    const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
    const query = normalize(searchName);
    const nameMatch = (member: ManagedMember) => {
      if (!query) return true;
      const fullName = normalize(`${member.firstName} ${member.lastName}`);
      const reverseName = normalize(`${member.lastName} ${member.firstName}`);
      return fullName.includes(query) || reverseName.includes(query);
    };
    if (activeTier === OVERALL_TAB) return rows.filter(nameMatch);
    if (activeTier === PENALTY_TAB) return rows.filter((m) => m.membershipPenalty && nameMatch);
    if (activeTier === NOT_ACTIVE_TAB) return rows.filter((m) => getOutwardStatus(m) === "Not active" && nameMatch);
    return (grouped.get(activeTier) ?? []).filter(nameMatch);
  }, [rows, grouped, activeTier, searchName]);

  const sortedManagementRows = useMemo(() => {
    const dir = mmSort.dir === "asc" ? 1 : -1;
    return filteredManagementRows.slice().sort((a, b) => {
      const band = rosterStatusGroupRank(a) - rosterStatusGroupRank(b);
      if (band !== 0) return band;
      return mmSortCompare(a, b, mmSort.key, dir);
    });
  }, [filteredManagementRows, mmSort]);

  const outwardCounts = useMemo(() => {
    let active = 0;
    let soon = 0;
    let expired = 0;
    let notActive = 0;
    for (const m of filteredManagementRows) {
      const o = getOutwardStatus(m);
      if (o === "Active") active += 1;
      else if (o === "Expiring soon") soon += 1;
      else if (o === "Expired") expired += 1;
      else notActive += 1;
    }
    return { active, soon, expired, notActive };
  }, [filteredManagementRows]);

  const sectionTitle = useMemo(() => {
    if (activeTier === OVERALL_TAB) return "Overall records";
    if (activeTier === PENALTY_TAB) return "Penalty (all tiers)";
    if (activeTier === NOT_ACTIVE_TAB) return "Not Active (all tiers)";
    return tierDisplayLabel(activeTier);
  }, [activeTier]);

  const headerAccent = useMemo(() => {
    if (activeTier === PENALTY_TAB) return "from-rose-50 to-red-50 border-rose-200";
    return TIER_ACCENT[activeTier] ?? TIER_ACCENT.Unassigned;
  }, [activeTier]);

  useEffect(() => {
    if (activeTier === PENALTY_TAB || activeTier === NOT_ACTIVE_TAB || activeTier === OVERALL_TAB) return;
    if (tierList.length === 0) {
      setActiveTier(OVERALL_TAB);
      return;
    }
    if (!tierList.includes(activeTier)) {
      setActiveTier(tierList[0]);
    }
  }, [tierList, activeTier]);

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
                      {(() => {
                        const exp = rosterAccessExpiryIso(member);
                        return exp ? format(new Date(exp), "MMM d, yyyy") : "N/A";
                      })()}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {(() => {
                        const left = extractLockInLeftMonths(member.lockInLabel);
                        const template = member.tierLockInTemplateMonths ?? null;
                        const paidFromHistory = member.tierLockInPaidMonths ?? null;
                        const paid = paidFromHistory ?? lockInPaidMonths(left, template);
                        if (paid === null || template == null) return member.lockInLabel || "N/A";
                        return `${paid} / ${template} mo`;
                      })()}
                    </td>
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
        <p className="text-sm text-slate-500">
          Use <span className="font-medium text-slate-700">Overall</span> for one sortable roster of every member, or tier tabs to filter. Status reflects active, expiring soon (&lt;= 7 days), expired, and{" "}
          <span className="font-medium text-slate-700">Not active</span> (expired with no visit in 30+ days).
        </p>
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
          <span className="font-semibold">Automatic penalty (two rules):</span> (1){" "}
          <span className="font-medium">Expired membership</span> and <span className="font-medium">contract balance owed</span> — flagged for{" "}
          <span className="font-medium">every tier</span>, listed on the <span className="font-medium">Penalty</span> tab (the <span className="font-medium">Not Active</span> tab is only for expired members inactive 30+ days), and highlighted on tier rosters with the Penalty badge. (2){" "}
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
          <span className="font-semibold text-[#1e3a5f]">Overall</span> shows every member in one sortable roster. Other tabs filter by tier.{" "}
          <span className="font-semibold text-rose-800">Penalty</span> opens the flagged-member list;{" "}
          <span className="font-semibold text-slate-800">Not Active</span> lists expired members with no visit or last visit 30+ days ago.
        </p>
      </Card>

      <section key={activeTier} className="space-y-3">
        <div className={`rounded-xl border bg-gradient-to-r px-4 py-3 ${headerAccent}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-800">{sectionTitle}</h2>
              {activeTier === PENALTY_TAB ? (
                <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                  Penalty list
                </span>
              ) : activeTier === NOT_ACTIVE_TAB ? (
                <span className="rounded-full bg-slate-700 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                  Not Active
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-700">
              <span className="rounded bg-white/80 px-2 py-0.5">Total: {filteredManagementRows.length}</span>
              {activeTier === PENALTY_TAB || activeTier === NOT_ACTIVE_TAB ? null : (
                <>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">Active: {outwardCounts.active}</span>
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">Expiring: {outwardCounts.soon}</span>
                  <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Expired: {outwardCounts.expired}</span>
                  <span className="rounded bg-slate-700 px-2 py-0.5 text-white">Not active: {outwardCounts.notActive}</span>
                </>
              )}
            </div>
          </div>
          {activeTier === PENALTY_TAB ? (
            <p className="mt-2 text-xs text-slate-600">
              Single list of every member with a penalty flag. Rows are sorted by membership status (expired first), then name. Edit to clear or override, or use
              &quot;Re-apply automatic penalty rules&quot; in the editor.
            </p>
          ) : activeTier === NOT_ACTIVE_TAB ? (
            <p className="mt-2 text-xs text-slate-600">
              Same roster as other tabs, filtered to members whose status is <span className="font-medium">Not active</span>: expired membership with no check-in on file, or last visit at least{" "}
              <span className="font-medium">30 calendar days</span> ago. All tiers included.
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-600">
              Rows are ordered <span className="font-medium">Active</span> first, then <span className="font-medium">Expiring soon</span>, then <span className="font-medium">Expired</span>, then{" "}
              <span className="font-medium">Not active</span> at the bottom; within each group, click a column header to sort. <span className="font-medium">Not active</span> means expired with no check-in or last visit{" "}
              <span className="font-medium">30+ days ago</span>.
            </p>
          )}
        </div>
        {activeTier === PENALTY_TAB ? (
          renderPenaltyListTable(filteredManagementRows)
        ) : (
          <Card className="overflow-hidden border border-slate-300 bg-white p-0 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[1400px] w-full border-collapse border border-slate-300 text-left text-[11px] text-slate-800">
                      <thead className="sticky top-0 z-10 shadow-sm">
                        <tr>
                          <MmSortTh label="Name" column="name" sort={mmSort} onToggle={toggleMmSort} className="min-w-[160px]" />
                          <MmSortTh label="Contact No." column="contact" sort={mmSort} onToggle={toggleMmSort} className="min-w-[110px]" />
                          <th
                            scope="col"
                            className="border-b border-slate-300 bg-slate-100 px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600"
                          >
                            Locker
                          </th>
                          <MmSortTh label="Status" column="status" sort={mmSort} onToggle={toggleMmSort} className="min-w-[100px]" />
                          <MmSortTh label="Lock-in (paid/template)" column="lockIn" sort={mmSort} onToggle={toggleMmSort} className="min-w-[150px]" />
                          <MmSortTh label="Membership Tier" column="tier" sort={mmSort} onToggle={toggleMmSort} className="min-w-[130px]" />
                          <MmSortTh label="Days Left" column="daysLeft" sort={mmSort} onToggle={toggleMmSort} className="min-w-[72px]" />
                          <MmSortTh label="Start Date" column="start" sort={mmSort} onToggle={toggleMmSort} className="min-w-[120px]" />
                          <MmSortTh label="Expiry Date" column="expiry" sort={mmSort} onToggle={toggleMmSort} className="min-w-[120px]" />
                          <MmSortTh label="Join Date" column="join" sort={mmSort} onToggle={toggleMmSort} className="min-w-[120px]" />
                          <MmSortTh label="Membership Ends" column="membershipEnds" sort={mmSort} onToggle={toggleMmSort} className="min-w-[130px]" />
                          <MmSortTh label="Grace Period End" column="grace" sort={mmSort} onToggle={toggleMmSort} className="min-w-[130px]" />
                          <MmSortTh label="Monthly Fee" column="monthlyFee" sort={mmSort} onToggle={toggleMmSort} className="min-w-[100px]" />
                          <MmSortTh label="Membership Fee" column="membershipFee" sort={mmSort} onToggle={toggleMmSort} className="min-w-[110px]" />
                          <MmSortTh label="Freeze Status" column="freeze" sort={mmSort} onToggle={toggleMmSort} className="min-w-[100px]" />
                          <MmSortTh label="Notes" column="notes" sort={mmSort} onToggle={toggleMmSort} className="min-w-[180px]" />
                          <MmSortTh label="Last Visit" column="lastVisit" sort={mmSort} onToggle={toggleMmSort} className="min-w-[110px]" />
                          <th
                            scope="col"
                            className="sticky right-0 z-[1] min-w-[88px] border-b border-l border-slate-300 bg-slate-100 px-2.5 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-600"
                          >
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedManagementRows.length === 0 ? (
                          <tr>
                            <td colSpan={18} className="bg-white px-4 py-10 text-center text-slate-500">
                              No members match this view.
                            </td>
                          </tr>
                        ) : (
                          sortedManagementRows.map((member, idx) => {
                            const outward = getOutwardStatus(member);
                            const lockLabel = member.lockInLabel?.trim() || "—";
                            const lockInLeft = extractLockInLeftMonths(member.lockInLabel);
                            const lockInTemplate = member.tierLockInTemplateMonths ?? null;
                            const lockInPaid =
                              member.tierLockInPaidMonths ?? lockInPaidMonths(lockInLeft, lockInTemplate);
                            const tierKey = member.tier;
                            const rowBg = idx % 2 === 0 ? "bg-white" : "bg-slate-50";
                            const lockerNo = memberLockerNumberLabel(member);
                            return (
                              <tr
                                key={member.id}
                                className={`border-b border-slate-200 ${rowBg} hover:bg-sky-50/80`}
                              >
                                <td className="px-2.5 py-2 align-middle text-slate-900">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-semibold">
                                      {member.firstName} {member.lastName}
                                    </span>
                                    <PenaltyNameTag member={member} />
                                  </div>
                                  {activeTier === OVERALL_TAB || activeTier === NOT_ACTIVE_TAB ? (
                                    <p className="mt-0.5 text-[10px] font-medium text-slate-500">Tier tab: {tierDisplayLabel(tierKey)}</p>
                                  ) : null}
                                </td>
                                <td className="px-2.5 py-2 align-middle tabular-nums text-slate-700">{member.contactNo?.trim() || "—"}</td>
                                <td
                                  className="max-w-[120px] px-2.5 py-2 align-middle text-slate-700"
                                  title={lockerNo || undefined}
                                >
                                  {lockerNo ? (
                                    <span className="block truncate font-medium tabular-nums text-slate-900">{lockerNo}</span>
                                  ) : (
                                    <span className="text-slate-500">—</span>
                                  )}
                                </td>
                                <td className="px-2.5 py-2 align-middle">
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusPillClass(outward)}`}>
                                    {outward}
                                  </span>
                                </td>
                                <td className="px-2.5 py-2 align-middle">
                                  {lockLabel === "—" ? (
                                    <span className="text-slate-500">—</span>
                                  ) : (
                                    <span
                                      className={`inline-flex max-w-[11rem] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${lockInPillClass(member.lockInLabel)}`}
                                      title={
                                        lockInPaid !== null && lockInTemplate != null
                                          ? `${lockLabel} (paid ${lockInPaid}/${lockInTemplate} mo)`
                                          : lockLabel
                                      }
                                    >
                                      {lockInPaid !== null && lockInTemplate != null
                                        ? `${lockInPaid}/${lockInTemplate} mo`
                                        : lockLabel}
                                    </span>
                                  )}
                                </td>
                                <td className="px-2.5 py-2 align-middle">
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${tierPillClass(tierKey)}`}
                                    title={tierDisplayLabel(tierKey)}
                                  >
                                    {tierDisplayLabel(tierKey)}
                                  </span>
                                </td>
                                <td className="px-2.5 py-2 align-middle tabular-nums">
                                  <span
                                    className={
                                      member.daysLeft !== null && member.daysLeft < 0
                                        ? "font-semibold text-red-600"
                                        : member.daysLeft !== null && member.daysLeft <= 7
                                          ? "font-semibold text-amber-700"
                                          : "text-emerald-700"
                                    }
                                  >
                                    {member.daysLeft ?? "—"}
                                  </span>
                                </td>
                                <td className="px-2.5 py-2 align-middle text-slate-700">{formatLongDate(member.membershipStart)}</td>
                                <td
                                  className="px-2.5 py-2 align-middle text-slate-700"
                                  title={member.monthlyExpiryDate ? "Monthly / access window (matches Days left)" : undefined}
                                >
                                  {formatLongDate(rosterAccessExpiryIso(member))}
                                </td>
                                <td className="px-2.5 py-2 align-middle text-slate-700">{formatLongDate(member.createdAt)}</td>
                                <td className="px-2.5 py-2 align-middle text-slate-700">{formatLongDate(member.fullMembershipExpiry)}</td>
                                <td className="px-2.5 py-2 align-middle text-slate-700">{formatLongDate(member.gracePeriodEnd)}</td>
                                <td className="px-2.5 py-2 align-middle text-slate-700">{member.monthlyFeeLabel?.trim() || "—"}</td>
                                <td className="px-2.5 py-2 align-middle text-slate-700">{member.membershipFeeLabel?.trim() || "—"}</td>
                                <td className="px-2.5 py-2 align-middle">
                                  {member.freezeStatus?.trim() ? (
                                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-900 ring-1 ring-sky-200">
                                      {member.freezeStatus}
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">None</span>
                                  )}
                                </td>
                                <td className="max-w-[220px] px-2.5 py-2 align-middle text-slate-600">
                                  <span className="line-clamp-2" title={member.membershipNotes ?? ""}>
                                    {member.membershipNotes?.trim() || "—"}
                                  </span>
                                </td>
                                <td className="px-2.5 py-2 align-middle text-slate-600">
                                  {member.lastAttendanceAt ? format(new Date(member.lastAttendanceAt), "MMM d, yyyy") : "—"}
                                </td>
                                <td
                                  className={`sticky right-0 z-[1] border-l border-slate-300 px-2.5 py-2 align-middle text-right ${rowBg}`}
                                >
                                  <Button
                                    size="sm"
                                    className="h-7 bg-[#1e3a5f] px-2.5 text-[11px] text-white hover:bg-[#1e3a5f]/90"
                                    onClick={() => setEditing(memberForEdit(member))}
                                  >
                                    Edit
                                  </Button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {editing
        ? createPortal(
            <div
              className="fixed inset-0 z-[102] overflow-y-auto bg-slate-900/60 backdrop-blur-[2px]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="members-edit-modal-title"
            >
              <div
                className="flex min-h-full items-center justify-center p-3 py-10 sm:p-4 sm:py-12"
                onClick={() => {
                  if (!loading) setEditing(null);
                }}
              >
                <Card
                  className="max-h-[min(92vh,920px)] w-full max-w-3xl space-y-4 overflow-y-auto border border-slate-300 bg-white p-4 sm:p-5 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 id="members-edit-modal-title" className="text-lg font-semibold text-slate-900">
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
                  value={editModalTierSelectValue(editing)}
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
                  value={toDateInputValue(editing.membershipStart)}
                  onChange={(e) => setEditing({ ...editing, membershipStart: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Membership Expiry</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={toDateInputValue(editing.membershipExpiry)}
                  onChange={(e) => setEditing({ ...editing, membershipExpiry: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Grace Period End</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={toDateInputValue(editing.gracePeriodEnd)}
                  onChange={(e) => setEditing({ ...editing, gracePeriodEnd: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Freeze Status</label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                  value={freezeStatusSelectFormValue(editing.freezeStatus)}
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
                  value={toDateInputValue(editing.freezeStartedAt)}
                  onChange={(e) => setEditing({ ...editing, freezeStartedAt: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Freeze End</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={toDateInputValue(editing.freezeEndsAt)}
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

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/90 p-3">
              <p className="text-xs font-semibold text-slate-800">Active add-ons</p>
              <p className="text-[11px] text-slate-600">
                Edit renewals and notes per add-on. When the name is <span className="font-medium text-slate-700">Locker</span>, use the locker number field — it is stored in notes as{" "}
                <span className="font-mono text-[10px] text-slate-700">Locker #: …</span> (same as payments).
              </p>
              {(editing.addOnSubscriptions ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">No add-ons on file for this member. Register one under Add-ons or via Payments (custom add-on).</p>
              ) : (
                <div className="space-y-3">
                  {(editing.addOnSubscriptions ?? []).map((sub) => {
                    const lockerAddon = isLockerAddonName(sub.addonName);
                    const otherNotes = lockerAddon ? stripLockerNoteLines(sub.notes) : (sub.notes ?? "");
                    const lockerNum = lockerAddon ? parseLockerNumberFromNotes(sub.notes) : "";
                    return (
                      <div key={sub.id} className="space-y-2 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-600">Add-on name</label>
                            <Input
                              className="border-slate-300 bg-white text-sm text-slate-800"
                              value={sub.addonName}
                              onChange={(e) => {
                                const name = e.target.value;
                                setEditing((prev) => {
                                  if (!prev) return prev;
                                  const wasLocker = isLockerAddonName(
                                    (prev.addOnSubscriptions ?? []).find((s) => s.id === sub.id)?.addonName,
                                  );
                                  const nowLocker = isLockerAddonName(name);
                                  return {
                                    ...prev,
                                    addOnSubscriptions: (prev.addOnSubscriptions ?? []).map((s) => {
                                      if (s.id !== sub.id) return s;
                                      let notes = s.notes ?? null;
                                      if (wasLocker && !nowLocker) {
                                        const stripped = stripLockerNoteLines(notes);
                                        notes = stripped ? stripped : null;
                                      }
                                      return { ...s, addonName: name, notes };
                                    }),
                                  };
                                });
                              }}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-600">Status</label>
                            <select
                              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                              value={(sub.status ?? "ACTIVE").toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE"}
                              onChange={(e) =>
                                setEditing((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        addOnSubscriptions: (prev.addOnSubscriptions ?? []).map((s) =>
                                          s.id === sub.id ? { ...s, status: e.target.value } : s,
                                        ),
                                      }
                                    : prev,
                                )
                              }
                            >
                              <option value="ACTIVE">ACTIVE</option>
                              <option value="INACTIVE">INACTIVE</option>
                            </select>
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <label className="text-xs font-medium text-slate-600">Next due</label>
                            <Input
                              className="border-slate-300 bg-white text-sm text-slate-800"
                              type="date"
                              value={toDateInputValue(sub.dueDate)}
                              onChange={(e) =>
                                setEditing((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        addOnSubscriptions: (prev.addOnSubscriptions ?? []).map((s) =>
                                          s.id === sub.id
                                            ? { ...s, dueDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : null }
                                            : s,
                                        ),
                                      }
                                    : prev,
                                )
                              }
                            />
                          </div>
                          {lockerAddon ? (
                            <div className="space-y-1.5 sm:col-span-2">
                              <label className="text-xs font-medium text-slate-600">Locker number</label>
                              <Input
                                className="border-slate-300 bg-white text-sm text-slate-800"
                                value={lockerNum}
                                onChange={(e) =>
                                  setEditing((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          addOnSubscriptions: (prev.addOnSubscriptions ?? []).map((s) =>
                                            s.id === sub.id
                                              ? {
                                                  ...s,
                                                  notes: mergeLockerIntoNotes(stripLockerNoteLines(s.notes), e.target.value),
                                                }
                                              : s,
                                          ),
                                        }
                                      : prev,
                                  )
                                }
                                placeholder="e.g. A-12"
                              />
                            </div>
                          ) : null}
                          <div className="space-y-1.5 sm:col-span-2">
                            <label className="text-xs font-medium text-slate-600">
                              Notes{lockerAddon ? " (other than locker #)" : ""}
                            </label>
                            <textarea
                              className="min-h-[72px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                              value={otherNotes}
                              onChange={(e) =>
                                setEditing((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        addOnSubscriptions: (prev.addOnSubscriptions ?? []).map((s) => {
                                          if (s.id !== sub.id) return s;
                                          if (lockerAddon) {
                                            return {
                                              ...s,
                                              notes: mergeLockerIntoNotes(e.target.value, parseLockerNumberFromNotes(s.notes)),
                                            };
                                          }
                                          return { ...s, notes: e.target.value.trim() ? e.target.value : null };
                                        }),
                                      }
                                    : prev,
                                )
                              }
                              placeholder={lockerAddon ? "Optional details besides locker assignment…" : "Optional notes…"}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end border-t border-slate-100 pt-2">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
                            disabled={loading || savingAddonId === sub.id || !sub.addonName.trim()}
                            onClick={async () => {
                              setSavingAddonId(sub.id);
                              try {
                                const res = await fetch(`/api/addons/${sub.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    addonName: sub.addonName.trim(),
                                    status: sub.status ?? "ACTIVE",
                                    dueDate: sub.dueDate ? toDateInputValue(sub.dueDate) : null,
                                    notes: sub.notes?.trim() ? sub.notes : null,
                                  }),
                                });
                                const json = (await res.json()) as {
                                  success?: boolean;
                                  error?: string;
                                  details?: string;
                                  data?: {
                                    id: string;
                                    addonName: string;
                                    dueDate: string | Date | null;
                                    status: string;
                                    notes: string | null;
                                  };
                                };
                                if (!json.success) {
                                  setNotice({
                                    type: "error",
                                    message: json.details || json.error || "Failed to save add-on.",
                                  });
                                  return;
                                }
                                if (json.data) {
                                  const d = json.data;
                                  setEditing((prev) => {
                                    if (!prev) return prev;
                                    return {
                                      ...prev,
                                      addOnSubscriptions: (prev.addOnSubscriptions ?? []).map((s) =>
                                        s.id === d.id
                                          ? {
                                              ...s,
                                              addonName: d.addonName,
                                              dueDate: d.dueDate != null ? String(d.dueDate) : null,
                                              status: d.status,
                                              notes: d.notes ?? null,
                                            }
                                          : s,
                                      ),
                                    };
                                  });
                                }
                                await load();
                                setNotice({ type: "success", message: "Add-on saved." });
                              } finally {
                                setSavingAddonId(null);
                              }
                            }}
                          >
                            {savingAddonId === sub.id ? "Saving…" : "Save add-on"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
              <p className="text-xs font-semibold text-rose-900">Membership penalty</p>
              <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-700">
                <p>
                  <span className="font-medium text-slate-600">Membership expires:</span>{" "}
                  {formatDateSafe(editing.membershipExpiry, "MMM d, yyyy", "N/A")}
                </p>
                <p>
                  <span className="font-medium text-slate-600">Monthly due:</span>{" "}
                  {formatDateSafe(editing.monthlyExpiryDate, "MMM d, yyyy", "N/A")}
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
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

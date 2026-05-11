"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, addYears, differenceInCalendarDays, format } from "date-fns";
import { extendMonthlyExpiry, computeDaysLeft, resolveMembershipStatus } from "@/lib/payment";
import { lockInLabelFromRemaining } from "@/lib/lock-in-cycle";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nowInPH } from "@/lib/time";
import {
  CalendarDays,
  CreditCard,
  FilePenLine,
  Loader2,
  Lock,
  Pencil,
  PlusCircle,
  Trash2,
  X,
} from "lucide-react";

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
  /** Earliest of membership start and current-cycle lock-in credits (POS + manual after anchor). */
  tierLockInRosterStartAt?: string | null;
  remainingMonths?: number | null;
  lockInCycleAnchorAt?: string | null;
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

type LockInDetailData = {
  tier: string;
  templateMonths: number;
  anchorAt: string | null;
  paymentsInCycle: Array<{
    id: string;
    paidAt: string;
    grossAmount: unknown;
    amount: unknown;
    paidMonths?: number;
    service: { monthlyRate: unknown; tier: string };
  }>;
  manualEntries: Array<{
    id: string;
    paidMonths: number;
    paidAt: string;
    notes: string | null;
    createdBy: string | null;
  }>;
  paymentMonthsTotal: number;
  manualMonthsTotal: number;
  paidMonthsTotal: number;
  paidMonthsCapped: number;
  remainingMonths: number;
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

/** Calendar-day addition in UTC so freeze dates stay aligned with `T00:00:00.000Z` inputs. */
function addCalendarDaysUtc(isoStart: string, days: number): string {
  const d = new Date(isoStart);
  if (Number.isNaN(d.getTime())) return isoStart;
  const n = Math.max(0, Math.trunc(days));
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n);
  return new Date(t).toISOString();
}

/** Whole calendar days between freeze start and end (UTC dates), matches server rounding. */
function freezeDaysBetweenUtc(startIso: string, endIso: string): number {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const sd = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  const ed = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
  return Math.max(0, Math.ceil((ed - sd) / (1000 * 60 * 60 * 24)));
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

/** Full lock-in horizon while set; after lock-in completes the API clears it — then show rolling access so the column matches POS refresh. */
function membershipContractEndIso(member: ManagedMember): string | null {
  const full = member.fullMembershipExpiry?.trim();
  if (full) return full;
  return rosterAccessExpiryIso(member);
}

function membershipJoiningStartIso(member: ManagedMember): string | null {
  const joined = member.membershipJoinedStart?.trim();
  if (joined) return joined;
  return member.createdAt ?? null;
}

function membershipJoiningEndIso(member: ManagedMember): string | null {
  const joinedEnd = member.membershipJoinedExpiry?.trim();
  if (joinedEnd) return joinedEnd;
  return membershipContractEndIso(member);
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

/** Matches server `isFreezeActive` in users/[id]/route — member currently on freeze. */
function isFreezeActiveMember(member: ManagedMember, now: Date): boolean {
  if ((member.freezeStatus ?? "").trim().toUpperCase() !== "ACTIVE") return false;
  if (!member.freezeEndsAt) return true;
  return new Date(member.freezeEndsAt).getTime() >= now.getTime();
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
    case "start": {
      const startKey = (m: ManagedMember) => {
        const iso = m.tierLockInRosterStartAt ?? m.membershipStart;
        if (!iso) return 0;
        const t = new Date(iso).getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      cmp = startKey(a) - startKey(b);
      break;
    }
    case "expiry": {
      const ae = rosterAccessExpiryIso(a);
      const be = rosterAccessExpiryIso(b);
      cmp = (ae ? new Date(ae).getTime() : 0) - (be ? new Date(be).getTime() : 0);
      break;
    }
    case "join":
      cmp =
        (membershipJoiningStartIso(a) ? new Date(membershipJoiningStartIso(a) as string).getTime() : 0) -
        (membershipJoiningStartIso(b) ? new Date(membershipJoiningStartIso(b) as string).getTime() : 0);
      break;
    case "membershipEnds":
      cmp =
        (membershipJoiningEndIso(a) ? new Date(membershipJoiningEndIso(a) as string).getTime() : 0) -
        (membershipJoiningEndIso(b) ? new Date(membershipJoiningEndIso(b) as string).getTime() : 0);
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
  title: thTitle,
}: {
  label: string;
  column: MmSortKey;
  sort: { key: MmSortKey; dir: "asc" | "desc" };
  onToggle: (k: MmSortKey) => void;
  align?: "left" | "right";
  className?: string;
  title?: string;
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
    <th
      scope="col"
      title={thTitle}
      className={`border-b border-slate-300 bg-slate-100 px-2.5 py-2 ${ta} ${className}`}
      aria-sort={ariaSort}
    >
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
  let freezeDaysTotal = member.freezeDaysTotal;
  if (member.freezeStartedAt && member.freezeEndsAt) {
    freezeDaysTotal = freezeDaysBetweenUtc(member.freezeStartedAt, member.freezeEndsAt);
  }
  return {
    ...member,
    membershipTier: explicit ?? fromInference,
    freezeDaysTotal,
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
  const joinedExpiryTouched = useRef(false);
  const freezeFieldsDirtyRef = useRef(false);
  const [unfreezingId, setUnfreezingId] = useState<string | null>(null);
  const [lockInModal, setLockInModal] = useState<ManagedMember | null>(null);
  const [lockInDetail, setLockInDetail] = useState<LockInDetailData | null>(null);
  const [lockInLoading, setLockInLoading] = useState(false);
  const [lockInForm, setLockInForm] = useState({ paidMonths: "1", paidAt: "", notes: "" });
  const [lockInSaving, setLockInSaving] = useState(false);
  const [lockInEditingManualId, setLockInEditingManualId] = useState<string | null>(null);
  const [lockInManualDraft, setLockInManualDraft] = useState({ paidMonths: "1", paidAt: "", notes: "" });
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

  useEffect(() => {
    if (!lockInModal) {
      setLockInDetail(null);
      setLockInEditingManualId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLockInLoading(true);
      try {
        const res = await fetch(`/api/users/${lockInModal.id}/lock-in-entries`, { cache: "no-store" });
        const json = (await res.json()) as { success?: boolean; data?: LockInDetailData };
        if (!cancelled && json.success && json.data) setLockInDetail(json.data);
        else if (!cancelled) setLockInDetail(null);
      } finally {
        if (!cancelled) setLockInLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lockInModal]);

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

  const frozenCount = useMemo(
    () => rows.filter((r) => isFreezeActiveMember(r, nowInPH())).length,
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
    items.splice(
      insertAt,
      0,
      { key: PENALTY_TAB, label: "Penalty", count: penaltyCount },
      { key: NOT_ACTIVE_TAB, label: "Not Active", count: notActiveCount },
      { key: FROZEN_TAB, label: "Freeze members", count: frozenCount },
    );
    return [{ key: OVERALL_TAB, label: "Overall", count: rows.length }, ...items];
  }, [tierList, grouped, penaltyCount, notActiveCount, frozenCount, rows.length]);

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
    if (activeTier === FROZEN_TAB) return rows.filter((m) => isFreezeActiveMember(m, nowInPH()) && nameMatch);
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
    if (activeTier === FROZEN_TAB) return "Freeze members (all tiers)";
    return tierDisplayLabel(activeTier);
  }, [activeTier]);

  const headerAccent = useMemo(() => {
    if (activeTier === PENALTY_TAB) return "from-rose-50 to-red-50 border-rose-200";
    if (activeTier === FROZEN_TAB) return "from-cyan-50 to-sky-50 border-cyan-200";
    return TIER_ACCENT[activeTier] ?? TIER_ACCENT.Unassigned;
  }, [activeTier]);

  useEffect(() => {
    if (activeTier === PENALTY_TAB || activeTier === NOT_ACTIVE_TAB || activeTier === FROZEN_TAB || activeTier === OVERALL_TAB)
      return;
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
                          onClick={() => {
                            joinedExpiryTouched.current = false;
                            freezeFieldsDirtyRef.current = false;
                            setEditing(memberForEdit(member));
                          }}
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
          <span className="font-semibold text-slate-800">Not Active</span> lists expired members with no visit or last visit 30+ days ago.{" "}
          <span className="font-semibold text-cyan-800">Freeze members</span> lists everyone with an active membership freeze.
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
              ) : activeTier === FROZEN_TAB ? (
                <span className="rounded-full bg-cyan-700 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                  Freeze
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-700">
              <span className="rounded bg-white/80 px-2 py-0.5">Total: {filteredManagementRows.length}</span>
              {activeTier === PENALTY_TAB || activeTier === NOT_ACTIVE_TAB || activeTier === FROZEN_TAB ? null : (
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
          ) : activeTier === FROZEN_TAB ? (
            <p className="mt-2 text-xs text-slate-600">
              Members with <span className="font-medium">Freeze status = Active</span> and a freeze end date still in the future (or no end date). Use{" "}
              <span className="font-medium">Unfreeze</span> to mark the freeze completed in one click, or Edit for full date changes.
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
                          <MmSortTh
                            label="Start Date"
                            column="start"
                            sort={mmSort}
                            onToggle={toggleMmSort}
                            className="min-w-[120px]"
                            title="Earliest of membership start and this cycle’s lock-in credits (POS + manual after cycle anchor), so backdated months show here."
                          />
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
                                  {activeTier === OVERALL_TAB || activeTier === NOT_ACTIVE_TAB || activeTier === FROZEN_TAB ? (
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
                                    <button
                                      type="button"
                                      className={`inline-flex max-w-[11rem] cursor-pointer truncate rounded-full border-0 px-2 py-0.5 text-left text-[10px] font-semibold transition hover:opacity-90 ${lockInPillClass(member.lockInLabel)}`}
                                      title={
                                        (lockInPaid !== null && lockInTemplate != null
                                          ? `${lockLabel} (paid ${lockInPaid}/${lockInTemplate} mo)`
                                          : lockLabel) + " — click for history"
                                      }
                                      onClick={() => setLockInModal(member)}
                                    >
                                      {lockInPaid !== null && lockInTemplate != null
                                        ? `${lockInPaid}/${lockInTemplate} mo`
                                        : lockLabel}
                                    </button>
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
                                <td
                                  className="px-2.5 py-2 align-middle text-slate-700"
                                  title={(() => {
                                    const disp = member.tierLockInRosterStartAt ?? member.membershipStart;
                                    const raw = member.membershipStart;
                                    if (!disp || !raw) return undefined;
                                    const dDisp = new Date(disp).getTime();
                                    const dRaw = new Date(raw).getTime();
                                    if (Number.isNaN(dDisp) || Number.isNaN(dRaw) || dDisp === dRaw) return undefined;
                                    return `Includes backdated lock-in or POS credits in this cycle. Membership start in edit: ${formatLongDate(raw)}`;
                                  })()}
                                >
                                  {formatLongDate(member.tierLockInRosterStartAt ?? member.membershipStart)}
                                </td>
                                <td
                                  className="px-2.5 py-2 align-middle text-slate-700"
                                  title={member.monthlyExpiryDate ? "Monthly / access window (matches Days left)" : undefined}
                                >
                                  {formatLongDate(rosterAccessExpiryIso(member))}
                                </td>
                                <td className="px-2.5 py-2 align-middle text-slate-700">
                                  {formatLongDate(membershipJoiningStartIso(member))}
                                </td>
                                <td
                                  className="px-2.5 py-2 align-middle text-slate-700"
                                  title={
                                    member.membershipJoinedExpiry?.trim()
                                      ? "Membership joining expiry (annual fee period)"
                                      : "Fallback: contract/access end"
                                  }
                                >
                                  {formatLongDate(membershipJoiningEndIso(member))}
                                </td>
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
                                  <div className="flex items-center justify-end gap-1.5">
                                    {activeTier === FROZEN_TAB && isFreezeActiveMember(member, nowInPH()) ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 gap-1 border-cyan-600 px-2.5 text-[11px] text-cyan-800 hover:bg-cyan-50"
                                        disabled={unfreezingId !== null}
                                        onClick={async () => {
                                          setUnfreezingId(member.id);
                                          try {
                                            const res = await fetch(`/api/users/${member.id}`, {
                                              method: "PATCH",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ freezeStatus: "COMPLETED" }),
                                            });
                                            const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                                            if (!json.success) {
                                              setNotice({
                                                type: "error",
                                                message: json.details || json.error || "Failed to unfreeze member.",
                                              });
                                              return;
                                            }
                                            await load();
                                            setNotice({ type: "success", message: "Member unfrozen (status completed)." });
                                          } finally {
                                            setUnfreezingId(null);
                                          }
                                        }}
                                      >
                                        {unfreezingId === member.id ? (
                                          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                                        ) : null}
                                        Unfreeze
                                      </Button>
                                    ) : null}
                                    <Button
                                      size="sm"
                                      className="h-7 bg-[#1e3a5f] px-2.5 text-[11px] text-white hover:bg-[#1e3a5f]/90"
                                      onClick={() => {
                                        joinedExpiryTouched.current = false;
                                        freezeFieldsDirtyRef.current = false;
                                        setEditing(memberForEdit(member));
                                      }}
                                    >
                                      Edit
                                    </Button>
                                  </div>
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
                <label className="text-xs font-medium text-slate-600">Lock-in months remaining</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800 tabular-nums"
                  type="number"
                  min={0}
                  placeholder="e.g. 4"
                  value={editing.remainingMonths ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw === "" ? null : Math.max(0, Math.trunc(Number(raw)));
                    setEditing({
                      ...editing,
                      remainingMonths: n,
                      lockInLabel: n != null && Number.isFinite(n) ? lockInLabelFromRemaining(n) : editing.lockInLabel,
                    });
                  }}
                />
                <p className="text-[10px] text-slate-500">Numeric override for legacy records. Label updates to match; POS payments still drive the ledger.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Monthly access start</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={toDateInputValue(editing.membershipStart)}
                  onChange={(e) => setEditing({ ...editing, membershipStart: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Monthly access expiry</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={toDateInputValue(rosterAccessExpiryIso(editing))}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!raw) {
                      setEditing({ ...editing, monthlyExpiryDate: null });
                      return;
                    }
                    const v = `${raw}T00:00:00.000Z`;
                    setEditing({ ...editing, monthlyExpiryDate: v, membershipExpiry: v });
                  }}
                />
                <p className="text-[10px] text-slate-500">Same date the roster uses for rolling access (monthly due).</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Membership joining start (annual fee period)</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={toDateInputValue(editing.membershipJoinedStart)}
                  onChange={(e) => {
                    const v = e.target.value ? `${e.target.value}T00:00:00.000Z` : null;
                    setEditing((prev) => {
                      if (!prev) return prev;
                      let joinedExpiry = prev.membershipJoinedExpiry;
                      if (!joinedExpiryTouched.current && v) {
                        joinedExpiry = addYears(new Date(v), 1).toISOString();
                      }
                      return { ...prev, membershipJoinedStart: v, membershipJoinedExpiry: joinedExpiry };
                    });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Membership joining expiry (1 year; editable)</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={toDateInputValue(editing.membershipJoinedExpiry)}
                  onChange={(e) => {
                    joinedExpiryTouched.current = true;
                    setEditing({
                      ...editing,
                      membershipJoinedExpiry: e.target.value ? `${e.target.value}T00:00:00.000Z` : null,
                    });
                  }}
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
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-slate-600">Membership freeze</label>
                <p className="text-[10px] leading-relaxed text-slate-600">
                  Set <span className="font-medium">start</span> and either <span className="font-medium">freeze days</span> or{" "}
                  <span className="font-medium">end</span> — they stay in sync. Saving sets status to <span className="font-medium">Active</span> automatically. Clear all
                  three to remove a freeze. Use <span className="font-medium">Unfreeze</span> on the Freeze members tab to mark completed without opening edit.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Freeze start</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={toDateInputValue(editing.freezeStartedAt)}
                  onChange={(e) => {
                    freezeFieldsDirtyRef.current = true;
                    const startIso = e.target.value ? `${e.target.value}T00:00:00.000Z` : null;
                    if (!startIso) {
                      setEditing({ ...editing, freezeStartedAt: null, freezeEndsAt: null, freezeDaysTotal: null });
                      return;
                    }
                    const days = editing.freezeDaysTotal;
                    let nextEnd = editing.freezeEndsAt;
                    let nextDays = days;
                    if (days != null && days > 0) {
                      nextEnd = addCalendarDaysUtc(startIso, days);
                      nextDays = days;
                    } else if (nextEnd) {
                      if (nextEnd < startIso) {
                        nextEnd = null;
                        nextDays = null;
                      } else {
                        nextDays = freezeDaysBetweenUtc(startIso, nextEnd);
                      }
                    }
                    setEditing({
                      ...editing,
                      freezeStartedAt: startIso,
                      freezeEndsAt: nextEnd ?? null,
                      freezeDaysTotal: nextDays ?? null,
                    });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Freeze days</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="number"
                  min={0}
                  value={editing.freezeDaysTotal ?? ""}
                  onChange={(e) => {
                    freezeFieldsDirtyRef.current = true;
                    const raw = e.target.value;
                    if (raw === "") {
                      const s = editing.freezeStartedAt;
                      const en = editing.freezeEndsAt;
                      const inferred =
                        s && en && en >= s ? freezeDaysBetweenUtc(s, en) : null;
                      setEditing({ ...editing, freezeDaysTotal: inferred });
                      return;
                    }
                    const n = Math.max(0, Math.trunc(Number(raw)));
                    const startIso = editing.freezeStartedAt;
                    if (startIso && n > 0) {
                      const endIso = addCalendarDaysUtc(startIso, n);
                      setEditing({ ...editing, freezeDaysTotal: n, freezeEndsAt: endIso });
                    } else {
                      setEditing({ ...editing, freezeDaysTotal: n });
                    }
                  }}
                />
                <p className="text-[10px] text-slate-500">Updates end date from start when both are set.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Freeze end</label>
                <Input
                  className="border-slate-300 bg-white text-slate-800"
                  type="date"
                  value={toDateInputValue(editing.freezeEndsAt)}
                  onChange={(e) => {
                    freezeFieldsDirtyRef.current = true;
                    const endIso = e.target.value ? `${e.target.value}T00:00:00.000Z` : null;
                    if (!endIso) {
                      setEditing({ ...editing, freezeEndsAt: null });
                      return;
                    }
                    const startIso = editing.freezeStartedAt;
                    const nextDays =
                      startIso && endIso >= startIso ? freezeDaysBetweenUtc(startIso, endIso) : editing.freezeDaysTotal;
                    setEditing({
                      ...editing,
                      freezeEndsAt: endIso,
                      freezeDaysTotal: nextDays ?? null,
                    });
                  }}
                />
                <p className="text-[10px] text-slate-500">Editable; days count updates from start.</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <div
                  className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-[11px] text-slate-700"
                  role="status"
                  aria-live="polite"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Freeze status (read-only)</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {(editing.freezeStatus ?? "").trim()
                      ? editing.freezeStatus
                      : isFreezeActiveMember(editing, nowInPH())
                        ? "Active"
                        : "None"}
                    {isFreezeActiveMember(editing, nowInPH()) && editing.freezeEndsAt
                      ? ` · through ${formatDateSafe(editing.freezeEndsAt, "MMM d, yyyy", "")}`
                      : null}
                  </p>
                  <p className="mt-1 text-[10px] leading-snug text-slate-600">
                    Not editable here — it follows your dates and save rules, or use <span className="font-medium">Unfreeze</span> on the Freeze members tab.
                  </p>
                </div>
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
                  setLoading(true);
                  const cycleDays = 30;
                  const curMonthly = editing.monthlyExpiryDate ? new Date(editing.monthlyExpiryDate) : null;
                  const nextMonthly = extendMonthlyExpiry(curMonthly, cycleDays);
                  const daysLeft = computeDaysLeft(nextMonthly);
                  const membershipStatus = resolveMembershipStatus(daysLeft);
                  const graceEnd = addDays(nextMonthly, 7);
                  const res = await fetch(`/api/users/${editing.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      monthlyExpiryDate: nextMonthly.toISOString(),
                      membershipExpiry: nextMonthly.toISOString(),
                      gracePeriodEnd: graceEnd.toISOString(),
                      daysLeft,
                      membershipStatus,
                    }),
                  });
                  const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                  setLoading(false);
                  if (!json.success) {
                    setNotice({ type: "error", message: json.details || json.error || "Failed to renew membership." });
                    return;
                  }
                  setEditing(null);
                  await load();
                  setNotice({ type: "success", message: "Monthly access extended by 30 days (aligned with POS)." });
                }}
              >
                Renew +30 days
              </Button>
              <Button
                disabled={loading}
                className="bg-[#1e3a5f] text-white shadow-sm hover:bg-[#1e3a5f]/90"
                onClick={async () => {
                  setLoading(true);
                  const accessIso =
                    editing.monthlyExpiryDate?.trim() || editing.membershipExpiry?.trim() || null;
                  const accessDate = accessIso ? new Date(accessIso) : null;
                  const daysLeftPatched = computeDaysLeft(accessDate);
                  const membershipStatusPatched = resolveMembershipStatus(daysLeftPatched);

                  const fStart = editing.freezeStartedAt?.trim() || null;
                  const fEndRaw = editing.freezeEndsAt?.trim() || null;
                  const fDays = editing.freezeDaysTotal;
                  let fEnd = fEndRaw;
                  if (fStart && !fEnd && fDays != null && fDays > 0) {
                    fEnd = addCalendarDaysUtc(fStart, fDays);
                  }
                  const fDaysTotal =
                    fStart && fEnd ? freezeDaysBetweenUtc(fStart, fEnd) : fDays;
                  const freezeAllClear =
                    !fStart && !fEnd && (fDays == null || fDays === 0);

                  const openEndedFreezeOk =
                    Boolean(fStart) &&
                    !fEnd &&
                    (editing.freezeStatus ?? "").trim().toUpperCase() === "ACTIVE" &&
                    !(editing.freezeEndsAt ?? "").trim() &&
                    !freezeFieldsDirtyRef.current;

                  if (!freezeAllClear) {
                    if (fStart && !fEnd && !openEndedFreezeOk) {
                      setLoading(false);
                      setNotice({
                        type: "error",
                        message: "Add freeze days or an end date (or clear freeze start).",
                      });
                      return;
                    }
                    if (!fStart && fEnd) {
                      setLoading(false);
                      setNotice({ type: "error", message: "Freeze start is required when an end date is set." });
                      return;
                    }
                    if (fStart && fEnd && fEnd < fStart) {
                      setLoading(false);
                      setNotice({ type: "error", message: "Freeze end must be on or after freeze start." });
                      return;
                    }
                  }

                  let freezeStatusPayload: string | null = editing.freezeStatus ?? null;
                  if (freezeAllClear) {
                    freezeStatusPayload = null;
                  } else if (fStart && (fEnd || openEndedFreezeOk)) {
                    const shouldAutoActive =
                      freezeFieldsDirtyRef.current ||
                      isFreezeActiveMember(editing, nowInPH()) ||
                      (editing.freezeStatus ?? "").trim().toUpperCase() !== "COMPLETED";
                    freezeStatusPayload = shouldAutoActive ? "ACTIVE" : freezeStatusPayload;
                  }

                  const res = await fetch(`/api/users/${editing.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      membershipTier: editing.membershipTier?.trim() || null,
                      lockInLabel: editing.lockInLabel,
                      remainingMonths: editing.remainingMonths,
                      membershipStart: editing.membershipStart,
                      membershipExpiry: editing.membershipExpiry,
                      monthlyExpiryDate: editing.monthlyExpiryDate,
                      daysLeft: daysLeftPatched,
                      membershipStatus: membershipStatusPatched,
                      membershipJoinedStart: editing.membershipJoinedStart,
                      membershipJoinedExpiry: editing.membershipJoinedExpiry,
                      gracePeriodEnd: editing.gracePeriodEnd,
                      freezeStatus: freezeStatusPayload,
                      freezeStartedAt: freezeAllClear ? null : fStart,
                      freezeEndsAt: freezeAllClear ? null : fEnd,
                      freezeDaysTotal: freezeAllClear ? null : fDaysTotal ?? null,
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
                  freezeFieldsDirtyRef.current = false;
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

      {lockInModal
        ? createPortal(
            <div
              className="fixed inset-0 z-[103] overflow-y-auto bg-slate-950/70"
              role="dialog"
              aria-modal="true"
              aria-labelledby="lock-in-modal-title"
            >
              <div
                className="flex min-h-full items-center justify-center p-3 py-8 sm:p-6 sm:py-10"
                onClick={() => {
                  if (!lockInSaving) setLockInModal(null);
                }}
              >
                <Card
                  className="max-h-[min(92vh,760px)] w-full max-w-lg overflow-hidden border border-slate-200 bg-white shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="bg-gradient-to-br from-[#1e3a5f] via-[#254a73] to-[#1a3254] px-5 pb-5 pt-5 text-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/95 ring-1 ring-white/20">
                            <Lock className="size-3 shrink-0 opacity-90" aria-hidden />
                            Lock-in
                          </span>
                          {lockInDetail ? (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${tierPillClass(lockInDetail.tier)}`}
                            >
                              {tierDisplayLabel(lockInDetail.tier)}
                            </span>
                          ) : null}
                        </div>
                        <h3 id="lock-in-modal-title" className="truncate text-lg font-semibold tracking-tight">
                          {lockInModal.firstName} {lockInModal.lastName}
                        </h3>
                        <p className="mt-0.5 text-xs text-white/75">
                          {lockInLoading || !lockInDetail
                            ? "Loading cycle details…"
                            : `${lockInDetail.templateMonths}-month tier obligation · current POS cycle`}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-white hover:bg-white/15 hover:text-white"
                        aria-label="Close"
                        disabled={lockInSaving}
                        onClick={() => setLockInModal(null)}
                      >
                        <X className="size-5" />
                      </Button>
                    </div>
                  </div>

                  <div className="max-h-[calc(min(92vh,760px)-8.5rem)] overflow-y-auto bg-white">
                    {lockInLoading || !lockInDetail ? (
                      <div className="flex flex-col items-center justify-center gap-3 bg-white py-16 text-slate-600">
                        <Loader2 className="size-8 animate-spin text-[#1e3a5f]" aria-hidden />
                        <p className="text-sm font-medium">Loading lock-in data…</p>
                      </div>
                    ) : (
                      <div className="space-y-5 bg-white p-5">
                        {(() => {
                          const tmpl = Math.max(0, lockInDetail.templateMonths);
                          const paid = tmpl > 0 ? Math.min(tmpl, lockInDetail.paidMonthsCapped) : 0;
                          const pct = tmpl > 0 ? Math.min(100, Math.round((paid / tmpl) * 100)) : 0;
                          return (
                            <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                  Progress this cycle
                                </span>
                                <span className="tabular-nums text-sm font-bold text-slate-900">
                                  {paid} / {tmpl || "—"}{" "}
                                  <span className="font-medium text-slate-600">mo</span>
                                </span>
                              </div>
                              <div className="h-2.5 overflow-hidden rounded-full bg-slate-300">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-[#1e3a5f] to-[#2d5a8a] transition-[width] duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-lg border border-slate-200 bg-white px-2 py-2 shadow-sm">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600">Anchor</p>
                                  <p className="mt-0.5 text-xs font-semibold leading-tight text-slate-900">
                                    {lockInDetail.anchorAt
                                      ? format(new Date(lockInDetail.anchorAt), "MMM d, yyyy")
                                      : "Start"}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white px-2 py-2 shadow-sm">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600">Paid</p>
                                  <p className="mt-0.5 text-xs font-semibold tabular-nums text-slate-900">
                                    {lockInDetail.paidMonthsCapped} mo
                                  </p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white px-2 py-2 shadow-sm">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600">Left</p>
                                  <p className="mt-0.5 text-xs font-semibold tabular-nums text-slate-900">
                                    {lockInDetail.remainingMonths} mo
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        <div>
                          <div className="mb-2 flex items-center gap-2 text-slate-900">
                            <CreditCard className="size-4 text-[#1e3a5f]" aria-hidden />
                            <h4 className="text-sm font-semibold">POS payments</h4>
                            <span className="text-[11px] font-normal text-slate-600">(this cycle)</span>
                          </div>
                          <div className="max-h-36 overflow-auto rounded-lg border border-slate-200 bg-slate-50">
                            {lockInDetail.paymentsInCycle.length === 0 ? (
                              <p className="bg-white px-3 py-6 text-center text-xs text-slate-600">
                                No payments in this cycle yet.
                              </p>
                            ) : (
                              <ul className="divide-y divide-slate-200">
                                {lockInDetail.paymentsInCycle.map((p) => {
                                  const mo = Math.max(1, Math.trunc(Number(p.paidMonths ?? 1) || 1));
                                  return (
                                    <li
                                      key={p.id}
                                      className="flex items-center justify-between gap-2 bg-white px-3 py-2.5 text-xs sm:text-[13px]"
                                    >
                                      <span className="flex items-center gap-2 font-medium text-slate-800">
                                        <CalendarDays className="size-3.5 shrink-0 text-slate-500" aria-hidden />
                                        {format(new Date(p.paidAt), "MMM d, yyyy")}
                                      </span>
                                      <span className="flex shrink-0 items-center gap-1.5">
                                        <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-900">
                                          {mo} mo
                                        </span>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          className="size-8 shrink-0 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                          aria-label="Delete payment"
                                          disabled={lockInSaving}
                                          onClick={async () => {
                                            if (
                                              !window.confirm(
                                                "Delete this POS payment? Lock-in will be recalculated. This cannot be undone.",
                                              )
                                            ) {
                                              return;
                                            }
                                            setLockInSaving(true);
                                            try {
                                              const res = await fetch(`/api/payments/${p.id}`, { method: "DELETE" });
                                              const json = (await res.json()) as {
                                                success?: boolean;
                                                error?: string;
                                                details?: string;
                                              };
                                              if (!json.success) {
                                                setNotice({
                                                  type: "error",
                                                  message: json.details || json.error || "Failed to delete payment.",
                                                });
                                                return;
                                              }
                                              setLockInModal({ ...lockInModal });
                                              await load();
                                              setNotice({ type: "success", message: "Payment removed." });
                                            } finally {
                                              setLockInSaving(false);
                                            }
                                          }}
                                        >
                                          <Trash2 className="size-3.5" aria-hidden />
                                        </Button>
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="mb-2 flex items-center gap-2 text-slate-900">
                            <FilePenLine className="size-4 text-[#1e3a5f]" aria-hidden />
                            <h4 className="text-sm font-semibold">Manual credits</h4>
                          </div>
                          <div className="max-h-40 space-y-2 overflow-auto pr-0.5">
                            {lockInDetail.manualEntries.length === 0 ? (
                              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-xs text-slate-600">
                                No manual entries. Add one below to backdate lock-in months.
                              </p>
                            ) : (
                              lockInDetail.manualEntries.map((e) => {
                                const isEditing = lockInEditingManualId === e.id;
                                return (
                                  <div
                                    key={e.id}
                                    className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm sm:flex-row sm:items-start sm:justify-between"
                                  >
                                    {isEditing ? (
                                      <div className="min-w-0 flex-1 space-y-2">
                                        <div className="grid gap-2 sm:grid-cols-2">
                                          <div className="space-y-1">
                                            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                              Months
                                            </label>
                                            <Input
                                              className="h-9 border-slate-300 bg-white text-sm text-slate-900"
                                              type="number"
                                              min={1}
                                              value={lockInManualDraft.paidMonths}
                                              onChange={(ev) =>
                                                setLockInManualDraft((d) => ({ ...d, paidMonths: ev.target.value }))
                                              }
                                            />
                                          </div>
                                          <div className="space-y-1">
                                            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                              Paid on
                                            </label>
                                            <Input
                                              className="h-9 border-slate-300 bg-white text-sm text-slate-900"
                                              type="date"
                                              value={lockInManualDraft.paidAt}
                                              onChange={(ev) =>
                                                setLockInManualDraft((d) => ({ ...d, paidAt: ev.target.value }))
                                              }
                                            />
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                            Notes
                                          </label>
                                          <Input
                                            className="border-slate-300 bg-white text-sm text-slate-900"
                                            value={lockInManualDraft.notes}
                                            onChange={(ev) =>
                                              setLockInManualDraft((d) => ({ ...d, notes: ev.target.value }))
                                            }
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="min-w-0 flex-1 text-xs leading-snug text-slate-800">
                                        <p className="font-semibold text-slate-900">
                                          {format(new Date(e.paidAt), "MMM d, yyyy")}
                                          <span className="ml-2 font-medium text-slate-600">· {e.paidMonths} mo</span>
                                        </p>
                                        {e.notes ? (
                                          <p className="mt-1 line-clamp-2 text-[11px] text-slate-700">{e.notes}</p>
                                        ) : null}
                                        {e.createdBy ? (
                                          <p className="mt-1 text-[10px] font-medium text-slate-500">By {e.createdBy}</p>
                                        ) : null}
                                      </div>
                                    )}
                                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex-col sm:items-stretch">
                                      {isEditing ? (
                                        <>
                                          <Button
                                            type="button"
                                            size="sm"
                                            className="h-8 gap-1 bg-[#1e3a5f] font-semibold text-white hover:bg-[#16304f]"
                                            disabled={lockInSaving || !lockInManualDraft.paidAt}
                                            onClick={async () => {
                                              setLockInSaving(true);
                                              try {
                                                const paidAtIso = `${lockInManualDraft.paidAt}T12:00:00.000Z`;
                                                const res = await fetch(
                                                  `/api/users/${lockInModal.id}/lock-in-entries/${e.id}`,
                                                  {
                                                    method: "PATCH",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({
                                                      paidMonths: Math.max(
                                                        1,
                                                        Math.trunc(Number(lockInManualDraft.paidMonths) || 1),
                                                      ),
                                                      paidAt: paidAtIso,
                                                      notes: lockInManualDraft.notes.trim() || null,
                                                    }),
                                                  },
                                                );
                                                const json = (await res.json()) as {
                                                  success?: boolean;
                                                  error?: string;
                                                  details?: string;
                                                };
                                                if (!json.success) {
                                                  setNotice({
                                                    type: "error",
                                                    message:
                                                      json.details || json.error || "Failed to update manual credit.",
                                                  });
                                                  return;
                                                }
                                                setLockInEditingManualId(null);
                                                setLockInModal({ ...lockInModal });
                                                await load();
                                                setNotice({ type: "success", message: "Manual credit updated." });
                                              } finally {
                                                setLockInSaving(false);
                                              }
                                            }}
                                          >
                                            {lockInSaving ? (
                                              <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                            ) : null}
                                            Save
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8"
                                            disabled={lockInSaving}
                                            onClick={() => setLockInEditingManualId(null)}
                                          >
                                            Cancel
                                          </Button>
                                        </>
                                      ) : (
                                        <>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 shrink-0 gap-1"
                                            disabled={lockInSaving || lockInEditingManualId !== null}
                                            onClick={() => {
                                              setLockInEditingManualId(e.id);
                                              setLockInManualDraft({
                                                paidMonths: String(e.paidMonths),
                                                paidAt: format(new Date(e.paidAt), "yyyy-MM-dd"),
                                                notes: e.notes ?? "",
                                              });
                                            }}
                                          >
                                            <Pencil className="size-3.5" aria-hidden />
                                            <span className="hidden sm:inline">Edit</span>
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 shrink-0 gap-1 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                            disabled={lockInSaving || lockInEditingManualId !== null}
                                            onClick={async () => {
                                              setLockInSaving(true);
                                              try {
                                                const res = await fetch(
                                                  `/api/users/${lockInModal.id}/lock-in-entries/${e.id}`,
                                                  { method: "DELETE" },
                                                );
                                                const json = (await res.json()) as {
                                                  success?: boolean;
                                                  error?: string;
                                                };
                                                if (!json.success) {
                                                  setNotice({
                                                    type: "error",
                                                    message: json.error || "Failed to remove entry.",
                                                  });
                                                  return;
                                                }
                                                setLockInModal({ ...lockInModal });
                                                await load();
                                              } finally {
                                                setLockInSaving(false);
                                              }
                                            }}
                                          >
                                            <Trash2 className="size-3.5" aria-hidden />
                                            <span className="hidden sm:inline">Remove</span>
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
                          <div className="mb-3 flex items-center gap-2 text-slate-900">
                            <PlusCircle className="size-4 text-[#1e3a5f]" aria-hidden />
                            <h4 className="text-sm font-semibold">Add manual credit</h4>
                          </div>
                          <p className="mb-3 text-[11px] leading-relaxed text-slate-700">
                            Use for backdated months that are not on a POS payment line. Months count toward this
                            member&apos;s current lock-in cycle.
                          </p>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-800">Months</label>
                              <Input
                                className="h-9 border-slate-300 bg-white text-sm text-slate-900"
                                type="number"
                                min={1}
                                value={lockInForm.paidMonths}
                                onChange={(ev) => setLockInForm((f) => ({ ...f, paidMonths: ev.target.value }))}
                              />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                              <label className="text-xs font-semibold text-slate-800">Paid on</label>
                              <Input
                                className="h-9 border-slate-300 bg-white text-sm text-slate-900"
                                type="date"
                                value={lockInForm.paidAt}
                                onChange={(ev) => setLockInForm((f) => ({ ...f, paidAt: ev.target.value }))}
                              />
                            </div>
                          </div>
                          <div className="mt-3 space-y-1">
                            <label className="text-xs font-semibold text-slate-800">Notes (optional)</label>
                            <Input
                              className="border-slate-300 bg-white text-sm text-slate-900"
                              placeholder="e.g. Adjustment agreed with member"
                              value={lockInForm.notes}
                              onChange={(ev) => setLockInForm((f) => ({ ...f, notes: ev.target.value }))}
                            />
                          </div>
                          <Button
                            type="button"
                            className="mt-4 w-full gap-2 bg-[#1e3a5f] font-semibold text-white shadow-md hover:bg-[#16304f] sm:w-auto"
                            disabled={lockInSaving || !lockInForm.paidAt || lockInEditingManualId !== null}
                            onClick={async () => {
                              setLockInSaving(true);
                              const paidAtIso = lockInForm.paidAt ? `${lockInForm.paidAt}T12:00:00.000Z` : "";
                              const res = await fetch(`/api/users/${lockInModal.id}/lock-in-entries`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  paidMonths: Math.max(1, Math.trunc(Number(lockInForm.paidMonths) || 1)),
                                  paidAt: paidAtIso,
                                  notes: lockInForm.notes.trim() || null,
                                }),
                              });
                              const json = (await res.json()) as { success?: boolean; error?: string };
                              setLockInSaving(false);
                              if (!json.success) {
                                setNotice({ type: "error", message: json.error || "Failed to add entry." });
                                return;
                              }
                              setLockInForm({ paidMonths: "1", paidAt: "", notes: "" });
                              setLockInModal({ ...lockInModal });
                              await load();
                              setNotice({ type: "success", message: "Manual lock-in credit saved." });
                            }}
                          >
                            {lockInSaving ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden />
                            ) : (
                              <PlusCircle className="size-4" aria-hidden />
                            )}
                            Save manual credit
                          </Button>
                        </div>
                      </div>
                    )}
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

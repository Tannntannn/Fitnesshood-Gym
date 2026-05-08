"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardConfirmDialog } from "@/components/dashboard-confirm-dialog";
import { getSalesFilterPaidAtRange } from "@/lib/sales-filter-window";
import { MAX_MEMBERSHIP_PAY_NOW_MONTHS } from "@/lib/payment";

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  remainingBalance?: string | null;
  membershipTier?: string | null;
  coachName?: string | null;
  addOnSubscriptions?: Array<{ addonName: string }>;
};
type ServiceRow = { id: string; name: string; tier: string; monthlyRate: string; contractMonths: number; contractPrice: string; isActive?: boolean };
type CoachRow = { id: string; name: string };
type SplitRow = { method: string; amount: string; reference: string };
type RoleFilter = "MEMBER" | "NON_MEMBER" | "WALK_IN" | "WALK_IN_REGULAR";
type SalesFilterPeriod = "TODAY" | "WEEKLY" | "MONTHLY" | "ANNUALLY";
type PaymentRow = {
  id: string;
  amount: string;
  grossAmount?: string | null;
  discountPercent?: number | null;
  discountAmount?: string | null;
  discountType?: string | null;
  discountFixedAmount?: string | null;
  discountReason?: string | null;
  transactionType?: string;
  paymentMethod: string;
  collectionStatus: "FULLY_PAID" | "PARTIAL";
  paidAt: string;
  createdAt?: string | null;
  recordedBy?: string | null;
  user: { id: string; firstName: string; lastName: string; role: string; remainingBalance: string | null; membershipTier?: string | null };
  service: { id: string; name: string; tier: string };
  paymentReference?: string | null;
  orNumber?: string | null;
  notes?: string | null;
  splitPayments?: Array<{ id: string; method: string; amount: string; reference?: string | null }>;
  addOnSubscription?: { id: string; addonName: string } | null;
  customAddOnLabel?: string | null;
  receiptGroupId?: string | null;
};

type ConfirmResult = {
  payment: { id: string; amount: string; paymentMethod: string; collectionStatus: "FULLY_PAID" | "PARTIAL"; paidAt: string };
  updatedMember: {
    firstName: string;
    lastName: string;
    membershipTier: string | null;
    membershipStatus: string | null;
    daysLeft: number | null;
    remainingBalance: string | null;
    monthsPaid: number;
    remainingMonths: number | null;
    lockInPaidMonths?: number | null;
    loyaltyStars: number;
    monthlyExpiryDate?: string | null;
    lockInLabel?: string | null;
    monthlyFeeLabel?: string | null;
  };
};

const methodOptions = ["CASH", "GCASH", "CARD", "BANK_TRANSFER", "MAYA", "OTHER"] as const;

type EditableTransaction = {
  id: string;
  grossAmount: string;
  discountType: "NONE" | "PERCENT" | "FIXED";
  discountPercent: string;
  discountFixedAmount: string;
  discountReason: string;
  paymentMethod: string;
  collectionStatus: "FULLY_PAID" | "PARTIAL";
  paidAtLocal: string;
  paymentReference: string;
  orNumber: string;
  notes: string;
  isSplit: boolean;
};

function methodMayHaveReference(method: string): boolean {
  return method === "GCASH" || method === "MAYA" || method === "BANK_TRANSFER" || method === "CARD";
}

function paymentMethodOptionLabel(method: string): string {
  return method
    .toLowerCase()
    .split("_")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function paymentTrackLabel(row: PaymentRow): string | null {
  const custom = row.customAddOnLabel?.trim();
  if (custom) return `Add-on: ${custom}`;
  if (row.transactionType === "MONTHLY_FEE")
    return row.service.name === "Membership" ? "Membership (monthly)" : "Monthly fee";
  if (row.transactionType === "MEMBERSHIP_CONTRACT") return "Contract";
  if (row.transactionType === "LEGACY" && row.service.name === "Membership") return "Membership (legacy contract)";
  if (row.transactionType === "ADD_ON")
    return row.addOnSubscription?.addonName ? `Add-on: ${row.addOnSubscription.addonName}` : "Add-on";
  return null;
}

/** `qLower` = trimmed, lowercased query; empty means match all. */
function paymentRecordMatchesQuery(row: PaymentRow, qLower: string): boolean {
  if (!qLower) return true;
  const paid = new Date(row.paidAt);
  const track = paymentTrackLabel(row);
  const blob = [
    row.user.firstName,
    row.user.lastName,
    `${row.user.firstName} ${row.user.lastName}`,
    `${row.user.lastName} ${row.user.firstName}`,
    row.user.id,
    row.service.name,
    row.service.tier,
    row.paymentMethod,
    String(row.amount),
    row.grossAmount != null ? String(row.grossAmount) : "",
    (row.notes ?? "").trim(),
    (row.paymentReference ?? "").trim(),
    (row.orNumber ?? "").trim(),
    (row.customAddOnLabel ?? "").trim(),
    row.addOnSubscription?.addonName ?? "",
    row.transactionType ?? "",
    track ?? "",
    paid.toLocaleString(),
    paid.toLocaleDateString(),
  ]
    .join(" ")
    .toLowerCase();
  return blob.includes(qLower);
}

type ServiceCartLine = {
  lineId: string;
  serviceId: string;
  grossStr: string;
  /** Months paying toward access now (Membership except Bronze); on SGP can differ from lock-in. */
  paymentMonths?: string | null;
  customAddOnLabel?: string | null;
  /** YYYY-MM-DD — shown on Add-ons dashboard as next due / expiration when saving custom add-on lines. */
  addOnDueDate?: string | null;
};

function newCartLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Membership tiers where admin can set “pay now” months (Bronze uses gross / tile only). */
function isMembershipNonBronze(service: ServiceRow | null | undefined): boolean {
  if (!service || service.name !== "Membership") return false;
  return service.tier.trim().toLowerCase() !== "bronze";
}

function clampPayNowMonths(raw: unknown): number {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_MEMBERSHIP_PAY_NOW_MONTHS, n));
}

/** Allocate whole-cent fixed discount across lines by gross share (last lines absorb remainder). */
function allocateFixedDiscountCents(grossCents: number[], discountCents: number): number[] {
  const total = grossCents.reduce((a, b) => a + b, 0);
  if (total <= 0 || discountCents <= 0) return grossCents.map(() => 0);
  const raw = grossCents.map((g) => Math.floor((discountCents * g) / total));
  let diff = discountCents - raw.reduce((a, b) => a + b, 0);
  for (let i = raw.length - 1; diff > 0 && i >= 0; i--) {
    raw[i] += 1;
    diff -= 1;
  }
  return raw;
}

function buildServicesForRole(services: ServiceRow[], role: RoleFilter): ServiceRow[] {
  const membershipPlan = services.filter((service) => service.name === "Membership");
  const bronzeMembership = membershipPlan.filter((service) => service.tier.trim().toLowerCase() === "bronze");
  const roleCore =
    role === "MEMBER"
      ? membershipPlan
      : role === "NON_MEMBER"
        ? [...services.filter((service) => service.tier === "Non-member"), ...bronzeMembership]
        : role === "WALK_IN"
          ? services.filter((service) => service.tier === "Walk-in Student")
          : services.filter((service) => service.tier === "Walk-in Regular");
  const addOns = services.filter(
    (service) => service.name !== "Membership" && (service.tier === "ALL" || service.contractMonths === 0),
  );
  const seen = new Set<string>();
  return [...roleCore, ...addOns].filter((service) => {
    if (seen.has(service.id)) return false;
    seen.add(service.id);
    return true;
  });
}

function mergeAllRoleServices(services: ServiceRow[]): ServiceRow[] {
  const roles: RoleFilter[] = ["MEMBER", "NON_MEMBER", "WALK_IN", "WALK_IN_REGULAR"];
  const seen = new Set<string>();
  const out: ServiceRow[] = [];
  for (const role of roles) {
    for (const s of buildServicesForRole(services, role)) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        out.push(s);
      }
    }
  }
  return out;
}

const roleTabs: Array<{ id: RoleFilter; label: string }> = [
  { id: "MEMBER", label: "Members" },
  { id: "NON_MEMBER", label: "Non-members" },
  { id: "WALK_IN", label: "Walk-in Student" },
  { id: "WALK_IN_REGULAR", label: "Walk-in Regular" },
];

type HistoryRoleFilter = "ALL" | RoleFilter;
type HistorySortColumn =
  | "paidAt"
  | "createdAt"
  | "customer"
  | "role"
  | "service"
  | "method"
  | "gross"
  | "discount"
  | "total";
type HistorySortDirection = "asc" | "desc";

const historyRoleFilters: Array<{ id: HistoryRoleFilter; label: string }> = [
  { id: "ALL", label: "Overall" },
  { id: "MEMBER", label: "Members" },
  { id: "NON_MEMBER", label: "Non-members" },
  { id: "WALK_IN_REGULAR", label: "Walk-in Regular" },
  { id: "WALK_IN", label: "Walk-in Student" },
];

function historyRoleShortLabel(role: string): string {
  if (role === "MEMBER") return "Member";
  if (role === "NON_MEMBER") return "Non-member";
  if (role === "WALK_IN") return "Walk-in Student";
  if (role === "WALK_IN_REGULAR") return "Walk-in Regular";
  return role;
}

function historyShortId(id: string): string {
  if (!id) return "";
  return id.length <= 6 ? id : id.slice(-6);
}

/**
 * Today's calendar date in Asia/Manila as `YYYY-MM-DD`.
 * Used to lock the payment-records date picker to today and earlier (no future selection).
 * `en-CA` locale renders as ISO `YYYY-MM-DD`, which matches the value format of `<input type="date">`.
 */
function todayPHDateStr(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

/** Add `delta` days to a `YYYY-MM-DD` string, treating it as a calendar date (DST-safe via UTC math). */
function addDaysToDateStr(value: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  const [, y, mo, d] = m;
  const base = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  base.setUTCDate(base.getUTCDate() + delta);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Color-coded pill (label + Tailwind classes) for the Role column. */
function historyRolePill(role: string, membershipTier?: string | null): { label: string; classes: string } {
  const tier = (membershipTier ?? "").trim().toLowerCase();
  if (role === "MEMBER") {
    if (tier === "bronze")
      return { label: "Bronze", classes: "bg-amber-100 text-amber-800 ring-1 ring-amber-200" };
    if (tier === "silver")
      return { label: "Silver", classes: "bg-slate-200 text-slate-700 ring-1 ring-slate-300" };
    if (tier === "gold")
      return { label: "Gold", classes: "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300" };
    if (tier === "platinum")
      return { label: "Platinum", classes: "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200" };
    return { label: "Member", classes: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200" };
  }
  if (role === "NON_MEMBER" && tier) {
    const label = tier.charAt(0).toUpperCase() + tier.slice(1);
    return { label: `${label} (Non-member)`, classes: "bg-amber-100 text-amber-800 ring-1 ring-amber-200" };
  }
  if (role === "NON_MEMBER")
    return { label: "Non-member", classes: "bg-amber-100 text-amber-800 ring-1 ring-amber-200" };
  if (role === "WALK_IN")
    return { label: "Walk-in Student", classes: "bg-violet-100 text-violet-800 ring-1 ring-violet-200" };
  if (role === "WALK_IN_REGULAR")
    return { label: "Walk-in Regular", classes: "bg-fuchsia-100 text-fuchsia-800 ring-1 ring-fuchsia-200" };
  return { label: role, classes: "bg-slate-100 text-slate-700 ring-1 ring-slate-200" };
}

/** Columns whose natural first sort is descending (recency / largest first). */
const HISTORY_DESC_FIRST: HistorySortColumn[] = [
  "paidAt",
  "createdAt",
  "gross",
  "discount",
  "total",
];

type HistorySortHeaderProps = {
  label: string;
  column: HistorySortColumn;
  sort: { column: HistorySortColumn; direction: HistorySortDirection };
  onToggle: (column: HistorySortColumn) => void;
  align?: "left" | "right";
  className?: string;
  sortable?: boolean;
  /** `pill` = compact toolbar button (card layout). `table` = legacy &lt;th&gt; header cell. */
  variant?: "table" | "pill";
};

function HistorySortHeader({
  label,
  column,
  sort,
  onToggle,
  align = "left",
  className = "",
  sortable = true,
  variant = "table",
}: HistorySortHeaderProps) {
  const active = sortable && sort.column === column;
  const indicator = !sortable ? "" : active ? (sort.direction === "asc" ? "▲" : "▼") : "↕";
  const justify = align === "right" ? "justify-end" : "justify-start";
  const textAlign = align === "right" ? "text-right" : "text-left";
  const ariaSort: "ascending" | "descending" | "none" = active
    ? sort.direction === "asc"
      ? "ascending"
      : "descending"
    : "none";

  if (variant === "pill") {
    if (!sortable) {
      return (
        <span className={`inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase text-slate-500 ${className}`}>
          {label}
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onToggle(column)}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${className} ${
          active ? "border-[#1e3a5f] bg-[#1e3a5f]/10 text-[#1e3a5f]" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        }`}
      >
        <span>{label}</span>
        <span className={`text-[9px] leading-none ${active ? "text-[#1e3a5f]" : "text-slate-400"}`} aria-hidden="true">
          {indicator}
        </span>
      </button>
    );
  }

  return (
    <th
      className={`border-b border-slate-200 px-2 py-2 ${textAlign} ${className}`}
      aria-sort={sortable ? ariaSort : undefined}
      scope="col"
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => onToggle(column)}
          className={`flex w-full items-center gap-1 ${justify} text-[11px] font-semibold uppercase tracking-wide transition ${
            active ? "text-[#1e3a5f]" : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <span>{label}</span>
          <span
            className={`text-[9px] leading-none ${active ? "text-[#1e3a5f]" : "text-slate-400"}`}
            aria-hidden="true"
          >
            {indicator}
          </span>
        </button>
      ) : (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      )}
    </th>
  );
}
const monthOptions = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];
const trendSeries = [
  { key: "bronze", label: "Bronze", color: "bg-amber-600" },
  { key: "silver", label: "Silver", color: "bg-slate-500" },
  { key: "gold", label: "Gold", color: "bg-yellow-500" },
  { key: "platinum", label: "Platinum", color: "bg-cyan-500" },
  { key: "students", label: "Students", color: "bg-violet-500" },
  { key: "member_unassigned", label: "Member Unassigned", color: "bg-emerald-500" },
  { key: "non_member", label: "Non-member", color: "bg-blue-500" },
  { key: "walk_in_student", label: "Walk-in Student", color: "bg-lime-500" },
  { key: "walk_in_regular", label: "Walk-in Regular", color: "bg-fuchsia-500" },
] as const;
type TrendSeriesKey = (typeof trendSeries)[number]["key"];

export default function PaymentsPage() {
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paymentImportInputRef = useRef<HTMLInputElement | null>(null);
  const memberSearchWrapRef = useRef<HTMLDivElement | null>(null);
  const prevMemberIdRef = useRef<string>("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [records, setRecords] = useState<PaymentRow[]>([]);

  const [clientSearch, setClientSearch] = useState("");
  const [coachName, setCoachName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [memberSuggestOpen, setMemberSuggestOpen] = useState(false);
  const [cartLines, setCartLines] = useState<ServiceCartLine[]>([]);
  const [discountKind, setDiscountKind] = useState<"NONE" | "PERCENT" | "FIXED">("NONE");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [discountFixed, setDiscountFixed] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [collectionStatus, setCollectionStatus] = useState<"FULLY_PAID" | "PARTIAL">("FULLY_PAID");
  const [customAddOnPanelOpen, setCustomAddOnPanelOpen] = useState(false);
  const [customAddOnName, setCustomAddOnName] = useState("");
  const [customAddOnPrice, setCustomAddOnPrice] = useState("");
  const [customAddOnDueDate, setCustomAddOnDueDate] = useState("");
  const [enableSplit, setEnableSplit] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([{ method: "CASH", amount: "", reference: "" }]);
  const [paymentReference, setPaymentReference] = useState("");
  const [orNumber, setOrNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [salesFilterPeriod, setSalesFilterPeriod] = useState<SalesFilterPeriod>("ANNUALLY");
  const [salesFilterYear, setSalesFilterYear] = useState<number>(new Date().getFullYear());
  const [salesMonthFrom, setSalesMonthFrom] = useState<number>(new Date().getMonth() + 1);
  const [salesMonthTo, setSalesMonthTo] = useState<number>(new Date().getMonth() + 1);
  const [salesSpecificDate, setSalesSpecificDate] = useState("");
  const [paymentRecordsSearch, setPaymentRecordsSearch] = useState("");
  /** YYYY-MM-DD; empty = no date filter (default behaviour, full recent window). */
  const [paymentRecordsDate, setPaymentRecordsDate] = useState("");
  const [paymentRecordsRoleFilter, setPaymentRecordsRoleFilter] = useState<HistoryRoleFilter>("ALL");
  const [paymentRecordsSort, setPaymentRecordsSort] = useState<{
    column: HistorySortColumn;
    direction: HistorySortDirection;
  }>({ column: "paidAt", direction: "desc" });
  const toggleHistorySort = useCallback((column: HistorySortColumn) => {
    setPaymentRecordsSort((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { column, direction: HISTORY_DESC_FIRST.includes(column) ? "desc" : "asc" };
    });
  }, []);
  /** PH-local today (YYYY-MM-DD). Memoized once per mount; future dates are locked to this value. */
  const todayPHStr = useMemo(() => todayPHDateStr(), []);
  /**
   * Step the date picker by ±1 day. Future dates are clamped: if the user clicks
   * the next-day arrow at today (or with no date set), it is a no-op.
   */
  const stepHistoryDate = useCallback(
    (delta: -1 | 1) => {
      setPaymentRecordsDate((prev) => {
        const base = prev || todayPHStr;
        const next = addDaysToDateStr(base, delta);
        if (next > todayPHStr) return prev;
        return next;
      });
    },
    [todayPHStr],
  );
  /** True only when there is a real date to step forward from AND it is strictly before today. */
  const canStepForward = !!paymentRecordsDate && paymentRecordsDate < todayPHStr;
  /** Per-service quantity (POS tile). Local-only; multiplies gross when added/updated in cart. */
  const [quantityByService, setQuantityByService] = useState<Record<string, number>>({});

  const [coachRemittanceSummary, setCoachRemittanceSummary] = useState<{ total: number; count: number }>({
    total: 0,
    count: 0,
  });
  const [coachRemittanceLoading, setCoachRemittanceLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [exportingPayments, setExportingPayments] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [importingPayments, setImportingPayments] = useState(false);
  const [updatingTransactionId, setUpdatingTransactionId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<EditableTransaction | null>(null);
  const [savingTransactionEdit, setSavingTransactionEdit] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<ConfirmResult | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [duplicateSaveOpen, setDuplicateSaveOpen] = useState(false);
  const [pendingVoidPayment, setPendingVoidPayment] = useState<PaymentRow | null>(null);
  const [voidReasonInput, setVoidReasonInput] = useState("Admin correction");
  const [pendingDeletePayment, setPendingDeletePayment] = useState<PaymentRow | null>(null);

  const showNotice = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2600);
  };

  const toDateTimeLocalValue = (value: string): string => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  type ReceiptSize = "thermal" | "a4";
  const buildReceiptUrl = (paymentId: string, size: ReceiptSize): string =>
    size === "a4" ? `/api/payments/receipt/${paymentId}?size=a4` : `/api/payments/receipt/${paymentId}`;
  const buildMergedReceiptUrl = (paymentIds: string[], size: ReceiptSize): string => {
    const q = encodeURIComponent(paymentIds.join(","));
    return size === "a4" ? `/api/payments/receipt/merged?ids=${q}&size=a4` : `/api/payments/receipt/merged?ids=${q}`;
  };
  const openReceipt = (paymentId: string, size: ReceiptSize = "thermal") => {
    window.open(buildReceiptUrl(paymentId, size), "_blank", "noopener,noreferrer");
  };
  const openMergedReceipt = (paymentIds: string[], size: ReceiptSize = "thermal") => {
    const unique = Array.from(new Set(paymentIds.map((id) => id.trim()).filter(Boolean)));
    if (unique.length === 0) return;
    if (unique.length === 1) {
      openReceipt(unique[0], size);
      return;
    }
    window.open(buildMergedReceiptUrl(unique, size), "_blank", "noopener,noreferrer");
  };

  const [mergeReceiptIds, setMergeReceiptIds] = useState<string[]>([]);
  const toggleMergeGroup = (ids: string[]) => {
    setMergeReceiptIds((prev) => {
      const allIn = ids.length > 0 && ids.every((id) => prev.includes(id));
      if (allIn) return prev.filter((x) => !ids.includes(x));
      return Array.from(new Set([...prev, ...ids]));
    });
  };
  const openMergedReceiptFromSelection = (size: ReceiptSize = "thermal") => {
    const rows = records.filter((r) => mergeReceiptIds.includes(r.id));
    if (rows.length < 2) {
      showNotice("error", "Select at least two payments to print a merged receipt.");
      return;
    }
    const uid = rows[0].user.id;
    if (rows.some((r) => r.user.id !== uid)) {
      showNotice("error", "Merged receipt: choose payments for the same client only.");
      return;
    }
    const order = mergeReceiptIds.filter((id) => rows.some((r) => r.id === id));
    openMergedReceipt(order, size);
  };

  /**
   * Optional `dateFilterArg` overrides `paymentRecordsDate`; pass empty string to force "all".
   * Default (undefined) reads the current state so manual reloads respect the visible filter.
   */
  const load = async (dateFilterArg?: string) => {
    const dateFilter = (dateFilterArg ?? paymentRecordsDate ?? "").trim();
    const paymentsUrl = dateFilter
      ? `/api/payments?limit=500&date=${encodeURIComponent(dateFilter)}`
      : "/api/payments?limit=200";
    const [memberRes, serviceRes, paymentsRes, coachRes] = await Promise.all([
      fetch("/api/users?view=payment"),
      fetch("/api/services"),
      fetch(paymentsUrl),
      fetch("/api/coaches"),
    ]);
    const memberJson = (await memberRes.json()) as { data?: MemberRow[] };
    const serviceJson = (await serviceRes.json()) as { data?: ServiceRow[] };
    const paymentsJson = (await paymentsRes.json()) as { data?: PaymentRow[] };
    const coachJson = (await coachRes.json()) as { data?: CoachRow[] };
    setMembers(memberJson.data ?? []);
    setServices(serviceJson.data ?? []);
    setRecords(paymentsJson.data ?? []);
    setCoaches(coachJson.data ?? []);
  };

  useEffect(() => {
    load();
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
    // Initial mount only; subsequent date changes are handled by the dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load(paymentRecordsDate);
    // load() reads other state but is intentionally only re-run when the date changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentRecordsDate]);

  /**
   * Export the currently visible (filtered + sorted) payment history to .xlsx.
   * Mirrors the table's column order and sort so a re-imported sheet matches what staff saw.
   * `xlsx` is imported dynamically so the ~700KB module is only fetched on click.
   */
  const handleExportExcel = async () => {
    if (exportingExcel) return;
    if (flatHistoryRows.length === 0) {
      showNotice("error", "Nothing to export — adjust the filters and try again.");
      return;
    }
    try {
      setExportingExcel(true);
      const XLSX = await import("xlsx");
      const sheetRows = flatHistoryRows.map((row, index) => {
        const pill = historyRolePill(row.user.role, row.user.membershipTier);
        const splitNote =
          row.paymentMethod === "SPLIT" && row.splitPayments?.length
            ? row.splitPayments
                .map((sp) => `${sp.method}${sp.reference ? ` · ${sp.reference}` : ""}`)
                .join(" · ")
            : "";
        return {
          "#": index + 1,
          ID: row.id,
          Date: new Date(row.paidAt).toLocaleDateString(),
          Created: row.createdAt ? new Date(row.createdAt).toLocaleString() : "",
          Customer: `${row.user.firstName} ${row.user.lastName}`.trim(),
          Role: pill.label,
          "Membership Tier": row.user.membershipTier ?? "",
          Service: row.service.name,
          "Service Tier": row.service.tier,
          Track: paymentTrackLabel(row) ?? "",
          "Add-on Label": row.customAddOnLabel ?? "",
          Method: paymentMethodOptionLabel(row.paymentMethod),
          Status: row.collectionStatus === "PARTIAL" ? "Partial" : "Fully Paid",
          "Discount Amount": Number(row.discountAmount ?? 0),
          "Discount Type": row.discountType ?? "NONE",
          "Discount Percent": Number(row.discountPercent ?? 0),
          "Discount Reason": row.discountReason ?? "",
          "Gross Amount": Number(row.grossAmount ?? row.amount),
          "Total Paid": Number(row.amount),
          Reference: (row.paymentReference ?? "").trim(),
          "OR Number": (row.orNumber ?? "").trim(),
          "Split Detail": splitNote,
          "Recorded By": row.recordedBy ?? "",
          Notes: (row.notes ?? "").trim(),
        };
      });
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      // Auto-size columns based on header + content length (clamped to a sensible range).
      const headers = Object.keys(sheetRows[0] ?? {});
      ws["!cols"] = headers.map((h) => {
        let max = h.length;
        for (const r of sheetRows) {
          const cell = (r as Record<string, unknown>)[h];
          const len = String(cell ?? "").length;
          if (len > max) max = len;
        }
        return { wch: Math.min(48, Math.max(8, max + 2)) };
      });
      const wb = XLSX.utils.book_new();
      const sheetName =
        paymentRecordsRoleFilter === "ALL"
          ? "All payments"
          : historyRoleFilters.find((f) => f.id === paymentRecordsRoleFilter)?.label ?? "Payments";
      XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
      const datePart = paymentRecordsDate || todayPHStr;
      const filterPart =
        paymentRecordsRoleFilter === "ALL" ? "all" : paymentRecordsRoleFilter.toLowerCase();
      XLSX.writeFile(wb, `payment-records-${datePart}-${filterPart}.xlsx`);
      showNotice("success", `Exported ${sheetRows.length} record(s) to Excel.`);
    } catch {
      showNotice("error", "Failed to export to Excel.");
    } finally {
      setExportingExcel(false);
    }
  };

  useEffect(() => {
    if (!editingTransaction) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [editingTransaction]);

  useEffect(() => {
    setMergeReceiptIds((prev) => prev.filter((id) => records.some((r) => r.id === id)));
  }, [records]);

  const filteredMembers = useMemo(
    () => {
      // Whitespace-tolerant + case-insensitive — lets staff find any registered user
      // (MEMBER, NON_MEMBER, WALK_IN, WALK_IN_REGULAR) even with stray spaces in stored names.
      const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
      const query = normalize(clientSearch);
      return members
        .filter((member) => {
          if (!query) return true;
          const first = normalize(member.firstName);
          const last = normalize(member.lastName);
          const fullName = normalize(`${member.firstName} ${member.lastName}`);
          const reverseName = normalize(`${member.lastName} ${member.firstName}`);
          if (
            first.includes(query) ||
            last.includes(query) ||
            fullName.includes(query) ||
            reverseName.includes(query)
          )
            return true;
          const addonMatch = (member.addOnSubscriptions ?? []).some((sub) =>
            normalize(sub.addonName).includes(query),
          );
          return addonMatch;
        })
        .slice()
        .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
    },
    [members, clientSearch],
  );
  const selectedMember = useMemo(() => members.find((member) => member.id === memberId) ?? null, [members, memberId]);
  const clientRole = useMemo(
    () => (selectedMember ? (selectedMember.role as RoleFilter) : ("MEMBER" as RoleFilter)),
    [selectedMember],
  );

  useEffect(() => {
    const prev = prevMemberIdRef.current;
    if (prev && prev !== memberId) setCartLines([]);
    prevMemberIdRef.current = memberId;
  }, [memberId]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = memberSearchWrapRef.current;
      if (!el?.contains(e.target as Node)) setMemberSuggestOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (cartLines.length > 1 && enableSplit) {
      setEnableSplit(false);
      setSplits([{ method: "CASH", amount: "", reference: "" }]);
    }
  }, [cartLines.length, enableSplit]);
  const getComputedAmount = (service: ServiceRow | null, role: RoleFilter) => {
    if (!service) return "";
    const baseAmount = Number(service.monthlyRate);
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) return "";
    if (role === "MEMBER" && service.name === "Membership") return String(baseAmount);
    return String(baseAmount);
  };
  const filteredServices = useMemo(() => {
    if (!selectedMember) return mergeAllRoleServices(services);
    return buildServicesForRole(services, selectedMember.role as RoleFilter);
  }, [services, selectedMember]);
  const customAddOnService = useMemo(
    () => services.find((s) => s.name.trim() === "Add-on" && s.tier.trim() === "Custom") ?? null,
    [services],
  );
  const servicesForProductGrid = useMemo(
    () => filteredServices.filter((s) => !(s.name.trim() === "Add-on" && s.tier.trim() === "Custom")),
    [filteredServices],
  );
  const selectedMemberBalance = useMemo(() => {
    const balance = Number(selectedMember?.remainingBalance ?? 0);
    if (!Number.isFinite(balance) || balance <= 0) return 0;
    return balance;
  }, [selectedMember]);

  useEffect(() => {
    setCoachName(selectedMember?.coachName ?? "");
  }, [selectedMember]);
  const splitTotal = useMemo(() => splits.reduce((sum, row) => sum + Number(row.amount || 0), 0), [splits]);
  const discountValue = useMemo(() => {
    const value = Math.trunc(Number(discountPercent || 0));
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, value));
  }, [discountPercent]);
  const grossAmountValue = useMemo(() => {
    const sum = cartLines.reduce((acc, line) => acc + (Number(line.grossStr) || 0), 0);
    if (!Number.isFinite(sum)) return 0;
    return sum;
  }, [cartLines]);
  const discountAmountValue = useMemo(() => {
    if (discountKind === "NONE") return 0;
    if (discountKind === "PERCENT") return grossAmountValue * (discountValue / 100);
    const fixed = Number(discountFixed || 0);
    if (!Number.isFinite(fixed) || fixed <= 0) return 0;
    return Math.min(fixed, grossAmountValue);
  }, [discountKind, discountValue, grossAmountValue, discountFixed]);
  const finalAmountValue = useMemo(() => Math.max(grossAmountValue - discountAmountValue, 0), [grossAmountValue, discountAmountValue]);

  /** Flat, role-filtered, search-filtered + sorted rows feeding the new payment history table. */
  const flatHistoryRows = useMemo(() => {
    const qLower = paymentRecordsSearch.trim().toLowerCase();
    let list = records.slice();
    if (paymentRecordsRoleFilter !== "ALL") {
      list = list.filter((row) => row.user.role === paymentRecordsRoleFilter);
    }
    if (qLower) list = list.filter((row) => paymentRecordMatchesQuery(row, qLower));
    const dir = paymentRecordsSort.direction === "asc" ? 1 : -1;
    const col = paymentRecordsSort.column;
    list.sort((a, b) => {
      let cmp = 0;
      switch (col) {
        case "paidAt":
          cmp = new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime();
          break;
        case "createdAt": {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : new Date(a.paidAt).getTime();
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : new Date(b.paidAt).getTime();
          cmp = ta - tb;
          break;
        }
        case "customer":
          cmp = `${a.user.lastName} ${a.user.firstName}`.localeCompare(
            `${b.user.lastName} ${b.user.firstName}`,
          );
          break;
        case "role":
          cmp = historyRoleShortLabel(a.user.role).localeCompare(historyRoleShortLabel(b.user.role));
          break;
        case "service":
          cmp = `${a.service.name} ${a.service.tier}`.localeCompare(`${b.service.name} ${b.service.tier}`);
          break;
        case "method":
          cmp = a.paymentMethod.localeCompare(b.paymentMethod);
          break;
        case "gross":
          cmp = Number(a.grossAmount ?? a.amount) - Number(b.grossAmount ?? b.amount);
          break;
        case "discount":
          cmp = Number(a.discountAmount ?? 0) - Number(b.discountAmount ?? 0);
          break;
        case "total":
          cmp = Number(a.amount) - Number(b.amount);
          break;
      }
      if (cmp !== 0) return cmp * dir;
      return new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime();
    });
    return list;
  }, [records, paymentRecordsSearch, paymentRecordsRoleFilter, paymentRecordsSort]);

  /** Counts shown next to each role-filter button, respecting the current text search. */
  const historyRoleCounts = useMemo(() => {
    const qLower = paymentRecordsSearch.trim().toLowerCase();
    const counts: Record<HistoryRoleFilter, number> = {
      ALL: 0,
      MEMBER: 0,
      NON_MEMBER: 0,
      WALK_IN: 0,
      WALK_IN_REGULAR: 0,
    };
    for (const row of records) {
      if (qLower && !paymentRecordMatchesQuery(row, qLower)) continue;
      counts.ALL += 1;
      if (row.user.role === "MEMBER") counts.MEMBER += 1;
      else if (row.user.role === "NON_MEMBER") counts.NON_MEMBER += 1;
      else if (row.user.role === "WALK_IN") counts.WALK_IN += 1;
      else if (row.user.role === "WALK_IN_REGULAR") counts.WALK_IN_REGULAR += 1;
    }
    return counts;
  }, [records, paymentRecordsSearch]);

  const historyTotalsForView = useMemo(() => {
    let gross = 0;
    let discount = 0;
    let net = 0;
    for (const r of flatHistoryRows) {
      gross += Number(r.grossAmount ?? r.amount) || 0;
      discount += Number(r.discountAmount ?? 0) || 0;
      net += Number(r.amount) || 0;
    }
    return { gross, discount, net };
  }, [flatHistoryRows]);

  const getChartAmount = (row: PaymentRow): number => {
    // Always use actual posted amount so split/discount totals are accurate.
    return Number(row.amount) || 0;
  };
  const getTrendSeriesKey = (row: PaymentRow): TrendSeriesKey => {
    if (row.user.role === "MEMBER") {
      const tier = (row.user.membershipTier ?? "").trim().toLowerCase();
      if (tier === "bronze") return "bronze";
      if (tier === "silver") return "silver";
      if (tier === "gold") return "gold";
      if (tier === "platinum") return "platinum";
      if (tier === "students" || tier === "student") return "students";
      return "member_unassigned";
    }
    if (row.user.role === "NON_MEMBER") return "non_member";
    if (row.user.role === "WALK_IN") return "walk_in_student";
    return "walk_in_regular";
  };
  const salesFilterYears = useMemo(() => {
    const years = Array.from(new Set(records.map((row) => new Date(row.paidAt).getFullYear()))).sort((a, b) => b - a);
    return years.length > 0 ? years : [new Date().getFullYear()];
  }, [records]);
  const filteredSalesRecords = useMemo(() => {
    const today = new Date();
    const parseDate = (value: string) => {
      const d = new Date(value);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    };
    const rowDateOnly = (row: PaymentRow) => {
      const d = new Date(row.paidAt);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    };
    if (salesSpecificDate) {
      const selected = parseDate(salesSpecificDate);
      return records.filter((row) => rowDateOnly(row).getTime() === selected.getTime());
    }

    if (salesFilterPeriod === "TODAY") {
      const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      return records.filter((row) => rowDateOnly(row).getTime() === base.getTime());
    }

    if (salesFilterPeriod === "WEEKLY") {
      const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const day = todayOnly.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const start = new Date(todayOnly);
      start.setDate(start.getDate() + diffToMonday);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return records.filter((row) => {
        const d = rowDateOnly(row);
        return d >= start && d <= end;
      });
    }

    if (salesFilterPeriod === "MONTHLY") {
      const startMonth = Math.min(salesMonthFrom, salesMonthTo);
      const endMonth = Math.max(salesMonthFrom, salesMonthTo);
      return records.filter((row) => {
        const d = new Date(row.paidAt);
        return d.getFullYear() === salesFilterYear && d.getMonth() + 1 >= startMonth && d.getMonth() + 1 <= endMonth;
      });
    }

    return records.filter((row) => new Date(row.paidAt).getFullYear() === salesFilterYear);
  }, [records, salesSpecificDate, salesFilterPeriod, salesFilterYear, salesMonthFrom, salesMonthTo]);
  const roleSalesSummary = useMemo(
    () =>
      roleTabs.map((roleTab) => {
        const roleRows = filteredSalesRecords.filter((row) => row.user.role === roleTab.id);
        const total = roleRows.reduce((sum, row) => sum + getChartAmount(row), 0);
        return { ...roleTab, total, count: roleRows.length };
      }),
    [filteredSalesRecords],
  );
  const totalSales = useMemo(() => roleSalesSummary.reduce((sum, role) => sum + role.total, 0), [roleSalesSummary]);
  const totalCount = useMemo(() => roleSalesSummary.reduce((sum, role) => sum + role.count, 0), [roleSalesSummary]);
  const combinedIntake = useMemo(() => totalSales + coachRemittanceSummary.total, [totalSales, coachRemittanceSummary.total]);

  useEffect(() => {
    let cancelled = false;
    const { start, end } = getSalesFilterPaidAtRange({
      salesSpecificDate,
      salesFilterPeriod,
      salesFilterYear,
      salesMonthFrom,
      salesMonthTo,
    });
    setCoachRemittanceLoading(true);
    void (async () => {
      const res = await fetch(
        `/api/coaches/remittances?fields=summary&paidAfter=${encodeURIComponent(start.toISOString())}&paidBefore=${encodeURIComponent(end.toISOString())}`,
      );
      const json = (await res.json()) as {
        success?: boolean;
        summary?: { count?: number; totalAmount?: string };
      };
      if (cancelled) return;
      setCoachRemittanceLoading(false);
      if (json.success && json.summary) {
        setCoachRemittanceSummary({
          total: Number(json.summary.totalAmount ?? 0),
          count: Number(json.summary.count ?? 0),
        });
      } else {
        setCoachRemittanceSummary({ total: 0, count: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [salesSpecificDate, salesFilterPeriod, salesFilterYear, salesMonthFrom, salesMonthTo]);
  const trendMonths = useMemo(() => {
    if (salesSpecificDate) {
      const d = new Date(salesSpecificDate);
      return [{ key: d.toISOString().slice(0, 10), label: d.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric" }) }];
    }
    if (salesFilterPeriod === "TODAY") {
      const now = new Date();
      return [{ key: now.toISOString().slice(0, 10), label: "Today" }];
    }
    if (salesFilterPeriod === "WEEKLY") {
      const now = new Date();
      const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day = todayOnly.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const start = new Date(todayOnly);
      start.setDate(start.getDate() + diffToMonday);
      return Array.from({ length: 7 }, (_, idx) => {
        const d = new Date(start);
        d.setDate(start.getDate() + idx);
        return { key: d.toISOString().slice(0, 10), label: d.toLocaleString("en-US", { month: "short", day: "2-digit" }) };
      });
    }
    if (salesFilterPeriod === "MONTHLY") {
      const startMonth = Math.min(salesMonthFrom, salesMonthTo);
      const endMonth = Math.max(salesMonthFrom, salesMonthTo);
      return Array.from({ length: endMonth - startMonth + 1 }, (_, idx) => {
        const m = startMonth + idx;
        const d = new Date(salesFilterYear, m - 1, 1);
        return {
          key: `${salesFilterYear}-${String(m).padStart(2, "0")}`,
          label: d.toLocaleString("en-US", { month: "short", year: "numeric" }),
        };
      });
    }
    return Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      const d = new Date(salesFilterYear, idx, 1);
      return {
        key: `${salesFilterYear}-${String(m).padStart(2, "0")}`,
        label: d.toLocaleString("en-US", { month: "short", year: "numeric" }),
      };
    });
  }, [salesSpecificDate, salesFilterPeriod, salesFilterYear, salesMonthFrom, salesMonthTo]);
  const trendData = useMemo(() => {
    return trendMonths.map((month) => {
      const rows = filteredSalesRecords.filter((row) => {
        const d = new Date(row.paidAt);
        const key =
          salesSpecificDate || salesFilterPeriod === "TODAY" || salesFilterPeriod === "WEEKLY"
            ? d.toISOString().slice(0, 10)
            : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === month.key;
      });
      const totals = trendSeries.reduce<Record<TrendSeriesKey, number>>((acc, series) => {
        acc[series.key] = 0;
        return acc;
      }, {} as Record<TrendSeriesKey, number>);
      for (const row of rows) {
        const key = getTrendSeriesKey(row);
        totals[key] += getChartAmount(row);
      }
      return { ...month, totals };
    });
  }, [filteredSalesRecords, trendMonths, salesSpecificDate, salesFilterPeriod]);
  const maxTrendValue = useMemo(
    () =>
      Math.max(
        ...trendData.flatMap((item) => trendSeries.map((series) => item.totals[series.key])),
        1,
      ),
    [trendData],
  );

  /** Keeps chart readable: no fixed 1180px canvas; columns grow with data density and viewport. */
  const trendChartLayout = useMemo(() => {
    const n = Math.max(trendData.length, 1);
    const slotMin = Math.max(40, Math.min(96, Math.floor(880 / n)));
    const gridMinWidth = 48 + n * slotMin + 24;
    return { n, slotMin, gridMinWidth };
  }, [trendData.length]);

  /** Per-tile quantity helpers — minimum 1, used as a multiplier for the gross when adding to cart. */
  const shouldAutoFillFromBalance = useCallback(
    (service: ServiceRow): boolean => {
      if (collectionStatus !== "FULLY_PAID") return false;
      if (service.name !== "Membership") return false;
      if (!selectedMember || selectedMemberBalance <= 0) return false;
      return (selectedMember.membershipTier ?? "").trim().toLowerCase() === service.tier.trim().toLowerCase();
    },
    [collectionStatus, selectedMember, selectedMemberBalance],
  );
  const unitPriceForService = (service: ServiceRow): number => {
    if (shouldAutoFillFromBalance(service)) {
      return selectedMemberBalance;
    }
    const def = getComputedAmount(service, clientRole) || String(Number(service.monthlyRate) || 0);
    const n = Number(def);
    return Number.isFinite(n) && n > 0 ? n : Number(service.monthlyRate) || 0;
  };
  const getServiceQty = (serviceId: string): number => {
    const v = quantityByService[serviceId];
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 1;
  };
  const setServiceQty = (service: ServiceRow, nextQty: number) => {
    if (service.name === "Membership") return;
    const qty = Math.max(1, Math.floor(Number.isFinite(nextQty) ? nextQty : 1));
    setQuantityByService((prev) => ({ ...prev, [service.id]: qty }));
    // If this tile is in the cart, sync its gross to qty * unit price.
    setCartLines((prev) => {
      const idx = prev.findIndex((line) => line.serviceId === service.id && !line.customAddOnLabel);
      if (idx < 0) return prev;
      const next = prev.slice();
      const current = next[idx];
      if (isMembershipNonBronze(service)) {
        const payMonthsRaw = Math.trunc(Number(current.paymentMonths));
        const paymentMonths =
          Number.isFinite(payMonthsRaw) && payMonthsRaw > 0 ? String(clampPayNowMonths(payMonthsRaw)) : String(qty);
        const grossStr = shouldAutoFillFromBalance(service)
          ? selectedMemberBalance.toFixed(2)
          : ((Number(service.monthlyRate) || 0) * Number(paymentMonths)).toFixed(2);
        next[idx] = { ...current, paymentMonths, grossStr };
        return next;
      }
      const unit = unitPriceForService(service);
      const grossStr = (unit * qty).toFixed(2);
      next[idx] = { ...current, grossStr };
      return next;
    });
  };
  const incServiceQty = (service: ServiceRow) => setServiceQty(service, getServiceQty(service.id) + 1);
  const decServiceQty = (service: ServiceRow) => setServiceQty(service, getServiceQty(service.id) - 1);

  const toggleServiceInCart = (service: ServiceRow) => {
    if (service.name.trim() === "Add-on" && service.tier.trim() === "Custom") return;
    setCartLines((prev) => {
      const idx = prev.findIndex((line) => line.serviceId === service.id && !line.customAddOnLabel);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      const unit = unitPriceForService(service);
      const qty = service.name === "Membership" ? 1 : getServiceQty(service.id);
      const grossStr = (unit * qty).toFixed(2);
      const nextLine: ServiceCartLine = {
        lineId: newCartLineId(),
        serviceId: service.id,
        grossStr,
      };
      if (isMembershipNonBronze(service)) {
        nextLine.paymentMonths = "1";
        nextLine.grossStr = shouldAutoFillFromBalance(service)
          ? selectedMemberBalance.toFixed(2)
          : (Number(service.monthlyRate) || 0).toFixed(2);
      }
      return [...prev, nextLine];
    });
  };

  useEffect(() => {
    if (collectionStatus !== "FULLY_PAID") return;
    if (!selectedMember || selectedMemberBalance <= 0) return;
    setCartLines((prev) =>
      prev.map((line) => {
        const svc = services.find((s) => s.id === line.serviceId);
        if (!svc || !shouldAutoFillFromBalance(svc)) return line;
        const rate = Number(svc.monthlyRate) || 0;
        const next: ServiceCartLine = { ...line, grossStr: selectedMemberBalance.toFixed(2) };
        if (isMembershipNonBronze(svc) && rate > 0) {
          const m = Math.max(
            1,
            Math.min(MAX_MEMBERSHIP_PAY_NOW_MONTHS, Math.round(selectedMemberBalance / rate) || 1),
          );
          next.paymentMonths = String(m);
        }
        return next;
      }),
    );
  }, [collectionStatus, selectedMember, selectedMemberBalance, services, shouldAutoFillFromBalance]);

  const appendCustomAddOnToCart = () => {
    if (!customAddOnService) {
      showNotice("error", "Add-on / Custom service is missing. Run prisma/sql/add_payment_custom_add_on_label.sql on the database.");
      return;
    }
    const label = customAddOnName.trim();
    const priceNum = Number(customAddOnPrice);
    if (!label) {
      showNotice("error", "Enter what the add-on is (name or short description).");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      showNotice("error", "Enter a valid price greater than zero.");
      return;
    }
    setCartLines((prev) => [
      ...prev,
      {
        lineId: newCartLineId(),
        serviceId: customAddOnService.id,
        grossStr: String(priceNum),
        customAddOnLabel: label.slice(0, 200),
        addOnDueDate: customAddOnDueDate.trim() || null,
      },
    ]);
    setCustomAddOnName("");
    setCustomAddOnPrice("");
    setCustomAddOnDueDate("");
    showNotice("success", "Add-on line added to cart.");
  };

  const peso = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(value);

  async function savePayment(skipDuplicateCheck = false) {
    setError("");
    setSuccess(null);
    if (!memberId || cartLines.length === 0) {
      setError("Choose a client, then add one or more services from the grid.");
      showNotice("error", "Choose a client and at least one service.");
      return;
    }
    const invalidCustomLine = cartLines.some((l) => {
      const cl = (l.customAddOnLabel ?? "").trim();
      if (!cl) return false;
      return !customAddOnService || l.serviceId !== customAddOnService.id;
    });
    if (invalidCustomLine) {
      setError("Custom add-on lines are invalid. Refresh the page or run the database script for Add-on / Custom.");
      showNotice("error", "Custom add-on setup is incomplete.");
      return;
    }
    const grossNums = cartLines.map((line) => Number(line.grossStr));
    if (grossNums.some((n) => !Number.isFinite(n) || n <= 0)) {
      setError("Each cart line needs a valid gross amount greater than zero.");
      showNotice("error", "Check amounts in the cart.");
      return;
    }
    if (discountKind === "PERCENT" && (discountValue < 0 || discountValue > 100)) {
      setError("Discount percent must be between 0 and 100.");
      showNotice("error", "Discount percent must be between 0 and 100.");
      return;
    }
    if (discountKind === "FIXED") {
      const fx = Number(discountFixed || 0);
      if (!Number.isFinite(fx) || fx <= 0) {
        setError("Enter a fixed discount amount greater than zero.");
        showNotice("error", "Invalid fixed discount.");
        return;
      }
      if (fx > grossAmountValue + 0.0001) {
        setError("Fixed discount cannot exceed combined gross.");
        showNotice("error", "Fixed discount too large.");
        return;
      }
    }
    if (discountAmountValue > 0 && !discountReason.trim()) {
      setError("Please enter a discount reason when applying a discount.");
      showNotice("error", "Discount reason is required.");
      return;
    }

    const grossCents = grossNums.map((n) => Math.round(n * 100));
    const discCentsPerLine =
      discountKind === "NONE"
        ? grossCents.map(() => 0)
        : discountKind === "PERCENT"
          ? grossCents.map((g) => Math.round((g * discountValue) / 100))
          : allocateFixedDiscountCents(grossCents, Math.round(discountAmountValue * 100));
    const finalNums = grossCents.map((g, i) => (g - discCentsPerLine[i]) / 100);
    const combinedFinal = finalNums.reduce((a, b) => a + b, 0);
    if (combinedFinal <= 0) {
      setError("Final amount must be greater than zero.");
      showNotice("error", "Final amount must be greater than zero.");
      return;
    }
    if (enableSplit && cartLines.length > 1) {
      setError("Split payment works for one cart line only. Save as separate payments or clear the cart to one item.");
      showNotice("error", "Split payment is not available with multiple services.");
      return;
    }
    if (enableSplit && Math.abs(splitTotal - combinedFinal) > 0.02) {
      setError("Split total must match combined amount after discount.");
      showNotice("error", "Split total must match final amount.");
      return;
    }

    let anyDuplicate = false;
    for (let i = 0; i < cartLines.length; i++) {
      const dupParams = new URLSearchParams({
        userId: memberId,
        serviceId: cartLines[i].serviceId,
        paymentMethod: enableSplit ? "SPLIT" : paymentMethod,
        amount: finalNums[i].toFixed(2),
        ...(paymentReference.trim() ? { paymentReference: paymentReference.trim() } : {}),
        ...(orNumber.trim() ? { orNumber: orNumber.trim() } : {}),
      });
      const duplicateRes = await fetch(`/api/payments/duplicate-check?${dupParams.toString()}`);
      const duplicateJson = (await duplicateRes.json()) as { success?: boolean; duplicate?: boolean };
      if (duplicateJson.success && duplicateJson.duplicate) anyDuplicate = true;
    }
    if (anyDuplicate && !skipDuplicateCheck) {
      setDuplicateSaveOpen(true);
      return;
    }

    const receiptGroupIdForBatch =
      cartLines.length > 1
        ? typeof globalThis !== "undefined" &&
            "crypto" in globalThis &&
            typeof (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID === "function"
          ? (globalThis as { crypto: { randomUUID: () => string } }).crypto.randomUUID()
          : `g-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
        : undefined;

    setSubmitting(true);
    let lastData: ConfirmResult | null = null;
    const savedPaymentIds: string[] = [];
    try {
      for (let i = 0; i < cartLines.length; i++) {
        const line = cartLines[i];
        const g = Number(line.grossStr);
        const dCents = discCentsPerLine[i];
        const final = (Math.round(g * 100) - dCents) / 100;
        const svc = services.find((s) => s.id === line.serviceId) ?? null;

        const customLabel = (line.customAddOnLabel ?? "").trim();
        const res = await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId,
            serviceId: line.serviceId,
            amount: final,
            grossAmount: g,
            discountType: discountKind,
            discountPercent: discountKind === "PERCENT" ? discountValue : 0,
            discountFixedAmount: discountKind === "FIXED" ? Number((dCents / 100).toFixed(2)) : 0,
            discountReason: discountReason.trim() || undefined,
            paymentMethod,
            collectionStatus,
            notes: cartLines.length > 1 ? `${notes ? `${notes} | ` : ""}Line ${i + 1}/${cartLines.length}` : notes,
            ...(customLabel
              ? {
                  transactionType: "ADD_ON" as const,
                  customAddOnLabel: customLabel,
                  ...((line.addOnDueDate ?? "").trim()
                    ? { addOnNextDueDate: (line.addOnDueDate ?? "").trim() }
                    : {}),
                }
                : {
                  transactionType:
                    svc?.name === "Membership" &&
                    (selectedMember?.role === "MEMBER" || svc?.tier.trim().toLowerCase() === "bronze")
                      ? "MONTHLY_FEE"
                      : undefined,
                  ...(isMembershipNonBronze(svc)
                    ? {
                        paymentMonths: Math.max(
                          1,
                          Math.min(
                            MAX_MEMBERSHIP_PAY_NOW_MONTHS,
                            Math.trunc(
                              Number(
                                line.paymentMonths ??
                                  getServiceQty(line.serviceId) ??
                                  1,
                              ) || 1,
                            ),
                          ),
                        ),
                      }
                    : {}),
                }),
            paymentReference: enableSplit ? undefined : paymentReference.trim() || undefined,
            orNumber: enableSplit ? undefined : orNumber.trim() || undefined,
            splits: enableSplit
              ? splits.map((row) => ({
                  method: row.method,
                  amount: Number(row.amount),
                  reference: row.reference.trim() || undefined,
                }))
              : [],
            ...(receiptGroupIdForBatch ? { receiptGroupId: receiptGroupIdForBatch } : {}),
          }),
        });
        const json = (await res.json()) as { success: boolean; data?: ConfirmResult; error?: string; details?: string };
        if (!json.success || !json.data) {
          setError(json.details || json.error || `Payment failed on line ${i + 1}.`);
          showNotice("error", json.details || json.error || "Payment failed.");
          return;
        }
        lastData = json.data;
        savedPaymentIds.push(json.data.payment.id);
      }
    } finally {
      setSubmitting(false);
    }
    if (lastData) {
      setSuccess(lastData);
      showNotice("success", cartLines.length > 1 ? `${cartLines.length} payments saved.` : "Payment saved successfully.");
      await load();
      if (savedPaymentIds.length > 1) {
        openMergedReceipt(savedPaymentIds);
      } else if (savedPaymentIds.length === 1) {
        openReceipt(savedPaymentIds[0]);
      }
      setCartLines([]);
      setCustomAddOnName("");
      setCustomAddOnPrice("");
      setCustomAddOnDueDate("");
      setOrNumber("");
    }
  }

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
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="surface-card space-y-4 p-3 sm:p-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Record a payment</h1>
          <p className="text-sm text-slate-600">
            Save updates the member&apos;s record and opens a receipt you can print or share.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="relative space-y-1.5" ref={memberSearchWrapRef}>
            <label className="text-xs font-medium text-slate-600" htmlFor="payment-client-search">
              Client <span className="font-normal text-slate-400">(members, non-members, walk-ins — one list)</span>
            </label>
            <Input
              id="payment-client-search"
              value={clientSearch}
              onChange={(e) => {
                const value = e.target.value;
                setClientSearch(value);
                setMemberSuggestOpen(true);
                if (selectedMember && `${selectedMember.firstName} ${selectedMember.lastName}` !== value) {
                  setMemberId("");
                }
              }}
              onFocus={() => setMemberSuggestOpen(true)}
              placeholder="Start typing — pick a row below (same names stay separate)"
              autoComplete="off"
            />
            {memberSuggestOpen && clientSearch.trim() && filteredMembers.length > 0 ? (
              <ul
                className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                role="listbox"
              >
                {filteredMembers.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => {
                        setMemberId(member.id);
                        setClientSearch(`${member.firstName} ${member.lastName}`);
                        setMemberSuggestOpen(false);
                      }}
                    >
                      <span className="font-medium text-slate-900">
                        {member.firstName} {member.lastName}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        ID {member.id.slice(0, 8)}…
                        {member.membershipTier ? ` · ${member.membershipTier}` : ""}
                        {member.coachName ? ` · Coach: ${member.coachName}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {memberId && selectedMember ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-medium text-emerald-900">
                Selected: {selectedMember.firstName} {selectedMember.lastName}{" "}
                <span className="font-normal text-emerald-800">({selectedMember.id.slice(0, 8)}…)</span>
              </p>
            ) : clientSearch.trim() ? (
              <p className="text-[11px] text-amber-800">
                {filteredMembers.length === 0
                  ? "No match — try another spelling, or search by add-on name (e.g. locker)."
                  : memberSuggestOpen
                    ? "Tap a row above — each person is listed by ID so duplicate names never merge."
                    : `${filteredMembers.length} match(es) — focus the field to open the list.`}
              </p>
            ) : (
              <p className="text-[11px] text-slate-500">Tip: you can search by add-on name to find who has that extra.</p>
            )}
            {selectedMember?.role === "MEMBER" && selectedMember ? (
              <div className="space-y-0.5 rounded-md border border-amber-100 bg-amber-50/80 px-2 py-1.5 text-[11px] text-amber-900">
                <p>
                  Legacy contract balance on file:{" "}
                  <span className="font-semibold">{peso(selectedMemberBalance)}</span>
                  {selectedMemberBalance <= 0 ? " (none)" : ""}
                  <span className="font-normal"> — new membership payments use monthly tier rate only.</span>
                </p>
                <p>Membership tier on file: {selectedMember.membershipTier ?? "Not set"}</p>
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Coach (optional)</label>
            <select
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
              value={coachName}
              disabled={!selectedMember}
              onChange={async (e) => {
                const nextCoach = e.target.value;
                setCoachName(nextCoach);
                if (!selectedMember) return;
                await fetch(`/api/users/${selectedMember.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ coachName: nextCoach || null }),
                });
                await load();
              }}
            >
              <option value="">No coach assigned</option>
              {coaches.map((coach) => (
                <option key={coach.id} value={coach.name}>
                  {coach.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              {selectedMember ? "Saves as soon as you pick a coach." : "Choose a client first, then you can assign their coach."}
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">2. Service &amp; money</p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <label className="text-xs font-medium text-slate-600">Products &amp; services (tap to add / remove)</label>
              {cartLines.length > 0 ? (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-red-700 underline"
                  onClick={() => {
                    setCartLines([]);
                    setCustomAddOnName("");
                    setCustomAddOnPrice("");
                  }}
                >
                  Clear cart
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              {servicesForProductGrid.map((service) => {
                const inCart = cartLines.some(
                  (line) => line.serviceId === service.id && !(line.customAddOnLabel ?? "").trim(),
                );
                const label =
                  service.contractMonths === 0 && service.name !== "Membership"
                    ? `${service.name} (No Contract)`
                    : `${service.name} · ${service.tier}`;
                const price = unitPriceForService(service);
                const initial = (service.name || "?").slice(0, 1).toUpperCase();
                const qty = getServiceQty(service.id);
                return (
                  <div
                    key={service.id}
                    className={`flex w-full min-w-0 flex-col rounded-lg border bg-white shadow-sm transition ${
                      inCart
                        ? "border-[#1e3a5f] ring-1 ring-[#1e3a5f]/30"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleServiceInCart(service)}
                      className="flex w-full min-w-0 items-center gap-2 px-2.5 pt-2 pb-1.5 text-left focus:outline-none focus-visible:bg-slate-50"
                      title={inCart ? "Remove from cart" : "Add to cart"}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-600">
                        {initial}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold leading-tight text-slate-800">{label}</span>
                        <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">{peso(price)}</span>
                      </span>
                      {inCart ? (
                        <span className="shrink-0 rounded bg-[#1e3a5f] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                          In cart
                        </span>
                      ) : null}
                    </button>
                    {service.name !== "Membership" ? (
                      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-2.5 py-1.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Qty</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => decServiceQty(service)}
                            disabled={qty <= 1}
                            aria-label={`Decrease quantity for ${label}`}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold leading-none text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            −
                          </button>
                          <span
                            aria-label={`Quantity for ${label}`}
                            className="min-w-[1.5rem] text-center text-xs font-semibold tabular-nums text-slate-800"
                          >
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => incServiceQty(service)}
                            aria-label={`Increase quantity for ${label}`}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold leading-none text-slate-700 transition hover:bg-slate-50"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 space-y-2">
              <label className="inline-flex cursor-pointer items-start gap-2 text-xs font-medium text-slate-800">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  checked={customAddOnPanelOpen}
                  onChange={(e) => setCustomAddOnPanelOpen(e.target.checked)}
                />
                <span>
                  Add-on sale (locker, Wi‑Fi, towel rental, etc.) — name it, set the price, and optionally set next due /
                  expiration. Counts as <span className="font-semibold text-slate-900">add-on revenue</span> in reports and
                  updates the Add-ons list for this member. Use tiles above for membership and other catalog items.
                </span>
              </label>
              {customAddOnPanelOpen ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600">What it is</label>
                    <Input
                      value={customAddOnName}
                      onChange={(e) => setCustomAddOnName(e.target.value)}
                      placeholder="e.g. Locker monthly, Wi‑Fi pass, towel pack"
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600">Price (₱)</label>
                    <Input
                      inputMode="decimal"
                      value={customAddOnPrice}
                      onChange={(e) => setCustomAddOnPrice(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600">Next due / expires (optional)</label>
                    <Input
                      type="date"
                      value={customAddOnDueDate}
                      onChange={(e) => setCustomAddOnDueDate(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <Button type="button" className="h-10 shrink-0" onClick={appendCustomAddOnToCart}>
                    Add to cart
                  </Button>
                </div>
              ) : null}
              {!customAddOnService && customAddOnPanelOpen ? (
                <p className="text-[11px] text-amber-800">
                  Catalog row missing: run{" "}
                  <code className="rounded bg-amber-100 px-1">prisma/sql/add_payment_custom_add_on_label.sql</code> on your
                  database, then reload services.
                </p>
              ) : null}
            </div>
            {cartLines.length > 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="mb-2 text-[11px] font-semibold text-slate-700">Cart — gross before discount (per line)</p>
                <div className="space-y-2">
                  {cartLines.map((line) => {
                    const customLbl = (line.customAddOnLabel ?? "").trim();
                    const svc = services.find((s) => s.id === line.serviceId);
                    const showPayNowMonths = Boolean(svc && isMembershipNonBronze(svc));
                    const title = customLbl
                      ? `Add-on: ${customLbl}`
                      : svc
                        ? svc.contractMonths === 0 && svc.name !== "Membership"
                          ? `${svc.name} (No Contract)`
                          : `${svc.name} — ${svc.tier}`
                        : line.serviceId;
                    return (
                      <div key={line.lineId} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                        <p className="min-w-0 flex-1 text-xs font-medium text-slate-800">{title}</p>
                        <Input
                          className="h-9 w-28"
                          inputMode="decimal"
                          value={line.grossStr}
                          onChange={(e) =>
                            setCartLines((prev) =>
                              prev.map((l) => (l.lineId === line.lineId ? { ...l, grossStr: e.target.value } : l)),
                            )
                          }
                        />
                        {showPayNowMonths && svc ? (
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] font-medium text-slate-500">
                              Pay now (months){" "}
                              <span className="font-normal text-slate-400">(1–{MAX_MEMBERSHIP_PAY_NOW_MONTHS})</span>
                            </label>
                            <div className="flex h-9 items-center gap-1">
                              <button
                                type="button"
                                aria-label="Decrease pay now months"
                                disabled={clampPayNowMonths(line.paymentMonths ?? 1) <= 1}
                                className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-base font-semibold leading-none text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                onClick={() => {
                                  const cur = clampPayNowMonths(line.paymentMonths ?? 1);
                                  const months = Math.max(1, cur - 1);
                                  const monthlyRate = Number(svc.monthlyRate) || 0;
                                  const nextGross = shouldAutoFillFromBalance(svc)
                                    ? selectedMemberBalance.toFixed(2)
                                    : (monthlyRate * months).toFixed(2);
                                  setCartLines((prev) =>
                                    prev.map((l) =>
                                      l.lineId === line.lineId
                                        ? { ...l, paymentMonths: String(months), grossStr: nextGross }
                                        : l,
                                    ),
                                  );
                                }}
                              >
                                −
                              </button>
                              <Input
                                className="h-9 w-14 min-w-[3.5rem] shrink-0 text-center tabular-nums"
                                inputMode="numeric"
                                value={line.paymentMonths ?? "1"}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^\d]/g, "");
                                  const months = clampPayNowMonths(raw || 1);
                                  const monthlyRate = Number(svc.monthlyRate) || 0;
                                  const nextGross = shouldAutoFillFromBalance(svc)
                                    ? selectedMemberBalance.toFixed(2)
                                    : (monthlyRate * months).toFixed(2);
                                  setCartLines((prev) =>
                                    prev.map((l) =>
                                      l.lineId === line.lineId
                                        ? { ...l, paymentMonths: String(months), grossStr: nextGross }
                                        : l,
                                    ),
                                  );
                                }}
                              />
                              <button
                                type="button"
                                aria-label="Increase pay now months"
                                disabled={
                                  clampPayNowMonths(line.paymentMonths ?? 1) >=
                                  MAX_MEMBERSHIP_PAY_NOW_MONTHS
                                }
                                className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-base font-semibold leading-none text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                onClick={() => {
                                  const cur = clampPayNowMonths(line.paymentMonths ?? 1);
                                  const months = Math.min(MAX_MEMBERSHIP_PAY_NOW_MONTHS, cur + 1);
                                  const monthlyRate = Number(svc.monthlyRate) || 0;
                                  const nextGross = shouldAutoFillFromBalance(svc)
                                    ? selectedMemberBalance.toFixed(2)
                                    : (monthlyRate * months).toFixed(2);
                                  setCartLines((prev) =>
                                    prev.map((l) =>
                                      l.lineId === line.lineId
                                        ? { ...l, paymentMonths: String(months), grossStr: nextGross }
                                        : l,
                                    ),
                                  );
                                }}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {customLbl ? (
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[10px] font-medium text-slate-500">Next due / expires</label>
                            <Input
                              type="date"
                              className="h-9 w-[11.5rem]"
                              value={line.addOnDueDate ?? ""}
                              onChange={(e) =>
                                setCartLines((prev) =>
                                  prev.map((l) =>
                                    l.lineId === line.lineId ? { ...l, addOnDueDate: e.target.value || null } : l,
                                  ),
                                )
                              }
                            />
                          </div>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 border-red-200 text-xs text-red-700"
                          onClick={() => setCartLines((prev) => prev.filter((l) => l.lineId !== line.lineId))}
                        >
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-800">Combined gross: {peso(grossAmountValue)}</p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">
                Select tiles above (each catalog line once) or add add-on lines here. Multiple add-on lines are allowed with
                different names; all post under add-ons for analytics and exports.
              </p>
            )}
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-medium text-slate-600">Discount</label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
                value={discountKind}
                onChange={(e) => setDiscountKind(e.target.value as "NONE" | "PERCENT" | "FIXED")}
              >
                <option value="NONE">No discount</option>
                <option value="PERCENT">Percent</option>
                <option value="FIXED">Fixed amount (₱)</option>
              </select>
              {discountKind === "PERCENT" ? (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="0–100"
                />
              ) : discountKind === "FIXED" ? (
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={discountFixed}
                  onChange={(e) => setDiscountFixed(e.target.value)}
                  placeholder="Fixed off gross"
                />
              ) : (
                <p className="flex items-center text-[11px] text-slate-500">No discount applied.</p>
              )}
              <Input
                className="sm:col-span-2 lg:col-span-2"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="Discount reason (required when discount is applied)"
              />
            </div>
            <p className="text-[11px] text-slate-600">
              Subtotal {peso(grossAmountValue)} − discount {peso(discountAmountValue)} ={" "}
              <span className="font-semibold text-slate-900">customer pays {peso(finalAmountValue)}</span>
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Payment method</label>
            <select
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
              value={paymentMethod}
              onChange={(e) => {
                const next = e.target.value;
                setPaymentMethod(next);
                if (!methodMayHaveReference(next)) setPaymentReference("");
              }}
              disabled={enableSplit}
            >
              {methodOptions.map((method) => (
                <option key={method} value={method}>
                  {paymentMethodOptionLabel(method)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Collection status</label>
            <select
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
              value={collectionStatus}
              onChange={(e) => setCollectionStatus(e.target.value as "FULLY_PAID" | "PARTIAL")}
            >
              <option value="FULLY_PAID">Fully Paid</option>
              <option value="PARTIAL">Partial</option>
            </select>
            <p className="text-[11px] text-slate-500">
              Use Partial when only part of the expected amount is collected now.
            </p>
          </div>
          {!enableSplit && methodMayHaveReference(paymentMethod) ? (
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-slate-600">Online payment reference</label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Txn ID / ref # (optional)"
                className="font-mono text-xs"
                autoComplete="off"
              />
              <p className="text-[11px] text-slate-500">Stored for GCash, Maya, bank, or card traceability.</p>
            </div>
          ) : null}
          {!enableSplit ? (
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-slate-600">OR number</label>
              <Input
                value={orNumber}
                onChange={(e) => setOrNumber(e.target.value)}
                placeholder="Official receipt # (optional)"
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={enableSplit}
              disabled={cartLines.length > 1}
              onChange={(e) => {
                const checked = e.target.checked;
                setEnableSplit(checked);
                if (checked) {
                  setPaymentReference("");
                  setOrNumber("");
                }
              }}
              className="h-4 w-4 rounded border-slate-300 disabled:opacity-50"
            />
            Enable split payment
          </label>
          {cartLines.length > 1 ? (
            <p className="text-[11px] text-slate-500">Turn off multi-item cart or save one service to use split payments.</p>
          ) : null}
          {enableSplit ? (
            <div className="mt-3 space-y-2">
              {splits.map((row, idx) => (
                <div key={`${idx}-${row.method}`} className="grid gap-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
                  <select
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
                    value={row.method}
                    onChange={(e) => {
                      const nextMethod = e.target.value;
                      setSplits((prev) =>
                        prev.map((split, splitIdx) =>
                          splitIdx === idx
                            ? {
                                ...split,
                                method: nextMethod,
                                reference: methodMayHaveReference(nextMethod) ? split.reference : "",
                              }
                            : split,
                        ),
                      );
                    }}
                  >
                    {methodOptions.map((method) => (
                      <option key={method} value={method}>
                        {paymentMethodOptionLabel(method)}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Amount"
                    value={row.amount}
                    onChange={(e) =>
                      setSplits((prev) => prev.map((split, splitIdx) => (splitIdx === idx ? { ...split, amount: e.target.value } : split)))
                    }
                  />
                  <div className="space-y-0.5">
                    {methodMayHaveReference(row.method) ? (
                      <>
                        <Input
                          placeholder="Ref # (optional)"
                          value={row.reference}
                          onChange={(e) =>
                            setSplits((prev) =>
                              prev.map((split, splitIdx) =>
                                splitIdx === idx ? { ...split, reference: e.target.value } : split,
                              ),
                            )
                          }
                          className="font-mono text-xs"
                          autoComplete="off"
                        />
                      </>
                    ) : (
                      <div className="flex h-10 items-center rounded-md border border-transparent px-2 text-[11px] text-slate-400">
                        No ref (cash/other)
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    className="border-slate-300 hover:bg-slate-100"
                    onClick={() => setSplits((prev) => prev.filter((_, splitIdx) => splitIdx !== idx))}
                    disabled={splits.length <= 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  variant="outline"
                  className="border-slate-300 hover:bg-slate-100"
                  onClick={() => setSplits((prev) => [...prev, { method: "CASH", amount: "", reference: "" }])}
                >
                  Add Split Row
                </Button>
                <span className="text-xs font-medium text-slate-600">
                  Split total: {splitTotal.toFixed(2)} / Final due: {finalAmountValue.toFixed(2)}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3">
          <label className="text-xs font-medium text-slate-600">Internal notes (optional)</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything staff should remember — not printed on receipt" />
        </div>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          className="w-full bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
          disabled={submitting}
          onClick={() => void savePayment(false)}
        >
          {submitting ? "Saving…" : "Save payment"}
        </Button>
        </Card>

        <Card className="surface-card flex flex-col overflow-hidden border-slate-200/90 p-0 shadow-sm ring-1 ring-slate-200/60 xl:sticky xl:top-20 xl:max-h-[calc(100vh-5.5rem)] xl:self-start xl:overflow-y-auto">
          <div className="relative overflow-hidden border-b border-slate-800/20 bg-gradient-to-br from-[#1e3a5f] via-[#234a72] to-[#1a3254] px-4 py-3.5 sm:px-5">
            <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute -bottom-10 -left-4 h-28 w-28 rounded-full bg-sky-400/10" />
            <div className="relative flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white shadow-inner ring-1 ring-white/20">
                <ClipboardList className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold tracking-tight text-white">Charge summary</h2>
                <p className="mt-0.5 text-xs leading-snug text-sky-100/90">
                  Live cart and totals before save. After save, the latest member snapshot appears below.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
            {cartLines.length > 0 ? (
              <section className="space-y-3" aria-label="Cart preview">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current cart</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {cartLines.length} line{cartLines.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="space-y-2">
                  {cartLines.map((line) => {
                    const customLbl = (line.customAddOnLabel ?? "").trim();
                    const svc = services.find((s) => s.id === line.serviceId);
                    const title = customLbl
                      ? `Add-on: ${customLbl}`
                      : svc
                        ? svc.contractMonths === 0 && svc.name !== "Membership"
                          ? `${svc.name} (No Contract)`
                          : `${svc.name} — ${svc.tier}`
                        : line.serviceId;
                    const gross = Number(line.grossStr) || 0;
                    return (
                      <li
                        key={line.lineId}
                        className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-3 shadow-sm"
                      >
                        <p className="text-sm font-semibold leading-snug text-slate-900">{title}</p>
                        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-2">
                          <span className="text-[11px] font-medium text-slate-500">Gross</span>
                          <span className="text-sm font-bold tabular-nums text-[#1e3a5f]">{peso(gross)}</span>
                        </div>
                        {customLbl && (line.addOnDueDate ?? "").trim() ? (
                          <p className="mt-1.5 text-[11px] text-slate-600">
                            Next due:{" "}
                            <span className="font-medium text-slate-800">
                              {new Date((line.addOnDueDate ?? "") + "T12:00:00").toLocaleDateString()}
                            </span>
                          </p>
                        ) : null}
                        {svc && svc.name === "Membership" ? (
                          <p className="mt-1 text-[11px] text-slate-500">
                            Per month {peso(Number(svc.monthlyRate) || 0)}
                            {isMembershipNonBronze(svc)
                                ? ` · Pay now ${Math.max(1, Math.min(MAX_MEMBERSHIP_PAY_NOW_MONTHS, Number(line.paymentMonths ?? 1) || 1))} mo · Lock-in ${Math.max(0, Number(svc.contractMonths) || 0)} mo`
                                : svc.contractMonths > 1
                                  ? ` · Lock-in ${svc.contractMonths} mo (set under Services)`
                                  : svc.contractMonths === 1
                                    ? " · Lock-in 1 mo (set under Services)"
                                    : " · No lock-in"}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-xs text-slate-800">
                  <div className="flex justify-between gap-2 py-0.5">
                    <span className="text-slate-600">Subtotal (gross)</span>
                    <span className="font-semibold tabular-nums">{peso(grossAmountValue)}</span>
                  </div>
                  {discountAmountValue > 0 ? (
                    <div className="flex justify-between gap-2 py-0.5 text-amber-900">
                      <span>Discount</span>
                      <span className="font-semibold tabular-nums">−{peso(discountAmountValue)}</span>
                    </div>
                  ) : null}
                  <div className="mt-2 flex justify-between gap-2 border-t border-slate-200/80 pt-2 text-sm">
                    <span className="font-semibold text-slate-700">Customer pays</span>
                    <span className="font-bold tabular-nums text-[#1e3a5f]">{peso(finalAmountValue)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                      {enableSplit ? "Split" : paymentMethodOptionLabel(paymentMethod)}
                    </span>
                    {enableSplit ? (
                      <span className="text-[10px] text-slate-500">Split rows must match final amount on the left.</span>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            {success ? (
              <section
                className="space-y-3 rounded-xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50/95 to-white p-4 shadow-sm ring-1 ring-emerald-100/80"
                aria-label="Last saved payment"
              >
                <div className="flex items-center gap-2 text-emerald-900">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Saved successfully</p>
                    <p className="text-xs text-emerald-800/90">
                      {success.updatedMember.firstName} {success.updatedMember.lastName}
                    </p>
                  </div>
                </div>
                {selectedMember?.role !== "MEMBER" ? (
                  <p className="text-xs text-emerald-900/90">Recorded for this customer type.</p>
                ) : (
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white/90 px-2.5 py-2 ring-1 ring-emerald-100">
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/85">Tier</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">{success.updatedMember.membershipTier ?? "—"}</dd>
                    </div>
                    <div className="rounded-lg bg-white/90 px-2.5 py-2 ring-1 ring-emerald-100">
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/85">Status</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">{success.updatedMember.membershipStatus ?? "—"}</dd>
                    </div>
                    <div className="rounded-lg bg-white/90 px-2.5 py-2 ring-1 ring-emerald-100">
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/85">Days left</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">{success.updatedMember.daysLeft ?? "—"}</dd>
                    </div>
                    <div className="rounded-lg bg-white/90 px-2.5 py-2 ring-1 ring-emerald-100">
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/85">Monthly thru</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {success.updatedMember.monthlyExpiryDate
                          ? new Date(success.updatedMember.monthlyExpiryDate).toLocaleDateString()
                          : "—"}
                      </dd>
                    </div>
                    <div className="col-span-2 rounded-lg bg-white/90 px-2.5 py-2 ring-1 ring-emerald-100">
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/85">Lock-in progress</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {(() => {
                          const tierKey = (success.updatedMember.membershipTier ?? "").trim().toLowerCase();
                          const tierService = services.find(
                            (s) => s.name === "Membership" && s.tier.trim().toLowerCase() === tierKey,
                          );
                          const template = Math.max(0, Math.trunc(Number(tierService?.contractMonths ?? 0) || 0));
                          const paidFromHistory =
                            success.updatedMember.lockInPaidMonths == null
                              ? null
                              : Math.max(
                                  0,
                                  Math.min(template, Math.trunc(Number(success.updatedMember.lockInPaidMonths) || 0)),
                                );
                          const left = Math.max(
                            0,
                            Math.min(template, Math.trunc(Number(success.updatedMember.remainingMonths ?? template) || 0)),
                          );
                          const paid = paidFromHistory ?? Math.max(0, template - left);
                          if (template <= 0) return success.updatedMember.lockInLabel ?? "No lock-in";
                          return `${paid}/${template} mo paid`;
                        })()}
                      </dd>
                      {success.updatedMember.lockInLabel ? (
                        <p className="mt-1 text-[10px] text-slate-500">Raw label: {success.updatedMember.lockInLabel}</p>
                      ) : null}
                      {success.updatedMember.monthlyFeeLabel ? (
                        <p className="mt-1 text-[10px] text-slate-500">Tier monthly rate label: {success.updatedMember.monthlyFeeLabel}</p>
                      ) : null}
                    </div>
                    {Number(success.updatedMember.remainingBalance ?? 0) > 0 ||
                    (success.updatedMember.monthsPaid ?? 0) > 0 ||
                    (success.updatedMember.remainingMonths ?? 0) > 0 ? (
                      <>
                        <div className="col-span-2 rounded-lg border border-amber-200/80 bg-amber-50/90 px-2.5 py-2 ring-1 ring-amber-100">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/90">
                            Legacy contract fields (old contract payments)
                          </p>
                          <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11px] text-amber-950">
                            <div>
                              <span className="text-amber-800/90">Months paid</span>
                              <p className="font-semibold tabular-nums">{success.updatedMember.monthsPaid}</p>
                            </div>
                            <div>
                              <span className="text-amber-800/90">Remaining mo.</span>
                              <p className="font-semibold tabular-nums">{success.updatedMember.remainingMonths ?? "—"}</p>
                            </div>
                            <div>
                              <span className="text-amber-800/90">Balance</span>
                              <p className="font-semibold tabular-nums">
                                ₱{Number(success.updatedMember.remainingBalance ?? 0).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}
                    <div className="col-span-2 rounded-lg bg-emerald-600/10 px-2.5 py-2 ring-1 ring-emerald-200/60">
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/90">Loyalty points</dt>
                      <dd className="mt-0.5 text-base font-bold tabular-nums text-emerald-950">{success.updatedMember.loyaltyStars}</dd>
                    </div>
                  </dl>
                )}
              </section>
            ) : null}

            {cartLines.length === 0 && !success ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
                <Receipt className="mb-3 h-11 w-11 text-slate-300" strokeWidth={1.25} aria-hidden />
                <p className="text-sm font-medium text-slate-700">Nothing in this summary yet</p>
                <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-slate-500">
                  Pick a client and add lines on the left — cart, totals, and method will mirror here before you tap{" "}
                  <span className="font-medium text-slate-700">Save payment</span>.
                </p>
              </div>
            ) : null}

            <p className="mt-auto flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <span>
                After save, one tab opens: a <span className="font-medium text-slate-800">combined receipt</span> for multi-line
                carts, or a single receipt for one line.
              </span>
            </p>
          </div>
        </Card>
      </div>

      <Card className="surface-card min-w-0 p-3 sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">Payment analytics &amp; records</h2>
        <p className="mb-4 text-xs text-slate-600">
          Totals and charts follow the period you pick. Month dropdowns only apply to <span className="font-medium text-slate-800">Monthly</span>{" "}
          — they are hidden for Today/Weekly so nothing looks &quot;broken&quot; or greyed out.
        </p>
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <p className="mb-2 text-sm font-semibold text-slate-800">Time period</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {(["TODAY", "WEEKLY", "MONTHLY", "ANNUALLY"] as SalesFilterPeriod[]).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setSalesFilterPeriod(period)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  salesFilterPeriod === period
                    ? "bg-emerald-600 text-white shadow"
                    : "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-100"
                }`}
              >
                {period === "TODAY" ? "Today" : period === "WEEKLY" ? "Weekly" : period === "MONTHLY" ? "Monthly" : "Annually"}
              </button>
            ))}
          </div>
          {!salesSpecificDate ? (
            <p className="mb-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700">
              {salesFilterPeriod === "TODAY"
                ? "Showing payments with today’s date only. Year and months are not used — switch to Monthly if you need a month range."
                : salesFilterPeriod === "WEEKLY"
                  ? "Showing this calendar week (Mon–Sun). Year and months are not used — switch to Monthly for custom months."
                  : salesFilterPeriod === "MONTHLY"
                    ? "Showing payments in the year below, between Start month and End month (inclusive)."
                    : "Showing the full calendar year below (January through December). Use Monthly if you only want part of the year."}
            </p>
          ) : (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              Specific date is set — it overrides Today / Weekly / Monthly / Year until you clear it.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-700">Calendar year</label>
              <select
                className="h-10 w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-1"
                value={salesFilterYear}
                onChange={(e) => setSalesFilterYear(Number(e.target.value))}
              >
                {salesFilterYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                {salesFilterPeriod === "TODAY" || salesFilterPeriod === "WEEKLY"
                  ? "Ignored while Today or Weekly is selected (unless you use a specific date)."
                  : salesFilterPeriod === "MONTHLY"
                    ? "Only payments in this year are included."
                    : "Full Jan–Dec for this year."}
              </p>
            </div>
            {salesFilterPeriod === "MONTHLY" ? (
              <>
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700">Start month</label>
                  <select
                    className="h-10 w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-1"
                    value={salesMonthFrom}
                    onChange={(e) => setSalesMonthFrom(Number(e.target.value))}
                  >
                    {monthOptions.map((month) => (
                      <option key={`from-${month.value}`} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700">End month</label>
                  <select
                    className="h-10 w-full cursor-pointer rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-1"
                    value={salesMonthTo}
                    onChange={(e) => setSalesMonthTo(Number(e.target.value))}
                  >
                    {monthOptions.map((month) => (
                      <option key={`to-${month.value}`} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <div className="flex min-h-[2.5rem] items-center sm:col-span-2 lg:col-span-4">
                <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-600">
                  <span className="font-medium text-slate-700">Start / End month</span> — choose{" "}
                  <button
                    type="button"
                    className="font-semibold text-sky-700 underline decoration-sky-400 underline-offset-2 hover:text-sky-900"
                    onClick={() => setSalesFilterPeriod("MONTHLY")}
                  >
                    Monthly
                  </button>{" "}
                  to enable these filters.
                </p>
              </div>
            )}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-700">Specific date (optional)</label>
              <Input
                type="date"
                value={salesSpecificDate}
                onChange={(e) => setSalesSpecificDate(e.target.value)}
                className="h-10 cursor-pointer font-medium text-slate-900"
              />
              <p className="mt-1 text-[11px] text-slate-500">When filled, only this day is shown (overrides period buttons).</p>
            </div>
            <div className="flex lg:col-span-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full border-slate-300 bg-white font-medium text-slate-800 hover:bg-slate-100 sm:w-auto"
                onClick={() => {
                  const now = new Date();
                  setSalesFilterPeriod("ANNUALLY");
                  setSalesFilterYear(now.getFullYear());
                  setSalesMonthFrom(1);
                  setSalesMonthTo(12);
                  setSalesSpecificDate("");
                }}
              >
                Reset filters
              </Button>
            </div>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {roleSalesSummary.map((role) => (
            <div
              key={role.id}
              className={`rounded-xl border p-3 ${
                role.id === "MEMBER"
                  ? "border-emerald-200 bg-emerald-50"
                  : role.id === "NON_MEMBER"
                    ? "border-blue-200 bg-blue-50"
                    : role.id === "WALK_IN"
                      ? "border-amber-200 bg-amber-50"
                      : "border-violet-200 bg-violet-50"
              }`}
            >
              <p className="text-xs font-semibold text-slate-700">{role.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{peso(role.total)}</p>
              <p className="mt-1 text-xs text-slate-600">Count: {role.count}</p>
            </div>
          ))}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">Customer payments</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{peso(totalSales)}</p>
            <p className="mt-1 text-xs text-slate-600">Transactions: {totalCount}</p>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/90 p-4">
          <p className="mb-2 text-xs font-semibold text-emerald-950">Sales intake (same date filter as above)</p>
          <p className="mb-3 text-[11px] text-emerald-900/90">
            Coach commission remittances are recorded under{" "}
            <Link href="/coaches" className="font-semibold underline decoration-emerald-700">
              Coaches
            </Link>{" "}
            (coach pays gym). Totals use the same calendar rules as customer payments.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-white/80 bg-white/90 p-3 shadow-sm">
              <p className="text-xs font-medium text-slate-600">Customer payments</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{peso(totalSales)}</p>
            </div>
            <div className="rounded-lg border border-white/80 bg-white/90 p-3 shadow-sm">
              <p className="text-xs font-medium text-slate-600">Coach commission remittances</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-emerald-900">
                {coachRemittanceLoading ? "…" : peso(coachRemittanceSummary.total)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Records: {coachRemittanceLoading ? "…" : coachRemittanceSummary.count}</p>
            </div>
            <div className="rounded-lg border border-emerald-300 bg-emerald-100/80 p-3 shadow-sm">
              <p className="text-xs font-semibold text-emerald-950">Combined intake</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-emerald-950">
                {coachRemittanceLoading ? "…" : peso(combinedIntake)}
              </p>
              <p className="mt-1 text-[11px] text-emerald-900/80">Customer + coach remittances</p>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-5">
        <div className="order-2 min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Sales Trend Chart</h3>
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
            {trendSeries.map((series) => (
              <span key={series.key} className="inline-flex min-w-0 items-center gap-1 text-slate-700">
                <span className={`h-2.5 w-2.5 shrink-0 rounded ${series.color}`} />{" "}
                <span className="truncate">{series.label}</span>
              </span>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-2 sm:p-3">
            <p className="mb-2 text-[11px] text-slate-500">
              When there are many periods, scroll sideways on this chart. Bars scale to the filtered totals.
            </p>
            <div
              className="max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-md border border-slate-200 bg-white pb-1 [-webkit-overflow-scrolling:touch]"
              style={{ scrollbarGutter: "stable" }}
            >
              <div
                className="grid gap-x-1 gap-y-1 p-2"
                style={{
                  gridTemplateColumns: `44px repeat(${trendChartLayout.n}, minmax(${trendChartLayout.slotMin}px, 1fr))`,
                  gridTemplateRows: "auto minmax(176px, max-content)",
                  width: `max(100%, ${trendChartLayout.gridMinWidth}px)`,
                }}
              >
                <div className="min-h-[2.5rem]" aria-hidden />
                {trendData.map((item) => (
                  <div
                    key={`head-${item.key}`}
                    className="flex min-w-0 items-end justify-center px-0.5 pb-1 text-center text-[10px] font-medium leading-tight text-slate-600 sm:text-[11px]"
                  >
                    <span className="line-clamp-3 break-words">{item.label}</span>
                  </div>
                ))}
                <div
                  className="flex flex-col justify-between border-r border-slate-200 py-1 pr-1.5 text-right text-[10px] leading-tight text-slate-500"
                  style={{ gridColumn: 1, gridRow: 2 }}
                >
                  {Array.from({ length: 7 }, (_, idx) => {
                    const value = (maxTrendValue / 6) * (6 - idx);
                    return (
                      <span key={`tick-${idx}`} className="relative z-[1] tabular-nums">
                        {peso(value)}
                      </span>
                    );
                  })}
                </div>
                {trendData.map((item, colIdx) => (
                  <div
                    key={`col-${item.key}`}
                    className="relative flex min-w-0 items-end justify-center gap-px border-l border-slate-100 px-0.5 sm:gap-0.5 sm:px-1"
                    style={{ gridColumn: colIdx + 2, gridRow: 2 }}
                  >
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                      {Array.from({ length: 7 }).map((_, idx) => (
                        <div key={`bgline-${item.key}-${idx}`} className="border-t border-slate-100/90" />
                      ))}
                    </div>
                    <div className="relative z-[1] flex h-full max-h-[176px] w-full min-h-[160px] items-end justify-center gap-px sm:gap-0.5">
                      {trendSeries.map((series) => {
                        const value = item.totals[series.key];
                        const heightPercent = Math.max((value / maxTrendValue) * 100, value > 0 ? 5 : 1.5);
                        return (
                          <div
                            key={`${item.key}-${series.key}`}
                            className={`min-h-[3px] min-w-0 max-w-[12px] flex-1 rounded-t ${series.color}`}
                            style={{ height: `${heightPercent}%` }}
                            title={`${item.label} • ${series.label}: ${peso(value)}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 min-w-0 border-t border-slate-200 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <h3 className="text-sm font-semibold text-slate-900">Payment Records</h3>
              {mergeReceiptIds.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-600">
                    {mergeReceiptIds.length} selected — same client only for merge
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 border-slate-300 px-2 text-[11px]"
                    onClick={() => setMergeReceiptIds([])}
                  >
                    Clear selection
                  </Button>
                  <Button
                    type="button"
                    className="h-7 bg-[#1e3a5f] px-2 text-[11px] text-white hover:bg-[#1e3a5f]/90"
                    disabled={mergeReceiptIds.length < 2}
                    onClick={() => openMergedReceiptFromSelection("thermal")}
                    title="Combined receipt on the standard 80mm POS size"
                  >
                    Merged receipt
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 border-[#1e3a5f] bg-white px-2 text-[11px] text-[#1e3a5f] hover:bg-[#1e3a5f]/10"
                    disabled={mergeReceiptIds.length < 2}
                    onClick={() => openMergedReceiptFromSelection("a4")}
                    title="Combined receipt on a full A4 page"
                  >
                    A4
                  </Button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Tip: tick rows in the table to combine them into a single merged receipt (same client only).
                </p>
              )}
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <input
                ref={paymentImportInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  try {
                    setImportingPayments(true);
                    const text = await file.text();
                    const parsed = JSON.parse(text) as { data?: unknown[] };
                    if (!Array.isArray(parsed.data)) {
                      showNotice("error", "Invalid import file format.");
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
                      showNotice("error", json.details || json.error || "Import failed.");
                      return;
                    }
                    const imported = json.data?.imported ?? 0;
                    const skipped = json.data?.skipped ?? 0;
                    const failed = json.data?.failed ?? 0;
                    showNotice(
                      failed > 0 ? "error" : "success",
                      `Import done. Added ${imported}, skipped ${skipped}, failed ${failed}.`,
                    );
                    await load();
                  } catch {
                    showNotice("error", "Failed to parse import file.");
                  } finally {
                    setImportingPayments(false);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-8 border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                disabled={exportingPayments}
                onClick={async () => {
                  try {
                    setExportingPayments(true);
                    const res = await fetch("/api/payments/export?limit=5000");
                    const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                    if (!json.success) {
                      showNotice("error", json.details || json.error || "Export failed.");
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
                    showNotice("success", "Payment records exported successfully.");
                  } catch {
                    showNotice("error", "Failed to export payment records.");
                  } finally {
                    setExportingPayments(false);
                  }
                }}
              >
                {exportingPayments ? "Exporting..." : "Export"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50"
                disabled={exportingExcel || flatHistoryRows.length === 0}
                onClick={handleExportExcel}
                title="Export the current view (filters + sort) to an Excel .xlsx file"
              >
                {exportingExcel ? "Building Excel..." : "Export Excel"}
              </Button>
              <Button
                type="button"
                className="h-8 bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
                disabled={importingPayments}
                onClick={() => paymentImportInputRef.current?.click()}
              >
                {importingPayments ? "Importing..." : "Import"}
              </Button>
              <p className="w-full text-[11px] leading-relaxed text-slate-500 sm:max-w-[30rem]">
                Import tip: Membership rows default to <span className="font-medium text-slate-700">MONTHLY_FEE</span>.
                Set <code className="rounded bg-slate-100 px-1">transactionType</code> to{" "}
                <code className="rounded bg-slate-100 px-1">MEMBERSHIP_CONTRACT</code> only for true contract balances.
              </p>
            </div>
          </div>
          <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,_1fr)_auto] sm:items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600" htmlFor="payment-records-search">
                Search payment records
              </label>
              <Input
                id="payment-records-search"
                type="search"
                value={paymentRecordsSearch}
                onChange={(e) => setPaymentRecordsSearch(e.target.value)}
                placeholder="Name, service, method, amount, reference, notes, add-on…"
                className="h-9 max-w-xl text-sm"
                autoComplete="off"
              />
              <p className="text-[11px] text-slate-500">
                Search across the table. Combine with the role buttons and column sorting.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600" htmlFor="payment-records-date">
                Filter by date
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  className="flex h-9 w-9 items-center justify-center border-slate-300 bg-white p-0 text-slate-700 hover:bg-slate-50"
                  onClick={() => stepHistoryDate(-1)}
                  aria-label="Previous day"
                  title="Previous day"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Input
                  id="payment-records-date"
                  type="date"
                  value={paymentRecordsDate}
                  max={todayPHStr}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v && v > todayPHStr) {
                      setPaymentRecordsDate(todayPHStr);
                      return;
                    }
                    setPaymentRecordsDate(v);
                  }}
                  className="h-9 w-44 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="flex h-9 w-9 items-center justify-center border-slate-300 bg-white p-0 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => stepHistoryDate(1)}
                  disabled={!canStepForward}
                  aria-label="Next day"
                  title={canStepForward ? "Next day" : "Future dates are locked"}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-50"
                  disabled={paymentRecordsDate === todayPHStr}
                  onClick={() => setPaymentRecordsDate(todayPHStr)}
                  title="Jump to today (PH)"
                >
                  Today
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-50"
                  disabled={!paymentRecordsDate}
                  onClick={() => setPaymentRecordsDate("")}
                  title="Clear date filter (show 200 most recent)"
                >
                  Clear
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                {paymentRecordsDate
                  ? `Showing transactions recorded on ${paymentRecordsDate} (PH calendar day, Asia/Manila). Future dates are locked.`
                  : "Default: 200 most recent payments (by record time). Pick a date to load up to 500 payments recorded that day in PH."}
              </p>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {historyRoleFilters.map((tab) => {
              const active = paymentRecordsRoleFilter === tab.id;
              const count = historyRoleCounts[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPaymentRecordsRoleFilter(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-[#1e3a5f] bg-[#1e3a5f] text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  aria-pressed={active}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                      active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
            <span className="ml-auto text-[11px] text-slate-500">
              {flatHistoryRows.length === 0
                ? "No matching transactions."
                : `${flatHistoryRows.length} ${flatHistoryRows.length === 1 ? "transaction" : "transactions"} · Net ₱${historyTotalsForView.net.toFixed(2)}${
                    historyTotalsForView.discount > 0
                      ? ` (Gross ₱${historyTotalsForView.gross.toFixed(2)} − Disc ₱${historyTotalsForView.discount.toFixed(2)})`
                      : ""
                  }`}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3">
              <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:mr-1 sm:w-auto">
                Sort
              </span>
              <HistorySortHeader
                variant="pill"
                label="ID"
                column="paidAt"
                sortable={false}
                sort={paymentRecordsSort}
                onToggle={toggleHistorySort}
              />
              <HistorySortHeader
                variant="pill"
                label="Paid"
                column="paidAt"
                sort={paymentRecordsSort}
                onToggle={toggleHistorySort}
              />
              <HistorySortHeader
                variant="pill"
                label="Recorded"
                column="createdAt"
                sort={paymentRecordsSort}
                onToggle={toggleHistorySort}
              />
              <HistorySortHeader
                variant="pill"
                label="Customer"
                column="customer"
                sort={paymentRecordsSort}
                onToggle={toggleHistorySort}
              />
              <HistorySortHeader variant="pill" label="Role" column="role" sort={paymentRecordsSort} onToggle={toggleHistorySort} />
              <HistorySortHeader variant="pill" label="Item" column="service" sort={paymentRecordsSort} onToggle={toggleHistorySort} />
              <HistorySortHeader variant="pill" label="Method" column="method" sort={paymentRecordsSort} onToggle={toggleHistorySort} />
              <HistorySortHeader
                variant="pill"
                label="Disc."
                column="discount"
                sort={paymentRecordsSort}
                onToggle={toggleHistorySort}
                align="right"
              />
              <HistorySortHeader
                variant="pill"
                label="Gross"
                column="gross"
                sort={paymentRecordsSort}
                onToggle={toggleHistorySort}
                align="right"
              />
              <HistorySortHeader
                variant="pill"
                label="Total"
                column="total"
                sort={paymentRecordsSort}
                onToggle={toggleHistorySort}
                align="right"
              />
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase text-slate-500">
                Reference / OR
              </span>
            </div>
            {records.length === 0 ? (
              <div className="w-full rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-xs text-slate-500">
                No payment records yet.
              </div>
            ) : flatHistoryRows.length === 0 ? (
              <div className="w-full rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-3 py-8 text-center text-xs text-amber-900">
                No records match your search and filter.
              </div>
            ) : (
              <div className="space-y-3">
                {flatHistoryRows.map((row) => {
                  const track = paymentTrackLabel(row);
                  const gross = Number(row.grossAmount ?? row.amount) || 0;
                  const total = Number(row.amount) || 0;
                  const discountAmount = Number(row.discountAmount ?? 0) || 0;
                  const discountPercent = Number(row.discountPercent ?? 0) || 0;
                  const isPartial = row.collectionStatus === "PARTIAL";
                  const selected = mergeReceiptIds.includes(row.id);
                  const rolePill = historyRolePill(row.user.role, row.user.membershipTier);
                  const showSubRole =
                    row.user.role === "MEMBER" &&
                    rolePill.label !== "Member" &&
                    rolePill.label !== historyRoleShortLabel(row.user.role);
                  const referenceText = (() => {
                    if (row.paymentMethod === "SPLIT" && row.splitPayments?.length) {
                      return row.splitPayments
                        .map((sp) => `${sp.method}${sp.reference ? ` · ${sp.reference}` : ""}`)
                        .join(" · ");
                    }
                    const ref = (row.paymentReference ?? "").trim();
                    const or = (row.orNumber ?? "").trim();
                    if (ref && or) return `${ref} · OR ${or}`;
                    return ref || (or ? `OR ${or}` : "");
                  })();
                  return (
                    <div
                      key={row.id}
                      className={`w-full rounded-lg border border-slate-200 p-3 shadow-sm transition hover:border-slate-300 ${
                        selected ? "border-[#1e3a5f]/50 bg-[#1e3a5f]/5" : "bg-white"
                      }`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                          <div className="flex shrink-0 items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-slate-400"
                              checked={selected}
                              onChange={() => toggleMergeGroup([row.id])}
                              aria-label="Select for merged receipt"
                            />
                            <span className="font-mono text-[11px] text-slate-500" title={row.id}>
                              #{historyShortId(row.id)}
                            </span>
                          </div>
                          <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Paid</div>
                              <div className="whitespace-nowrap text-slate-800 tabular-nums">{new Date(row.paidAt).toLocaleDateString()}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Recorded</div>
                              <div className="text-[11px] text-slate-600">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</div>
                            </div>
                            <div className="min-w-0 sm:col-span-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Customer</div>
                              <div className="font-medium text-slate-900">
                                {row.user.firstName} {row.user.lastName}
                              </div>
                              {row.user.remainingBalance && Number(row.user.remainingBalance) > 0 ? (
                                <div className="mt-0.5 text-[10px] text-amber-700">Balance: ₱{Number(row.user.remainingBalance).toFixed(2)}</div>
                              ) : null}
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Role</div>
                              <span className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${rolePill.classes}`}>
                                {rolePill.label}
                              </span>
                              {showSubRole ? <div className="mt-0.5 text-[10px] text-slate-500">Member</div> : null}
                            </div>
                            <div className="min-w-0 sm:col-span-2 lg:col-span-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Item</div>
                              <div className="font-medium text-slate-900">{row.service.name}</div>
                              <div className="text-[11px] text-slate-500">{row.service.tier}</div>
                              {track ? <div className="mt-0.5 text-[10px] font-medium text-slate-500">{track}</div> : null}
                              {row.customAddOnLabel ? <div className="mt-0.5 text-[10px] text-slate-500">{row.customAddOnLabel}</div> : null}
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Method</div>
                              <span className="inline-flex items-center rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                                {paymentMethodOptionLabel(row.paymentMethod)}
                              </span>
                              {row.user.role === "MEMBER" && row.service.name === "Membership" ? (
                                <div
                                  className={`mt-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    isPartial ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                                  }`}
                                >
                                  {isPartial ? "Partial" : "Fully paid"}
                                </div>
                              ) : null}
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Discount</div>
                              {discountAmount > 0 ? (
                                <div>
                                  <div className="font-semibold text-slate-800 tabular-nums">−₱{discountAmount.toFixed(2)}</div>
                                  <div className="text-[10px] text-slate-500">
                                    {row.discountType === "FIXED" ? "Fixed" : `${discountPercent}%`}
                                  </div>
                                  {row.discountReason ? (
                                    <div className="line-clamp-2 text-[10px] text-slate-400" title={row.discountReason}>
                                      {row.discountReason}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Gross</div>
                              <div className="tabular-nums text-slate-800">₱{gross.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
                              <div className="font-semibold tabular-nums text-slate-900">₱{total.toFixed(2)}</div>
                            </div>
                            <div className="min-w-0 sm:col-span-2 lg:col-span-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reference</div>
                              {referenceText ? (
                                <div className="break-all font-mono text-[10px] text-slate-600" title={referenceText}>
                                  {referenceText}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400">—</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 border-t border-slate-100 pt-2 lg:border-0 lg:pt-0">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-7 border-slate-300 bg-white px-2 text-[10px] text-slate-700 hover:bg-slate-100"
                            onClick={() => openReceipt(row.id, "thermal")}
                            title="Print on the standard 80mm POS receipt size"
                          >
                            Receipt
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-7 border-[#1e3a5f] bg-white px-2 text-[10px] text-[#1e3a5f] hover:bg-[#1e3a5f]/10"
                            onClick={() => openReceipt(row.id, "a4")}
                            title="Print on a full A4 page"
                          >
                            A4
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-7 border-slate-300 bg-white px-2 text-[10px] text-slate-700 hover:bg-slate-100"
                            disabled={updatingTransactionId === row.id}
                            onClick={() => {
                              setEditingTransaction({
                                id: row.id,
                                grossAmount: Number(row.grossAmount ?? row.amount).toFixed(2),
                                discountType:
                                  row.discountType === "FIXED" ||
                                  row.discountType === "PERCENT" ||
                                  row.discountType === "NONE"
                                    ? row.discountType
                                    : Number(row.discountAmount ?? 0) > 0 && Number(row.discountPercent ?? 0) === 0
                                      ? "FIXED"
                                      : Number(row.discountPercent ?? 0) > 0
                                        ? "PERCENT"
                                        : "NONE",
                                discountPercent: String(row.discountPercent ?? 0),
                                discountFixedAmount: Number(row.discountFixedAmount ?? row.discountAmount ?? 0).toFixed(2),
                                discountReason: row.discountReason ?? "",
                                paymentMethod: row.paymentMethod,
                                collectionStatus: row.collectionStatus,
                                paidAtLocal: toDateTimeLocalValue(row.paidAt),
                                paymentReference: row.paymentReference ?? "",
                                orNumber: row.orNumber ?? "",
                                notes: row.notes ?? "",
                                isSplit: row.paymentMethod === "SPLIT",
                              });
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-7 border-amber-300 bg-white px-2 text-[10px] text-amber-700 hover:bg-amber-50"
                            disabled={updatingTransactionId === row.id}
                            onClick={() => {
                              setVoidReasonInput("Admin correction");
                              setPendingVoidPayment(row);
                            }}
                          >
                            Void
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-7 border-red-300 bg-white px-2 text-[10px] text-red-700 hover:bg-red-50"
                            disabled={updatingTransactionId === row.id}
                            onClick={() => setPendingDeletePayment(row)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </div>
      </Card>
      {editingTransaction
        ? createPortal(
            <div
              className="fixed inset-0 z-[102] overflow-y-auto bg-slate-900/60 backdrop-blur-[2px]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-transaction-title"
            >
              <div
                className="flex min-h-full items-center justify-center p-3 py-10 sm:p-4 sm:py-12"
                onClick={() => {
                  if (!savingTransactionEdit) setEditingTransaction(null);
                }}
              >
                <Card
                  className="max-h-[min(92vh,920px)] w-full max-w-xl space-y-4 overflow-y-auto border border-slate-300 bg-white p-4 sm:p-5 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 id="edit-transaction-title" className="text-lg font-semibold text-slate-900">
                Edit Transaction
              </h3>
              <Button
                variant="outline"
                className="border-slate-300 hover:bg-slate-100"
                onClick={() => setEditingTransaction(null)}
                disabled={savingTransactionEdit}
              >
                Close
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Gross amount</label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={editingTransaction.grossAmount}
                  onChange={(e) => setEditingTransaction({ ...editingTransaction, grossAmount: e.target.value })}
                  disabled={editingTransaction.isSplit}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Discount type</label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
                  value={editingTransaction.discountType}
                  onChange={(e) =>
                    setEditingTransaction({
                      ...editingTransaction,
                      discountType: e.target.value as "NONE" | "PERCENT" | "FIXED",
                    })
                  }
                  disabled={editingTransaction.isSplit}
                >
                  <option value="NONE">None</option>
                  <option value="PERCENT">Percent</option>
                  <option value="FIXED">Fixed (₱)</option>
                </select>
              </div>
              {editingTransaction.discountType === "PERCENT" ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Discount %</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={editingTransaction.discountPercent}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, discountPercent: e.target.value })}
                    disabled={editingTransaction.isSplit}
                  />
                </div>
              ) : null}
              {editingTransaction.discountType === "FIXED" ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Fixed discount</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={editingTransaction.discountFixedAmount}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, discountFixedAmount: e.target.value })}
                    disabled={editingTransaction.isSplit}
                  />
                </div>
              ) : null}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-slate-600">Discount reason</label>
                <Input
                  value={editingTransaction.discountReason}
                  onChange={(e) => setEditingTransaction({ ...editingTransaction, discountReason: e.target.value })}
                  disabled={editingTransaction.isSplit}
                  placeholder="Required when discount is applied"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <p className="font-medium text-slate-800">Final amount (computed)</p>
                <p className="tabular-nums">
                  {(() => {
                    const g = Number(editingTransaction.grossAmount);
                    if (!Number.isFinite(g) || g <= 0) return "—";
                    let d = 0;
                    if (editingTransaction.discountType === "PERCENT") {
                      const p = Math.min(100, Math.max(0, Math.trunc(Number(editingTransaction.discountPercent || 0))));
                      d = g * (p / 100);
                    } else if (editingTransaction.discountType === "FIXED") {
                      const f = Number(editingTransaction.discountFixedAmount || 0);
                      d = Number.isFinite(f) ? Math.min(f, g) : 0;
                    }
                    return Math.max(g - d, 0).toFixed(2);
                  })()}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Payment Method</label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
                  value={editingTransaction.paymentMethod}
                  onChange={(e) => setEditingTransaction({ ...editingTransaction, paymentMethod: e.target.value })}
                  disabled={editingTransaction.isSplit}
                >
                  {methodOptions.map((method) => (
                    <option key={method} value={method}>
                      {paymentMethodOptionLabel(method)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Collection Status</label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
                  value={editingTransaction.collectionStatus}
                  onChange={(e) =>
                    setEditingTransaction({
                      ...editingTransaction,
                      collectionStatus: e.target.value as "FULLY_PAID" | "PARTIAL",
                    })
                  }
                >
              <option value="FULLY_PAID">Fully Paid</option>
              <option value="PARTIAL">Partial</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Timestamp</label>
                <Input
                  type="datetime-local"
                  value={editingTransaction.paidAtLocal}
                  onChange={(e) => setEditingTransaction({ ...editingTransaction, paidAtLocal: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-slate-600">Reference</label>
                <Input
                  value={editingTransaction.paymentReference}
                  onChange={(e) => setEditingTransaction({ ...editingTransaction, paymentReference: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-slate-600">OR number</label>
                <Input
                  value={editingTransaction.orNumber}
                  onChange={(e) => setEditingTransaction({ ...editingTransaction, orNumber: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-slate-600">Notes</label>
                <Input
                  value={editingTransaction.notes}
                  onChange={(e) => setEditingTransaction({ ...editingTransaction, notes: e.target.value })}
                />
              </div>
            </div>
            {editingTransaction.isSplit ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Split transaction details cannot be edited directly. Use Void or Delete + re-create.
              </p>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <Button
                variant="outline"
                className="border-slate-300 text-slate-700 hover:bg-slate-100"
                onClick={() => setEditingTransaction(null)}
                disabled={savingTransactionEdit}
              >
                Cancel
              </Button>
              <Button
                className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
                disabled={savingTransactionEdit}
                onClick={async () => {
                  if (editingTransaction.isSplit) {
                    showNotice("error", "Split transactions cannot be edited directly.");
                    return;
                  }
                  const gross = Number(editingTransaction.grossAmount);
                  if (!Number.isFinite(gross) || gross <= 0) {
                    showNotice("error", "Gross amount must be greater than zero.");
                    return;
                  }
                  const dtype = editingTransaction.discountType;
                  const pct = dtype === "PERCENT" ? Math.trunc(Number(editingTransaction.discountPercent || 0)) : 0;
                  const fixed = dtype === "FIXED" ? Number(editingTransaction.discountFixedAmount || 0) : 0;
                  let disc = 0;
                  if (dtype === "PERCENT") disc = gross * (pct / 100);
                  if (dtype === "FIXED") disc = Math.min(fixed, gross);
                  if (disc > 0 && !editingTransaction.discountReason.trim()) {
                    showNotice("error", "Discount reason is required when a discount is applied.");
                    return;
                  }
                  if (dtype === "PERCENT" && (pct < 0 || pct > 100)) {
                    showNotice("error", "Discount percent must be 0–100.");
                    return;
                  }
                  if (Math.max(gross - disc, 0) <= 0) {
                    showNotice("error", "Final amount after discount must be greater than zero.");
                    return;
                  }
                  const paidAtIso = editingTransaction.paidAtLocal ? new Date(editingTransaction.paidAtLocal).toISOString() : "";
                  if (!paidAtIso || Number.isNaN(new Date(paidAtIso).getTime())) {
                    showNotice("error", "Invalid timestamp.");
                    return;
                  }
                  setSavingTransactionEdit(true);
                  const res = await fetch(`/api/payments/${editingTransaction.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      grossAmount: gross,
                      discountType: dtype,
                      discountPercent: pct,
                      discountFixedAmount: fixed,
                      discountReason: editingTransaction.discountReason.trim() || null,
                      paymentMethod: editingTransaction.paymentMethod,
                      collectionStatus: editingTransaction.collectionStatus,
                      paidAt: paidAtIso,
                      paymentReference: editingTransaction.paymentReference,
                      orNumber: editingTransaction.orNumber,
                      notes: editingTransaction.notes,
                    }),
                  });
                  const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                  setSavingTransactionEdit(false);
                  if (!json.success) {
                    showNotice("error", json.details || json.error || "Failed to edit transaction.");
                    return;
                  }
                  setEditingTransaction(null);
                  await load();
                  showNotice("success", "Transaction updated.");
                }}
              >
                {savingTransactionEdit ? "Saving..." : "Save Changes"}
              </Button>
            </div>
                </Card>
              </div>
            </div>,
            document.body,
          )
        : null}

      <DashboardConfirmDialog
        open={duplicateSaveOpen}
        onOpenChange={setDuplicateSaveOpen}
        title="Possible duplicate payment"
        description="We detected a similar payment for one or more cart lines in the last few minutes. Only continue if you mean to record another payment."
        tone="warning"
        confirmLabel="Continue anyway"
        cancelLabel="Cancel save"
        loading={submitting}
        onDismiss={() => showNotice("error", "Payment cancelled to avoid duplicate record.")}
        onConfirm={async () => {
          await savePayment(true);
        }}
      />

      <DashboardConfirmDialog
        open={Boolean(pendingVoidPayment)}
        onOpenChange={(open) => {
          if (!open) setPendingVoidPayment(null);
        }}
        title="Void transaction"
        description={
          pendingVoidPayment ? (
            <>
              Void payment for{" "}
              <span className="font-semibold text-slate-800">
                {pendingVoidPayment.user.firstName} {pendingVoidPayment.user.lastName}
              </span>
              {" — "}
              {peso(Number(pendingVoidPayment.amount))} · {pendingVoidPayment.service.name} ({pendingVoidPayment.service.tier})
            </>
          ) : null
        }
        tone="warning"
        confirmLabel="Void transaction"
        cancelLabel="Cancel"
        loading={Boolean(pendingVoidPayment && updatingTransactionId === pendingVoidPayment.id)}
        confirmDisabled={!voidReasonInput.trim()}
        onConfirm={async () => {
          const row = pendingVoidPayment;
          if (!row || !voidReasonInput.trim()) return;
          setUpdatingTransactionId(row.id);
          const res = await fetch(`/api/payments/${row.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voidTransaction: true, voidReason: voidReasonInput.trim() }),
          });
          const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
          setUpdatingTransactionId(null);
          if (!json.success) {
            showNotice("error", json.details || json.error || "Failed to void transaction.");
            return;
          }
          await load();
          showNotice("success", "Transaction voided.");
        }}
      >
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-slate-700" htmlFor="void-reason-payment">
            Void reason
          </label>
          <textarea
            id="void-reason-payment"
            rows={2}
            value={voidReasonInput}
            onChange={(e) => setVoidReasonInput(e.target.value)}
            className="h-[4.25rem] w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-1"
            placeholder="Short reason (e.g. duplicate entry)"
          />
        </div>
      </DashboardConfirmDialog>

      <DashboardConfirmDialog
        open={Boolean(pendingDeletePayment)}
        onOpenChange={(open) => {
          if (!open) setPendingDeletePayment(null);
        }}
        title="Delete transaction permanently?"
        description={
          pendingDeletePayment ? (
            <>
              This removes the payment record for{" "}
              <span className="font-semibold text-slate-800">
                {pendingDeletePayment.user.firstName} {pendingDeletePayment.user.lastName}
              </span>{" "}
              ({peso(Number(pendingDeletePayment.amount))}). This cannot be undone.
            </>
          ) : null
        }
        tone="danger"
        confirmLabel="Delete permanently"
        cancelLabel="Keep record"
        loading={Boolean(pendingDeletePayment && updatingTransactionId === pendingDeletePayment.id)}
        onConfirm={async () => {
          const row = pendingDeletePayment;
          if (!row) return;
          setUpdatingTransactionId(row.id);
          const res = await fetch(`/api/payments/${row.id}`, { method: "DELETE" });
          const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
          setUpdatingTransactionId(null);
          if (!json.success) {
            showNotice("error", json.details || json.error || "Failed to delete transaction.");
            return;
          }
          await load();
          showNotice("success", "Transaction deleted.");
        }}
      />
    </div>
  );
}

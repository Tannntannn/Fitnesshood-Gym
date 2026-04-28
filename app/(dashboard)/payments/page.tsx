"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  remainingBalance?: string | null;
  membershipTier?: string | null;
  coachName?: string | null;
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
  paymentMethod: string;
  collectionStatus: "FULLY_PAID" | "PARTIAL";
  paidAt: string;
  user: { id: string; firstName: string; lastName: string; role: string; remainingBalance: string | null; membershipTier?: string | null };
  service: { id: string; name: string; tier: string };
  paymentReference?: string | null;
  splitPayments?: Array<{ id: string; method: string; amount: string; reference?: string | null }>;
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
    loyaltyStars: number;
  };
  rewardTriggered: boolean;
};

const methodOptions = ["CASH", "GCASH", "CARD", "BANK_TRANSFER", "MAYA", "OTHER"] as const;

function methodMayHaveReference(method: string): boolean {
  return method === "GCASH" || method === "MAYA" || method === "BANK_TRANSFER" || method === "CARD";
}
const roleTabs: Array<{ id: RoleFilter; label: string }> = [
  { id: "MEMBER", label: "Members" },
  { id: "NON_MEMBER", label: "Non-members" },
  { id: "WALK_IN", label: "Walk-in Student" },
  { id: "WALK_IN_REGULAR", label: "Walk-in Regular" },
];
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
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [records, setRecords] = useState<PaymentRow[]>([]);
  const [activeRole, setActiveRole] = useState<RoleFilter>("MEMBER");

  const [clientSearch, setClientSearch] = useState("");
  const [coachName, setCoachName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [collectionStatus, setCollectionStatus] = useState<"FULLY_PAID" | "PARTIAL">("FULLY_PAID");
  const [enableSplit, setEnableSplit] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([{ method: "CASH", amount: "", reference: "" }]);
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [salesFilterPeriod, setSalesFilterPeriod] = useState<SalesFilterPeriod>("ANNUALLY");
  const [salesFilterYear, setSalesFilterYear] = useState<number>(new Date().getFullYear());
  const [salesMonthFrom, setSalesMonthFrom] = useState<number>(new Date().getMonth() + 1);
  const [salesMonthTo, setSalesMonthTo] = useState<number>(new Date().getMonth() + 1);
  const [salesSpecificDate, setSalesSpecificDate] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [exportingPayments, setExportingPayments] = useState(false);
  const [importingPayments, setImportingPayments] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<ConfirmResult | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showNotice = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2600);
  };

  const load = async () => {
    const [memberRes, serviceRes, paymentsRes, coachRes] = await Promise.all([
      fetch("/api/users?view=payment"),
      fetch("/api/services"),
      fetch("/api/payments?limit=200"),
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
  }, []);

  const filteredMembers = useMemo(
    () =>
      members
        .filter((member) => member.role === activeRole)
        .filter((member) => {
          const query = clientSearch.trim().toLowerCase();
          if (!query) return true;
          const fullName = `${member.firstName} ${member.lastName}`.toLowerCase();
          const reverseName = `${member.lastName} ${member.firstName}`.toLowerCase();
          return fullName.includes(query) || reverseName.includes(query);
        })
        .slice()
        .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)),
    [members, activeRole, clientSearch],
  );
  const selectedMember = useMemo(() => members.find((member) => member.id === memberId) ?? null, [members, memberId]);
  const getComputedAmount = (
    service: ServiceRow | null,
    role: RoleFilter,
    status: "FULLY_PAID" | "PARTIAL",
    member: MemberRow | null,
  ) => {
    if (!service) return "";
    if (role === "MEMBER" && service.name === "Membership" && status === "FULLY_PAID") {
      const outstanding = Number(member?.remainingBalance ?? 0);
      if (Number.isFinite(outstanding) && outstanding > 0) return String(outstanding);
    }
    const baseAmount = Number(service.monthlyRate);
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) return "";
    if (role === "MEMBER" && service.name === "Membership" && status === "PARTIAL") return "";
    return String(baseAmount);
  };
  const filteredServices = useMemo(() => {
    const membershipPlan = services.filter((service) => service.name === "Membership");
    const roleCore =
      activeRole === "MEMBER"
        ? membershipPlan
        : activeRole === "NON_MEMBER"
          ? services.filter((service) => service.tier === "Non-member")
          : activeRole === "WALK_IN"
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
  }, [services, activeRole]);
  const selectedService = useMemo(() => services.find((service) => service.id === serviceId) ?? null, [services, serviceId]);
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
    const value = Number(amount || 0);
    if (!Number.isFinite(value)) return 0;
    return value;
  }, [amount]);
  const discountAmountValue = useMemo(() => grossAmountValue * (discountValue / 100), [grossAmountValue, discountValue]);
  const finalAmountValue = useMemo(() => Math.max(grossAmountValue - discountAmountValue, 0), [grossAmountValue, discountAmountValue]);

  useEffect(() => {
    if (!selectedService) return;
    setAmount(getComputedAmount(selectedService, activeRole, collectionStatus, selectedMember));
  }, [selectedService, selectedMember, activeRole, collectionStatus]);

  useEffect(() => {
    if (activeRole !== "MEMBER" || !selectedMember) return;
    const outstanding = Number(selectedMember.remainingBalance ?? 0);
    if (!Number.isFinite(outstanding) || outstanding <= 0) return;

    const tier = (selectedMember.membershipTier ?? "").trim().toLowerCase();
    if (!tier) return;

    const matchedMembershipService =
      filteredServices.find(
        (service) => service.name === "Membership" && service.tier.trim().toLowerCase() === tier,
      ) ?? null;
    if (!matchedMembershipService) return;

    setServiceId(matchedMembershipService.id);
    setCollectionStatus("FULLY_PAID");
    setAmount(String(outstanding));
  }, [activeRole, selectedMember, filteredServices]);
  const recordsByRole = useMemo(() => {
    return roleTabs.reduce<Record<RoleFilter, PaymentRow[]>>(
      (acc, roleTab) => {
        acc[roleTab.id] = records
          .filter((row) => row.user.role === roleTab.id)
          .slice()
          .sort((a, b) =>
            `${a.user.lastName} ${a.user.firstName}`.localeCompare(`${b.user.lastName} ${b.user.firstName}`),
          );
        return acc;
      },
      { MEMBER: [], NON_MEMBER: [], WALK_IN: [], WALK_IN_REGULAR: [] },
    );
  }, [records]);
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
  const peso = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(value);

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
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="surface-card space-y-4 p-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Confirm Payment</h1>
          <p className="text-sm text-slate-500">Record payment, update membership status, and recompute balances instantly.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {roleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                activeRole === tab.id
                  ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              onClick={() => {
                setActiveRole(tab.id);
                setClientSearch("");
                setMemberId("");
                setCoachName("");
                setServiceId("");
                setAmount("");
                setDiscountPercent("0");
                setCollectionStatus("FULLY_PAID");
                setPaymentReference("");
                setSplits([{ method: "CASH", amount: "", reference: "" }]);
                setSuccess(null);
                setError("");
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Client ({roleTabs.find((tab) => tab.id === activeRole)?.label})</label>
            <Input
              value={clientSearch}
              onChange={(e) => {
                const value = e.target.value;
                setClientSearch(value);
                const matchedMember = filteredMembers.find((member) => `${member.firstName} ${member.lastName}` === value) ?? null;
                if (matchedMember) {
                  setMemberId(matchedMember.id);
                } else if (selectedMember && `${selectedMember.firstName} ${selectedMember.lastName}` !== value) {
                  setMemberId("");
                }
              }}
              placeholder="Type or select client"
              list={`client-options-${activeRole}`}
            />
            <datalist id={`client-options-${activeRole}`}>
              {filteredMembers.map((member) => (
                <option key={member.id} value={`${member.firstName} ${member.lastName}`} />
              ))}
            </datalist>
            <p className="text-[11px] text-slate-500">{filteredMembers.length} client(s) found</p>
            {activeRole === "MEMBER" && selectedMember ? (
              <div className="space-y-0.5 text-[11px] font-medium text-amber-700">
                <p>Outstanding balance: {selectedMemberBalance.toFixed(2)}</p>
                <p>Membership tier on file: {selectedMember.membershipTier ?? "N/A"}</p>
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Coach</label>
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
              {selectedMember ? "Coach assignment saves automatically." : "Select client first to assign coach."}
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Service</label>
            <select
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                const service = filteredServices.find((item) => item.id === e.target.value);
                setAmount(getComputedAmount(service ?? null, activeRole, collectionStatus, selectedMember));
              }}
            >
              <option value="">Select service/tier</option>
              {filteredServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.contractMonths === 0 ? `${service.name} (No Contract)` : `${service.name} - ${service.tier}`}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Gross Amount</label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            {selectedService && selectedService.contractMonths === 0 ? (
              <p className="text-[11px] text-slate-500">Additional service selected: enter or adjust amount as needed.</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Discount % (0-100)</label>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              placeholder="0"
            />
            <p className="text-[11px] text-slate-500">
              Final amount: {finalAmountValue.toFixed(2)} (discount: {discountAmountValue.toFixed(2)})
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Payment Method</label>
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
                  {method}
                </option>
              ))}
            </select>
          </div>
          {activeRole === "MEMBER" && selectedService?.name === "Membership" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Membership Payment Status</label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
                value={collectionStatus}
                onChange={(e) => {
                  const nextStatus = e.target.value as "FULLY_PAID" | "PARTIAL";
                  setCollectionStatus(nextStatus);
                  setAmount(getComputedAmount(selectedService, activeRole, nextStatus, selectedMember));
                }}
              >
                <option value="FULLY_PAID">Fully Paid</option>
                <option value="PARTIAL">Partial</option>
              </select>
              <p className="text-[11px] text-slate-500">
                Fully Paid auto-fills from tier pricing. Partial keeps amount manual so you can enter custom payment.
              </p>
            </div>
          ) : null}
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
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={enableSplit}
              onChange={(e) => {
                const checked = e.target.checked;
                setEnableSplit(checked);
                if (checked) setPaymentReference("");
              }}
              className="h-4 w-4 rounded border-slate-300"
            />
            Enable split payment
          </label>
          {enableSplit ? (
            <div className="mt-3 space-y-2">
              {splits.map((row, idx) => (
                <div key={`${idx}-${row.method}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
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
                        {method}
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
              <div className="flex items-center justify-between">
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

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Notes (optional)</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reference, remarks, etc." />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Button
          className="w-full bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
          disabled={submitting}
          onClick={async () => {
            setError("");
            setSuccess(null);
            if (!memberId || !serviceId) {
              setError("Please select member and service.");
              showNotice("error", "Please select member and service.");
              return;
            }
            if (discountValue < 0 || discountValue > 100) {
              setError("Discount must be between 0 and 100.");
              showNotice("error", "Discount must be between 0 and 100.");
              return;
            }
            if (finalAmountValue <= 0) {
              setError("Final amount must be greater than zero.");
              showNotice("error", "Final amount must be greater than zero.");
              return;
            }
            if (enableSplit && Math.abs(splitTotal - finalAmountValue) > 0.001) {
              setError("Split total must match final amount after discount.");
              showNotice("error", "Split total must match final amount.");
              return;
            }
            setSubmitting(true);
            const res = await fetch("/api/payments/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                memberId,
                serviceId,
                amount: finalAmountValue,
                grossAmount: grossAmountValue,
                discountPercent: discountValue,
                paymentMethod,
                collectionStatus,
                notes,
                paymentReference: enableSplit ? undefined : paymentReference.trim() || undefined,
                splits: enableSplit
                  ? splits.map((row) => ({
                      method: row.method,
                      amount: Number(row.amount),
                      reference: row.reference.trim() || undefined,
                    }))
                  : [],
              }),
            });
            const json = (await res.json()) as { success: boolean; data?: ConfirmResult; error?: string; details?: string };
            setSubmitting(false);
            if (!json.success || !json.data) {
              setError(json.details || json.error || "Payment failed.");
              showNotice("error", json.details || json.error || "Payment failed.");
              return;
            }
            setSuccess(json.data);
            showNotice("success", "Payment saved successfully.");
            await load();
          }}
        >
          {submitting ? "Processing..." : "Confirm Payment"}
        </Button>
        </Card>

        <Card className="surface-card space-y-3 p-5">
          <h2 className="text-base font-semibold text-slate-900">Payment Result</h2>
          {selectedService ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold">Selected Service</p>
              <p>{selectedService.contractMonths === 0 ? `${selectedService.name} (No Contract)` : `${selectedService.name} - ${selectedService.tier}`}</p>
            {selectedService.contractMonths === 0 || activeRole !== "MEMBER" ? (
                <p>No contract. Product/add-on purchase only.</p>
              ) : (
                <>
                  <p>Contract: {selectedService.contractMonths} month(s)</p>
                  <p>Contract Price: {selectedService.contractPrice}</p>
                </>
              )}
            </div>
          ) : null}

          {success ? (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-semibold">Payment saved successfully.</p>
              <p>Member: {success.updatedMember.firstName} {success.updatedMember.lastName}</p>
              {selectedService?.contractMonths === 0 || activeRole !== "MEMBER" ? (
                <p>Recorded as non-contract product/service purchase.</p>
              ) : (
                <>
                  <p>Tier: {success.updatedMember.membershipTier ?? "N/A"}</p>
                  <p>Status: {success.updatedMember.membershipStatus ?? "N/A"}</p>
                  <p>Days left: {success.updatedMember.daysLeft ?? "N/A"}</p>
                  <p>Months paid: {success.updatedMember.monthsPaid}</p>
                  <p>Remaining months: {success.updatedMember.remainingMonths ?? "N/A"}</p>
                  <p>Remaining balance: {success.updatedMember.remainingBalance ?? "0.00"}</p>
                  <p>Loyalty stars: {success.updatedMember.loyaltyStars}</p>
                  {success.rewardTriggered ? (
                    <p className="rounded bg-emerald-200 px-2 py-1 text-xs font-semibold">Reward unlocked: free session triggered.</p>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No payment processed yet.</p>
          )}
        </Card>
      </div>

      <Card className="surface-card p-5">
        <h2 className="text-base font-semibold text-slate-900">Payment Analytics and Records</h2>
        <p className="mb-4 text-xs text-slate-500">Role-based summary and bar graph for easier sales comparison.</p>
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-700">Filter Period:</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {(["TODAY", "WEEKLY", "MONTHLY", "ANNUALLY"] as SalesFilterPeriod[]).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setSalesFilterPeriod(period)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  salesFilterPeriod === period
                    ? "bg-emerald-600 text-white shadow"
                    : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                }`}
              >
                {period === "TODAY" ? "Today" : period === "WEEKLY" ? "Weekly" : period === "MONTHLY" ? "Monthly" : "Annually"}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-[1.4fr_0.7fr_0.7fr_1.1fr_auto]">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Year (for Monthly/Annual ranges)</label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
                value={salesFilterYear}
                onChange={(e) => setSalesFilterYear(Number(e.target.value))}
              >
                {salesFilterYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Month range (optional)</label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
                value={salesMonthFrom}
                onChange={(e) => setSalesMonthFrom(Number(e.target.value))}
                disabled={salesFilterPeriod === "TODAY" || salesFilterPeriod === "WEEKLY"}
              >
                {monthOptions.map((month) => (
                  <option key={`from-${month.value}`} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">&nbsp;</label>
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
                value={salesMonthTo}
                onChange={(e) => setSalesMonthTo(Number(e.target.value))}
                disabled={salesFilterPeriod === "TODAY" || salesFilterPeriod === "WEEKLY"}
              >
                {monthOptions.map((month) => (
                  <option key={`to-${month.value}`} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Specific Date (overrides buttons)</label>
              <Input type="date" value={salesSpecificDate} onChange={(e) => setSalesSpecificDate(e.target.value)} />
            </div>
            <div className="self-end">
              <Button
                type="button"
                variant="outline"
                className="h-10 border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  const now = new Date();
                  setSalesFilterPeriod("ANNUALLY");
                  setSalesFilterYear(now.getFullYear());
                  setSalesMonthFrom(1);
                  setSalesMonthTo(12);
                  setSalesSpecificDate("");
                }}
              >
                Clear
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
            <p className="text-xs font-semibold text-slate-700">Total</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{peso(totalSales)}</p>
            <p className="mt-1 text-xs text-slate-600">Sales: {totalCount}</p>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Sales Trend Chart</h3>
          <div className="mb-4 flex flex-wrap items-center justify-center gap-3 text-xs">
            {trendSeries.map((series) => (
              <span key={series.key} className="inline-flex items-center gap-1 text-slate-700">
                <span className={`h-2.5 w-2.5 rounded ${series.color}`} /> {series.label}
              </span>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-[11px] text-slate-500">Scroll horizontally below to view all annual bars.</p>
            <div className="overflow-x-scroll pb-2" style={{ scrollbarGutter: "stable both-edges" }}>
            <div
              className="grid grid-cols-[96px_1fr] gap-3"
              style={{ minWidth: `${Math.max(1180, trendData.length * 250 + 140)}px` }}
            >
              <div className="flex h-64 flex-col justify-between pr-1 text-right text-[11px] text-slate-500">
                {Array.from({ length: 7 }, (_, idx) => {
                  const value = (maxTrendValue / 6) * (6 - idx);
                  return <span key={`tick-${idx}`} className="whitespace-nowrap">{peso(value)}</span>;
                })}
              </div>
              <div className="relative h-64">
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                  {Array.from({ length: 7 }).map((_, idx) => (
                    <div key={`line-${idx}`} className="border-t border-slate-200" />
                  ))}
                </div>
                <div className="absolute inset-0 flex items-end gap-4 px-3 pb-1">
                  {trendData.map((item) => (
                    <div key={item.key} className="flex w-[230px] flex-none flex-col items-center">
                      <div className="flex h-56 w-full items-end justify-center gap-1">
                        {trendSeries.map((series) => {
                          const value = item.totals[series.key];
                          const heightPercent = Math.max((value / maxTrendValue) * 100, value > 0 ? 3 : 1);
                          return (
                            <div
                              key={`${item.key}-${series.key}`}
                              className={`w-4 rounded-t ${series.color}`}
                              style={{ height: `${heightPercent}%` }}
                              title={`${item.label} • ${series.label}: ${peso(value)}`}
                            />
                          );
                        })}
                      </div>
                      <p className="mt-2 max-w-full whitespace-nowrap text-center text-[11px] text-slate-600">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Payment Records</h3>
            <div className="flex items-center gap-2">
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
                className="h-8 bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
                disabled={importingPayments}
                onClick={() => paymentImportInputRef.current?.click()}
              >
                {importingPayments ? "Importing..." : "Import"}
              </Button>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
            {roleTabs.map((roleTab) => {
              const data = recordsByRole[roleTab.id];
              return (
                <div key={roleTab.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-700">{roleTab.label}</p>
                    <p className="text-[11px] text-slate-500">{data.length} payment(s)</p>
                  </div>
                  <div className="max-h-[350px] overflow-auto p-2">
                    <div className="space-y-2">
                      {data.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
                          No payment records yet.
                        </div>
                      ) : (
                        data.map((row) => (
                          <div key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-slate-800">{row.user.firstName} {row.user.lastName}</p>
                              <div className="flex items-center gap-1">
                                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">{row.paymentMethod}</span>
                                {row.user.role === "MEMBER" && row.service.name === "Membership" ? (
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                                      row.collectionStatus === "PARTIAL"
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-emerald-100 text-emerald-800"
                                    }`}
                                  >
                                    {row.collectionStatus === "PARTIAL" ? "Partial" : "Fully Paid"}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <p className="mt-1 text-slate-600">{row.service.name} - {row.service.tier}</p>
                            <div className="mt-1 flex items-center justify-between text-slate-700">
                              <span>Paid: {Number(row.amount).toFixed(2)}</span>
                              <span>{new Date(row.paidAt).toLocaleString()}</span>
                            </div>
                            {Number(row.discountPercent ?? 0) > 0 ? (
                              <p className="mt-1 text-[10px] text-slate-500">
                                Gross {Number(row.grossAmount ?? row.amount).toFixed(2)} - {Number(row.discountPercent)}% discount
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
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

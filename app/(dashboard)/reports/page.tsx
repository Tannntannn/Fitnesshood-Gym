"use client";

import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  firstName: string;
  lastName: string;
  membershipTier?: string | null;
  remainingBalance?: string | null;
  totalContractPrice?: string | null;
  fullMembershipExpiry?: string | null;
  monthlyExpiryDate?: string | null;
  dueDate?: string | null;
  lastPaymentDate?: string | null;
  status?: "OVERDUE" | "WITH_BALANCE" | "CLEARED";
  loyaltyStars?: number;
};

type Summary = {
  totalOutstanding: number;
  membersWithBalance: number;
  membersCleared: number;
  overdueMembers: number;
  totalStars: number;
};

type MembershipKpis = {
  totalActiveMemberships: number;
  expiringMembershipFees: number;
  expiredMembershipFees: number;
  monthlyRenewalCount: number;
  membershipContractRevenueMonth: number;
  monthlyFeeRevenueMonth: number;
  monthlySales: number;
  dailySales: number;
  weeklySales: number;
  revenuePerTier: Array<{ tier: string; amount: number }>;
};

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatPeso(n: string | number | null | undefined): string {
  const v = Number(n ?? 0);
  return `₱${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tierBadgeClass(tier: string | null | undefined): string {
  const t = (tier ?? "").toLowerCase();
  const base = "inline-flex max-w-[9rem] truncate rounded-full border px-2 py-0.5 text-[11px] font-medium";
  if (t.includes("founding")) return `${base} border-violet-200 bg-violet-50 text-violet-900`;
  if (t.includes("gold")) return `${base} border-amber-300 bg-amber-50 text-amber-900`;
  if (t.includes("silver")) return `${base} border-slate-300 bg-slate-100 text-slate-800`;
  if (t.includes("bronze")) return `${base} border-orange-300 bg-orange-50 text-orange-900`;
  if (t.includes("student")) return `${base} border-sky-200 bg-sky-50 text-sky-900`;
  return `${base} border-slate-200 bg-white text-slate-600`;
}

function statusBadgeMeta(status: Row["status"]): { label: string; className: string } {
  if (status === "OVERDUE") {
    return { label: "Overdue", className: "border-red-200 bg-red-50 text-red-800" };
  }
  if (status === "WITH_BALANCE") {
    return { label: "Balance due", className: "border-amber-200 bg-amber-50 text-amber-900" };
  }
  return { label: "Cleared", className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
}

function loyaltyPointsClass(points: number): string {
  const base =
    "inline-flex min-w-[2.5rem] items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums";
  if (points > 0) return `${base} border-cyan-200 bg-cyan-50 text-cyan-900`;
  return `${base} border-slate-200 bg-slate-100 text-slate-500`;
}

export default function ReportsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [kpis, setKpis] = useState<MembershipKpis | null>(null);
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);

  const load = async (nextPage = page) => {
    const params = new URLSearchParams({
      page: String(nextPage),
      limit: "25",
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(tier ? { tier } : {}),
      ...(statusFilter ? { statusFilter } : {}),
    });
    const res = await fetch(`/api/reports/balance-credit?${params.toString()}`);
    const json = (await res.json()) as { success?: boolean; data?: Row[]; summary?: Summary; meta?: { hasNextPage?: boolean } };
    if (!json.success) return;
    setRows(json.data ?? []);
    setSummary(json.summary ?? null);
    setHasNextPage(Boolean(json.meta?.hasNextPage));
  };

  useEffect(() => {
    load(1);
    const loadKpis = async () => {
      const res = await fetch("/api/reports/membership-kpis");
      const json = (await res.json()) as { success?: boolean; data?: MembershipKpis };
      if (json.success && json.data) setKpis(json.data);
    };
    loadKpis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4 px-1 sm:px-0">
      <Card className="surface-card space-y-3 p-3 sm:p-5">
        <h1 className="text-xl font-semibold text-slate-900">Balance & Credit Dashboard</h1>
        <p className="text-xs text-slate-500">Bounded report with egress-safe export limit (max 500 rows).</p>
        <div className="grid gap-2 md:grid-cols-[1fr_160px_220px_auto_auto]">
          <Input placeholder="Search member name" value={q} onChange={(e) => setQ(e.target.value)} />
          <select
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All status</option>
            <option value="BOTH_ACTIVE">Both active</option>
            <option value="BOTH_EXPIRED">Both expired</option>
            <option value="MEMBERSHIP_EXPIRED">Membership expired / Monthly active</option>
            <option value="MONTHLY_EXPIRED">Monthly expired / Membership active</option>
            <option value="OVERDUE">Overdue balances</option>
          </select>
          <Input placeholder="Tier filter (e.g. Gold)" value={tier} onChange={(e) => setTier(e.target.value)} />
          <Button
            variant="outline"
            className="border-slate-300 hover:bg-slate-100"
            onClick={() => {
              setPage(1);
              load(1);
            }}
          >
            Apply
          </Button>
          <Button variant="outline" className="border-slate-300 hover:bg-slate-100" onClick={() => load(page)}>
            Refresh
          </Button>
        </div>
      </Card>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Card className="surface-card p-3"><p className="text-xs text-slate-500">Total Outstanding</p><p className="text-xl font-semibold text-red-700">{summary.totalOutstanding.toFixed(2)}</p></Card>
          <Card className="surface-card p-3"><p className="text-xs text-slate-500">Members with Balance</p><p className="text-xl font-semibold text-amber-700">{summary.membersWithBalance}</p></Card>
          <Card className="surface-card p-3"><p className="text-xs text-slate-500">Overdue Members</p><p className="text-xl font-semibold text-rose-700">{summary.overdueMembers}</p></Card>
          <Card className="surface-card p-3"><p className="text-xs text-slate-500">Members Cleared</p><p className="text-xl font-semibold text-emerald-700">{summary.membersCleared}</p></Card>
          <Card className="surface-card p-3"><p className="text-xs text-slate-500">Total Loyalty Stars</p><p className="text-xl font-semibold text-cyan-700">{summary.totalStars}</p></Card>
        </div>
      ) : null}

      {kpis ? (
        <Card className="surface-card space-y-3 p-3 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Membership & revenue (PDF dashboard metrics)</h2>
          <p className="text-xs text-slate-500">Calendar month revenue uses payment posted dates. “Expiring” = membership end within 30 days.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Active memberships</p>
              <p className="text-lg font-semibold text-slate-900">{kpis.totalActiveMemberships}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
              <p className="text-xs text-amber-800">Expiring (30d)</p>
              <p className="text-lg font-semibold text-amber-900">{kpis.expiringMembershipFees}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50/80 p-3">
              <p className="text-xs text-red-800">Expired / status expired</p>
              <p className="text-lg font-semibold text-red-900">{kpis.expiredMembershipFees}</p>
            </div>
            <div className="rounded-lg border border-cyan-200 bg-cyan-50/80 p-3">
              <p className="text-xs text-cyan-800">Monthly renewals (this month)</p>
              <p className="text-lg font-semibold text-cyan-900">{kpis.monthlyRenewalCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Contract / membership fee revenue (month)</p>
              <p className="text-lg font-semibold text-slate-900">₱{kpis.membershipContractRevenueMonth.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Monthly access revenue (month)</p>
              <p className="text-lg font-semibold text-slate-900">₱{kpis.monthlyFeeRevenueMonth.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Sales this month</p>
              <p className="text-lg font-semibold text-slate-900">₱{kpis.monthlySales.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Sales today</p>
              <p className="text-lg font-semibold text-slate-900">₱{kpis.dailySales.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Sales this week</p>
              <p className="text-lg font-semibold text-slate-900">₱{kpis.weeklySales.toFixed(2)}</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Revenue per membership tier (month)</p>
            {kpis.revenuePerTier.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {kpis.revenuePerTier.map((row) => (
                  <div key={row.tier} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="text-xs text-slate-500">{row.tier}</p>
                    <p className="text-sm font-semibold text-slate-900">₱{row.amount.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No membership revenue recorded this month.</p>
            )}
          </div>
        </Card>
      ) : null}

      <Card className="surface-card p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Member balances</h2>
            <p className="mt-1 max-w-xl text-xs text-slate-500">
              Members are sorted by <span className="font-medium text-slate-600">tier (A–Z)</span>, then last name. Loyalty shows
              current points. On small screens, scroll the table sideways.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-slate-300 hover:bg-slate-100"
              onClick={() => {
                const params = new URLSearchParams({
                  ...(q.trim() ? { q: q.trim() } : {}),
                  ...(statusFilter ? { statusFilter } : {}),
                  ...(tier ? { tier } : {}),
                  format: "xlsx",
                });
                window.open(`/api/reports/balance-credit/export?${params.toString()}`, "_blank", "noopener,noreferrer");
              }}
            >
              Export XLSX
            </Button>
            <Button
              variant="outline"
              className="border-slate-300 hover:bg-slate-100"
              onClick={() => {
                const params = new URLSearchParams({
                  ...(q.trim() ? { q: q.trim() } : {}),
                  ...(statusFilter ? { statusFilter } : {}),
                  ...(tier ? { tier } : {}),
                  format: "print",
                });
                window.open(`/api/reports/balance-credit/export?${params.toString()}`, "_blank", "noopener,noreferrer");
              }}
            >
              Printable Report
            </Button>
            <Button
              variant="outline"
              className="border-slate-300 hover:bg-slate-100"
              onClick={() => {
                const params = new URLSearchParams({
                  ...(q.trim() ? { q: q.trim() } : {}),
                  ...(statusFilter ? { statusFilter } : {}),
                  ...(tier ? { tier } : {}),
                  format: "pdf",
                });
                window.open(`/api/reports/balance-credit/export?${params.toString()}`, "_blank", "noopener,noreferrer");
              }}
            >
              Export PDF
            </Button>
          </div>
        </div>

        {rows.length > 0 ? (
          <p className="mb-2 text-xs text-slate-600">
            Showing <span className="font-semibold text-slate-800">{rows.length}</span> member{rows.length === 1 ? "" : "s"} on this page
          </p>
        ) : null}

        <div className="-mx-1 overflow-x-auto rounded-xl border border-slate-200 bg-white sm:mx-0">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="whitespace-nowrap px-3 py-3 pl-4">Member</th>
                <th className="whitespace-nowrap px-3 py-3">Tier</th>
                <th className="whitespace-nowrap px-3 py-3">Balances</th>
                <th className="whitespace-nowrap px-3 py-3">Contract end</th>
                <th className="whitespace-nowrap px-3 py-3">Monthly end</th>
                <th className="whitespace-nowrap px-3 py-3">
                  <span className="inline-flex items-center gap-1">
                    <Award className="h-3.5 w-3.5 text-cyan-600" aria-hidden />
                    Points
                  </span>
                </th>
                <th className="whitespace-nowrap px-3 py-3">Status</th>
                <th className="whitespace-nowrap px-3 py-3 pr-4">Activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const st = statusBadgeMeta(row.status);
                const pts = row.loyaltyStars ?? 0;
                return (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 transition-colors hover:bg-slate-50/90 last:border-b-0"
                  >
                    <td className="px-3 py-3 pl-4 align-top">
                      <p className="font-semibold text-slate-900">
                        {row.firstName} {row.lastName}
                      </p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className={tierBadgeClass(row.membershipTier)} title={row.membershipTier ?? "Unassigned"}>
                        {row.membershipTier?.trim() ? row.membershipTier : "Unassigned"}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top tabular-nums">
                      <p className="text-slate-900">{formatPeso(row.remainingBalance)}</p>
                      <p className="text-xs text-slate-500">of {formatPeso(row.totalContractPrice)} contract</p>
                    </td>
                    <td className="px-3 py-3 align-top text-slate-700 tabular-nums">{formatShortDate(row.fullMembershipExpiry)}</td>
                    <td className="px-3 py-3 align-top text-slate-700 tabular-nums">{formatShortDate(row.monthlyExpiryDate)}</td>
                    <td className="px-3 py-3 align-top">
                      <span className={loyaltyPointsClass(pts)} title="Current loyalty points">{pts}</span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.className}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 pr-4 align-top text-xs text-slate-600">
                      <p>
                        <span className="text-slate-400">Due</span>{" "}
                        <span className="font-medium text-slate-700 tabular-nums">{formatShortDate(row.dueDate)}</span>
                      </p>
                      <p className="mt-0.5">
                        <span className="text-slate-400">Last pay</span>{" "}
                        <span className="font-medium text-slate-700 tabular-nums">{formatShortDate(row.lastPaymentDate)}</span>
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 py-10 text-center">
            <p className="text-sm font-medium text-slate-700">No members match your filters</p>
            <p className="mt-1 text-xs text-slate-500">Clear search or choose “All status”, then Apply.</p>
          </div>
        ) : null}
        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="outline"
            className="border-slate-300 hover:bg-slate-100"
            disabled={page <= 1}
            onClick={() => {
              const next = Math.max(1, page - 1);
              setPage(next);
              load(next);
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            className="border-slate-300 hover:bg-slate-100"
            disabled={!hasNextPage}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              load(next);
            }}
          >
            Next
          </Button>
        </div>
      </Card>
    </div>
  );
}


"use client";

import { useEffect, useRef, useState } from "react";
import { Award, Ban, Pencil, RotateCcw, Trash2, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LOYALTY_INACTIVITY_EXPIRE_MONTHS, LOYALTY_POINTS_EXPIRED_REASON } from "@/lib/loyalty-expiration";
import {
  LOYALTY_VOIDED_ENTRY_REASON,
  LOYALTY_VOID_REVERSAL_REASON,
  parseLoyaltyVoidAdminReason,
} from "@/lib/loyalty-void";
import { formatRoleLabel } from "@/lib/role-labels";
import type { UserRole } from "@prisma/client";

type UserPick = { id: string; firstName: string; lastName: string; role: UserRole };

type LedgerRow = {
  id: string;
  userId: string;
  points: number;
  pointsEarned?: number;
  pointsDeducted?: number;
  remainingBalance?: number | null;
  reason: string;
  reasonDetail?: string | null;
  transactionReference?: string | null;
  claimId?: string | null;
  adminApproval?: string;
  adjustedBy?: string | null;
  adjustedAt?: string | null;
  amountBasis?: string | null;
  rewardUsed: boolean;
  notes?: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string };
};
type RankingRow = { id: string; firstName: string; lastName: string; loyaltyStars: number | null; role?: string };
type ClaimRow = {
  id: string;
  userId: string;
  rewardName: string;
  pointsRequired: number;
  status: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; loyaltyStars: number | null };
};

const VOID_REVERSAL = "VOID_REVERSAL";

function reasonBadgeClass(reason: string, voided: boolean): string {
  const base = "inline-flex max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  if (voided) return `${base} border-slate-300 bg-slate-100 text-slate-500 line-through decoration-slate-400`;
  if (reason === VOID_REVERSAL) return `${base} border-violet-300 bg-violet-50 text-violet-800`;
  if (reason === "PAYMENT_EARNED") return `${base} border-emerald-300 bg-emerald-50 text-emerald-800`;
  if (reason === LOYALTY_POINTS_EXPIRED_REASON) return `${base} border-rose-300 bg-rose-50 text-rose-900`;
  if (reason.includes("CLAIM") || reason.includes("REDEEM")) return `${base} border-amber-300 bg-amber-50 text-amber-900`;
  if (reason.includes("MANUAL")) return `${base} border-sky-300 bg-sky-50 text-sky-900`;
  return `${base} border-slate-200 bg-white text-slate-700`;
}

function reasonShortLabel(reason: string): string {
  if (reason === "PAYMENT_EARNED") return "Payment earned";
  if (reason === LOYALTY_POINTS_EXPIRED_REASON) return "Expired (inactive)";
  if (reason === LOYALTY_VOID_REVERSAL_REASON) return "Balance reversal";
  if (reason === LOYALTY_VOIDED_ENTRY_REASON) return "Voided entry";
  if (reason === "CLAIM_APPROVED") return "Claim approved";
  return reason.replace(/_/g, " ");
}

export default function LoyaltyPage() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [filterUserId, setFilterUserId] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ hasNextPage: false });
  const [form, setForm] = useState({ userId: "", points: "", reason: "MANUAL_ADJUST", notes: "" });
  const [editing, setEditing] = useState<LedgerRow | null>(null);
  const [summary, setSummary] = useState({ totalIssued: 0, totalClaimed: 0 });
  const [claimForm, setClaimForm] = useState({ userId: "", rewardName: "", pointsRequired: "", notes: "" });
  const [adjustSearch, setAdjustSearch] = useState("");
  const [adjustCandidates, setAdjustCandidates] = useState<UserPick[]>([]);
  const [adjustPickedLabel, setAdjustPickedLabel] = useState("");
  const [claimSearch, setClaimSearch] = useState("");
  const [claimCandidates, setClaimCandidates] = useState<UserPick[]>([]);
  const [claimPickedLabel, setClaimPickedLabel] = useState("");
  const [formNotice, setFormNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [voiding, setVoiding] = useState<LedgerRow | null>(null);
  const [voidReasonInput, setVoidReasonInput] = useState("");
  const [voidSaving, setVoidSaving] = useState(false);
  const [deleting, setDeleting] = useState<LedgerRow | null>(null);
  const [deleteReasonInput, setDeleteReasonInput] = useState("");
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const adjustSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claimSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async (nextPage = page) => {
    const params = new URLSearchParams({
      page: String(nextPage),
      limit: "20",
      ...(filterUserId.trim() ? { userId: filterUserId.trim() } : {}),
      ...(nameQuery.trim() ? { q: nameQuery.trim() } : {}),
    });
    const res = await fetch(`/api/loyalty/ledger?${params.toString()}`);
    const json = (await res.json()) as {
      success?: boolean;
      data?: LedgerRow[];
      rankings?: RankingRow[];
      summary?: { totalIssued?: number; totalClaimed?: number };
      meta?: { hasNextPage?: boolean };
    };
    if (json.success) {
      setRows(json.data ?? []);
      setRankings(json.rankings ?? []);
      setSummary({ totalIssued: Number(json.summary?.totalIssued ?? 0), totalClaimed: Number(json.summary?.totalClaimed ?? 0) });
      setMeta({ hasNextPage: Boolean(json.meta?.hasNextPage) });
    }
  };

  const loadClaims = async () => {
    const res = await fetch("/api/loyalty/claims");
    const json = (await res.json()) as { success?: boolean; data?: ClaimRow[] };
    if (json.success) setClaims(json.data ?? []);
  };

  useEffect(() => {
    load(1);
    loadClaims();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = adjustSearch.trim();
    if (adjustSearchTimerRef.current) clearTimeout(adjustSearchTimerRef.current);
    if (q.length < 2) {
      setAdjustCandidates([]);
      return;
    }
    adjustSearchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/attendance/manual-search?q=${encodeURIComponent(q)}&limit=30`);
        const json = (await res.json()) as { success?: boolean; data?: Array<UserPick & { canScan?: boolean }> };
        setAdjustCandidates(
          json.success
            ? (json.data ?? []).map((r) => ({
                id: r.id,
                firstName: r.firstName,
                lastName: r.lastName,
                role: r.role,
              }))
            : [],
        );
      } catch {
        setAdjustCandidates([]);
      }
    }, 280);
    return () => {
      if (adjustSearchTimerRef.current) clearTimeout(adjustSearchTimerRef.current);
    };
  }, [adjustSearch]);

  useEffect(() => {
    const q = claimSearch.trim();
    if (claimSearchTimerRef.current) clearTimeout(claimSearchTimerRef.current);
    if (q.length < 2) {
      setClaimCandidates([]);
      return;
    }
    claimSearchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/attendance/manual-search?q=${encodeURIComponent(q)}&limit=30`);
        const json = (await res.json()) as { success?: boolean; data?: Array<UserPick & { canScan?: boolean }> };
        setClaimCandidates(
          json.success
            ? (json.data ?? []).map((r) => ({
                id: r.id,
                firstName: r.firstName,
                lastName: r.lastName,
                role: r.role,
              }))
            : [],
        );
      } catch {
        setClaimCandidates([]);
      }
    }, 280);
    return () => {
      if (claimSearchTimerRef.current) clearTimeout(claimSearchTimerRef.current);
    };
  }, [claimSearch]);

  return (
    <div className="space-y-4 px-1 sm:px-0">
      {formNotice ? (
        <div
          className={`fixed left-3 right-3 top-16 z-50 rounded-lg border px-3 py-2 text-xs font-medium shadow-lg sm:left-auto sm:right-4 ${
            formNotice.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {formNotice.message}
        </div>
      ) : null}
      <Card className="surface-card space-y-3 p-3 sm:p-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Loyalty points</h1>
          <p className="mt-1 text-xs text-slate-600">
            Earning rule: every ₱100 paid (final amount) = 1 point for the paying user (members, walk-ins, and other roles on eligible payment types). Optional env{" "}
            <code className="rounded bg-slate-100 px-1">LOYALTY_EARNING_TRANSACTION_TYPES</code> (comma-separated types, e.g.{" "}
            <code className="rounded bg-slate-100 px-1">MONTHLY_FEE,WALK_IN,ADD_ON,OTHER</code>) limits which payment types accrue points.
            Balances reset to 0 after {LOYALTY_INACTIVITY_EXPIRE_MONTHS} months with no earn or redemption (ledger shows{" "}
            <span className="font-mono text-[10px]">{LOYALTY_POINTS_EXPIRED_REASON}</span>). Schedule{" "}
            <code className="rounded bg-slate-100 px-1">GET /api/cron/loyalty-expire</code> daily (see <code className="rounded bg-slate-100 px-1">vercel.json</code> on Vercel, or call manually with{" "}
            <code className="rounded bg-slate-100 px-1">Authorization: Bearer CRON_SECRET</code>).
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Points issued (active)</p>
            <p className="text-lg font-bold tabular-nums text-emerald-900">{summary.totalIssued}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">Points deducted (active)</p>
            <p className="text-lg font-bold tabular-nums text-amber-950">{summary.totalClaimed}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Note</p>
            <p className="text-xs text-slate-600">Totals exclude voided rows. Void creates a reversal line and restores balance.</p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto]">
          <Input
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="Search by name (e.g. Juan or Juan Dela Cruz)"
          />
          <Input
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            placeholder="Filter by user ID (optional, exact)"
          />
          <Button
            variant="outline"
            className="border-slate-300 hover:bg-slate-100"
            onClick={() => {
              setPage(1);
              load(1);
            }}
          >
            Apply Filter
          </Button>
          <Button variant="outline" className="border-slate-300 hover:bg-slate-100" onClick={() => load(page)}>
            Refresh
          </Button>
        </div>
      </Card>

      <Card className="surface-card space-y-3 p-3 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Manual Add / Deduct / Claim Approval</h2>
        <p className="text-xs text-slate-500">
          Search by name (all registered users: members, walk-ins, etc.), click a match to select, then enter points. Or paste a User ID below if you already have it.
        </p>
        <div className="space-y-2">
          <Input
            value={adjustSearch}
            onChange={(e) => setAdjustSearch(e.target.value)}
            placeholder="Search user by name (type 2+ letters)"
            className="max-w-xl"
          />
          {adjustPickedLabel || form.userId ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1">
                Selected: <strong>{adjustPickedLabel || "—"}</strong>
                {form.userId ? <span className="text-slate-500"> · ID: {form.userId}</span> : null}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-7 border-slate-300 px-2 text-[11px]"
                onClick={() => {
                  setForm((prev) => ({ ...prev, userId: "" }));
                  setAdjustPickedLabel("");
                  setAdjustSearch("");
                  setAdjustCandidates([]);
                }}
              >
                Clear selection
              </Button>
            </div>
          ) : null}
          {adjustCandidates.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {adjustCandidates.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  variant="outline"
                  className="h-8 border-slate-300 px-2 text-[11px]"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, userId: c.id }));
                    setAdjustPickedLabel(`${c.firstName} ${c.lastName} (${formatRoleLabel(c.role)})`);
                  }}
                >
                  {c.firstName} {c.lastName}
                  <span className="ml-1 text-[10px] font-normal text-slate-500">· {formatRoleLabel(c.role)}</span>
                </Button>
              ))}
            </div>
          ) : adjustSearch.trim().length >= 2 ? (
            <p className="text-[11px] text-slate-500">No matches. Try another spelling.</p>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            value={form.userId}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, userId: e.target.value }));
              if (!e.target.value.trim()) setAdjustPickedLabel("");
            }}
            placeholder="User ID (optional if you selected a name above)"
          />
          <Input
            value={form.points}
            onChange={(e) => setForm((prev) => ({ ...prev, points: e.target.value }))}
            placeholder="Points (+ add, - deduct)"
          />
          <Input
            value={form.reason}
            onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
            placeholder="Reason (e.g. CLAIM_APPROVED)"
          />
          <Input
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Notes / audit detail"
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={async () => {
              const uid = form.userId.trim();
              if (!uid) {
                setFormNotice({ type: "error", message: "Select a user by name or paste a User ID." });
                setTimeout(() => setFormNotice(null), 3200);
                return;
              }
              const res = await fetch("/api/loyalty/ledger", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userId: uid,
                  points: Number(form.points),
                  reason: form.reason.trim(),
                  notes: form.notes.trim(),
                  rewardUsed: form.reason.trim().toUpperCase().includes("CLAIM"),
                }),
              });
              const json = (await res.json()) as { success?: boolean; error?: string };
              if (!res.ok || !json.success) {
                setFormNotice({ type: "error", message: json.error || "Adjustment failed." });
                setTimeout(() => setFormNotice(null), 3200);
                return;
              }
              setFormNotice({ type: "success", message: "Adjustment saved." });
              setTimeout(() => setFormNotice(null), 2200);
              setForm({ userId: "", points: "", reason: "MANUAL_ADJUST", notes: "" });
              setAdjustPickedLabel("");
              setAdjustSearch("");
              setAdjustCandidates([]);
              load(page);
            }}
          >
            Save Adjustment
          </Button>
        </div>
      </Card>

      <Card className="surface-card space-y-3 p-3 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Claim Requests (Approval Workflow)</h2>
        <p className="text-xs text-slate-500">Search by name (any registered user) and select, or paste User ID.</p>
        <div className="space-y-2">
          <Input
            value={claimSearch}
            onChange={(e) => setClaimSearch(e.target.value)}
            placeholder="Search user by name (type 2+ letters)"
            className="max-w-xl"
          />
          {claimPickedLabel || claimForm.userId ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <span className="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1">
                Selected: <strong>{claimPickedLabel || "—"}</strong>
                {claimForm.userId ? <span className="text-slate-500"> · ID: {claimForm.userId}</span> : null}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-7 border-slate-300 px-2 text-[11px]"
                onClick={() => {
                  setClaimForm((p) => ({ ...p, userId: "" }));
                  setClaimPickedLabel("");
                  setClaimSearch("");
                  setClaimCandidates([]);
                }}
              >
                Clear selection
              </Button>
            </div>
          ) : null}
          {claimCandidates.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {claimCandidates.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  variant="outline"
                  className="h-8 border-slate-300 px-2 text-[11px]"
                  onClick={() => {
                    setClaimForm((p) => ({ ...p, userId: c.id }));
                    setClaimPickedLabel(`${c.firstName} ${c.lastName} (${formatRoleLabel(c.role)})`);
                  }}
                >
                  {c.firstName} {c.lastName}
                  <span className="ml-1 text-[10px] font-normal text-slate-500">· {formatRoleLabel(c.role)}</span>
                </Button>
              ))}
            </div>
          ) : claimSearch.trim().length >= 2 ? (
            <p className="text-[11px] text-slate-500">No matches.</p>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            value={claimForm.userId}
            onChange={(e) => {
              setClaimForm((p) => ({ ...p, userId: e.target.value }));
              if (!e.target.value.trim()) setClaimPickedLabel("");
            }}
            placeholder="User ID (optional if selected above)"
          />
          <Input value={claimForm.rewardName} onChange={(e) => setClaimForm((p) => ({ ...p, rewardName: e.target.value }))} placeholder="Reward name" />
          <Input value={claimForm.pointsRequired} onChange={(e) => setClaimForm((p) => ({ ...p, pointsRequired: e.target.value }))} placeholder="Points required" />
          <Input value={claimForm.notes} onChange={(e) => setClaimForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={async () => {
              const uid = claimForm.userId.trim();
              if (!uid) {
                setFormNotice({ type: "error", message: "Select a user by name or paste a User ID for the claim." });
                setTimeout(() => setFormNotice(null), 3200);
                return;
              }
              const res = await fetch("/api/loyalty/claims", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userId: uid,
                  rewardName: claimForm.rewardName.trim(),
                  pointsRequired: Number(claimForm.pointsRequired),
                  notes: claimForm.notes.trim(),
                }),
              });
              const json = (await res.json()) as { success?: boolean; error?: string };
              if (!res.ok || !json.success) {
                setFormNotice({ type: "error", message: json.error || "Create claim failed." });
                setTimeout(() => setFormNotice(null), 3200);
                return;
              }
              setFormNotice({ type: "success", message: "Claim created." });
              setTimeout(() => setFormNotice(null), 2200);
              setClaimForm({ userId: "", rewardName: "", pointsRequired: "", notes: "" });
              setClaimPickedLabel("");
              setClaimSearch("");
              setClaimCandidates([]);
              loadClaims();
            }}
          >
            Create Claim
          </Button>
        </div>
        <div className="space-y-3">
          {claims.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-4 text-xs text-slate-700 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {row.user.firstName} {row.user.lastName}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-cyan-800">{row.rewardName}</p>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    row.status === "PENDING"
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : row.status === "APPROVED"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-slate-300 bg-slate-100 text-slate-600"
                  }`}
                >
                  {row.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-600">
                <span>
                  <span className="text-slate-400">Cost</span>{" "}
                  <strong className="text-slate-900">{row.pointsRequired}</strong> pts
                </span>
                <span>
                  <span className="text-slate-400">Member balance</span>{" "}
                  <strong className="tabular-nums text-slate-900">{row.user.loyaltyStars ?? 0}</strong>
                </span>
                <span className="text-slate-500">{new Date(row.createdAt).toLocaleString()}</span>
              </div>
              {row.notes ? <p className="mt-2 rounded-md bg-slate-100/80 px-2 py-1 text-slate-600">Notes: {row.notes}</p> : null}
              {row.status === "PENDING" ? (
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    className="h-7 border-emerald-300 px-2 text-[11px] text-emerald-700"
                    onClick={async () => {
                      await fetch(`/api/loyalty/claims/${row.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "APPROVE" }),
                      });
                      loadClaims();
                      load(page);
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="h-7 border-red-300 px-2 text-[11px] text-red-700"
                    onClick={async () => {
                      await fetch(`/api/loyalty/claims/${row.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "REJECT" }),
                      });
                      loadClaims();
                    }}
                  >
                    Reject
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {claims.length === 0 ? <p className="text-xs text-slate-500">No claims yet.</p> : null}
        </div>
      </Card>

      <Card className="surface-card p-3 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Top point balances</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rankings.map((row, i) => {
            const rank = i + 1;
            const ring =
              rank === 1
                ? "border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100/80 shadow-amber-100"
                : rank === 2
                  ? "border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100/80"
                  : rank === 3
                    ? "border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100/50"
                    : "border-slate-200 bg-slate-50";
            return (
              <div
                key={row.id}
                className={`relative flex items-center gap-3 rounded-xl border px-3 py-3 text-sm ${ring}`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    rank === 1 ? "bg-amber-400 text-amber-950" : "bg-white text-slate-700 ring-1 ring-slate-200"
                  }`}
                >
                  {rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">
                    {row.firstName} {row.lastName}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-600">
                    <Award className="h-3.5 w-3.5 text-cyan-600" aria-hidden />
                    <span className="font-semibold tabular-nums text-slate-900">{row.loyaltyStars ?? 0}</span> points
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        {rankings.length === 0 ? <p className="text-xs text-slate-500">No point balances yet.</p> : null}
      </Card>

      <Card className="surface-card p-3 sm:p-5">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-slate-500" aria-hidden />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Transaction history</h2>
              <p className="text-xs text-slate-500">
                Newest first. Void keeps history and adds a reversal row. Delete permanently removes the row and reverses its
                effect on points (and reopens an approved reward claim when applicable).
              </p>
            </div>
          </div>
        </div>

        <div className="-mx-1 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[800px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="whitespace-nowrap px-3 py-2.5 pl-2">When</th>
                <th className="whitespace-nowrap px-3 py-2.5">Member</th>
                <th className="whitespace-nowrap px-3 py-2.5">Type</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">Pts</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">Earn / Deduct</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">Balance</th>
                <th className="whitespace-nowrap px-3 py-2.5">Reference</th>
                <th className="whitespace-nowrap px-3 py-2.5 pr-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const voided = row.reason === LOYALTY_VOIDED_ENTRY_REASON;
                const canVoid = !voided && row.reason !== LOYALTY_VOID_REVERSAL_REASON;
                const canEdit = canVoid;
                const canDelete = row.reason !== LOYALTY_VOID_REVERSAL_REASON;
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-slate-100 transition-colors hover:bg-slate-50/90 ${
                      voided ? "bg-slate-50/50 text-slate-500" : ""
                    } ${row.reason === LOYALTY_VOID_REVERSAL_REASON ? "bg-violet-50/40" : ""}`}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 pl-2 align-top text-xs text-slate-600">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="max-w-[140px] px-3 py-2.5 align-top">
                      <p className={`truncate font-medium text-slate-900 ${voided ? "line-through decoration-slate-400" : ""}`}>
                        {row.user.firstName} {row.user.lastName}
                      </p>
                      <p className="truncate text-[10px] text-slate-400">{row.userId}</p>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span className={reasonBadgeClass(row.reason, voided)} title={row.reason}>
                        {reasonShortLabel(row.reason)}
                      </span>
                      {voided ? (
                        <span className="mt-1 flex items-center gap-0.5 text-[10px] font-medium text-amber-800">
                          <Ban className="h-3 w-3 shrink-0" aria-hidden />
                          Voided
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right align-top text-sm font-semibold tabular-nums ${
                        voided
                          ? "text-slate-400 line-through"
                          : row.points >= 0
                            ? "text-emerald-700"
                            : "text-red-700"
                      }`}
                    >
                      {row.points >= 0 ? "+" : ""}
                      {row.points}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top text-xs tabular-nums text-slate-600">
                      +{row.pointsEarned ?? 0} / −{row.pointsDeducted ?? 0}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top text-xs font-medium tabular-nums text-slate-800">
                      {row.remainingBalance ?? "—"}
                    </td>
                    <td className="max-w-[160px] px-3 py-2.5 align-top text-[11px] text-slate-600">
                      <p className="truncate" title={row.transactionReference ?? ""}>
                        {row.transactionReference ?? "—"}
                      </p>
                      {row.adjustedBy ? <p className="truncate text-slate-400">by {row.adjustedBy}</p> : null}
                      {voided && parseLoyaltyVoidAdminReason(row.notes) ? (
                        <p
                          className="mt-1 line-clamp-2 text-amber-900/80"
                          title={parseLoyaltyVoidAdminReason(row.notes) ?? ""}
                        >
                          Void: {parseLoyaltyVoidAdminReason(row.notes)}
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 pr-2 text-right align-top">
                      <div className="flex flex-wrap justify-end gap-1">
                        {canEdit ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 border-slate-300 px-2 text-[11px]"
                            onClick={() => setEditing(row)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
                            Edit
                          </Button>
                        ) : null}
                        {canVoid ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 border-amber-300 px-2 text-[11px] text-amber-900 hover:bg-amber-50"
                            onClick={() => {
                              setVoiding(row);
                              setVoidReasonInput("");
                            }}
                          >
                            <Ban className="mr-1 h-3.5 w-3.5" aria-hidden />
                            Void
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 border-red-300 px-2 text-[11px] text-red-800 hover:bg-red-50"
                            onClick={() => {
                              setDeleting(row);
                              setDeleteReasonInput("");
                            }}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">No loyalty entries.</div>
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
            disabled={!meta.hasNextPage}
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

      <Dialog
        open={Boolean(voiding)}
        onOpenChange={(open) => {
          if (!open) {
            if (voidSaving) return;
            setVoiding(null);
            setVoidReasonInput("");
          }
        }}
      >
        <DialogContent
          className="max-h-[min(90vh,640px)] overflow-y-auto border-amber-200/60 bg-white text-slate-900 sm:max-w-md"
          showCloseButton={!voidSaving}
        >
          {voiding ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-900">Void ledger entry</DialogTitle>
                <DialogDescription className="text-slate-600">
                  <span className="font-medium text-slate-800">
                    {voiding.user.firstName} {voiding.user.lastName}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">Entry ID · {voiding.id}</span>
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-1">
                <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-slate-700">
                  <p>
                    Original line:{" "}
                    <strong className={voiding.points >= 0 ? "text-emerald-700" : "text-red-700"}>
                      {voiding.points >= 0 ? "+" : ""}
                      {voiding.points}
                    </strong>{" "}
                    pts ({reasonShortLabel(voiding.reason)}). Member balance will change by{" "}
                    <strong className="tabular-nums text-slate-900">
                      {voiding.points <= 0 ? "+" : "−"}
                      {Math.abs(voiding.points)}
                    </strong>{" "}
                    pts; a reversal row is added for the audit trail.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="loyalty-void-reason" className="text-xs font-medium text-slate-700">
                    Reason (required)
                  </label>
                  <textarea
                    id="loyalty-void-reason"
                    className="min-h-[88px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    value={voidReasonInput}
                    onChange={(e) => setVoidReasonInput(e.target.value)}
                    placeholder="e.g. Duplicate payment post, wrong member, admin correction…"
                    disabled={voidSaving}
                  />
                </div>
              </div>

              <DialogFooter className="border-slate-200 bg-slate-50/80 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-300"
                  onClick={() => {
                    setVoidSaving(false);
                    setVoiding(null);
                    setVoidReasonInput("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-amber-700 text-white hover:bg-amber-800"
                  disabled={voidSaving}
                  onClick={async () => {
                    const r = voidReasonInput.trim();
                    if (!r) {
                      setFormNotice({ type: "error", message: "Enter a reason to void this entry." });
                      setTimeout(() => setFormNotice(null), 2800);
                      return;
                    }
                    setVoidSaving(true);
                    try {
                      const res = await fetch(`/api/loyalty/ledger/${voiding.id}/void`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ reason: r }),
                      });
                      const json = (await res.json()) as { success?: boolean; error?: string };
                      if (!res.ok || !json.success) {
                        setFormNotice({ type: "error", message: json.error || "Void failed." });
                        setTimeout(() => setFormNotice(null), 3200);
                        return;
                      }
                      setFormNotice({ type: "success", message: "Entry voided; balance updated." });
                      setTimeout(() => setFormNotice(null), 2200);
                      setVoiding(null);
                      setVoidReasonInput("");
                      load(page);
                      loadClaims();
                    } finally {
                      setVoidSaving(false);
                    }
                  }}
                >
                  {voidSaving ? "Voiding…" : "Confirm void"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            if (deleteSaving) return;
            setDeleting(null);
            setDeleteReasonInput("");
          }
        }}
      >
        <DialogContent
          className="max-h-[min(90vh,640px)] overflow-y-auto border-red-200/60 bg-white text-slate-900 sm:max-w-md"
          showCloseButton={!deleteSaving}
        >
          {deleting ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-900">Delete ledger entry</DialogTitle>
                <DialogDescription className="text-slate-600">
                  <span className="font-medium text-slate-800">
                    {deleting.user.firstName} {deleting.user.lastName}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">Entry ID · {deleting.id}</span>
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-1">
                <div className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-xs text-slate-700">
                  {deleting.reason === LOYALTY_VOIDED_ENTRY_REASON ? (
                    <p>
                      This removes the voided line and its paired <strong>balance reversal</strong> row from the database,
                      and updates the member&apos;s points so it matches having no void (same as undoing a void).
                    </p>
                  ) : (
                    <p>
                      This <strong>permanently deletes</strong> this transaction line. The member&apos;s balance changes by{" "}
                      <strong className="tabular-nums text-slate-900">
                        {deleting.points <= 0 ? "+" : "−"}
                        {Math.abs(deleting.points)}
                      </strong>{" "}
                      points (inverse of this row).
                      {deleting.reason === "CLAIM_APPROVED" ? (
                        <span className="mt-1 block font-medium text-red-900">
                          The linked reward claim will go back to <strong>PENDING</strong> so it can be processed again.
                        </span>
                      ) : null}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="loyalty-delete-reason" className="text-xs font-medium text-slate-700">
                    Reason (required)
                  </label>
                  <textarea
                    id="loyalty-delete-reason"
                    className="min-h-[88px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                    value={deleteReasonInput}
                    onChange={(e) => setDeleteReasonInput(e.target.value)}
                    placeholder="e.g. Duplicate entry, entered on wrong member, test data…"
                    disabled={deleteSaving}
                  />
                </div>
              </div>

              <DialogFooter className="border-slate-200 bg-slate-50/80 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-300"
                  onClick={() => {
                    setDeleteSaving(false);
                    setDeleting(null);
                    setDeleteReasonInput("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-red-700 text-white hover:bg-red-800"
                  disabled={deleteSaving}
                  onClick={async () => {
                    const r = deleteReasonInput.trim();
                    if (!r) {
                      setFormNotice({ type: "error", message: "Enter a reason to delete this entry." });
                      setTimeout(() => setFormNotice(null), 2800);
                      return;
                    }
                    setDeleteSaving(true);
                    try {
                      const res = await fetch(`/api/loyalty/ledger/${deleting.id}`, {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ reason: r }),
                      });
                      const json = (await res.json()) as { success?: boolean; error?: string };
                      if (!res.ok || !json.success) {
                        setFormNotice({ type: "error", message: json.error || "Delete failed." });
                        setTimeout(() => setFormNotice(null), 3200);
                        return;
                      }
                      setFormNotice({ type: "success", message: "Entry deleted; balance updated." });
                      setTimeout(() => setFormNotice(null), 2200);
                      setDeleting(null);
                      setDeleteReasonInput("");
                      load(page);
                      loadClaims();
                    } finally {
                      setDeleteSaving(false);
                    }
                  }}
                >
                  {deleteSaving ? "Deleting…" : "Confirm delete"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent
          className="max-h-[min(90vh,640px)] overflow-y-auto border-slate-200 bg-white text-slate-900 sm:max-w-md"
          showCloseButton
        >
          {editing ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-900">Edit loyalty entry</DialogTitle>
                <DialogDescription className="text-slate-600">
                  <span className="font-medium text-slate-800">
                    {editing.user.firstName} {editing.user.lastName}
                  </span>
                  <span className="block text-xs text-slate-500">Entry ID · {editing.id}</span>
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-1">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <p>
                    <span className="text-slate-500">Current line</span>{" "}
                    <span className={editing.points >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
                      {editing.points >= 0 ? "+" : ""}
                      {editing.points} pts
                    </span>
                    <span className="text-slate-400"> · </span>
                    {reasonShortLabel(editing.reason)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Saving updates this row and adjusts the member&apos;s balance by the difference in points.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="loyalty-edit-points" className="text-xs font-medium text-slate-700">
                    Points (net for this entry)
                  </label>
                  <Input
                    id="loyalty-edit-points"
                    type="number"
                    className="border-slate-300"
                    value={String(editing.points)}
                    onChange={(e) =>
                      setEditing((prev) => (prev ? { ...prev, points: Number(e.target.value || "0") } : prev))
                    }
                    placeholder="e.g. 10 or -5"
                  />
                  <p className="text-[11px] text-slate-500">Use positive for earned, negative for deductions.</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="loyalty-edit-reason" className="text-xs font-medium text-slate-700">
                    Reason code
                  </label>
                  <Input
                    id="loyalty-edit-reason"
                    className="border-slate-300"
                    value={editing.reason}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, reason: e.target.value } : prev))}
                    placeholder="e.g. MANUAL_ADJUST, PAYMENT_EARNED"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="loyalty-edit-notes" className="text-xs font-medium text-slate-700">
                    Notes / audit detail
                  </label>
                  <textarea
                    id="loyalty-edit-notes"
                    className="min-h-[88px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    value={editing.notes ?? ""}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, notes: e.target.value } : prev))}
                    placeholder="Why is this correction being made?"
                  />
                </div>
              </div>

              <DialogFooter className="border-slate-200 bg-slate-50/80 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-300"
                  disabled={editSaving}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-slate-900 text-white hover:bg-slate-800"
                  disabled={editSaving || !editing.reason.trim() || editing.points === 0}
                  onClick={async () => {
                    if (!editing.reason.trim() || editing.points === 0) {
                      setFormNotice({ type: "error", message: "Reason is required and points cannot be zero." });
                      setTimeout(() => setFormNotice(null), 2800);
                      return;
                    }
                    setEditSaving(true);
                    try {
                      const res = await fetch(`/api/loyalty/ledger/${editing.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          points: editing.points,
                          reason: editing.reason.trim(),
                          notes: editing.notes?.trim() ?? "",
                        }),
                      });
                      const json = (await res.json()) as { success?: boolean; error?: string };
                      if (!res.ok || !json.success) {
                        setFormNotice({ type: "error", message: json.error || "Update failed." });
                        setTimeout(() => setFormNotice(null), 3200);
                        return;
                      }
                      setFormNotice({ type: "success", message: "Loyalty entry updated." });
                      setTimeout(() => setFormNotice(null), 2200);
                      setEditing(null);
                      load(page);
                    } finally {
                      setEditSaving(false);
                    }
                  }}
                >
                  {editSaving ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}


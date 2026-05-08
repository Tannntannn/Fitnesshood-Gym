"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserRole } from "@prisma/client";
import { differenceInCalendarDays, format } from "date-fns";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScanInput } from "@/components/scan-input";
import { nowInPH } from "@/lib/time";
import { formatRoleLabel } from "@/lib/role-labels";

type ManualCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  canScan?: boolean;
  blockReason?: string | null;
};

type ClientPreviewUser = {
  id: string;
  firstName: string;
  lastName: string;
  contactNo: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  role: UserRole;
  qrCodeImage: string;
  membershipStart: string | null;
  membershipExpiry: string | null;
  profileImageUrl: string | null;
};
type ClientPreviewAttendance = { id: string; scannedAt: string; timeIn: string; date: string };
type WalkInRegistrationSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  createdAt: string;
};

function ClientPreviewPanel({
  user,
  attendance,
  previewImageFailed,
  onProfileImageError,
}: {
  user: ClientPreviewUser;
  attendance: ClientPreviewAttendance[];
  previewImageFailed: boolean;
  onProfileImageError: () => void;
}) {
  const remainingDays =
    user.membershipExpiry != null
      ? differenceInCalendarDays(new Date(user.membershipExpiry), new Date())
      : null;
  return (
    <div className="space-y-3 p-3 text-left text-xs text-slate-700 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {user.profileImageUrl && !previewImageFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.profileImageUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={onProfileImageError}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-500">
                {`${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`}
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="truncate text-sm font-semibold text-slate-900">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-[11px] text-slate-600">{formatRoleLabel(user.role)}</p>
            <p className="truncate text-[11px] text-slate-500">Contact: {user.contactNo || "—"}</p>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">QR</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={user.qrCodeImage} alt="Member QR" className="mx-auto mt-1 max-h-24 w-auto" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-[11px]">
        <div className="rounded border border-slate-100 bg-slate-50 px-1.5 py-1">
          <p className="text-slate-500">Start</p>
          <p className="font-medium text-slate-900">
            {user.membershipStart ? format(new Date(user.membershipStart), "MMM d, yy") : "—"}
          </p>
        </div>
        <div className="rounded border border-slate-100 bg-slate-50 px-1.5 py-1">
          <p className="text-slate-500">Expiry</p>
          <p className="font-medium text-slate-900">
            {user.membershipExpiry ? format(new Date(user.membershipExpiry), "MMM d, yy") : "—"}
          </p>
        </div>
        <div className="rounded border border-slate-100 bg-slate-50 px-1.5 py-1">
          <p className="text-slate-500">Days left</p>
          <p className="font-medium text-slate-900">{remainingDays !== null ? `${remainingDays}` : "—"}</p>
        </div>
      </div>
      <div className="max-h-[140px] overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-slate-100 text-slate-600">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Date</th>
              <th className="px-2 py-1.5 text-left font-semibold">Time in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {attendance.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-2 py-3 text-center text-slate-400">
                  No attendance yet.
                </td>
              </tr>
            ) : (
              attendance.map((row) => (
                <tr key={row.id}>
                  <td className="px-2 py-1">{format(new Date(row.date), "MMM d, yyyy")}</td>
                  <td className="px-2 py-1">{row.timeIn}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400">Same data as the member portal; loaded with your admin session.</p>
    </div>
  );
}

type AttendanceSummary = {
  totalAll: number;
  totals: Record<UserRole, number>;
  activeTotals?: Record<UserRole, number>;
  currentPopulation?: number;
  peakHours?: Array<{ hour: string; count: number }>;
  recent: Array<{
    id: string;
    scannedAt: string;
    timeIn: string;
    roleSnapshot: UserRole;
    user: { firstName: string; lastName: string };
  }>;
};

export default function DashboardPage() {
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clock, setClock] = useState<Date | null>(null);
  const [previewUser, setPreviewUser] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [previewPayload, setPreviewPayload] = useState<{
    user: ClientPreviewUser;
    attendance: ClientPreviewAttendance[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState("");
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [manualSearch, setManualSearch] = useState("");
  const [manualCandidates, setManualCandidates] = useState<ManualCandidate[]>([]);
  const [manualUserId, setManualUserId] = useState("");
  const [searchingManual, setSearchingManual] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [recentRegistrations, setRecentRegistrations] = useState<WalkInRegistrationSummary[]>([]);

  const showNotice = useCallback((type: "success" | "error", message: string) => {
    setNotice({ type, message });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2600);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      if (manualSearchTimerRef.current) clearTimeout(manualSearchTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const res = await fetch("/api/attendance/summary");
        const json = (await res.json()) as { success?: boolean; data?: AttendanceSummary };
        if (json.success) setSummary(json.data ?? null);
      } catch {
        // keep last snapshot
      }
    };
    loadSummary();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") loadSummary();
    }, 90000);
    const onFocus = () => loadSummary();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  useEffect(() => {
    const loadRecentRegistrations = async () => {
      try {
        const res = await fetch("/api/client/registrations?status=REGISTERED&take=5");
        const json = (await res.json()) as { success?: boolean; data?: WalkInRegistrationSummary[] };
        if (json.success) setRecentRegistrations(json.data ?? []);
      } catch {
        setRecentRegistrations([]);
      }
    };
    void loadRecentRegistrations();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void loadRecentRegistrations();
    }, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setClock(nowInPH());
    const id = setInterval(() => setClock(nowInPH()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!previewUser) {
      setPreviewPayload(null);
      setPreviewErr("");
      setPreviewLoading(false);
      setPreviewImageFailed(false);
      return;
    }
    let cancelled = false;
    const userId = previewUser.id;
    setPreviewLoading(true);
    setPreviewErr("");
    setPreviewImageFailed(false);
    void (async () => {
      try {
        const res = await fetch(`/api/client/${encodeURIComponent(userId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json()) as
          | {
              success: true;
              data: { user: ClientPreviewUser; attendance: ClientPreviewAttendance[] };
            }
          | { success: false; error?: string };
        if (cancelled) return;
        if (!json.success) {
          setPreviewPayload(null);
          setPreviewErr(json.error || "Unable to load client preview.");
          return;
        }
        setPreviewPayload({ user: json.data.user, attendance: json.data.attendance });
      } catch {
        if (cancelled) return;
        setPreviewPayload(null);
        setPreviewErr("Network error loading preview.");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#scan-station") {
      requestAnimationFrame(() => {
        document.getElementById("scan-station")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  useEffect(() => {
    const query = manualSearch.trim();
    if (manualSearchTimerRef.current) clearTimeout(manualSearchTimerRef.current);
    if (query.length < 2) {
      setManualCandidates([]);
      return;
    }
    manualSearchTimerRef.current = setTimeout(async () => {
      try {
        setSearchingManual(true);
        const res = await fetch(`/api/attendance/manual-search?q=${encodeURIComponent(query)}`);
        const json = (await res.json()) as { success?: boolean; data?: ManualCandidate[] };
        setManualCandidates(json.success ? (json.data ?? []) : []);
      } catch {
        setManualCandidates([]);
      } finally {
        setSearchingManual(false);
      }
    }, 260);
  }, [manualSearch]);

  const submitManualAttendance = async () => {
    const userId = manualUserId.trim();
    if (!userId) {
      showNotice("error", "Select a client from manual search first.");
      return;
    }
    const selected = manualCandidates.find((candidate) => candidate.id === userId);
    if (selected && selected.canScan === false) {
      showNotice("error", selected.blockReason || "This client is currently not eligible for attendance scan.");
      return;
    }
    setManualSaving(true);
    try {
      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json()) as
        | {
            success: true;
            action?: "TIME_IN" | "TIME_OUT";
            user: { id: string; firstName: string; lastName: string; role: UserRole; timeIn: string; scannedAt: string };
          }
        | { success: false; error: string; lastScanTime?: string };

      if (res.status === 200 && data.success) {
        setPreviewUser({ id: data.user.id, firstName: data.user.firstName, lastName: data.user.lastName });
        showNotice("success", `Manual time-in saved for ${data.user.firstName} ${data.user.lastName}.`);
        setManualSearch("");
        setManualUserId("");
        setManualCandidates([]);
        return;
      }
      if (res.status === 429 && !data.success) {
        showNotice("error", `Duplicate scan blocked. Last log at ${data.lastScanTime ?? "a moment ago"}.`);
        return;
      }
      showNotice("error", !data.success ? data.error : "Failed to save manual time-in.");
    } catch {
      showNotice("error", "Manual save failed due to network error.");
    } finally {
      setManualSaving(false);
    }
  };

  return (
    <div className="space-y-5 px-1 sm:px-0 fade-in-up">
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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard Overview</h1>
        <p className="text-sm text-slate-500">
          Scan station and client preview for front desk workflow.
        </p>
        {summary ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">Today total: {summary.totalAll}</span>
            <span className="rounded bg-fuchsia-100 px-2 py-1 text-fuchsia-700">
              Current population: {summary.currentPopulation ?? summary.totalAll}
            </span>
            {summary.activeTotals ? (
              <>
                <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Inside Members: {summary.activeTotals.MEMBER}</span>
                <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">Inside Non-member: {summary.activeTotals.NON_MEMBER}</span>
              </>
            ) : null}
            <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-700">Members: {summary.totals.MEMBER}</span>
            <span className="rounded bg-blue-100 px-2 py-1 text-blue-700">Non-member: {summary.totals.NON_MEMBER}</span>
            <span className="rounded bg-amber-100 px-2 py-1 text-amber-700">Walk-in Student: {summary.totals.WALK_IN}</span>
            <span className="rounded bg-violet-100 px-2 py-1 text-violet-700">
              Walk-in Regular: {summary.totals.WALK_IN_REGULAR}
            </span>
            {summary.peakHours?.[0] ? (
              <span className="rounded bg-cyan-100 px-2 py-1 text-cyan-700">
                Peak hour: {summary.peakHours[0].hour}:00 ({summary.peakHours[0].count})
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-900">Newly registered walk-ins</p>
          {recentRegistrations.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">No pending registrations right now.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {recentRegistrations.map((row) => (
                <span key={row.id} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  {row.firstName} {row.lastName} ({formatRoleLabel(row.role)})
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <Card className="surface-card border border-slate-200 p-3 sm:p-4">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-slate-900">Manual attendance fallback</h3>
          <p className="text-xs text-slate-500">
            When the scanner fails: search the client, then save time-in manually.
          </p>
        </div>
        <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto]">
          <input
            value={manualSearch}
            onChange={(e) => {
              const next = e.target.value;
              setManualSearch(next);
              const matched = manualCandidates.find((c) => `${c.firstName} ${c.lastName}` === next);
              setManualUserId(matched?.id ?? "");
            }}
            list="manual-client-options-dashboard"
            placeholder="Search client name"
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/25"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={submitManualAttendance}
            disabled={manualSaving}
            className="h-10 rounded-md bg-[#1e3a5f] px-4 text-sm font-semibold text-white hover:bg-[#1e3a5f]/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {manualSaving ? "Saving..." : "Save time-in"}
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("attendance-focus-scanner"))}
            className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Refocus Scanner
          </button>
        </div>
        <datalist id="manual-client-options-dashboard">
          {manualCandidates.map((candidate) => (
            <option key={candidate.id} value={`${candidate.firstName} ${candidate.lastName}`} />
          ))}
        </datalist>
        <p className="mt-1 text-[11px] text-slate-500">
          {searchingManual ? "Searching..." : manualCandidates.length > 0 ? `${manualCandidates.length} match(es)` : "Type at least 2 letters to search"}
        </p>
        {manualCandidates.some((candidate) => candidate.canScan === false) ? (
          <p className="mt-1 text-[11px] text-amber-700">
            Some matches are blocked (freeze or expired monthly fee) and cannot be saved until account is settled.
          </p>
        ) : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div
          id="scan-station"
          className="scroll-mt-4 rounded-2xl border border-slate-700 bg-[#0f172a] p-4 text-white shadow-lg sm:rounded-3xl sm:p-5"
        >
          <div className="flex h-full min-h-[360px] flex-col justify-between gap-4 sm:min-h-[400px] md:min-h-[470px]">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-semibold tracking-wide text-slate-200">FITNESSHOOD SCAN STATION</h2>
              <p className="text-sm text-slate-400" suppressHydrationWarning>
                {clock ? format(clock, "MMMM d, yyyy") : "\u00A0"}
              </p>
              <p className="text-2xl font-semibold tabular-nums" suppressHydrationWarning>
                {clock ? format(clock, "hh:mm:ss a") : "\u00A0"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-4">
              <ScanInput
                onScanSuccess={(payload) => {
                  setPreviewUser({ id: payload.userId, firstName: payload.firstName, lastName: payload.lastName });
                  showNotice("success", `Scan saved for ${payload.firstName} ${payload.lastName}.`);
                }}
              />
            </div>
          </div>
        </div>

        <Card className="surface-card overflow-hidden p-0">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Client View Preview</h3>
              <p className="text-xs text-slate-500">
                {previewUser ? `${previewUser.firstName} ${previewUser.lastName}` : "Scan a QR code to load preview"}
              </p>
            </div>
            {previewUser ? (
              <button
                type="button"
                onClick={() => setPreviewUser(null)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Close
              </button>
            ) : null}
          </div>

          <div className="h-[360px] overflow-y-auto bg-white sm:h-[400px] md:h-[470px]">
            {!previewUser ? (
              <div className="grid h-full min-h-[200px] place-items-center px-6 text-center text-sm text-slate-500">
                Waiting for scan. The preview will stay here until you close it.
              </div>
            ) : previewLoading ? (
              <div className="grid h-full min-h-[200px] place-items-center px-6 text-sm text-slate-500">Loading preview…</div>
            ) : previewErr ? (
              <div className="grid h-full min-h-[200px] place-items-center px-6 text-center">
                <p className="text-sm font-semibold text-red-700">Unable to load dashboard</p>
                <p className="mt-1 text-xs text-slate-600">{previewErr}</p>
              </div>
            ) : previewPayload ? (
              <ClientPreviewPanel
                user={previewPayload.user}
                attendance={previewPayload.attendance}
                previewImageFailed={previewImageFailed}
                onProfileImageError={() => setPreviewImageFailed(true)}
              />
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserRole } from "@prisma/client";
import { format } from "date-fns";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScanInput } from "@/components/scan-input";
import { nowInPH } from "@/lib/time";

type ManualCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
};

export default function DashboardPage() {
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clock, setClock] = useState<Date | null>(null);
  const [previewUser, setPreviewUser] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [manualSearch, setManualSearch] = useState("");
  const [manualCandidates, setManualCandidates] = useState<ManualCandidate[]>([]);
  const [manualUserId, setManualUserId] = useState("");
  const [searchingManual, setSearchingManual] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);

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
    setClock(nowInPH());
    const id = setInterval(() => setClock(nowInPH()), 1000);
    return () => clearInterval(id);
  }, []);

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
      if (res.status === 409 && !data.success) {
        showNotice("error", `Already logged today at ${data.lastScanTime ?? "earlier"}.`);
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
      </div>

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

          <div className="h-[360px] bg-white sm:h-[400px] md:h-[470px]">
            {previewUser ? (
              <iframe src={`/client/${previewUser.id}`} title="Client dashboard preview" className="h-full w-full" />
            ) : (
              <div className="grid h-full place-items-center px-6 text-center text-sm text-slate-500">
                Waiting for scan. The preview will stay here until you close it.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="surface-card border border-slate-200 p-3 sm:p-4">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-slate-900">Manual Attendance Fallback</h3>
          <p className="text-xs text-slate-500">Use this only when scanner cannot read. This section is below the scanner area.</p>
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
            {manualSaving ? "Saving..." : "Save Time-in"}
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
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { UserRole } from "@prisma/client";
import { AlertTriangle, CheckCircle2, Loader2, QrCode, XCircle } from "lucide-react";
import { RoleBadge } from "@/components/role-badge";

type ScanState =
  | { type: "idle" }
  | { type: "processing" }
  | { type: "success"; name: string; role: UserRole; mode: "TIME_IN" | "TIME_OUT"; timeIn: string; timeOut?: string | null; date: string }
  | { type: "error"; message: string }
  | { type: "warning"; message: string };

type ScanSuccessPayload = {
  userId: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  action?: "TIME_IN" | "TIME_OUT";
  timeIn: string;
  timeOut?: string | null;
  scannedAt: string;
};

export function ScanInput({ onScanSuccess }: { onScanSuccess?: (payload: ScanSuccessPayload) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [state, setState] = useState<ScanState>({ type: "idle" });
  const isSubmittingRef = useRef(false);
  const lastSubmittedRef = useRef<{ qr: string; at: number } | null>(null);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrExtractRegex = /\bGYM-(MEM|NMB|WLK|WIR)-([0-9]{8}|[A-Z0-9-]{6,30})\b/i;
  /** Next macrotick after input so value is complete; ~0ms after buffer flush */
  const SCHEDULE_MS = 80;

  useEffect(() => {
    const focus = () => {
      if (document.visibilityState !== "visible") return;
      inputRef.current?.focus();
    };
    focus();
    const onVisibility = () => focus();
    window.addEventListener("focus", focus);
    window.addEventListener("attendance-focus-scanner", focus as EventListener);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("attendance-focus-scanner", focus as EventListener);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    };
  }, []);

  const reset = (ms: number) => setTimeout(() => setState({ type: "idle" }), ms);

  const submitScan = async (qrOverride?: string) => {
    if (isSubmittingRef.current) return;
    const raw = (qrOverride ?? inputRef.current?.value ?? value).trim();
    const qr = (raw.match(qrExtractRegex)?.[0] ?? raw).trim().toUpperCase();
    if (!qr) return;

    const now = Date.now();
    if (lastSubmittedRef.current?.qr === qr && now - lastSubmittedRef.current.at < 900) return;
    lastSubmittedRef.current = { qr, at: now };
    isSubmittingRef.current = true;
    setState({ type: "processing" });

    try {
      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode: qr }),
      });
      const data = (await res.json()) as
        | {
            success: true;
            action?: "TIME_IN" | "TIME_OUT";
            user: { id: string; firstName: string; lastName: string; role: UserRole; timeIn: string; timeOut?: string | null; scannedAt: string };
          }
        | { success: false; error: string; lastScanTime?: string; details?: string };

      if (res.status === 200 && data.success) {
        onScanSuccess?.({
          userId: data.user.id,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          role: data.user.role,
            action: data.action,
          timeIn: data.user.timeIn,
            timeOut: data.user.timeOut,
          scannedAt: data.user.scannedAt,
        });
        setState({
          type: "success",
          name: `${data.user.firstName} ${data.user.lastName}`,
          role: data.user.role,
          mode: data.action === "TIME_OUT" ? "TIME_OUT" : "TIME_IN",
          timeIn: data.user.timeIn,
          timeOut: data.user.timeOut,
          date: data.user.scannedAt,
        });
        reset(3000);
      } else if (res.status === 429 && !data.success) {
        setState({ type: "warning", message: `Duplicate scan blocked. Last log at ${data.lastScanTime ?? "a moment ago"}.` });
        reset(2500);
      } else if (res.status === 403 && !data.success) {
        setState({ type: "warning", message: data.error || "Attendance scan blocked." });
        reset(3200);
      } else {
        setState({
          type: "error",
          message: !data.success && data.error ? `Unrecognized QR Code (${data.error})` : "Unrecognized QR Code",
        });
        reset(2600);
      }
    } catch {
      setState({ type: "error", message: "Network error — check connection and try again" });
      reset(3000);
    } finally {
      setValue("");
      if (inputRef.current) inputRef.current.value = "";
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 text-center">
      <input
        ref={inputRef}
        value={value}
        autoFocus
        onInput={(event) => {
          const next = (event.target as HTMLInputElement).value;
          setValue(next);
          if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
          submitTimerRef.current = setTimeout(() => {
            const qrRaw = (inputRef.current?.value ?? next).trim();
            const extracted = qrRaw.match(qrExtractRegex)?.[0];
            if (extracted) submitScan(extracted);
          }, SCHEDULE_MS);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitScan();
          }
        }}
        className="absolute left-[-9999px] top-0 w-px h-px opacity-0"
        aria-label="scanner-input"
      />

      {state.type === "idle" && (
        <div className="min-h-[180px] rounded-xl border border-slate-700 bg-slate-800 p-6 text-white transition-all duration-300 ease-out sm:min-h-[220px] sm:p-8 md:p-10">
          <div className="mb-3 flex items-center justify-center">
            <QrCode className="h-10 w-10 animate-pulse text-[#f97316] sm:h-12 sm:w-12" />
          </div>
          <p className="text-2xl font-semibold sm:text-3xl">Ready to Scan</p>
        </div>
      )}

      {state.type === "processing" && (
        <div
          className="min-h-[180px] rounded-xl border border-slate-600 bg-slate-800 p-6 text-white transition-all duration-200 ease-out sm:min-h-[220px] sm:p-8 md:p-10"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="mb-3 flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-[#f97316] sm:h-12 sm:w-12" aria-hidden />
          </div>
          <p className="text-xl font-semibold sm:text-2xl">Processing scan...</p>
          <p className="mt-2 text-sm text-slate-400">Please wait while we verify this QR.</p>
        </div>
      )}

      {state.type === "success" && (
        <div className="min-h-[180px] space-y-2 rounded-xl bg-green-600 p-6 text-white transition-all duration-300 ease-out sm:min-h-[220px] sm:p-8 md:p-10">
          <div className="flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>
          <p className="text-xl font-bold sm:text-2xl">{state.mode === "TIME_OUT" ? "Time-out saved" : "Welcome"}, {state.name}</p>
          <div className="flex justify-center">
            <RoleBadge role={state.role} />
          </div>
          <p>{state.mode === "TIME_OUT" ? `Time out: ${state.timeOut ?? "-"}` : `Time in: ${state.timeIn}`}</p>
          <p>Date: {state.date}</p>
        </div>
      )}

      {state.type === "error" && (
        <div className="min-h-[180px] rounded-xl bg-red-600 p-6 text-xl font-semibold text-white transition-all duration-300 ease-out sm:min-h-[220px] sm:p-8 sm:text-2xl md:p-10">
          <div className="mb-2 flex items-center justify-center">
            <XCircle className="h-10 w-10" />
          </div>
          {state.message}
        </div>
      )}

      {state.type === "warning" && (
        <div className="min-h-[180px] rounded-xl bg-amber-500 p-6 text-xl font-semibold text-slate-900 transition-all duration-300 ease-out sm:min-h-[220px] sm:p-8 sm:text-2xl md:p-10">
          <div className="mb-2 flex items-center justify-center">
            <AlertTriangle className="h-10 w-10" />
          </div>
          {state.message}
        </div>
      )}
    </div>
  );
}

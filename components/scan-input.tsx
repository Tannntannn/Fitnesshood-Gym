"use client";

import { useEffect, useRef, useState } from "react";
import { UserRole } from "@prisma/client";
import { AlertTriangle, CheckCircle2, Loader2, QrCode, XCircle } from "lucide-react";
import { RoleBadge } from "@/components/role-badge";

type ScanState =
  | { type: "idle" }
  | { type: "processing" }
  | { type: "success"; name: string; role: UserRole; timeIn: string; date: string }
  | { type: "error"; message: string }
  | { type: "warning"; message: string };

type ScanSuccessPayload = {
  userId: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  timeIn: string;
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
  const SCHEDULE_MS = 0;

  useEffect(() => {
    const focus = () => {
      if (document.visibilityState !== "visible") return;
      inputRef.current?.focus();
    };
    focus();
    const onVisibility = () => focus();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const reset = (ms: number) => setTimeout(() => setState({ type: "idle" }), ms);

  const submitScan = async (qrOverride?: string) => {
    if (isSubmittingRef.current) return;
    const raw = (qrOverride ?? inputRef.current?.value ?? value).trim();
    const qr = (raw.match(qrExtractRegex)?.[0] ?? raw).trim().toUpperCase();
    if (!qr) return;

    const now = Date.now();
    if (lastSubmittedRef.current?.qr === qr && now - lastSubmittedRef.current.at < 400) return;
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
            user: { id: string; firstName: string; lastName: string; role: UserRole; timeIn: string; scannedAt: string };
          }
        | { success: false; error: string; lastScanTime?: string; details?: string };

      if (res.status === 200 && data.success) {
        onScanSuccess?.({
          userId: data.user.id,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          role: data.user.role,
          timeIn: data.user.timeIn,
          scannedAt: data.user.scannedAt,
        });
        setState({
          type: "success",
          name: `${data.user.firstName} ${data.user.lastName}`,
          role: data.user.role,
          timeIn: data.user.timeIn,
          date: data.user.scannedAt,
        });
        reset(3000);
      } else if (res.status === 409 && !data.success) {
        setState({ type: "warning", message: `Already logged today at ${data.lastScanTime ?? "earlier"}` });
        reset(3000);
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
    <div className="w-full max-w-3xl mx-auto text-center">
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
        <div className="rounded-xl bg-slate-800 text-white p-10 border border-slate-700 transition-all duration-300 ease-out">
          <div className="flex items-center justify-center mb-3">
            <QrCode className="h-12 w-12 animate-pulse text-[#f97316]" />
          </div>
          <p className="text-3xl font-semibold">Ready to Scan</p>
        </div>
      )}

      {state.type === "processing" && (
        <div
          className="rounded-xl bg-slate-800 text-white p-10 border border-slate-600 transition-all duration-200 ease-out"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center justify-center mb-3">
            <Loader2 className="h-12 w-12 animate-spin text-[#f97316]" aria-hidden />
          </div>
          <p className="text-2xl font-semibold">Processing scan…</p>
          <p className="mt-2 text-sm text-slate-400">Please wait while we verify this QR.</p>
        </div>
      )}

      {state.type === "success" && (
        <div className="rounded-xl bg-green-600 text-white p-10 space-y-2 transition-all duration-300 ease-out">
          <div className="flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>
          <p className="text-2xl font-bold">Welcome, {state.name}</p>
          <div className="flex justify-center">
            <RoleBadge role={state.role} />
          </div>
          <p>Time logged: {state.timeIn}</p>
          <p>Date: {state.date}</p>
        </div>
      )}

      {state.type === "error" && (
        <div className="rounded-xl bg-red-600 text-white p-10 text-2xl font-semibold transition-all duration-300 ease-out">
          <div className="flex items-center justify-center mb-2">
            <XCircle className="h-10 w-10" />
          </div>
          {state.message}
        </div>
      )}

      {state.type === "warning" && (
        <div className="rounded-xl bg-amber-500 text-slate-900 p-10 text-2xl font-semibold transition-all duration-300 ease-out">
          <div className="flex items-center justify-center mb-2">
            <AlertTriangle className="h-10 w-10" />
          </div>
          {state.message}
        </div>
      )}
    </div>
  );
}

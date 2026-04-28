"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay, isSameMonth, isSameYear } from "date-fns";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScanInput } from "@/components/scan-input";
import { getDateOnlyPH, nowInPH } from "@/lib/time";
import type { AttendanceWithUser } from "@/types";

export default function DashboardPage() {
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rows, setRows] = useState<AttendanceWithUser[]>([]);
  const [clock, setClock] = useState<Date | null>(null);
  const [previewUser, setPreviewUser] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [sales, setSales] = useState({
    todaySales: 0,
    monthSales: 0,
    pendingBalance: 0,
    statusCounts: { active: 0, warning: 0, expired: 0 },
  });

  const showNotice = useCallback((type: "success" | "error", message: string) => {
    setNotice({ type, message });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const [attendanceResponse, salesResponse] = await Promise.all([
        fetch("/api/attendance?limit=300"),
        fetch("/api/dashboard/sales"),
      ]);
      const attendanceData = (await attendanceResponse.json()) as { data: AttendanceWithUser[] };
      const salesData = (await salesResponse.json()) as {
        success?: boolean;
        data?: {
          todaySales: number;
          monthSales: number;
          pendingBalance: number;
          statusCounts: { active: number; warning: number; expired: number };
        };
      };
      setRows(attendanceData.data ?? []);
      if (salesData.success && salesData.data) {
        setSales(salesData.data);
      }
    } catch {
      showNotice("error", "Failed to refresh dashboard data.");
    }
  }, [showNotice]);

  useEffect(() => {
    load();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30000);
    const onFocus = () => load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, [load]);

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

  const stats = useMemo(() => {
    const now = new Date();
    const byRole = (role: string) => rows.filter((r) => r.roleSnapshot === role);
    const countSet = (items: AttendanceWithUser[]) => ({
      today: items.filter((i) => isSameDay(new Date(i.scannedAt), now)).length,
      month: items.filter((i) => isSameMonth(new Date(i.scannedAt), now)).length,
      year: items.filter((i) => isSameYear(new Date(i.scannedAt), now)).length,
    });

    const todayPH = getDateOnlyPH(nowInPH()).getTime();
    const todays = rows
      .filter((r) => new Date(r.date).getTime() === todayPH)
      .slice()
      .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());

    return {
      member: countSet(byRole("MEMBER")),
      nonMember: countSet(byRole("NON_MEMBER")),
      walkIn: countSet(byRole("WALK_IN")),
      walkInRegular: countSet(byRole("WALK_IN_REGULAR")),
      todayAll: todays,
      todayByRole: {
        MEMBER: todays.filter((r) => r.roleSnapshot === "MEMBER"),
        NON_MEMBER: todays.filter((r) => r.roleSnapshot === "NON_MEMBER"),
        WALK_IN: todays.filter((r) => r.roleSnapshot === "WALK_IN"),
        WALK_IN_REGULAR: todays.filter((r) => r.roleSnapshot === "WALK_IN_REGULAR"),
      },
    };
  }, [rows]);

  return (
    <div className="space-y-6 fade-in-up">
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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard Overview</h1>
        <p className="text-sm text-slate-500">
          Stats, recent activity, and scan station are all on this page — use one browser tab at the front desk.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div
          id="scan-station"
          className="scroll-mt-4 rounded-3xl border border-slate-700 bg-[#0f172a] p-5 text-white shadow-lg"
        >
          <div className="flex h-full min-h-[400px] flex-col justify-between gap-5 md:min-h-[470px]">
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
                  load();
                }}
              />
            </div>
          </div>
        </div>

        <Card className="surface-card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
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

          <div className="h-[400px] bg-white md:h-[470px]">
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

      <Card className="surface-card p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Stats and Recent Activity</h2>
          <span className="text-xs text-slate-500">Today total: {stats.todayAll.length}</span>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Today Sales", value: `PHP ${sales.todaySales.toFixed(2)}` },
            { label: "Month Sales", value: `PHP ${sales.monthSales.toFixed(2)}` },
            { label: "Pending Balance", value: `PHP ${sales.pendingBalance.toFixed(2)}` },
            {
              label: "Member Status",
              value: `Active: ${sales.statusCounts.active} | Warning: ${sales.statusCounts.warning} | Expired: ${sales.statusCounts.expired}`,
            },
          ].map((item) => (
            <Card key={item.label} className="surface-card p-4">
              <p className="text-xs font-semibold text-slate-500">{item.label}</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{item.value}</p>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Members", value: stats.member },
            { label: "Non-Members", value: stats.nonMember },
            { label: "Walk-in (Student)", value: stats.walkIn },
            { label: "Walk-in (Regular)", value: stats.walkInRegular },
          ].map(({ label, value }) => (
            <Card key={label} className="surface-card surface-card-interactive p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-600">{label}</p>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">Today</span>
              </div>
              <p className="text-3xl font-bold leading-none text-slate-900">{value.today}</p>
              <p className="text-xs text-slate-500">
                Month total: <span className="font-semibold text-slate-700">{value.month}</span>
                <span className="mx-1.5">|</span>
                Year total: <span className="font-semibold text-slate-700">{value.year}</span>
              </p>
            </Card>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          {[
            { key: "MEMBER" as const, title: "Members" },
            { key: "NON_MEMBER" as const, title: "Non-Members" },
            { key: "WALK_IN" as const, title: "Walk-in (Student)" },
            { key: "WALK_IN_REGULAR" as const, title: "Walk-in (Regular)" },
          ].map(({ key, title }) => {
            const data = stats.todayByRole[key];
            return (
              <div key={key} className="overflow-auto rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <h3 className="text-xs font-semibold text-slate-700">{title}</h3>
                  <span className="text-[11px] text-slate-500">Today: {data.length}</span>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-slate-600">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-3 py-8 text-center text-slate-400">
                          No scans today.
                        </td>
                      </tr>
                    ) : (
                      data.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-800">
                              {item.user.firstName} {item.user.lastName}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">
                            {format(new Date(item.scannedAt), "hh:mm:ss a")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

      </Card>
    </div>
  );
}

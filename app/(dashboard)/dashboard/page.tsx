"use client";

import { useEffect, useMemo, useState } from "react";
import { format, isSameDay, isSameMonth, isSameYear } from "date-fns";
import { Card } from "@/components/ui/card";
import { ScanInput } from "@/components/scan-input";
import { formatRoleLabel } from "@/lib/role-labels";
import { getDateOnlyPH, nowInPH } from "@/lib/time";
import type { AttendanceWithUser } from "@/types";

export default function DashboardPage() {
  const [rows, setRows] = useState<AttendanceWithUser[]>([]);
  const [clock, setClock] = useState<Date | null>(null);

  const load = async () => {
    const response = await fetch("/api/attendance?limit=200");
    const data = (await response.json()) as { data: AttendanceWithUser[] };
    setRows(data.data ?? []);
  };

  useEffect(() => {
    load();

    const interval = setInterval(() => load(), 3000);
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
    };
  }, []);

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
    const todays = rows.filter((r) => new Date(r.date).getTime() === todayPH);
    const todaysByRole = (role: string) =>
      todays
        .filter((r) => r.roleSnapshot === role)
        .slice()
        .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())
        .slice(0, 20);

    return {
      member: countSet(byRole("MEMBER")),
      nonMember: countSet(byRole("NON_MEMBER")),
      walkIn: countSet(byRole("WALK_IN")),
      walkInRegular: countSet(byRole("WALK_IN_REGULAR")),
      todayTables: {
        MEMBER: todaysByRole("MEMBER"),
        NON_MEMBER: todaysByRole("NON_MEMBER"),
        WALK_IN: todaysByRole("WALK_IN"),
        WALK_IN_REGULAR: todaysByRole("WALK_IN_REGULAR"),
      },
    };
  }, [rows]);

  return (
    <div className="space-y-6 fade-in-up">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard Overview</h1>
        <p className="text-sm text-slate-500">
          Stats, recent activity, and scan station are all on this page — use one browser tab at the front desk.
        </p>
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

      <div
        id="scan-station"
        className="rounded-2xl border border-slate-700 bg-[#0f172a] text-white p-6 md:p-8 shadow-lg scroll-mt-4"
      >
        <div className="text-center space-y-1 mb-6">
          <h2 className="text-lg font-semibold tracking-wide text-slate-200">FITNESSHOOD SCAN STATION</h2>
          <p className="text-sm text-slate-400" suppressHydrationWarning>
            {clock ? format(clock, "MMMM d, yyyy") : "\u00A0"}
          </p>
          <p className="text-2xl font-semibold tabular-nums" suppressHydrationWarning>
            {clock ? format(clock, "hh:mm:ss a") : "\u00A0"}
          </p>
        </div>
        <ScanInput onScanSuccess={load} />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {[
          { key: "MEMBER" as const, title: "Members" },
          { key: "NON_MEMBER" as const, title: "Non-Members" },
          { key: "WALK_IN" as const, title: "Walk-in (Student)" },
          { key: "WALK_IN_REGULAR" as const, title: "Walk-in (Regular)" },
        ].map(({ key, title }) => {
          const data = stats.todayTables[key];
          return (
            <Card key={key} className="surface-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
                <span className="text-xs text-slate-500">Today: {data.length}</span>
              </div>

              <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
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
                            <div className="text-[11px] text-slate-400">{formatRoleLabel(item.roleSnapshot)}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">
                            {format(new Date(item.scannedAt), "hh:mm a")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

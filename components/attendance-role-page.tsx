"use client";

import { useCallback, useEffect, useState } from "react";
import { UserRole } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AttendanceFilters } from "@/components/attendance-filters";
import { AttendanceTable } from "@/components/attendance-table";
import { ExportButton } from "@/components/export-button";
import type { AttendanceWithUser } from "@/types";

export function AttendanceRolePage({ role, title }: { role: UserRole; title: string }) {
  const [rows, setRows] = useState<AttendanceWithUser[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ date: "", month: "", year: "", search: "" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ role, page: "1", limit: "50" });
    if (filters.date) params.set("date", filters.date);
    if (filters.search) params.set("search", filters.search);
    const response = await fetch(`/api/attendance?${params.toString()}`);
    const data = (await response.json()) as { data: AttendanceWithUser[]; total: number };
    setRows(data.data ?? []);
    setTotal(data.total ?? 0);
  }, [role, filters.date, filters.search]);

  useEffect(() => {
    load();
  }, [load]);

  const params = new URLSearchParams({ role });
  if (filters.date) params.set("date", filters.date);

  return (
    <Card className="surface-card space-y-5 p-5 lg:p-6 fade-in-up">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">Total records: {total}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportButton href={`/api/export?${params.toString()}`} label="Export Current View" variant="primary" />
          <ExportButton href={`/api/export?role=${role}&exportAll=true`} label="Export All Records" variant="outline" />
        </div>
      </div>
      <AttendanceFilters filters={filters} setFilters={setFilters} />
      <AttendanceTable rows={rows} onDelete={(id) => setDeletingId(id)} />

      {deletingId ? (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] grid place-items-center p-4 z-40">
          <Card className="p-5 w-full max-w-md space-y-3 surface-card shadow-xl fade-in-up">
            <h3 className="text-lg font-semibold text-red-700">Delete Attendance Record?</h3>
            <p className="text-sm text-slate-600">This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" className="border-slate-300 hover:bg-slate-100" onClick={() => setDeletingId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="bg-red-600 hover:bg-red-600/90 shadow-sm"
                onClick={async () => {
                  await fetch(`/api/attendance/${deletingId}`, { method: "DELETE" });
                  setDeletingId(null);
                  await load();
                }}
              >
                Delete
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </Card>
  );
}

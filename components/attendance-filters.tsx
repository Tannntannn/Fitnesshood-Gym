"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AttendanceFilters({
  filters,
  setFilters,
}: {
  filters: { date: string; month: string; year: string; search: string };
  setFilters: (value: { date: string; month: string; year: string; search: string }) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 md:p-4">
      <div className="flex flex-col md:flex-row md:items-end gap-3">
      <div className="flex flex-col gap-1.5 w-full md:w-56">
        <Label>Date</Label>
        <Input
          type="date"
          value={filters.date}
          onChange={(e) => setFilters({ ...filters, date: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5 flex-1">
        <Label>Search by name</Label>
        <Input
          placeholder="Search by name"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
      </div>

      <div className="flex items-end">
        <Button
          type="button"
          variant="outline"
          className="border-slate-300 text-slate-700 hover:bg-slate-100 bg-white"
          onClick={() => setFilters({ date: "", month: "", year: "", search: "" })}
        >
          Clear Filters
        </Button>
      </div>
      </div>
    </div>
  );
}

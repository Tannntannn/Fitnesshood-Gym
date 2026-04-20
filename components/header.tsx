"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Menu } from "lucide-react";
import { nowInPH } from "@/lib/time";

type HeaderProps = {
  onMenuClick?: () => void;
};

export function Header({ onMenuClick }: HeaderProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(nowInPH());
    const id = setInterval(() => setNow(nowInPH()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="h-16 border-b border-slate-200 bg-white/90 backdrop-blur px-4 md:px-6 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png?v=1"
          alt="FitnessHood logo"
          className="h-8 w-8 rounded-md bg-slate-100 object-contain p-1"
        />
        <div>
          <h1 className="font-semibold tracking-tight text-[#1e3a5f]">FitnessHood Attendance Monitoring</h1>
          <p className="text-[11px] text-slate-500">Administrative Dashboard</p>
        </div>
      </div>
      <p className="text-sm text-slate-500" suppressHydrationWarning>
        {now ? format(now, "MMMM d, yyyy hh:mm:ss a") : "\u00A0"}
      </p>
    </header>
  );
}

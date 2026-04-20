"use client";

import { Button } from "@/components/ui/button";

export function ExportButton({
  href,
  label,
  variant = "primary",
}: {
  href: string;
  label: string;
  variant?: "primary" | "outline";
}) {
  return (
    <Button
      size="sm"
      onClick={() => {
        window.location.href = href;
      }}
      className={
        variant === "primary"
          ? "h-9 bg-[#1e3a5f] text-white border border-[#1e3a5f] hover:bg-[#1e3a5f]/90 transition-all duration-200 shadow-sm"
          : "h-9 bg-white border-slate-300 text-slate-700 hover:bg-slate-50 transition-all duration-200"
      }
    >
      {label}
    </Button>
  );
}

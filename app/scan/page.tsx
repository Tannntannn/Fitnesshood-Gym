"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy URL: scan is now on the dashboard (same tab). */
export default function ScanRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard#scan-station");
  }, [router]);
  return (
    <div className="min-h-screen grid place-items-center bg-slate-900 text-white p-6">
      <p className="text-sm text-slate-400">Opening dashboard…</p>
    </div>
  );
}

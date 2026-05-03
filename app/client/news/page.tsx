"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type NewsRow = {
  id: string;
  title: string;
  message: string;
  imageUrl?: string | null;
  updatedAt: string;
};

type ImageViewMode = "original" | "16:9" | "4:3";

function announcementImageClass(mode: ImageViewMode) {
  if (mode === "16:9") return "aspect-video w-full rounded object-cover";
  if (mode === "4:3") return "aspect-[4/3] w-full rounded object-cover";
  return "max-h-[520px] w-full rounded object-contain";
}

export default function ClientNewsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<NewsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageViewMode, setImageViewMode] = useState<ImageViewMode>("original");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/client/announcements", { cache: "no-store" });
        const json = (await res.json()) as { success?: boolean; data?: NewsRow[]; error?: string };
        if (!json.success) {
          if (res.status === 401) {
            router.replace("/client/login");
            return;
          }
          setError(json.error || "Failed to load news feed.");
          return;
        }
        setRows(json.data ?? []);
      } catch {
        setError("Failed to load news feed.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  return (
    <div className="min-h-screen bg-[#07101f] px-4 py-4 text-white md:px-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Fitnesshood Announcement</h1>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded-md border border-white/20 bg-white/10 px-2 text-xs text-white outline-none"
              value={imageViewMode}
              onChange={(e) => setImageViewMode(e.target.value as ImageViewMode)}
            >
              <option value="original" className="text-slate-900">
                Image: Original
              </option>
              <option value="16:9" className="text-slate-900">
                Image: 16:9
              </option>
              <option value="4:3" className="text-slate-900">
                Image: 4:3
              </option>
            </select>
            <Button
              variant="outline"
              className="border-white/20 bg-white/10 text-white hover:bg-white/20"
              onClick={() => router.push("/client/dashboard")}
            >
              Back to Dashboard
            </Button>
          </div>
        </div>

        {loading ? <p className="text-sm text-slate-300">Loading announcements...</p> : null}
        {error ? (
          <Card className="border border-red-300/40 bg-red-900/20 p-4 text-red-100">
            <p>{error}</p>
          </Card>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <Card className="border border-white/15 bg-slate-900/50 p-4 text-slate-300">
            No announcements right now.
          </Card>
        ) : null}

        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className="overflow-hidden border border-white/15 bg-slate-950/65 p-0 text-white">
              {row.imageUrl ? (
                <div className="bg-black/35 p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={row.imageUrl}
                    alt={row.title}
                    loading="lazy"
                    className={announcementImageClass(imageViewMode)}
                  />
                </div>
              ) : null}
              <div className="p-4">
                <p className="text-lg font-semibold text-[#00d47d]">{row.title}</p>
                <p className="mt-2 whitespace-pre-wrap text-slate-100">{row.message}</p>
                <p className="mt-2 text-xs text-slate-400">{new Date(row.updatedAt).toLocaleString()}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}


"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardConfirmDialog } from "@/components/dashboard-confirm-dialog";

type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  imageUrl?: string | null;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  updatedAt: string;
};

type ImageViewMode = "original" | "16:9" | "4:3";

function announcementImageClass(mode: ImageViewMode) {
  if (mode === "16:9") return "aspect-video w-full rounded object-cover";
  if (mode === "4:3") return "aspect-[4/3] w-full rounded object-cover";
  return "max-h-[420px] w-full rounded object-contain";
}

export default function AnnouncementsPage() {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [imageViewMode, setImageViewMode] = useState<ImageViewMode>("original");
  const [pendingDeleteAnnouncement, setPendingDeleteAnnouncement] = useState<AnnouncementRow | null>(null);
  const [announcementDeleting, setAnnouncementDeleting] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/announcements");
      const json = (await res.json()) as { success?: boolean; data?: AnnouncementRow[]; error?: string };
      if (!json.success) {
        setNotice({ type: "error", message: json.error || "Failed to load announcements." });
        return;
      }
      setRows(json.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      {notice ? (
        <div
          className={`fixed left-3 right-3 top-16 z-50 rounded-lg border px-3 py-2 text-xs font-medium shadow-lg sm:left-auto sm:right-4 ${
            notice.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <Card className="surface-card p-4">
        <h1 className="text-xl font-semibold text-slate-900">Client Announcements</h1>
        <p className="mt-1 text-sm text-slate-500">Post notices that members will see on their dashboard.</p>
        <div className="mt-3 flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">Image view</label>
          <select
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
            value={imageViewMode}
            onChange={(e) => setImageViewMode(e.target.value as ImageViewMode)}
          >
            <option value="original">Original</option>
            <option value="16:9">16:9</option>
            <option value="4:3">4:3</option>
          </select>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Holiday schedule, promo, reminder..." />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Status</label>
            <select
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
              value={isActive ? "active" : "inactive"}
              onChange={(e) => setIsActive(e.target.value === "active")}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Starts at (optional)</label>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Ends at (optional)</label>
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-medium text-slate-600">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              placeholder="Type the announcement for members..."
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-medium text-slate-600">Announcement image (optional)</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://... or upload below"
              />
              <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-100">
                {uploadingImage ? "Uploading..." : "Upload image"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={uploadingImage}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    try {
                      setUploadingImage(true);
                      const formData = new FormData();
                      formData.append("file", file);
                      const res = await fetch("/api/upload/announcement", { method: "POST", body: formData });
                      const json = (await res.json()) as { success?: boolean; url?: string; error?: string; details?: string };
                      if (!json.success || !json.url) {
                        setNotice({ type: "error", message: json.details || json.error || "Failed to upload image." });
                        return;
                      }
                      setImageUrl(json.url);
                      setNotice({ type: "success", message: "Image uploaded." });
                    } finally {
                      setUploadingImage(false);
                    }
                  }}
                />
              </label>
            </div>
            {imageUrl ? (
              <div className="rounded-md border border-slate-200 bg-slate-100 p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Announcement preview"
                  className={announcementImageClass(imageViewMode)}
                />
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
            disabled={saving}
            onClick={async () => {
              try {
                setSaving(true);
                const res = await fetch("/api/announcements", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title,
                    message,
                    imageUrl: imageUrl.trim() || null,
                    isActive,
                    startsAt: startsAt ? new Date(startsAt).toISOString() : null,
                    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
                  }),
                });
                const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                if (!json.success) {
                  setNotice({ type: "error", message: json.details || json.error || "Failed to save announcement." });
                  return;
                }
                setTitle("");
                setMessage("");
                setStartsAt("");
                setEndsAt("");
                setImageUrl("");
                setIsActive(true);
                await load();
                setNotice({ type: "success", message: "Announcement saved." });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving..." : "Save Announcement"}
          </Button>
          <Button
            variant="outline"
            className="border-slate-300 text-slate-700 hover:bg-slate-100"
            onClick={() => load()}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </Card>

      <Card className="surface-card p-4">
        <h2 className="text-sm font-semibold text-slate-900">Recent Announcements</h2>
        <div className="mt-3 space-y-2">
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
              No announcements yet.
            </div>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{row.title}</p>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      row.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {row.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{row.message}</p>
                {row.imageUrl ? (
                  <div className="mt-2 rounded-md border border-slate-200 bg-slate-100 p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.imageUrl}
                      alt={row.title}
                      loading="lazy"
                      className={announcementImageClass(imageViewMode)}
                    />
                  </div>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">Updated: {new Date(row.updatedAt).toLocaleString()}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="h-7 border-slate-300 px-2 text-xs text-slate-700 hover:bg-slate-100"
                    onClick={async () => {
                      const res = await fetch(`/api/announcements/${row.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ isActive: !row.isActive }),
                      });
                      const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                      if (!json.success) {
                        setNotice({ type: "error", message: json.details || json.error || "Failed to update status." });
                        return;
                      }
                      await load();
                      setNotice({ type: "success", message: row.isActive ? "Announcement deactivated." : "Announcement activated." });
                    }}
                  >
                    {row.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-7 border-red-300 px-2 text-xs text-red-700 hover:bg-red-50"
                    disabled={announcementDeleting}
                    onClick={() => setPendingDeleteAnnouncement(row)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <DashboardConfirmDialog
        open={Boolean(pendingDeleteAnnouncement)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteAnnouncement(null);
        }}
        title="Delete announcement?"
        description={
          pendingDeleteAnnouncement ? (
            <>
              Remove <span className="font-semibold text-slate-800">{pendingDeleteAnnouncement.title}</span> permanently. Members
              will no longer see it.
            </>
          ) : null
        }
        tone="danger"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={announcementDeleting}
        onConfirm={async () => {
          const row = pendingDeleteAnnouncement;
          if (!row) return;
          setAnnouncementDeleting(true);
          const res = await fetch(`/api/announcements/${row.id}`, { method: "DELETE" });
          const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
          setAnnouncementDeleting(false);
          if (!json.success) {
            setNotice({ type: "error", message: json.details || json.error || "Failed to delete announcement." });
            return;
          }
          await load();
          setNotice({ type: "success", message: "Announcement deleted." });
        }}
      />
    </div>
  );
}


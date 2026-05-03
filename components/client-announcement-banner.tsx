export type AnnouncementImageViewMode = "original" | "16:9" | "4:3";

export type ClientAnnouncementBannerData = {
  title: string;
  message: string;
  imageUrl?: string | null;
  updatedAt: string;
};

function announcementImageClass(mode: AnnouncementImageViewMode) {
  if (mode === "16:9") return "aspect-video w-full max-w-full rounded object-cover";
  if (mode === "4:3") return "aspect-[4/3] w-full max-w-full rounded object-cover";
  return "max-h-[420px] w-full max-w-full rounded object-contain";
}

type Props = {
  announcement: ClientAnnouncementBannerData;
  imageViewMode?: AnnouncementImageViewMode;
  onImageViewModeChange?: (mode: AnnouncementImageViewMode) => void;
  /** Dashboard: green tint inside hero. Info: slightly different border for contrast on dark bg. */
  variant?: "dashboard" | "info";
};

export function ClientAnnouncementBanner({
  announcement,
  imageViewMode = "original",
  onImageViewModeChange,
  variant = "dashboard",
}: Props) {
  const shell =
    variant === "dashboard"
      ? "mb-3 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-[#00d47d]/45 bg-[#00d47d]/15 px-3 py-3 text-left"
      : "w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-[#00d47d]/40 bg-[#00d47d]/10 p-4 text-left ring-1 ring-[#00d47d]/20";

  return (
    <div className={shell}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png?v=1"
            alt=""
            className="h-10 w-10 rounded-lg bg-white/10 object-contain p-0.5 ring-1 ring-white/20"
            width={40}
            height={40}
          />
          {onImageViewModeChange ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] font-medium text-slate-200">Image view</label>
              <select
                className="h-8 max-w-full rounded-md border border-white/20 bg-white/10 px-2 text-[11px] text-white outline-none"
                value={imageViewMode}
                onChange={(e) => onImageViewModeChange(e.target.value as AnnouncementImageViewMode)}
              >
                <option value="original" className="text-slate-900">
                  Original
                </option>
                <option value="16:9" className="text-slate-900">
                  16:9
                </option>
                <option value="4:3" className="text-slate-900">
                  4:3
                </option>
              </select>
            </div>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#00d47d]">{announcement.title}</p>
          {announcement.imageUrl ? (
            <div className="mt-2 max-w-full overflow-hidden rounded-md border border-white/20 bg-black/35 p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={announcement.imageUrl}
                alt=""
                loading="lazy"
                className={announcementImageClass(imageViewMode)}
              />
            </div>
          ) : null}
          <p className="mt-2 text-sm break-words text-slate-100">{announcement.message}</p>
          <p className="mt-1 text-[10px] text-slate-500">Updated {new Date(announcement.updatedAt).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

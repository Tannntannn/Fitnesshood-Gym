"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Shell: crisp card, left accent, no inner scroll for typical copy. */
const toneShell: Record<"default" | "danger" | "warning", string> = {
  default: "border-l-4 border-l-slate-600 bg-white ring-1 ring-slate-200/90",
  danger: "border-l-4 border-l-red-600 bg-white ring-1 ring-red-200/80",
  warning: "border-l-4 border-l-amber-500 bg-white ring-1 ring-amber-200/80",
};

const confirmClass: Record<"default" | "danger" | "warning", string> = {
  default: "bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90",
  danger: "bg-red-600 text-white hover:bg-red-600/90",
  warning: "bg-amber-600 text-white hover:bg-amber-600/90",
};

export function DashboardConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  loading = false,
  confirmDisabled = false,
  children,
  contentClassName,
  onDismiss,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger" | "warning";
  loading?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
  contentClassName?: string;
  /** Fires when the dialog closes without a successful confirm (Cancel, backdrop, Escape). Not fired after Confirm completes. */
  onDismiss?: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const confirmedRef = useRef(false);
  const confirmBusyRef = useRef(false);
  const skipDismissAfterConfirmRef = useRef(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    if (open) {
      confirmedRef.current = false;
      confirmBusyRef.current = false;
      skipDismissAfterConfirmRef.current = false;
      setConfirmBusy(false);
    }
  }, [open]);

  const busy = loading || confirmBusy;

  const handleRootOpenChange = (next: boolean) => {
    if (!next && busy) return;
    if (!next && !skipDismissAfterConfirmRef.current && !confirmedRef.current) {
      onDismiss?.();
    }
    onOpenChange(next);
  };

  const handleCancel = () => {
    if (busy) return;
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    if (busy || confirmDisabled) return;
    confirmedRef.current = true;
    confirmBusyRef.current = true;
    setConfirmBusy(true);
    try {
      await onConfirm();
    } finally {
      confirmBusyRef.current = false;
      confirmedRef.current = false;
      setConfirmBusy(false);
      skipDismissAfterConfirmRef.current = true;
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleRootOpenChange}>
      <DialogContent
        className={cn(
          "grid w-[min(100%,calc(100vw-1.5rem))] max-w-[400px] gap-0 overflow-hidden rounded-xl p-0 text-slate-900 shadow-2xl sm:max-w-[400px]",
          toneShell[tone],
          contentClassName,
        )}
        showCloseButton={!busy}
      >
        <div className="border-b border-slate-200/80 bg-slate-50/90 px-5 pb-3 pt-4 pr-12">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-lg font-semibold leading-snug tracking-tight text-slate-900">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="text-sm leading-snug text-slate-600 [&_strong]:font-semibold [&_strong]:text-slate-800">
                {description}
              </DialogDescription>
            ) : null}
          </DialogHeader>
        </div>

        {children ? (
          <div className="border-b border-slate-100 bg-white px-5 py-3">{children}</div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 bg-slate-100/70 px-5 py-3.5 sm:flex-row sm:justify-end sm:gap-3">
          <Button type="button" variant="outline" className="h-10 border-slate-300 bg-white sm:min-w-[7rem]" disabled={busy} onClick={handleCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className={cn("h-10 min-w-[8.5rem] font-semibold sm:min-w-[9.5rem]", confirmClass[tone])}
            disabled={busy || confirmDisabled}
            onClick={() => void handleConfirm()}
          >
            {busy ? "Please wait…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

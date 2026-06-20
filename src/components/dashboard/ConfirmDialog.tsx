"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Reusable confirmation dialog for destructive actions (delete photo / remove
 * component / remove domain, etc.). Keeps single-click destructive actions from
 * firing without a confirm step. Controlled via `open`.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !busy && onCancel()} />
      <div className="relative w-full max-w-sm rounded-2xl border border-glass-border bg-surface-base p-5 shadow-2xl">
        <h2 className="text-[15px] font-semibold text-warm-black">{title}</h2>
        {message && (
          <div className="mt-2 text-[13px] leading-relaxed text-gray-muted">{message}</div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-gray-border px-3.5 py-2 text-[13px] font-medium text-warm-black transition-colors hover:bg-gray-bg disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-3.5 py-2 text-[13px] font-medium text-white transition-colors disabled:opacity-60 ${
              destructive ? "bg-red-600 hover:bg-red-700" : "bg-warm-black hover:bg-warm-black/90"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

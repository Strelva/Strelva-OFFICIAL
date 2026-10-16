"use client";

import type { ReactNode } from "react";
import { XaButton, XaSheet } from "@/components/ui/strelva/Xa";

/**
 * The confirmation a destructive action needs before it happens (delete a
 * photo, remove a domain, cancel a booking). An XA sheet: a native <dialog>,
 * focus moves in, Escape closes, focus returns to the opener. The confirm is
 * the sheet's one ink pill; the sheet counts as its own screen.
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
  /** Said in the words; the pill stays ink so a sheet never shouts. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <XaSheet
      open={open}
      onClose={() => { if (!busy) onCancel(); }}
      title={title}
      actions={<>
        <XaButton variant="primary" size="lg" block busy={busy} onClick={onConfirm} data-destructive={destructive || undefined}>{confirmLabel}</XaButton>
        <XaButton variant="quiet" size="lg" disabled={busy} onClick={onCancel}>{cancelLabel}</XaButton>
      </>}
    >
      {message ? <div className="text-[15px] leading-[1.5] text-[var(--st-text-2)]">{message}</div> : null}
    </XaSheet>
  );
}

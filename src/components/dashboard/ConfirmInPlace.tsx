"use client";

import type { ReactNode } from "react";
import { XaYes } from "@/components/ui/strelva/Xa";

/**
 * The one question an act with no Undo asks before it happens (remove a
 * domain, delete a post, cancel a booking, disconnect, go back to a saved
 * version). October 16: asked in place, beside the thing it changes, as the
 * one yes (XaYes `question`), never in a sheet over the page; the same way
 * PhotoDetail asks before a delete. The pill is the confirmation and the
 * quiet action backs out.
 */
export function ConfirmInPlace({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Not yet",
  busy = false,
  onConfirm,
  onCancel,
  thumbnail,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Kept for callers; the words say it, the pill stays ink. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** The thing being removed, shown so the owner sees it instead of a name. */
  thumbnail?: { src: string; alt: string };
}) {
  if (!open) return null;
  return (
    <div className="flex flex-col gap-3">
      {thumbnail ? <img src={thumbnail.src} alt={thumbnail.alt} className="block h-24 w-24 rounded-[var(--st-r-md)] object-cover" /> : null}
      <XaYes
        state="waiting"
        question={<><span className="font-medium text-[var(--st-text)]">{title}</span>{message ? <> {message}</> : null}</>}
        yesLabel={confirmLabel}
        notYetLabel={cancelLabel}
        onYes={onConfirm}
        onNotYet={() => { if (!busy) onCancel(); }}
        disabled={busy}
        block={false}
        shortcut={false}
      />
    </div>
  );
}

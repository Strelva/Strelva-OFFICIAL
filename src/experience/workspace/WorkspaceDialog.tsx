"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * The workspace's modal shell: initial focus on the first enabled control,
 * focus contained while open, Escape closes unless busy, and focus returns to
 * the trigger on close. The caller owns the title (pass its id) and actions.
 */
export function WorkspaceDialog({ labelledBy, busy = false, onClose, children }: { labelledBy: string; busy?: boolean; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled])")?.focus();
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    if (busy && !dialogRef.current?.querySelector("button:not([disabled])")) dialogRef.current?.focus();
  }, [busy]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!busy) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
    if (!focusable.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return (
    <div ref={dialogRef} tabIndex={-1} onKeyDown={handleDialogKeyDown} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="fixed inset-0 z-50 overflow-y-auto bg-overlay-scrim p-3 outline-none sm:p-8">
      <div className="mx-auto flex min-h-full max-w-xl items-center">
        <div className="w-full rounded-2xl border border-gray-border bg-surface p-5 shadow-2xl sm:p-8">{children}</div>
      </div>
    </div>
  );
}

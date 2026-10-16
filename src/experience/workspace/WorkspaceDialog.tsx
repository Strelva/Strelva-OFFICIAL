"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { XaIconButton } from "@/components/ui/strelva/Xa";
import styles from "./workspace-dialog.module.css";

/**
 * XA (October 16): drawn like LX · In · Confirm sheet (zY9qV). White, 24
 * radius, the one large shadow, rising on Fast from .98; a bottom sheet on a
 * phone. Only for a confirmation that needs its own moment; inline tasks
 * stay inline. A sheet counts as its own screen: one ink pill inside it.
 *
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
    <div ref={dialogRef} tabIndex={-1} onKeyDown={handleDialogKeyDown} role="dialog" aria-modal="true" aria-labelledby={labelledBy} data-workspace-theme="linen" data-workspace-look="xa" className={styles.scrim}>
      <div className={styles.frame}>
        <div className={styles.sheet}>{children}<span className={styles.close}><XaIconButton label="Close" tone="plain" disabled={busy} onClick={onClose}><X size={18} aria-hidden="true" /></XaIconButton></span></div>
      </div>
    </div>
  );
}

/** The sheet's question: what pressing the ink pill will do, as a sentence. */
export function WorkspaceDialogTitle({ id, children, quiet }: { id: string; children: ReactNode; quiet?: ReactNode }) {
  return <h1 id={id} className={styles.title}>{children}{quiet ? <span className={styles.quiet}> {quiet}</span> : null}</h1>;
}

/** The way out on the left, the one ink pill on the right; stacked with the pill first on a phone. */
export function WorkspaceDialogActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

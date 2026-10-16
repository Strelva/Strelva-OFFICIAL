"use client";
/**
 * The kit's fold for agency screens: a label, an optional count, and a chevron
 * that turns when it opens. Native <details>, so it works with the keyboard
 * and without script. Children stay mounted while closed, so a fold can still
 * read and report what it holds.
 */
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import styles from "./agency-xa.module.css";

export function AgencyFold({ label, count, children, open, onToggle, hidden }: { label: ReactNode; count?: number | null; children: ReactNode; open?: boolean; onToggle?: (open: boolean) => void; hidden?: boolean }) {
  return <details className={styles.more} open={open} hidden={hidden} onToggle={onToggle ? event => onToggle(event.currentTarget.open) : undefined}>
    <summary><span>{label}</span>{typeof count === "number" ? <span className={styles.foldCount}>{count}</span> : null}<ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" /></summary>
    <div className={styles.foldBody}>{children}</div>
  </details>;
}

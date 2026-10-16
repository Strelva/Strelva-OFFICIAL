"use client";
/**
 * XA state marks. Pen: LX · Status · Live (jLAL3), Waits (H9Qdxq),
 * Draft (Jilw8), LX · Mark (hb8WJ), C2 · Kbd (z6OmJ, without mono).
 *
 * Status is for exceptions: a dot and a word where something differs from
 * normal. Rows that are fine show their fact ("31 this week"), not "Live".
 */
import type { CSSProperties, ReactNode } from "react";
import styles from "./xa.module.css";

export type XaStatusKind = "live" | "waits" | "draft" | "working" | "down";

/**
 * A dot and a word. `breathe` lets the one Live dot that matters on a screen
 * keep its halo (Live is the only thing that keeps moving). Waits pulses once
 * when it arrives. Working spins. Draft never moves.
 */
export function XaStatus({ kind, children, size = "md", breathe = false }: { kind: XaStatusKind; children: ReactNode; size?: "sm" | "md"; breathe?: boolean }) {
  return <span className={styles.status} data-kind={kind} data-size={size}>
    {kind === "working" ? <span className={styles.spinner} aria-hidden="true" /> : <span className={styles.dot} data-kind={kind} data-breathe={(kind === "live" && breathe) || undefined} aria-hidden="true" />}
    <span>{children}</span>
  </span>;
}

/** A bare dot, for a sidebar row or a list where the word sits elsewhere. Pass `label` when no word is visible. */
export function XaDot({ kind, label, breathe }: { kind: Exclude<XaStatusKind, "working">; label?: string; breathe?: boolean }) {
  return <span className={styles.dot} data-kind={kind} data-breathe={breathe || undefined} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

const MARK_PATH = "M13.96 16.82a6.6 4-8 1 0 13.08-1.84 6.6 4-8 1 0-13.08 1.84z m-0.82 8.76a9.4 4.9 5 1 0 18.72 1.64 9.4 4.9 5 1 0-18.72-1.64z m-1.32 13.56a12.2 5.6-3 1 0 24.36-1.28 12.2 5.6-3 1 0-24.36 1.28z";

/** Strelva's mark: three stones and Pebble. Decorative unless `label` is given. */
export function XaMark({ size = 40, label }: { size?: number; label?: string }) {
  return <svg className={styles.mark} width={size} height={size} viewBox="0 0 48 48" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <path fill="currentColor" d={MARK_PATH} />
    <circle className={styles.markPebble} cx="24.5" cy="7.2" r="3.4" />
  </svg>;
}

/** A key on the keyboard, in DM Sans figures. */
export function XaKbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}

/** A person or business by its initial: round for people, squared for a business or client. */
export function XaInitial({ name, color, size = 26, shape = "square" }: { name: string; color?: string; size?: number; shape?: "square" | "round" }) {
  const initial = xaInitialOf(name);
  return <span className={styles.initial} data-shape={shape} data-default={!color || undefined} style={{ "--xa-size": `${size}px`, ...(color ? { "--xa-color": color } : null) } as CSSProperties} aria-hidden="true">{initial}</span>;
}

const HONORIFIC = /^(dr|mr|mrs|ms|mx|miss|prof|rev|sir|dame)\.?\s+/i;

/**
 * One initials rule everywhere: a person known by a title goes by the
 * surname ("Dr. Amy Lin" and "Dr. Lin" are both L, as patients say it);
 * everyone and everything else by the first letter ("Maya Okafor" is M).
 */
export function xaInitialOf(name: string): string {
  const trimmed = name.trim();
  const titled = HONORIFIC.test(trimmed) ? trimmed.replace(HONORIFIC, "").trim().split(/\s+/).at(-1) ?? "" : trimmed;
  return titled.charAt(0).toUpperCase() || trimmed.charAt(0).toUpperCase() || "·";
}

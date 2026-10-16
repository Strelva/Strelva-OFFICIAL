"use client";
/**
 * XA entry frame. Pen: XA · A1, A2, C1, C2 (and B1 for the business door):
 * paper on the left with the mark, one link top right, the task, and a quiet
 * footnote; a felt panel on the right that shows what this step leads to.
 *
 * The panel is never decoration: it holds Pebble doing the job this step
 * starts, or a true preview of what someone else will see. On phones the
 * panel drops below the task and shrinks, so the task stays first.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { XaMark } from "./state";
import styles from "./entry.module.css";

export function XaEntry({ children, aside, corner, footnote, mode, label = "Strelva", width = "form" }: {
  children: ReactNode;
  /** The felt panel's content. Omit for a single-column entry (errors, loading). */
  aside?: ReactNode;
  /** One link or name in the top right: "Sign in", the signed-in person, the address. */
  corner?: ReactNode;
  footnote?: ReactNode;
  mode?: "light" | "dark";
  label?: string;
  /** "wide" (640) for a review the owner reads line by line; "form" (460) otherwise. */
  width?: "form" | "wide";
}) {
  return <main className={styles.entry} data-workspace-theme="linen" data-workspace-mode={mode} data-has-aside={aside ? true : undefined}>
    <div className={styles.task}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label={`${label} home`}><XaMark size={28} /><span>Strelva</span></Link>
        {corner ? <div className={styles.corner}>{corner}</div> : null}
      </header>
      <div className={styles.body} data-width={width}>{children}</div>
      {footnote ? <p className={styles.footnote}>{footnote}</p> : null}
    </div>
    {aside ? <aside className={styles.aside}>{aside}</aside> : null}
  </main>;
}

/** A caption under the felt panel's art: one line that names what is true, one quieter line under it. */
export function XaEntryCaption({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return <div className={styles.caption}><p className={styles.captionTitle}>{title}</p>{children ? <p className={styles.captionBody}>{children}</p> : null}</div>;
}

/** The stack inside the entry body: headline, facts, actions, with the board's rhythm. */
export function XaEntryStack({ children, gap = "md" }: { children: ReactNode; gap?: "sm" | "md" }) {
  return <div className={styles.stack} data-gap={gap}>{children}</div>;
}

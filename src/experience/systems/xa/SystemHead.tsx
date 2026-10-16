"use client";
/**
 * The head of every System up close (XA · S1–S3): its clay tile, its name,
 * and one state line. Status is drawn only when it is an exception or the
 * one Live that matters on the screen; the rest is a plain sentence.
 */
import type { ReactNode } from "react";
import { XaStatus, XaSystemTile, type XaStatusKind } from "@/components/ui/strelva/Xa";
import styles from "./system-xa.module.css";

export function SystemHead({ kind, title, status, line, tone, actions, back, headingId }: {
  /** System kind or product id; picks the clay. */
  kind: string;
  title: ReactNode;
  /** A dot and a word, e.g. Live, Draft, Waits for you. */
  status?: { kind: XaStatusKind; label: ReactNode; breathe?: boolean };
  /** One quiet sentence beside the status. */
  line?: ReactNode;
  tone?: "waits";
  actions?: ReactNode;
  back?: ReactNode;
  headingId?: string;
}) {
  return <>
    {back}
    <header className={styles.head}>
      <XaSystemTile kind={kind} size={56} />
      <div className={styles.headText}>
        <h1 id={headingId} className={styles.title}>{title}</h1>
        {status || line ? <p className={styles.stateLine} data-tone={tone === "waits" && !status ? tone : undefined}>{status ? <XaStatus kind={status.kind} breathe={status.breathe}>{status.label}</XaStatus> : null}{line ? <span>{line}</span> : null}</p> : null}
      </div>
      {actions ? <div className={styles.headActions}>{actions}</div> : null}
    </header>
  </>;
}

/** One block in a System's side column: a sentence-case label, a quiet count, then its contents. */
export function SidePanel({ id, title, count, intro, children }: { id?: string; title: string; count?: number; intro?: ReactNode; children: ReactNode }) {
  return <section id={id} className={styles.panel} aria-label={title}>
    <h2 className={styles.panelHead}>{title}{count ? <span>{count}</span> : null}</h2>
    {intro ? <p className={styles.quiet}>{intro}</p> : null}
    {children}
  </section>;
}

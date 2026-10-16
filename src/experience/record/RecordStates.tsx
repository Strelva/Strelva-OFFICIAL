/**
 * XA-8 shared states: loading keeps the screen's shape; trouble sits in the
 * page's own column, left-aligned, with Pebble in frame beside one plain
 * sentence (what happened, what still works) and "Try again" as a text link.
 */
import type { ReactNode } from "react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaHeadline, XaPebbleScene, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "./record.module.css";

export function RecordLoading({ title, rows = 5, label }: { title: ReactNode; rows?: number; label: string }) {
  return <div className={styles.screen} aria-busy="true">
    <XaHeadline>{title}</XaHeadline>
    <div className={styles.skeletonRows}>{Array.from({ length: rows }, (_, index) => <StSkeleton key={index} width={index % 2 ? "62%" : "84%"} label={index === 0 ? label : undefined} />)}</div>
  </div>;
}

export function RecordTrouble({ title, quiet, children, retry }: { title: string; quiet?: string; children?: ReactNode; retry?: { label: string; href?: string; onClick?: () => void } }) {
  return <div className={styles.screen}>
    <section className={styles.trouble} role="alert" aria-live="polite">
      <XaPebbleScene pose="fixing" size={112} label="Pebble looking into it" />
      <div className={styles.troubleText}>
        <p className={styles.troubleSay}>{title}{quiet ? ` ${quiet}` : ""}{retry ? <> <XaTextLink href={retry.href} onClick={retry.onClick}>{retry.label}</XaTextLink></> : null}</p>
        {children ? <p className={styles.quietNote}>{children}</p> : null}
      </div>
    </section>
  </div>;
}

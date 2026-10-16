/**
 * XA-8 shared states: loading keeps the screen's shape; trouble keeps Pebble
 * in frame with what happened, what still works, and one way forward.
 */
import type { ReactNode } from "react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaHeadline, XaPebbleScene } from "@/components/ui/strelva/Xa";
import styles from "./record.module.css";

export function RecordLoading({ title, rows = 5, label }: { title: ReactNode; rows?: number; label: string }) {
  return <div className={styles.screen} aria-busy="true">
    <XaHeadline>{title}</XaHeadline>
    <div className={styles.skeletonRows}>{Array.from({ length: rows }, (_, index) => <StSkeleton key={index} width={index % 2 ? "62%" : "84%"} label={index === 0 ? label : undefined} />)}</div>
  </div>;
}

export function RecordTrouble({ title, quiet, children, action }: { title: ReactNode; quiet?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return <div className={styles.center}>
    <section className={styles.trouble} role="alert" aria-live="polite">
      <XaPebbleScene pose="fixing" size={200} label="Pebble looking into it" />
      <XaHeadline as="h2" size="sm" quiet={quiet}>{title}</XaHeadline>
      {children}
      {action}
    </section>
  </div>;
}

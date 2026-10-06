import type { ReactNode } from "react";
import styles from "./systems.module.css";

/** One titled panel beside the System's own surface. */
export function SystemPanel({ id, title, count, intro, children }: { id: string; title: string; count: number; intro: string; children: ReactNode }) {
  return <section className={styles.panel} aria-labelledby={id}>
    <h2 id={id}>{title}{count ? <span>{count}</span> : null}</h2>
    <p>{intro}</p>
    {children}
  </section>;
}

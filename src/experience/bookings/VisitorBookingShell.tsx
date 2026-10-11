import type { ReactNode } from "react";
import styles from "./visitor.module.css";
/** Visitor pages inherit the client's site variables, independent of workspace mode. */
export function VisitorBookingShell({ children, siteName }: { children: ReactNode; siteName?: string }) {
  return <main className={styles.shell}><div className={styles.column}>{siteName ? <p className={styles.brand}>{siteName}</p> : null}{children}</div></main>;
}

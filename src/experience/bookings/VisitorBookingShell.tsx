import type { ReactNode } from "react";
import styles from "./visitor.module.css";
/** Visitor pages inherit the client's site variables, independent of workspace mode. */
export function VisitorBookingShell({ children, siteName, navigation, wide = false }: { children: ReactNode; siteName?: string; navigation?: ReactNode; wide?: boolean }) {
  return <main className={styles.shell}><div className={wide ? styles.wide : styles.column}>
    <header className={styles.header}><p className={styles.brand}>{siteName?.trim() || "Business details unavailable"}</p>{navigation ? <nav className={styles.navigation} aria-label="Business website">{navigation}</nav> : null}</header>
    {children}
  </div></main>;
}

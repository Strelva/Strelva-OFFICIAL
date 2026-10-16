import type { ReactNode } from "react";
import styles from "./visitor.module.css";

/**
 * The visitor's page is the business's page: its name heads it and its
 * --visitor-* colors (when a site sets them) win over the XA fallbacks.
 * Strelva is never named here. Independent of workspace mode; dark follows
 * the visitor's own device. A missing business identity stays neutral.
 */
export function VisitorBookingShell({ children, siteName, navigation, wide = false, reading = false }: { children: ReactNode; siteName?: string; navigation?: ReactNode; wide?: boolean; /** The name is still being read: hold its place instead of calling it unavailable. */ reading?: boolean }) {
  const name = siteName?.trim();
  return <main className={styles.shell}><div className={wide ? styles.wide : styles.column}>
    <header className={styles.header}>{reading && !name ? <span className={`${styles.skeleton} ${styles.brandHold}`} aria-hidden="true" /> : <p className={styles.brand} data-unknown={name ? undefined : true}>{name || "Business details unavailable"}</p>}{navigation ? <nav className={styles.navigation} aria-label="Business website">{navigation}</nav> : null}</header>
    {children}
  </div></main>;
}

import type { ReactNode } from "react";
import styles from "./payment.module.css";

/** Client-page composition. Payment details and authority remain with the caller. */
export function PaymentLayout({ brand, navigation, children }: { brand?: ReactNode; navigation?: ReactNode; children: ReactNode }) {
  return <main className={styles.canvas} data-workspace-theme="linen">
    {brand ? <header className={styles.header}><span className={`${styles.brand} font-display`}>{brand}</span>{navigation ? <nav aria-label="Business website" className={styles.navigation}>{navigation}</nav> : null}</header> : null}
    <div className={styles.content}>{children}</div>
  </main>;
}

export function PaymentSplit({ description, children }: { description: ReactNode; children: ReactNode }) {
  return <div className={styles.split}><div className={styles.description}>{description}</div><div className={styles.payment}>{children}</div></div>;
}

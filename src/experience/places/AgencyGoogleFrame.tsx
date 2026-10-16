import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { XaPebbleScene } from "@/components/ui/strelva/Xa";
import { FocusedPage } from "@/experience/connections/FocusedPage";
import styles from "@/experience/connections/xa-connections.module.css";

/**
 * Where an agency person lands after signing in to its own Google account
 * for one client (XA · C2 composition, R4 rows in the felt). The felt says
 * what this connection lets the agency do, and what stays with the owner.
 */
export function AgencyGoogleFrame({ children, mode }: { children: ReactNode; mode?: "light" | "dark" }) {
  return <FocusedPage label="Connect your agency’s Google account" mode={mode} who="Your agency’s Google account" felt={<>
    <XaPebbleScene pose="adds" size={220} label="Pebble adding the Google listing" />
    <p className={styles.feltCaption}>No message is sent to the owner</p>
    <div className={styles.stack}>
      <p className={styles.groupLabel}>With this connection your agency can</p>
      <ul className={styles.group}>
        <li className={styles.groupRow}><span className={styles.groupText}><span className={styles.groupTitle}>Read the listing</span><span className={styles.groupDetail}>Hours, phone, website and reviews</span></span></li>
        <li className={styles.groupRow}><span className={styles.groupText}><span className={styles.groupTitle}>Prepare listing changes</span><span className={styles.groupDetail}>They wait for the owner’s yes</span></span></li>
      </ul>
      <p className={styles.groupLabel}>Never, without the owner</p>
      <ul className={styles.group} data-locked>
        <li className={styles.groupRow}><Lock className={styles.lock} size={14} aria-hidden="true" /><span className={styles.groupText}><span className={styles.groupTitle}>Change anything on Google</span></span><span className={styles.groupEnd}>Their yes</span></li>
      </ul>
    </div>
  </>}>{children}</FocusedPage>;
}

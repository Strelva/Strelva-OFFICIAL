import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Clay } from "@/experience/connections/Clay";
import { FocusedPage } from "@/experience/connections/FocusedPage";
import styles from "@/experience/connections/xa-connections.module.css";

/**
 * Where an agency person lands after signing in to its own Google account
 * for one client (XA · C2 composition). Pebble stands on the felt with the
 * listing; under it, plain lines say how any Google connection here works.
 * These are platform rules, not a reading of this agency's grant: the server
 * re-checks the agency's current access before showing any choice. On a
 * phone the felt is left out; the picker carries the same two lines.
 */
export function AgencyGoogleFrame({ children, mode }: { children: ReactNode; mode?: "light" | "dark" }) {
  return <FocusedPage label="Connect your agency’s Google account" mode={mode} who="Your agency’s Google account" feltOnPhone={false} felt={<>
    <Clay pose="adds" width={340} label="Pebble bringing the Google listing in" />
    <p className={styles.linesLabel}>How a Google connection works in Strelva</p>
    <ul className={styles.lines}>
      <li className={styles.line}><span className={styles.lineText}>Strelva reads the listing with the account you choose.</span></li>
      <li className={styles.line}><Lock size={14} aria-hidden="true" /><span className={styles.lineText}>Anything that changes on Google</span><span className={styles.lineEnd}>The owner’s yes</span></li>
    </ul>
  </>}>{children}</FocusedPage>;
}

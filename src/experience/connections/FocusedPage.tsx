import type { ReactNode } from "react";
import { XaMark } from "@/components/ui/strelva/Xa";
import styles from "./xa-connections.module.css";

/**
 * A page someone lands on from outside the workspace (a Google or assistant
 * sign-in) composed like XA · C2: the words and the one action on the left,
 * the felt on the right holding what the choice means. On a phone the felt
 * follows the action.
 */
export function FocusedPage({ who, felt, children, mode, label, feltOnPhone = true }: { who?: ReactNode; felt?: ReactNode; children: ReactNode; mode?: "light" | "dark"; label?: string; feltOnPhone?: boolean }) {
  return <main className={styles.focused} data-workspace-theme="linen" data-workspace-mode={mode === "dark" ? "dark" : undefined} aria-label={label}>
    <div className={styles.focusedLead}>
      <div className={styles.focusedTop}><span className={styles.head}><XaMark size={28} label="Strelva" /></span>{who ? <span>{who}</span> : null}</div>
      <div className={styles.focusedBody}>{children}</div>
    </div>
    {felt ? <aside className={styles.felt} data-phone={feltOnPhone ? undefined : "hidden"}>{felt}</aside> : null}
  </main>;
}

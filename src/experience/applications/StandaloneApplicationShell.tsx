"use client";

import { createContext, useContext, type ReactNode } from "react";

export const StandaloneApplicationModeContext = createContext<"light" | "dark">("light");
import styles from "./standalone-application.module.css";

/** Recipient and delegated pages have their own paper, without workspace navigation. */
export function StandaloneApplicationShell({ children }: { children: ReactNode }) {
  const mode = useContext(StandaloneApplicationModeContext);
  return <main data-dashboard data-workspace-theme="linen" data-workspace-mode={mode} className={styles.canvas}>{children}</main>;
}

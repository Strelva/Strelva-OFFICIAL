import type { ReactNode } from "react";
import { AdminRail } from "@/app/admin/AdminRail";
import { AdminMobileNav } from "@/app/admin/AdminMobileNav";
import styles from "./operator-frame.module.css";

/** Operations keeps its own ink navigation; business authority is never inherited. */
export function OperatorFrame({ children, preview = false, operatorName = "Operator", moneyEnabled = false, clients = [] }: { children: ReactNode; preview?: boolean; operatorName?: string; moneyEnabled?: boolean; clients?: readonly { id: string; siteName: string }[] }) {
  return <div data-dashboard data-workspace-theme="linen" className={styles.frame}>
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-warm-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-surface-base">Skip to content</a>
    <AdminMobileNav operatorName={operatorName} moneyEnabled={moneyEnabled} preview={preview} />
    <div className={styles.body}><div className={styles.desktopRail}><AdminRail operatorName={operatorName} moneyEnabled={moneyEnabled} preview={preview} clients={clients} /></div><main id="main-content" className={styles.main}>{children}</main></div>
  </div>;
}

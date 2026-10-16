import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/Logo";
import { StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./public-frame.module.css";

export function PublicFrame({ children, email, preview = false }: { children: ReactNode; email?: string; preview?: boolean }) {
  return <div data-dashboard data-workspace-theme="linen" data-workspace-mode="light" className={styles.frame}>
    <header className={styles.header}><Link href={preview ? "/preview/strelva/answer-check" : "/audit"} className={styles.brand}><LogoMark className={styles.mark} /><span>Strelva</span></Link><nav aria-label="Public navigation"><StTextButton href="/agencies">For agencies</StTextButton><StTextButton href={email ? "/workspace" : "/sign-in"}>{email ? "Open Strelva" : "Sign in"}</StTextButton></nav></header>
    <main>{children}</main>
  </div>;
}

import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/Logo";
import { StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./public-frame.module.css";

export function PublicFrame({ children, email, preview = false }: { children: ReactNode; email?: string; preview?: boolean }) {
  return <div data-dashboard data-workspace-theme="linen" data-workspace-mode="light" className={styles.frame}>
    <header className={styles.header}><Link href={preview ? "/preview/strelva/answer-check" : "/ai-visibility"} className={styles.brand}><LogoMark className={styles.mark} /><span>Strelva</span></Link><nav aria-label="Public navigation"><StTextButton href="/workspace/agency/start">For agencies</StTextButton><StTextButton href={email ? "/workspace" : "/sign-in"}>{email ? "Your workspace" : "Sign in"}</StTextButton></nav></header>
    <main>{children}</main>
  </div>;
}

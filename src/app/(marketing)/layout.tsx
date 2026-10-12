import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { StTextButton } from "@/components/ui/strelva/Kit";
import { getSessionUser } from "@/platform/infra/db/server-client";
import styles from "./platform-entry.module.css";

export const metadata: Metadata = {
  title: "Strelva — Business systems, made possible",
  description: "Make and run systems for your business, or build for clients with your agency.",
};

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return <div data-dashboard data-workspace-theme="linen" data-workspace-mode="light" className={styles.frame}>
    <a href="#platform-content" className="sr-only focus:not-sr-only">Skip to content</a>
    <header className={styles.header}>
      <Link href="/home" className={styles.brand}><LogoMark className="size-6" /><span>Strelva</span></Link>
      <nav aria-label="Platform navigation"><StTextButton href="/agencies">For agencies</StTextButton><StTextButton href={user ? "/workspace" : "/sign-in"}>{user ? "Your workspace" : "Sign in"}</StTextButton></nav>
    </header>
    <main id="platform-content" className={styles.content}>{children}</main>
    <footer className={styles.footer}><StTextButton href="/pricing">Plans</StTextButton><StTextButton href="/privacy">Privacy</StTextButton><StTextButton href="/terms">Terms</StTextButton></footer>
  </div>;
}

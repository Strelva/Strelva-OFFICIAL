"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BriefcaseBusiness, CircleHelp, Compass, Home, Plus, Search, Settings, Settings2, Users, Workflow, X, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { WorkspaceSignOutButton } from "@/experience/workspace/WorkspaceSignOutButton";
import styles from "./strelva-sidebar.module.css";

export type StrelvaSection = "home" | "work" | "ongoing" | "access" | "settings" | "products" | "help" | "account";
type NavigableSection = Exclude<StrelvaSection, "account">;

export function workspaceSectionHref(section: StrelvaSection, base = "") {
  if (section === "account") return `${base}/workspace/account`;
  if (section === "home") return `${base}/workspace`;
  return `${base}/workspace?view=${section}`;
}

const PRIMARY_ITEMS: readonly { id: Exclude<StrelvaSection, "account" | "products" | "help">; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "work", label: "Work", icon: BriefcaseBusiness },
  { id: "ongoing", label: "Ongoing", icon: Workflow },
  { id: "access", label: "People & access", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];

const UTILITY_ITEMS: readonly { id: "search" | "products" | "help"; label: string; icon: LucideIcon }[] = [
  { id: "search", label: "Search", icon: Search },
  { id: "products", label: "Explore offerings", icon: Compass },
  { id: "help", label: "Help", icon: CircleHelp },
];

interface Props {
  active?: StrelvaSection;
  appBase?: string;
  accountName: string;
  accountDetail?: string;
  contextualNavigation?: ReactNode;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onNavigate?: (section: NavigableSection) => void;
  onSearch?: () => void;
  onStart?: () => void;
  signedIn?: boolean;
  signInHref?: string;
  signOut?: ReactNode;
  standalone?: boolean;
}

/** One customer navigation across Home, work, account, and managed surfaces. */
export function StrelvaSidebar({
  active,
  appBase = "",
  accountName,
  accountDetail,
  contextualNavigation,
  mobileOpen = false,
  onCloseMobile,
  onNavigate,
  onSearch,
  onStart,
  signedIn = true,
  signInHref,
  signOut,
  standalone = false,
}: Props) {
  function primaryItem({ id, label, icon: Icon }: (typeof PRIMARY_ITEMS)[number]) {
    const body = <><Icon size={17} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span></>;
    const shared = { className: styles.navItem, "aria-current": active === id ? "page" as const : undefined };
    return onNavigate
      ? <button key={id} type="button" {...shared} onClick={() => { onCloseMobile?.(); onNavigate(id); }}>{body}</button>
      : <Link key={id} {...shared} href={workspaceSectionHref(id, appBase)} onClick={onCloseMobile}>{body}</Link>;
  }

  function utilityItem({ id, label, icon: Icon }: (typeof UTILITY_ITEMS)[number]) {
    const section = id === "search" ? "work" : id;
    const body = <><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span></>;
    const shared = { className: styles.utilityItem, "aria-current": id !== "search" && active === section ? "page" as const : undefined };
    if (id === "search" && onSearch) return <button key={id} type="button" {...shared} onClick={() => { onCloseMobile?.(); onSearch(); }}>{body}</button>;
    if (onNavigate) return <button key={id} type="button" {...shared} onClick={() => { onCloseMobile?.(); onNavigate(section); }}>{body}</button>;
    const href = id === "search" ? `${workspaceSectionHref("work", appBase)}&search=1` : workspaceSectionHref(section, appBase);
    return <Link key={id} {...shared} href={href} onClick={onCloseMobile}>{body}</Link>;
  }

  return <aside className={styles.sidebar} data-open={mobileOpen} data-standalone={standalone} aria-label="Strelva navigation">
    <div className={styles.brandRow}>
      <Link href={workspaceSectionHref("home", appBase)} className={styles.brand} onClick={(event) => {
        if (!onNavigate) return;
        event.preventDefault();
        onCloseMobile?.();
        onNavigate("home");
      }} aria-label="Strelva home"><LogoMark className={styles.brandMark} /><span>Strelva</span></Link>
      <button className={styles.mobileClose} aria-label="Close navigation" type="button" onClick={onCloseMobile}><X size={18} /></button>
    </div>
    <nav className={styles.primary} aria-label="Main">{PRIMARY_ITEMS.map(primaryItem)}</nav>
    <div className={styles.utilities} aria-label="Workspace utilities">
      {onStart
        ? <button type="button" className={styles.newAction} onClick={() => { onCloseMobile?.(); onStart(); }}><Plus size={16} strokeWidth={1.6} aria-hidden="true" /><span>New</span></button>
        : <Link className={styles.newAction} href={`${appBase}/workspace?view=start`} onClick={onCloseMobile}><Plus size={16} strokeWidth={1.6} aria-hidden="true" /><span>New</span></Link>}
      {UTILITY_ITEMS.map(utilityItem)}
    </div>
    {contextualNavigation ? <div className={styles.contextual}>{contextualNavigation}</div> : <div className={styles.spacer} />}
    <div className={styles.footer}>
      {signedIn ? <>
        <Link className={styles.account} href={workspaceSectionHref("account", appBase)} aria-current={active === "account" ? "page" : undefined} onClick={onCloseMobile}>
          <span className={styles.avatar} aria-hidden="true">{accountName.slice(0, 1).toUpperCase()}</span>
          <span><strong>{accountName}</strong><small>{accountDetail || "Account & access"}</small></span>
          <Settings2 size={15} aria-hidden="true" />
        </Link>
        {signOut === undefined ? <WorkspaceSignOutButton className={styles.signOut} /> : signOut}
      </> : <Link className={styles.signIn} href={signInHref || `${appBase}/sign-in?next=%2Fworkspace`}>Sign in</Link>}
    </div>
  </aside>;
}

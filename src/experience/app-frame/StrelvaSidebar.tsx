"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { BriefcaseBusiness, CircleHelp, Home, LayoutGrid, Plus, Search, Settings, Users, Workflow, X, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { WorkspaceSignOutButton } from "@/experience/workspace/WorkspaceSignOutButton";
import type { WorkspaceSearchItem } from "@/experience/workspace/workspace-search";
import styles from "./strelva-sidebar.module.css";

export type StrelvaSection = "home" | "work" | "ongoing" | "access" | "settings" | "products" | "help" | "account";
type NavigableSection = Exclude<StrelvaSection, "account">;

export function workspaceSectionHref(section: StrelvaSection, base = "", workspaceId?: string) {
  const path = section === "account" ? `${base}/workspace/account` : `${base}/workspace`;
  const params = new URLSearchParams();
  if (section !== "home" && section !== "account") params.set("view", section);
  if (workspaceId && section !== "account") params.set("workspaceId", workspaceId);
  return `${path}${params.size ? `?${params}` : ""}`;
}

const PRIMARY_ITEMS: readonly { id: NavigableSection; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "work", label: "Work", icon: BriefcaseBusiness },
  { id: "ongoing", label: "Ongoing", icon: Workflow },
];
const SETTINGS_ITEMS: readonly { id: NavigableSection; label: string; icon: LucideIcon }[] = [
  { id: "access", label: "People & access", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "help", label: "Help", icon: CircleHelp },
];

interface Props {
  active?: StrelvaSection;
  appBase?: string;
  workspaceId?: string;
  accountName: string;
  accountDetail?: string;
  businessContext?: ReactNode;
  contextualNavigation?: ReactNode;
  recentWork?: readonly WorkspaceSearchItem[];
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onNavigate?: (section: NavigableSection) => void;
  onSearch?: () => void;
  onStart?: () => void;
  startDisabled?: boolean;
  signedIn?: boolean;
  signInHref?: string;
  signOut?: ReactNode;
  standalone?: boolean;
}

function navigateInPlace(event: MouseEvent<HTMLAnchorElement>, action: (() => void) | undefined) {
  if (!action || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  action();
}

/** One navigation contract for owners, agencies, account and managed work. */
export function StrelvaSidebar({ active, appBase = "", workspaceId, accountName, accountDetail, businessContext, contextualNavigation, recentWork = [], mobileOpen = false, onCloseMobile, onNavigate, onSearch, onStart, startDisabled = false, signedIn = true, signInHref, signOut, standalone = false }: Props) {
  const href = (section: StrelvaSection) => workspaceSectionHref(section, appBase, workspaceId);
  const newHref = `${appBase}/workspace?view=start${workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : ""}`;
  const searchHref = `${href("work")}&search=1`;
  function item({ id, label, icon: Icon }: (typeof PRIMARY_ITEMS)[number]) {
    return <Link key={id} className={styles.navItem} href={href(id)} aria-current={active === id ? "page" : undefined} onClick={event => {
      navigateInPlace(event, onNavigate ? () => { onCloseMobile?.(); onNavigate(id); } : undefined);
      if (!onNavigate) onCloseMobile?.();
    }}><Icon size={18} strokeWidth={1.6} aria-hidden="true" /><span>{label}</span></Link>;
  }
  return <aside className={styles.sidebar} data-open={mobileOpen} data-standalone={standalone} aria-label="Strelva navigation">
    <div className={styles.brandRow}>
      <Link href={href("home")} className={styles.brand} aria-label="Strelva home" onClick={event => navigateInPlace(event, onNavigate ? () => { onCloseMobile?.(); onNavigate("home"); } : undefined)}><LogoMark className={styles.brandMark} /><span>Strelva</span></Link>
      <button className={styles.mobileClose} aria-label="Close navigation" type="button" onClick={onCloseMobile}><X size={20} /></button>
    </div>
    {businessContext ? <div className={styles.businessContext}>{businessContext}</div> : null}
    <div className={styles.body}>
      <div className={styles.utilities} aria-label="Workspace utilities">
        {onStart ? <button type="button" className={styles.newAction} disabled={startDisabled} onClick={() => { onCloseMobile?.(); onStart(); }}><Plus size={18} aria-hidden="true" /><span>New</span></button> : <Link className={styles.newAction} href={newHref} aria-disabled={startDisabled || undefined} tabIndex={startDisabled ? -1 : undefined} onClick={event => { if (startDisabled) event.preventDefault(); onCloseMobile?.(); }}><Plus size={18} aria-hidden="true" /><span>New</span></Link>}
        {onSearch ? <button type="button" className={styles.navItem} onClick={() => { onCloseMobile?.(); onSearch(); }} title="Search (Ctrl or Command + K)"><Search size={18} aria-hidden="true" /><span>Search</span></button> : <Link className={styles.navItem} href={searchHref} onClick={onCloseMobile}><Search size={18} aria-hidden="true" /><span>Search</span></Link>}
        {item({ id: "products", label: "Examples", icon: LayoutGrid })}
      </div>
      <nav className={styles.primary} aria-label="Main">{PRIMARY_ITEMS.map(item)}</nav>
      {recentWork.length ? <section className={styles.recent} aria-label="Recent work"><h2>Recent</h2>{recentWork.slice(0, 8).map(work => <Link key={work.id} href={work.href} title={work.title} onClick={event => navigateInPlace(event, work.onOpen ? () => { onCloseMobile?.(); work.onOpen?.(); } : undefined)}><span>{work.title}</span></Link>)}</section> : null}
      {contextualNavigation ? <div className={styles.contextual}>{contextualNavigation}</div> : null}
    </div>
    <div className={styles.footer}>
      <nav aria-label="Business and help">{SETTINGS_ITEMS.map(item)}</nav>
      {signedIn ? <>
        <Link className={styles.account} href={href("account")} aria-current={active === "account" ? "page" : undefined} onClick={onCloseMobile}>
          <span className={styles.avatar} aria-hidden="true">{accountName.slice(0, 1).toUpperCase()}</span>
          <span><strong>{accountName}</strong><small>{accountDetail || "Your account"}</small></span>
        </Link>
        {signOut === undefined ? <WorkspaceSignOutButton className={styles.signOut} /> : signOut}
      </> : <Link className={styles.signIn} href={signInHref || `${appBase}/sign-in?next=%2Fworkspace`}>Sign in</Link>}
    </div>
  </aside>;
}

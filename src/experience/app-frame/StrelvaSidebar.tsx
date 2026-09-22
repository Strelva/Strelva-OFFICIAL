"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BriefcaseBusiness, CircleHelp, Compass, Home, LayoutTemplate, Plus, Search, Settings, Settings2, Users, Workflow, X, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { WorkspaceSignOutButton } from "@/experience/workspace/WorkspaceSignOutButton";
import styles from "./strelva-sidebar.module.css";

export type StrelvaSection = "home" | "work" | "ongoing" | "templates" | "access" | "settings" | "products" | "help" | "account";
type NavigableSection = Exclude<StrelvaSection, "account">;

/** Navigation carries context, never authority. Every destination still authorizes its own reads. */
export function workspaceSectionHref(section: StrelvaSection, base = "", workspaceId?: string) {
  const path = `${base.replace(/\/$/, "")}/workspace${section === "account" ? "/account" : ""}`;
  const query = new URLSearchParams();
  if (section !== "home" && section !== "account") query.set("view", section);
  if (workspaceId) query.set("workspaceId", workspaceId);
  return query.size ? `${path}?${query}` : path;
}

const PRIMARY_ITEMS: readonly { id: NavigableSection; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "work", label: "Work", icon: BriefcaseBusiness },
  { id: "ongoing", label: "Ongoing", icon: Workflow },
];
const UTILITY_ITEMS: readonly { id: NavigableSection; label: string; icon: LucideIcon }[] = [
  { id: "products", label: "Explore offerings", icon: Compass },
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
  contextualNavigation?: ReactNode;
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

export function StrelvaSidebar({ active, appBase = "", workspaceId, accountName, accountDetail, contextualNavigation, mobileOpen = false, onCloseMobile, onNavigate, onSearch, onStart, startDisabled = false, signedIn = true, signInHref, signOut, standalone = false }: Props) {
  function item({ id, label, icon: Icon }: (typeof PRIMARY_ITEMS)[number], utility = false) {
    const body = <><Icon size={18} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span></>;
    const shared = { className: utility ? styles.utilityItem : styles.navItem, "aria-current": active === id ? "page" as const : undefined };
    return <Link key={id} {...shared} href={workspaceSectionHref(id, appBase, workspaceId)} onClick={event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      onCloseMobile?.();
      if (onNavigate) { event.preventDefault(); onNavigate(id); }
    }}>{body}</Link>;
  }
  const startQuery = new URLSearchParams({ view: "start" });
  if (workspaceId) startQuery.set("workspaceId", workspaceId);
  const searchHref = `${workspaceSectionHref("work", appBase, workspaceId)}&search=1`;

  return <aside className={styles.sidebar} data-open={mobileOpen} data-standalone={standalone} aria-label="Strelva navigation">
    <div className={styles.brandRow}>
      <Link href={workspaceSectionHref("home", appBase, workspaceId)} className={styles.brand} onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        onCloseMobile?.();
        if (onNavigate) { event.preventDefault(); onNavigate("home"); }
      }} aria-label="Strelva home"><LogoMark className={styles.brandMark} /><span>Strelva</span></Link>
      <button className={styles.mobileClose} aria-label="Close navigation" type="button" onClick={onCloseMobile}><X size={20} aria-hidden="true" /></button>
    </div>
    <div className={styles.startActions}>
      {onStart ? <button type="button" className={styles.newAction} disabled={startDisabled} onClick={() => { onCloseMobile?.(); onStart(); }}><Plus size={18} strokeWidth={1.5} aria-hidden="true" /><span>New</span></button> : <Link className={styles.newAction} aria-disabled={startDisabled || undefined} tabIndex={startDisabled ? -1 : undefined} href={`${appBase}/workspace?${startQuery}`} onClick={event => { if (startDisabled) event.preventDefault(); onCloseMobile?.(); }}><Plus size={18} aria-hidden="true" /><span>New</span></Link>}
      <Link className={styles.navItem} href={searchHref} onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        onCloseMobile?.();
        if (onSearch) { event.preventDefault(); onSearch(); }
        else if (onNavigate) { event.preventDefault(); onNavigate("work"); }
      }}><Search size={18} strokeWidth={1.5} aria-hidden="true" /><span>Search</span><kbd aria-hidden="true">⌘ K</kbd></Link>
      {item({ id: "templates", label: "Templates", icon: LayoutTemplate })}
    </div>
    <nav className={styles.primary} aria-label="Main">{PRIMARY_ITEMS.map(entry => item(entry))}</nav>
    {contextualNavigation ? <nav className={styles.contextual} aria-label="Recent work">{contextualNavigation}</nav> : <div className={styles.spacer} />}
    <nav className={styles.utilities} aria-label="Workspace utilities">{UTILITY_ITEMS.map(entry => item(entry, true))}</nav>
    <div className={styles.footer}>
      {signedIn ? <>
        <Link className={styles.account} href={workspaceSectionHref("account", appBase, workspaceId)} aria-current={active === "account" ? "page" : undefined} onClick={onCloseMobile}>
          <span className={styles.avatar} aria-hidden="true">{accountName.slice(0, 1).toUpperCase()}</span>
          <span><strong>{accountName}</strong><small>{accountDetail || "Your account"}</small></span><Settings2 size={16} aria-hidden="true" />
        </Link>
        {signOut === undefined ? <WorkspaceSignOutButton className={styles.signOut} /> : signOut}
      </> : <Link className={styles.signIn} href={signInHref || `${appBase}/sign-in?next=%2Fworkspace`}>Sign in</Link>}
    </div>
  </aside>;
}

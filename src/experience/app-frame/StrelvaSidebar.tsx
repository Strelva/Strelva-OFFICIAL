"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { AppWindow, Building2, CalendarDays, CircleHelp, FileText, Globe2, Home, Inbox, KeyRound, ListChecks, MessageSquareText, Repeat, Search, Sheet, UserPlus, Users, X, type LucideIcon } from "lucide-react";
import { SYSTEMS_LABEL, SYSTEMS_LIST_LABEL } from "@/experience/systems/model";
import { LogoMark } from "@/components/Logo";
import { WorkspaceSignOutButton } from "@/experience/workspace/WorkspaceSignOutButton";
import type { WorkspaceSearchItem } from "@/experience/workspace/workspace-search";
import styles from "./strelva-sidebar.module.css";
import { placeForSection, sectionTitle, workspaceSectionHref, type StrelvaPinnedItem, type StrelvaSection } from "./workspace-places";

export { placeForSection, workspaceSectionHref, type StrelvaPinnedItem, type StrelvaSection } from "./workspace-places";

type NavigableSection = Exclude<StrelvaSection, "account">;

const PRIMARY_ITEMS: readonly { id: NavigableSection; icon: LucideIcon }[] = [
  { id: "home", icon: Home },
  { id: "customers", icon: Users },
  { id: "requests", icon: ListChecks },
  { id: "ongoing", icon: Repeat },
];
const PINNED_ICONS: Record<NonNullable<StrelvaPinnedItem["kind"]>, LucideIcon> = { website: Globe2, app: AppWindow, inquiries: Inbox, bookings: CalendarDays, document: FileText, tracker: Sheet, onboarding: UserPlus };

const BUSINESS_ITEMS: readonly { id: NavigableSection; icon: LucideIcon }[] = [
  { id: "settings", icon: Building2 },
  { id: "access", icon: KeyRound },
  { id: "help", icon: CircleHelp },
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
  /** Pinned Systems. A managed website appears first, by its name or domain. */
  pinned?: readonly StrelvaPinnedItem[];
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
export function StrelvaSidebar({ active, appBase = "", workspaceId, accountName, accountDetail, businessContext, contextualNavigation, recentWork = [], pinned = [], mobileOpen = false, onCloseMobile, onNavigate, onSearch, onStart, startDisabled = false, signedIn = true, signInHref, signOut, standalone = false }: Props) {
  const href = (section: StrelvaSection) => workspaceSectionHref(section, appBase, workspaceId);
  const newHref = `${appBase}/workspace?view=start${workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : ""}`;
  const searchHref = `${href("work")}&search=1`;
  const place = placeForSection(active);
  function item({ id, icon: Icon }: (typeof PRIMARY_ITEMS)[number]) {
    const label = sectionTitle(id);
    return <Link key={id} className={styles.navItem} href={href(id)} aria-current={place === id ? "page" : undefined} onClick={event => {
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
        {onStart ? <button type="button" className={styles.newAction} disabled={startDisabled} onClick={() => { onCloseMobile?.(); onStart(); }}><MessageSquareText size={18} aria-hidden="true" /><span>Ask Strelva</span></button> : <Link className={styles.newAction} href={newHref} aria-disabled={startDisabled || undefined} tabIndex={startDisabled ? -1 : undefined} onClick={event => { if (startDisabled) event.preventDefault(); onCloseMobile?.(); }}><MessageSquareText size={18} aria-hidden="true" /><span>Ask Strelva</span></Link>}
        {onSearch ? <button type="button" className={styles.navItem} onClick={() => { onCloseMobile?.(); onSearch(); }} title="Search (Ctrl or Command + K)"><Search size={18} aria-hidden="true" /><span>Search</span></button> : <Link className={styles.navItem} href={searchHref} onClick={onCloseMobile}><Search size={18} aria-hidden="true" /><span>Search</span></Link>}
      </div>
      <nav className={styles.primary} aria-label="Main">{PRIMARY_ITEMS.map(item)}</nav>
      {pinned.length ? <section className={styles.recent} aria-label={SYSTEMS_LABEL}><h2>{SYSTEMS_LABEL}</h2>{pinned.map(entry => {
        const Icon = PINNED_ICONS[entry.kind || "website"];
        return <Link key={entry.id} className={styles.pinned} href={entry.href} title={entry.title} aria-current={entry.current ? "page" : undefined} onClick={event => navigateInPlace(event, entry.onOpen ? () => { onCloseMobile?.(); entry.onOpen?.(); } : undefined)}><Icon size={15} strokeWidth={1.6} aria-hidden="true" /><span>{entry.title}</span></Link>;
      })}<Link className={styles.allApps} href={href("apps")} aria-current={place === "apps" ? "page" : undefined} onClick={event => {
        navigateInPlace(event, onNavigate ? () => { onCloseMobile?.(); onNavigate("apps"); } : undefined);
        if (!onNavigate) onCloseMobile?.();
      }}><span>{SYSTEMS_LIST_LABEL}</span></Link></section> : <nav className={styles.recent} aria-label={SYSTEMS_LIST_LABEL}><Link className={styles.allApps} href={href("apps")} aria-current={place === "apps" ? "page" : undefined} onClick={event => {
        navigateInPlace(event, onNavigate ? () => { onCloseMobile?.(); onNavigate("apps"); } : undefined);
        if (!onNavigate) onCloseMobile?.();
      }}><AppWindow size={15} strokeWidth={1.6} aria-hidden="true" /><span>{SYSTEMS_LIST_LABEL}</span></Link></nav>}
      {recentWork.length ? <section className={styles.recent} aria-label="Recent work"><h2>Recent</h2>{recentWork.slice(0, 8).map(work => <Link key={work.id} href={work.href} title={work.title} onClick={event => navigateInPlace(event, work.onOpen ? () => { onCloseMobile?.(); work.onOpen?.(); } : undefined)}><span>{work.title}</span></Link>)}</section> : null}
      {contextualNavigation ? <div className={styles.contextual}>{contextualNavigation}</div> : null}
    </div>
    <div className={styles.footer}>
      <nav aria-label="Business menu">{BUSINESS_ITEMS.map(item)}</nav>
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

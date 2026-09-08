"use client";

import Link from "next/link";
import { useRef, useState, type RefObject, type ReactNode } from "react";
import { Boxes, FolderOpen, Home, LifeBuoy, Menu, Plus, Settings2, X, type LucideIcon } from "lucide-react";
import { AppFrame, useHydrationReady } from "./AppFrame";
import { WorkspaceSignOutButton } from "@/experience/workspace/WorkspaceSignOutButton";
import styles from "./strelva-shell.module.css";

export type StrelvaSection = "home" | "work" | "products" | "help" | "account";
export const STRELVA_SECTIONS: readonly { id: StrelvaSection; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "work", label: "My work", icon: FolderOpen },
  { id: "products", label: "Explore", icon: Boxes },
];

export function workspaceSectionHref(section: StrelvaSection, base = "") {
  return section === "account" ? `${base}/workspace/account` : `${base}/workspace${section === "home" ? "" : `?view=${section}`}`;
}

interface Props {
  children: ReactNode;
  active?: StrelvaSection;
  title?: string;
  context?: ReactNode;
  navigation?: ReactNode;
  actions?: ReactNode;
  notice?: ReactNode;
  accountName?: string;
  accountDetail?: string;
  signedIn?: boolean;
  signInHref?: string;
  signOut?: ReactNode;
  /** Use an authorized app origin on a customer host. Never add tenant authority to these links. */
  appBase?: string;
  onNavigate?: (section: StrelvaSection) => void;
  onStart?: () => void;
  contentId?: string;
  rightRail?: ReactNode;
  rightRailOpen?: boolean;
  onCloseRightRail?: () => void;
  rightRailTriggerRef?: RefObject<HTMLButtonElement | null>;
}

/** Shared presentation only. Each resource retains its existing server authorization and runtime. */
export function StrelvaShell({ children, active, title = "Strelva", context, navigation, actions, notice, accountName = "Your account", accountDetail, signedIn = true, signInHref, signOut, appBase = "", onNavigate, onStart, contentId = "strelva-main", rightRail, rightRailOpen, onCloseRightRail, rightRailTriggerRef }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const ready = useHydrationReady();
  function item(section: StrelvaSection, label: string, Icon: LucideIcon) {
    const body = <><Icon size={18} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span></>;
    const shared = { className: styles.navItem, "aria-current": active === section ? "page" as const : undefined };
    return onNavigate && section !== "account"
      ? <button key={section} type="button" {...shared} onClick={() => { setMobileOpen(false); onNavigate(section); }}>{body}</button>
      : <Link key={section} {...shared} href={workspaceSectionHref(section, appBase)} onClick={() => setMobileOpen(false)}>{body}</Link>;
  }
  return (
    <div data-dashboard>
      <a className={styles.skip} href={`#${contentId}`}>Skip to work</a>
      <AppFrame
        className={styles.shell}
        navigationLabel="Strelva navigation"
        navigationStorageKey="strelva:app-frame-navigation-collapsed"
        navigationOpen={mobileOpen}
        onCloseNavigation={() => setMobileOpen(false)}
        navigationTriggerRef={menuRef}
        contentId={contentId}
        navigation={
          <div className={styles.sidebar} data-open={mobileOpen}>
            <div className={styles.brandRow}>
              <Link href={workspaceSectionHref("home", appBase)} className={styles.brand} onClick={onNavigate ? (event) => { event.preventDefault(); setMobileOpen(false); onNavigate("home"); } : undefined} aria-label="Strelva home"><span className={styles.mark} aria-hidden="true">s</span>Strelva</Link>
              <button className={styles.mobileClose} aria-label="Close navigation" type="button" onClick={() => setMobileOpen(false)}><X size={18} /></button>
            </div>
            {onStart ? <button className={styles.start} type="button" onClick={() => { setMobileOpen(false); onStart(); }}><Plus size={18} aria-hidden="true" />Start something</button> : <Link className={styles.start} href={workspaceSectionHref("products", appBase)}><Plus size={18} aria-hidden="true" />Start something</Link>}
            <nav className={styles.primary} aria-label="Main">{STRELVA_SECTIONS.map(({ id, label, icon }) => item(id, label, icon))}</nav>
            <div className={styles.resources} onClick={(event) => { if ((event.target as HTMLElement).closest("a, button")) setMobileOpen(false); }}>{navigation}</div>
            <div className={styles.footer}>
              {item("help", "Help & service", LifeBuoy)}
              {signedIn ? <>
                <Link className={styles.account} href={workspaceSectionHref("account", appBase)} aria-current={active === "account" ? "page" : undefined}>
                  <span className={styles.avatar} aria-hidden="true">{accountName.slice(0, 1).toUpperCase()}</span>
                  <span><strong>{accountName}</strong><small>{accountDetail || "Account & access"}</small></span>
                  <Settings2 size={16} aria-hidden="true" />
                </Link>
                {signOut === undefined ? <WorkspaceSignOutButton className={styles.signOut} /> : signOut}
              </> : <Link className={styles.start} href={signInHref || `${appBase}/sign-in?next=%2Fworkspace`}>Sign in</Link>}
            </div>
          </div>
        }
        header={<div className={styles.header}>
          <button ref={menuRef} className={styles.mobileMenu} disabled={!ready} onClick={() => setMobileOpen(true)} type="button" aria-label="Open navigation" aria-expanded={mobileOpen}><Menu size={20} /></button>
          <span className={styles.title}>{title}</span>
          {context ? <div className={styles.context}>{context}</div> : null}
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>}
        notice={notice}
        rightRail={rightRail}
        rightRailId="managed-discussion"
        rightRailTitle="Ask Strelva"
        rightRailOpen={rightRailOpen}
        onCloseRightRail={onCloseRightRail}
        rightRailTriggerRef={rightRailTriggerRef}
      >{children}</AppFrame>
    </div>
  );
}

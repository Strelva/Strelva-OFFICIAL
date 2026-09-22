"use client";

import { useEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { WorkspaceSearchDialog } from "@/experience/workspace/WorkspaceSearchDialog";
import type { WorkspaceSearchItem } from "@/experience/workspace/workspace-search";
import { AppFrame, useHydrationReady } from "./AppFrame";
import { StrelvaSidebar, type StrelvaSection } from "./StrelvaSidebar";
import styles from "./strelva-shell.module.css";

export { workspaceSectionHref, type StrelvaSection } from "./StrelvaSidebar";

interface Props {
  children: ReactNode;
  active?: StrelvaSection;
  title?: string;
  context?: ReactNode;
  businessContext?: ReactNode;
  workspaceId?: string;
  navigation?: ReactNode;
  recentWork?: readonly WorkspaceSearchItem[];
  searchItems?: readonly WorkspaceSearchItem[];
  searchScopeName?: string;
  actions?: ReactNode;
  notice?: ReactNode;
  accountName?: string;
  accountDetail?: string;
  signedIn?: boolean;
  signInHref?: string;
  signOut?: ReactNode;
  /** Presentation origin only. Server membership remains the authority. */
  appBase?: string;
  onNavigate?: (section: StrelvaSection) => void;
  onAccess?: () => void;
  onSearch?: () => void;
  onStart?: () => void;
  startDisabled?: boolean;
  contentId?: string;
  rightRail?: ReactNode;
  rightRailOpen?: boolean;
  onCloseRightRail?: () => void;
  rightRailTriggerRef?: RefObject<HTMLButtonElement | null>;
}

/** Shared presentation only. Each resource retains its server authorization. */
export function StrelvaShell({ children, active, title = "Strelva", context, businessContext, workspaceId, navigation, recentWork, searchItems, searchScopeName = "Your work", actions, notice, accountName = "Your account", accountDetail, signedIn = true, signInHref, signOut, appBase = "", onNavigate, onAccess, onSearch, onStart, startDisabled = false, contentId = "strelva-main", rightRail, rightRailOpen, onCloseRightRail, rightRailTriggerRef }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const ready = useHydrationReady();
  const canSearch = Boolean(searchItems || onSearch);

  function openSearch() {
    setMobileOpen(false);
    if (searchItems) setSearchOpen(true);
    else onSearch?.();
  }

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === "Escape" && mobileOpen) setMobileOpen(false);
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k" && canSearch) {
        event.preventDefault();
        setMobileOpen(false);
        if (searchItems) setSearchOpen(true);
        else onSearch?.();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [canSearch, mobileOpen, onSearch, searchItems]);

  return <div data-dashboard className={styles.root}>
    <a className={styles.skip} href={`#${contentId}`}>Skip to work</a>
    <AppFrame className={styles.shell} navigationLabel="Strelva workspace navigation" navigationStorageKey="strelva:app-frame-navigation-collapsed" navigationOpen={mobileOpen} onCloseNavigation={() => setMobileOpen(false)} navigationTriggerRef={menuRef} contentId={contentId}
      navigation={<StrelvaSidebar active={active} appBase={appBase} workspaceId={workspaceId} accountName={accountName} accountDetail={accountDetail} businessContext={businessContext} contextualNavigation={navigation} recentWork={recentWork} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} onNavigate={onNavigate ? section => section === "access" && onAccess ? onAccess() : onNavigate(section) : undefined} onSearch={canSearch ? openSearch : undefined} onStart={onStart} startDisabled={startDisabled} signedIn={signedIn} signInHref={signInHref} signOut={signOut} />}
      header={<div className={styles.header}><button ref={menuRef} className={styles.mobileMenu} disabled={!ready} onClick={() => setMobileOpen(true)} type="button" aria-label="Open navigation" aria-expanded={mobileOpen}><Menu size={20} /></button><span className={styles.title}>{title}</span>{context ? <div className={styles.context}>{context}</div> : null}{actions ? <div className={styles.actions}>{actions}</div> : null}</div>}
      notice={notice} rightRail={rightRail} rightRailId="managed-discussion" rightRailTitle="Ask Strelva" rightRailOpen={rightRailOpen} onCloseRightRail={onCloseRightRail} rightRailTriggerRef={rightRailTriggerRef}
    >{children}</AppFrame>
    {searchItems ? <WorkspaceSearchDialog key={workspaceId || searchScopeName} open={searchOpen} items={searchItems} scopeName={searchScopeName} onClose={() => setSearchOpen(false)} /> : null}
  </div>;
}

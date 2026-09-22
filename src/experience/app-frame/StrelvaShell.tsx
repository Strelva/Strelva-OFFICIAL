"use client";

import { useEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { AppFrame, useHydrationReady } from "./AppFrame";
import { StrelvaSidebar, workspaceSectionHref, type StrelvaSection } from "./StrelvaSidebar";
import styles from "./strelva-shell.module.css";

export { workspaceSectionHref, type StrelvaSection } from "./StrelvaSidebar";

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
  workspaceId?: string;
  signedIn?: boolean;
  signInHref?: string;
  signOut?: ReactNode;
  /** An authorized application origin, not a tenant authority claim. */
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

/** Shared presentation only. Native products retain their server authorization and runtime. */
export function StrelvaShell({ children, active, title = "Strelva", context, navigation, actions, notice, accountName = "Your account", accountDetail, workspaceId, signedIn = true, signInHref, signOut, appBase = "", onNavigate, onAccess, onSearch, onStart, startDisabled = false, contentId = "strelva-main", rightRail, rightRailOpen, onCloseRightRail, rightRailTriggerRef }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const ready = useHydrationReady();
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      // Do not steal commands from a product dialog or a native-app preview.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (event.key.toLowerCase() === "k" && !event.shiftKey) {
        event.preventDefault();
        setMobileOpen(false);
        if (onSearch) onSearch();
        else window.location.assign(`${workspaceSectionHref("work", appBase, workspaceId)}&search=1`);
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [appBase, onSearch, workspaceId]);

  return <div data-dashboard data-strelva-workspace>
    <a className={styles.skip} href={`#${contentId}`}>Skip to work</a>
    <AppFrame className={styles.shell} navigationLabel="Strelva workspace navigation" navigationStorageKey="strelva:app-frame-navigation-collapsed" navigationOpen={mobileOpen} onCloseNavigation={() => setMobileOpen(false)} navigationTriggerRef={menuRef} contentId={contentId}
      navigation={<StrelvaSidebar active={active} appBase={appBase} workspaceId={workspaceId} accountName={accountName} accountDetail={accountDetail} contextualNavigation={navigation} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} onNavigate={onNavigate ? section => section === "access" && onAccess ? onAccess() : onNavigate(section) : undefined} onSearch={onSearch} onStart={onStart} startDisabled={startDisabled} signedIn={signedIn} signInHref={signInHref} signOut={signOut} />}
      header={<div className={styles.header}>
        <button ref={menuRef} className={styles.mobileMenu} disabled={!ready} onClick={() => setMobileOpen(true)} type="button" aria-label="Open navigation" aria-expanded={mobileOpen}><Menu size={20} aria-hidden="true" /></button>
        <span className={styles.title}>{title}</span>
        {context ? <div className={styles.context}>{context}</div> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>}
      notice={notice} rightRail={rightRail} rightRailId="managed-discussion" rightRailTitle="Ask Strelva" rightRailOpen={rightRailOpen} onCloseRightRail={onCloseRightRail} rightRailTriggerRef={rightRailTriggerRef}
    >{children}</AppFrame>
  </div>;
}

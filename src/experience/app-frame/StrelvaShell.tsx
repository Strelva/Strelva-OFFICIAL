"use client";
import { plainWorkspaceName, readOwnerBrand } from "./workspace-header";
import type { OwnerBrand } from "@/platform/infra/agency-brand";

import { useEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { WorkspaceSearchDialog } from "@/experience/workspace/WorkspaceSearchDialog";
import type { WorkspaceSearchItem } from "@/experience/workspace/workspace-search";
import { AppFrame, useHydrationReady } from "./AppFrame";
import { StrelvaSidebar, type AgencyNavigation } from "./StrelvaSidebar";
import type { StrelvaAgencyLink, StrelvaDetailsPlace, StrelvaPinnedItem, StrelvaSection } from "./workspace-places";
import { XaInitial, XaMark } from "@/components/ui/strelva/Xa";
import styles from "./strelva-shell.module.css";

export { isRetiredView, pinnedApps, pinnedSystems, pinnedWebsites, placeForSection, sectionFromView, sectionTitle, workspaceSectionHref, type StrelvaPinnedItem, type StrelvaSection } from "./workspace-places";

interface Props {
  agencyNavigation?: AgencyNavigation;
  ownerBrand?: OwnerBrand;
  /** Authorized workspace name, separate from the agency brand. */
  workspaceName?: string;
  /** Agency chrome can read its own authorized brand while viewing a client. */
  brandWorkspaceId?: string;
  tenantId?: string;
  children: ReactNode;
  active?: StrelvaSection;
  title?: string;
  context?: ReactNode;
  businessContext?: ReactNode;
  workspaceId?: string;
  navigation?: ReactNode;
  recentWork?: readonly WorkspaceSearchItem[];
  pinned?: readonly StrelvaPinnedItem[];
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
  rightRailId?: string;
  rightRailTitle?: string;
  rightRailOpen?: boolean;
  onCloseRightRail?: () => void;
  rightRailTriggerRef?: RefObject<HTMLButtonElement | null>;
  /** STRELVA_SYSTEMS_RELEASE, from the workspace snapshot. Off (the default): pre-Systems places and labels. */
  systemsReleased?: boolean;
  connectionsAvailable?: boolean;
  /**
   * STRELVA_NEEDS_YOU_RELEASE. Present: the sidebar shows the Needs you place,
   * with the waiting count when the caller knows it (null while unknown).
   */
  needsYou?: { count: number | null; label?: string };
  allClients?: { href: string; onOpen?: () => void };
  /**
   * The theme switch. "linen" is the workspace: since October 15 it renders
   * the XA look (paper, quiet rail, ink primary). "paper" keeps the October 9
   * paper look with its dot grid and floating card. The tenant dashboard
   * keeps its dark foundation.
   */
  theme?: "linen" | "paper" | "dashboard";
  /** Light or dark, for previews and the account's choice. */
  mode?: "light" | "dark";
  /** XA: the business's agency, shown under "Your agency". */
  agency?: StrelvaAgencyLink;
  /** XA: which business details place is open (billing, export). */
  detailsPlace?: StrelvaDetailsPlace;
  /** XS: no workspace has loaded (opening, or it could not open). The sidebar hides every business place. */
  unopened?: boolean;
}

/** Shared presentation only. Each resource retains its server authorization. */
export function StrelvaShell({ connectionsAvailable = false, agencyNavigation, tenantId, ownerBrand, workspaceName, brandWorkspaceId, children, active, title = "Strelva", context, businessContext, workspaceId, navigation, recentWork, pinned, searchItems, searchScopeName = "Your work", actions, notice, accountName = "Your account", accountDetail, signedIn = true, signInHref, signOut, appBase = "", onNavigate, onAccess, onSearch, onStart, startDisabled = false, contentId = "strelva-main", rightRail, rightRailId = "managed-discussion", rightRailTitle = "Ask Strelva", rightRailOpen, onCloseRightRail, rightRailTriggerRef, systemsReleased = false, needsYou, allClients, theme = "linen", mode, agency, detailsPlace, unopened = false }: Props) {
  const look = theme === "paper" ? "paper" : "xa";
  const navigationName = workspaceName || plainWorkspaceName(businessContext) || undefined;
  const brandId = brandWorkspaceId || workspaceId;
  const brandScope = brandId ? `workspaceId=${encodeURIComponent(brandId)}` : tenantId ? `tenantId=${encodeURIComponent(tenantId)}` : null;
  const presentationScope = `${appBase}|${brandScope || ""}`;
  const [loadedBrand, setLoadedBrand] = useState<{ scope: string; brand: OwnerBrand | null } | null>(null);
  useEffect(() => {
    if (ownerBrand || !signedIn || !brandScope) return;
    const controller = new AbortController();
    fetch(`${appBase}/api/workspace/owner-brand?${brandScope}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) setLoadedBrand({ scope: presentationScope, brand: readOwnerBrand(body?.brand) });
      })
      .catch(() => { if (!controller.signal.aborted) setLoadedBrand({ scope: presentationScope, brand: null }); });
    return () => controller.abort();
  }, [ownerBrand, signedIn, brandScope, appBase, presentationScope]);
  const presentationBrand = ownerBrand ?? (loadedBrand?.scope === presentationScope ? loadedBrand.brand ?? undefined : undefined);
  const [leadAvailability, setLeadAvailability] = useState<{ scope: string; available: boolean } | null>(null);
  const hasAgencyNavigation = Boolean(agencyNavigation);
  const suppliedLeadAvailability = agencyNavigation?.leadsAvailable;
  const leadScope = `${appBase}|${workspaceId || ""}|${accountDetail || accountName}|${signedIn}`;
  useEffect(() => {
    if (!hasAgencyNavigation || suppliedLeadAvailability !== undefined || !signedIn || !workspaceId) return;
    const controller = new AbortController();
    fetch(`${appBase}/api/agency/leads?agencyWorkspaceId=${encodeURIComponent(workspaceId)}&availability=1`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const value = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) setLeadAvailability({ scope: leadScope, available: value?.available === true && value.agencyWorkspaceId === workspaceId });
      })
      .catch(() => { if (!controller.signal.aborted) setLeadAvailability({ scope: leadScope, available: false }); });
    return () => controller.abort();
  }, [hasAgencyNavigation, suppliedLeadAvailability, appBase, workspaceId, signedIn, leadScope]);
  const salesNavigation = agencyNavigation ? { ...agencyNavigation, leadsAvailable: signedIn && (agencyNavigation.leadsAvailable ?? (leadAvailability?.scope === leadScope && leadAvailability.available)) } : undefined;
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

  return <div data-dashboard data-workspace-theme={theme === "dashboard" ? undefined : "linen"} data-workspace-look={theme === "dashboard" ? undefined : look} data-workspace-mode={mode} className={styles.root}>
    <a className={styles.skip} href={`#${contentId}`}>Skip to work</a>
    <AppFrame className={styles.shell} navigationLabel={`${navigationName || "Workspace"} navigation`} navigationStorageKey="strelva:app-frame-navigation-collapsed" navigationOpen={mobileOpen} onCloseNavigation={() => setMobileOpen(false)} navigationTriggerRef={menuRef} contentId={contentId}
      navigation={<StrelvaSidebar connectionsAvailable={connectionsAvailable} allClients={allClients} agencyNavigation={salesNavigation} ownerBrand={presentationBrand} workspaceName={navigationName} systemsReleased={systemsReleased} needsYou={needsYou} active={active} appBase={appBase} workspaceId={workspaceId} accountName={accountName} accountDetail={accountDetail} businessContext={businessContext} contextualNavigation={navigation} recentWork={recentWork} pinned={pinned} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} onNavigate={onNavigate ? section => section === "access" && onAccess ? onAccess() : onNavigate(section) : undefined} onSearch={canSearch ? openSearch : undefined} onStart={onStart} startDisabled={startDisabled} signedIn={signedIn} signInHref={signInHref} signOut={signOut} look={look} agency={agency} detailsPlace={detailsPlace} unopened={unopened} />}
      header={<div className={styles.header}><button ref={menuRef} className={styles.mobileMenu} disabled={!ready} onClick={() => setMobileOpen(true)} type="button" aria-label="Open navigation" aria-expanded={mobileOpen}>{look === "xa" ? <><XaMark size={22} /><span className={styles.mobileName}>{navigationName || title}</span></> : <Menu size={20} />}</button><span className={styles.title}>{title}</span>{look === "xa" && signedIn ? <span className={styles.mobileAccount} aria-hidden="true"><XaInitial name={accountName} shape="round" size={30} /></span> : null}{context ? <div className={styles.context} data-shell-extra>{context}</div> : null}{actions ? <div className={styles.actions} data-shell-extra>{actions}</div> : null}</div>}
      notice={notice} rightRail={rightRail} rightRailId={rightRailId} rightRailTitle={rightRailTitle} rightRailOpen={rightRailOpen} onCloseRightRail={onCloseRightRail} rightRailTriggerRef={rightRailTriggerRef}
    >{children}</AppFrame>
    {searchItems ? <WorkspaceSearchDialog systemsReleased={systemsReleased} key={workspaceId || searchScopeName} storageKey={workspaceId && accountDetail ? `strelva:search-query:v1:${encodeURIComponent(accountDetail)}:${workspaceId}` : undefined} open={searchOpen} items={searchItems} scopeName={searchScopeName} onClose={() => setSearchOpen(false)} /> : null}
  </div>;
}

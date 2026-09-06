"use client";

import { ArrowUpRight, Building2, Home, PanelLeftClose, Plus, Search, Share2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import type { WorkspaceSnapshot } from "./contracts";
import { WorkspaceProductDiscovery, type ManagedWorkSummary } from "./WorkspaceProductDiscovery";
import { WorkspaceSignOutButton } from "./WorkspaceSignOutButton";
import styles from "./workspace-layout.module.css";

interface Props {
  snapshot: WorkspaceSnapshot;
  managedWork?: readonly ManagedWorkSummary[];
  managedWorkUnavailable?: boolean;
  collapsed: boolean;
  productsOpen: boolean;
  mobileOpen: boolean;
  onToggleSidebar: () => void;
  onCloseMobile: () => void;
  onToggleProducts: () => void;
  onNew: () => void;
  onHome: () => void;
  onSearch: () => void;
  onShared: () => void;
  onAgency: () => void;
  onStartAiVisibility: () => void;
}

function isOwnedWorkspace(snapshot: WorkspaceSnapshot): boolean {
  const current = snapshot.workspaces.find((workspace) => workspace.id === snapshot.workspaceId);
  // A malformed snapshot must not silently become a writable context. Legacy
  // fixtures may omit `access`, which still means direct member access when the
  // workspace itself is present.
  return Boolean(current && current.access !== "delegated_read");
}

function hasSharedWorkspace(snapshot: WorkspaceSnapshot): boolean {
  return snapshot.workspaces.some((workspace) => workspace.access === "delegated_read");
}

function workspaceName(snapshot: WorkspaceSnapshot): string {
  return snapshot.workspaces.find((workspace) => workspace.id === snapshot.workspaceId)?.name || "Current workspace";
}

export function WorkspaceSidebar({
  snapshot,
  managedWork,
  managedWorkUnavailable,
  collapsed,
  productsOpen,
  mobileOpen,
  onToggleSidebar,
  onCloseMobile,
  onToggleProducts,
  onNew,
  onHome,
  onSearch,
  onShared,
  onAgency,
  onStartAiVisibility,
}: Props) {
  const owned = isOwnedWorkspace(snapshot);
  const hasShared = hasSharedWorkspace(snapshot);
  const current = workspaceName(snapshot);

  return (
    <>
      <aside className={styles.sidebar} data-mobile-open={mobileOpen} aria-label="Workspace navigation">
      <div className={styles.sidebarBrand}>
        <div className={styles.brandMark} aria-hidden="true">S</div>
        <div className={styles.brandCopy}>
          <span className={styles.wordmark}>Strelva</span>
          <span className={styles.workspaceName}>{current}</span>
        </div>
        <button type="button" className={styles.sidebarIconButton} onClick={onToggleSidebar} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <PanelLeftClose size={17} strokeWidth={1.5} />
        </button>
        <button type="button" className={styles.mobileClose} onClick={onCloseMobile} aria-label="Close navigation" title="Close navigation">
          <X size={17} strokeWidth={1.5} />
        </button>
      </div>

      <nav className={styles.navigation} aria-label="Workspace sections">
        <button type="button" onClick={() => { onCloseMobile(); onNew(); }} disabled={!owned} title="New assessment">
          <Plus size={17} strokeWidth={1.5} /><span>New</span>
        </button>
        <button type="button" onClick={() => { onCloseMobile(); onSearch(); }} title="Search work">
          <Search size={17} strokeWidth={1.5} /><span>Search</span>
        </button>
        <button type="button" onClick={() => { onCloseMobile(); onHome(); }} aria-current={owned ? "page" : undefined} title="My work">
          <Home size={17} strokeWidth={1.5} /><span>My work</span>
        </button>
        {hasShared ? (
          <button type="button" onClick={() => { onCloseMobile(); onShared(); }} aria-current={!owned ? "page" : undefined} title="Shared with me">
            <Share2 size={17} strokeWidth={1.5} /><span>Shared with me</span>
          </button>
        ) : null}
        <button type="button" onClick={() => { onCloseMobile(); onAgency(); }} title="Agency access">
          <Building2 size={17} strokeWidth={1.5} /><span>Agency</span>
        </button>
        <button type="button" onClick={() => { onToggleProducts(); }} aria-expanded={productsOpen} aria-controls="workspace-products" title="Products">
          <Sparkles size={17} strokeWidth={1.5} /><span>Products</span>
        </button>
      </nav>

      {productsOpen ? (
        <WorkspaceProductDiscovery products={snapshot.products} managedWork={managedWork} managedWorkUnavailable={managedWorkUnavailable ?? snapshot.managedWorkUnavailable} onStartAiVisibility={() => { onCloseMobile(); onStartAiVisibility(); }} />
      ) : null}

      <div className={styles.sidebarFoot}>
        <span className={styles.privacy}>{owned ? "Private by default" : "Shared read-only"}</span>
        <details className={styles.account}>
          <summary title={snapshot.actor.email}>
            <span className={styles.avatar}>{snapshot.actor.email.slice(0, 1).toUpperCase()}</span>
            <span className={styles.accountLabel}>{snapshot.actor.email}</span>
          </summary>
          <div className={styles.accountMenu}>
            <p>Signed in as<br />{snapshot.actor.email}</p>
            <Link href="/workspace/account">Account <ArrowUpRight size={14} strokeWidth={1.5} /></Link>
            <WorkspaceSignOutButton />
          </div>
        </details>
      </div>
      </aside>
      {mobileOpen ? <button type="button" className={styles.mobileScrim} onClick={onCloseMobile} aria-label="Close navigation backdrop" /> : null}
    </>
  );
}

export function CollapsedWorkspaceSidebar({ onExpand }: { onExpand: () => void }) {
  return (
    <nav className={styles.collapsedSidebar} aria-label="Workspace navigation (collapsed)">
      <div className={styles.collapsedBrand} aria-hidden="true">S</div>
      <button type="button" className={styles.collapsedButton} onClick={onExpand} aria-label="Expand sidebar" title="Expand sidebar">
        <PanelLeftClose size={17} strokeWidth={1.5} />
      </button>
    </nav>
  );
}

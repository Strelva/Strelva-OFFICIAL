"use client";

import { ArrowLeft, ArrowUpRight, FileSearch, Menu, MessageSquare, Search } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppFrame } from "@/experience/app-frame";
import { Button } from "@/components/ui/Button";
import type { WorkspaceSnapshot, WorkspaceWork } from "./contracts";
import { CollapsedWorkspaceSidebar, WorkspaceSidebar } from "./WorkspaceSidebar";
import type { ManagedWorkSummary } from "./WorkspaceProductDiscovery";
import styles from "./workspace-layout.module.css";

interface Props {
  snapshot: WorkspaceSnapshot;
  /** Optional server-scoped managed-client destinations for this actor. */
  managedWork?: readonly ManagedWorkSummary[];
  managedWorkUnavailable?: boolean;
  home: boolean;
  agency: boolean;
  busy: boolean;
  selectedWork: WorkspaceWork | null;
  onHome: () => void;
  onNew: () => void;
  onAgency: () => void;
  onChoose: (id: string) => void;
  onWorkspace: (id: string) => void;
  notice: ReactNode;
  children: ReactNode;
}

function subscribePreference(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("strelva:sidebar", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("strelva:sidebar", callback);
  };
}

let sessionCollapsed = false;

function readPreference() {
  try {
    return localStorage.getItem("strelva:sidebar-collapsed") === "true";
  } catch {
    return sessionCollapsed;
  }
}

function writePreference(collapsed: boolean) {
  sessionCollapsed = collapsed;
  try {
    localStorage.setItem("strelva:sidebar-collapsed", String(collapsed));
  } catch {
    // A blocked preference must not affect workspace navigation.
  }
  window.dispatchEvent(new Event("strelva:sidebar"));
}

function DiscussionPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.discussionEmpty}>
      <MessageSquare aria-hidden="true" size={25} strokeWidth={1.3} />
      <h3>Stay beside the work.</h3>
      <p>Discussion isn’t available for private assessments yet. Your assessment and sharing controls remain available.</p>
      <Button type="button" size="sm" variant="ghost" onClick={onClose} icon={<ArrowLeft size={14} strokeWidth={1.5} />}>
        Back to the assessment
      </Button>
    </div>
  );
}

export function WorkspaceLayout({
  snapshot,
  managedWork,
  managedWorkUnavailable,
  home,
  agency,
  busy,
  selectedWork,
  onHome,
  onNew,
  onAgency,
  onChoose,
  onWorkspace,
  notice,
  children,
}: Props) {
  const collapsed = useSyncExternalStore(subscribePreference, readPreference, () => false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const [discussion, setDiscussion] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const discussionButton = useRef<HTMLButtonElement>(null);
  const mobileNavigationButton = useRef<HTMLButtonElement>(null);
  const current = snapshot.workspaces.find((item) => item.id === snapshot.workspaceId);
  const readOnly = current?.access === "delegated_read";
  const ownedWorkspaces = snapshot.workspaces.filter((item) => item.access !== "delegated_read");
  const sharedWorkspaces = snapshot.workspaces.filter((item) => item.access === "delegated_read");
  const normalizedQuery = query.trim().toLowerCase();
  const visible = busy ? [] : snapshot.work.filter((item) => {
    if (!normalizedQuery) return true;
    const searchable = [
      item.title,
      item.productId,
      item.resourceKind,
      item.payload?.business,
      item.payload?.url,
      item.payload?.verdict,
      item.payload?.topFix,
      item.input.business,
      item.input.url,
      item.input.category,
      item.input.location,
    ];
    return searchable.some((value) => typeof value === "string" && value.toLowerCase().includes(normalizedQuery));
  });
  const scopeLabel = readOnly ? "Shared with me" : "My work";

  useEffect(() => {
    if (!discussion) return;
    // AppFrame also moves focus to its close control. This fallback keeps the
    // focus contract intact if the rail is temporarily unavailable on mobile.
    const frame = window.requestAnimationFrame(() => discussionButton.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [discussion]);

  function goHome() {
    setProductsOpen(false);
    const personalWorkspace = ownedWorkspaces.find((workspace) => workspace.kind === "personal") ?? ownedWorkspaces[0];
    if (readOnly && personalWorkspace && personalWorkspace.id !== snapshot.workspaceId) {
      onWorkspace(personalWorkspace.id);
      return;
    }
    onHome();
  }

  function goShared() {
    setProductsOpen(false);
    const target = sharedWorkspaces[0];
    if (!target) return;
    if (target.id === snapshot.workspaceId) {
      onHome();
      return;
    }
    onWorkspace(target.id);
  }

  function startAiVisibility() {
    setProductsOpen(false);
    onNew();
  }

  function focusSearch() {
    setProductsOpen(false);
    setMobileNavigation(false);
    // Let AppFrame finish restoring focus from the mobile navigation overlay,
    // then move focus into the search field as the requested destination.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const input = searchRef.current;
        if (!input) return;
        input.focus();
        input.scrollIntoView?.({
          block: "center",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
      });
    });
  }

  const header = (
    <div className={styles.headerContent}>
      {home ? (
        <button ref={mobileNavigationButton} type="button" className={styles.mobileMenuButton} onClick={() => setMobileNavigation(true)} aria-label="Open navigation" title="Open navigation">
          <Menu size={18} strokeWidth={1.5} />
        </button>
      ) : null}
      {!home ? (
        <button type="button" className={styles.headerIconButton} onClick={onHome} aria-label="Back to my work" title="Back to my work">
          <ArrowLeft size={18} strokeWidth={1.5} />
        </button>
      ) : null}
      {!home ? <span className={styles.workTitle}>{agency ? "Agency" : selectedWork?.title || "New assessment"}</span> : <span className={styles.headerScope}>Workspace</span>}
      <label className={styles.workspaceSelect}>
        <span className="sr-only">Current workspace</span>
        <select value={snapshot.workspaceId} disabled={busy} onChange={(event) => onWorkspace(event.target.value)}>
          {snapshot.workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}{item.access === "delegated_read" ? " · Read-only" : ""}
            </option>
          ))}
        </select>
      </label>
      {!home && !agency && selectedWork ? (
        <div className={styles.headerActions}>
          <button
            ref={discussionButton}
            type="button"
            aria-expanded={discussion}
            aria-controls="workspace-discussion"
            className={styles.textButton}
            onClick={() => setDiscussion((value) => !value)}
          >
            <MessageSquare size={16} strokeWidth={1.5} />Discuss
          </button>
          <button type="button" className={styles.textButton} onClick={onAgency}>Access</button>
        </div>
      ) : null}
      {!home && agency ? (
        <button type="button" className={styles.textButton} onClick={() => selectedWork ? onChoose(selectedWork.id) : onHome()}>
          Work
        </button>
      ) : null}
    </div>
  );

  const navigation = home ? (
    <WorkspaceSidebar
      snapshot={snapshot}
      managedWork={managedWork}
      managedWorkUnavailable={managedWorkUnavailable}
      collapsed={collapsed}
      productsOpen={productsOpen}
      mobileOpen={mobileNavigation}
      onToggleSidebar={() => writePreference(!collapsed)}
      onCloseMobile={() => setMobileNavigation(false)}
      onToggleProducts={() => setProductsOpen((open) => !open)}
      onNew={onNew}
      onHome={goHome}
      onSearch={focusSearch}
      onShared={goShared}
      onAgency={onAgency}
      onStartAiVisibility={startAiVisibility}
    />
  ) : undefined;

  return (
    <AppFrame
      navigation={navigation}
      collapsedNavigation={home ? <CollapsedWorkspaceSidebar onExpand={() => writePreference(false)} /> : undefined}
      navigationLabel="Workspace navigation"
      showNavigationToggle={false}
      navigationCollapsed={collapsed}
      onNavigationToggle={writePreference}
      navigationStorageKey="strelva:sidebar-collapsed"
      navigationOpen={mobileNavigation}
      onCloseNavigation={() => setMobileNavigation(false)}
      navigationTriggerRef={mobileNavigationButton}
      header={header}
      notice={notice}
      contentId="workspace-main"
      rightRail={selectedWork && !home && !agency ? <DiscussionPanel onClose={() => setDiscussion(false)} /> : undefined}
      rightRailId="workspace-discussion"
      rightRailTitle="Discussion"
      rightRailOpen={discussion}
      onCloseRightRail={() => setDiscussion(false)}
      rightRailTriggerRef={discussionButton}
      className={styles.workspaceFrame}
    >
      <div className={styles.content}>
        {home ? (
          <div className={styles.home}>
            <section className={styles.start} aria-labelledby="start-title">
              <p className={styles.eyebrow}>{readOnly ? "Shared workspace" : "Your Strelva workspace"}</p>
              <h1 id="start-title">{readOnly ? "Shared work starts here." : "Good work starts here."}</h1>
              <p>{readOnly ? "Review the customer work shared with you." : "Something new, or right where you left off."}</p>
              <Button disabled={readOnly} onClick={onNew} icon={<FileSearch size={16} strokeWidth={1.5} />}>
                Check a business
              </Button>
              {readOnly ? <p className={styles.readOnly}>This workspace is shared with you read-only.</p> : null}
            </section>

            <section aria-labelledby="recent-title" aria-busy={busy || undefined}>
              <div className={styles.collectionHeader}>
                <div>
                  <h2 id="recent-title">{scopeLabel}</h2>
                  <p>{readOnly ? "Customer-owned work shared with you" : "Private to this workspace"}</p>
                </div>
                <label className={styles.search}>
                  <Search aria-hidden="true" size={15} strokeWidth={1.5} />
                  <span className="sr-only">Search saved work</span>
                  <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find work…" type="search" />
                </label>
              </div>
              {busy ? <div className={styles.loadingWork} role="status">Loading saved work…</div> : <div className={styles.collection}>
                {visible.map((work) => (
                  <button className={styles.workCard} key={work.id} type="button" onClick={() => onChoose(work.id)} aria-label={`Open ${work.title}`}>
                    <div className={styles.preview}>
                      <FileSearch aria-hidden="true" size={20} strokeWidth={1.3} />
                      <span className={styles.previewTitle}>{work.title}</span>
                      <span className={styles.previewLine} />
                      <span className={styles.previewLine} />
                      <p>{work.payload?.topFix || "Open saved work"}</p>
                    </div>
                    <div className={styles.cardCaption}><span>{work.title}</span><ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.5} /></div>
                    <p className={styles.cardMeta}>{work.productId === "ai_visibility" ? "AI Visibility" : work.productId} · {new Date(work.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                  </button>
                ))}
              </div>}
              {!busy && !visible.length ? (
                <div className={styles.empty}>
                  <FileSearch aria-hidden="true" size={24} strokeWidth={1.3} />
                  <h3>{query ? "No matching work" : "A place for what you make."}</h3>
                  <p>{query ? "Try a different name." : "Your saved assessments will appear here. Start with a business you know."}</p>
                  {query ? <button type="button" className={styles.textButton} onClick={() => setQuery("")}>Clear search</button> : null}
                </div>
              ) : null}
            </section>
          </div>
        ) : (
          <div className={styles.workContent}>{children}</div>
        )}
      </div>
    </AppFrame>
  );
}

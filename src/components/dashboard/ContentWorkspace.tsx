"use client";

import { XaButtonLink, XaIconButton, XaSegmented } from "@/components/ui/strelva/Xa";
import { DashEmpty } from "./xa/DashboardXa";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, PanelRightOpen } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { SitePreview } from "./SitePreview";
import { PropertiesEditor } from "./PropertiesEditor";
import { ChatPanel } from "./ChatPanel";
import { CustomChangeRequestPanel } from "./CustomChangeRequestPanel";
import { PublishBar, type PublishOutcome } from "./design/PublishBar";
import type { SectionData } from "@/platform/infra/section-summary";
import { SECTION_LABELS, COMPOSITE_SECTIONS } from "@/components/ui/section-labels";
import { getDefaultPageConfig } from "@/lib/pageConfigDefaults";

interface ContentWorkspaceProps {
  siteName: string;
  ownerName: string;
  sectionData: Record<string, SectionData>;
  timestamps: Record<string, string>;
  /** Replaces the tenant chat in the right panel (the workspace passes Ask Strelva about this System). */
  assistant?: React.ReactNode;
}

type WorkspaceViewport = "mobile" | "tablet" | "desktop";

function getWorkspaceViewport(): WorkspaceViewport {
  if (typeof window === "undefined") return "desktop";
  if (window.innerWidth >= 1024) return "desktop";
  if (window.innerWidth >= 768) return "tablet";
  return "mobile";
}

export function ContentWorkspace({
  siteName,
  ownerName,
  sectionData,
  timestamps,
  assistant,
}: ContentWorkspaceProps) {
  const {
    activeSection,
    setActiveSection,
    setScrollToSection,
    activePage,
    setActivePage,
    siteModel,
    rightTab,
    setRightTab,
    rightCollapsed,
    siteUrl,
    liveSyncEnabled,
    dashboardHref,
    hasDraft,
    hasPageConfigDraft,
    setHasDraft,
    setHasPageConfigDraft,
    reloadDraftState,
    triggerRefresh,
    markDraftReceipts,
    readOnly,
  } = useDashboard();
  void timestamps;
  const [viewportMode, setViewportMode] = useState<WorkspaceViewport | null>(null);
  // Land on preview (see your site) — editing tooling appears only when asked for.
  const [isEditing, setIsEditing] = useState(false);

  const sectionOptions = useMemo(
    () =>
      Object.keys(sectionData).map((section) => ({
        value: section,
        label: SECTION_LABELS[section] || sectionData[section]?.preview || section,
      })),
    [sectionData],
  );

  // Pages and their sections come from the active site model's page config, so
  // the rail shows a Page selector on top of that page's sections.
  const siteModelPages = useMemo(() => getDefaultPageConfig(siteModel), [siteModel]);
  const pageOptions = useMemo(
    () =>
      Object.keys(siteModelPages)
        .sort((a, b) => (a === "home" ? -1 : b === "home" ? 1 : a.localeCompare(b)))
        .map((page) => ({
          value: page,
          label: page === "home" ? "Home" : page.charAt(0).toUpperCase() + page.slice(1),
        })),
    [siteModelPages],
  );
  const pageSections = useMemo(() => {
    const secs = [...(siteModelPages[activePage]?.sections || [])]
      .sort((a, b) => a.order - b.order)
      .filter((section) => section.visible !== false)
      .map((section) => ({
        value: section.type,
        label: SECTION_LABELS[section.type] || sectionData[section.type]?.preview || section.type,
      }));
    return secs.length > 0 ? secs : sectionOptions;
  }, [siteModelPages, activePage, sectionData, sectionOptions]);

  const hasAnyDraft = Object.values(hasDraft).some(Boolean) || hasPageConfigDraft;

  const handlePublishAll = useCallback(async (): Promise<PublishOutcome> => {
    const res = await fetch(dashboardHref("/api/publish"), {
      method: "POST",
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || "Publish failed");
    }
    setHasDraft({});
    setHasPageConfigDraft(false);
    markDraftReceipts("published");
    triggerRefresh();
    await reloadDraftState();
    return data as PublishOutcome;
  }, [dashboardHref, markDraftReceipts, reloadDraftState, setHasDraft, setHasPageConfigDraft, triggerRefresh]);

  const handleDiscardDrafts = useCallback(async () => {
    const res = await fetch(dashboardHref("/api/publish"), {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) {
      throw new Error("Discard failed");
    }
    setHasDraft({});
    setHasPageConfigDraft(false);
    markDraftReceipts("discarded");
    triggerRefresh();
    await reloadDraftState();
  }, [dashboardHref, markDraftReceipts, reloadDraftState, setHasDraft, setHasPageConfigDraft, triggerRefresh]);

  useEffect(() => {
    setRightTab("properties");
  }, [setRightTab]);

  useEffect(() => {
    if (activeSection || pageSections.length === 0) return;
    // Prefer the first directly-editable section so a page never opens on a
    // composite ("Page Header", "Call to Action") that only offers Ask Strelva.
    const firstEditable = pageSections.find((section) => !COMPOSITE_SECTIONS.has(section.value));
    setActiveSection((firstEditable ?? pageSections[0]!).value);
  }, [activeSection, pageSections, setActiveSection]);

  useEffect(() => {
    const updateViewportMode = () => setViewportMode(getWorkspaceViewport());
    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);
    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  // Arrow keys step through the current page's sections (ignored while typing).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!isEditing) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (pageSections.length === 0) return;
      event.preventDefault();
      const idx = pageSections.findIndex((section) => section.value === activeSection);
      const nextIdx =
        event.key === "ArrowDown"
          ? Math.min(pageSections.length - 1, idx < 0 ? 0 : idx + 1)
          : Math.max(0, idx < 0 ? 0 : idx - 1);
      const next = pageSections[nextIdx];
      if (next) {
        setActiveSection(next.value);
        setScrollToSection(next.value);
        setRightTab("properties");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isEditing, pageSections, activeSection, setActiveSection, setScrollToSection, setRightTab]);

  const inRequest = rightTab === "request";
  const inChat = rightTab === "chat";

  const rightPanelContent = (
    <>
      {/* One slim mode switch: change the selected part, or ask Strelva */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--st-line)] px-3 py-2.5">
        <XaSegmented label="Edit or ask" value={inChat ? "chat" : "properties"} onChange={(value) => setRightTab(value)} options={[
          { value: "properties", label: "Edit" },
          { value: "chat", label: "Ask Strelva" },
        ]} />
        <button type="button" onClick={() => setRightTab(inRequest ? "properties" : "request")} aria-pressed={inRequest}
          className={`border-0 bg-transparent p-0 text-[13px] font-medium ${inRequest ? "text-[var(--st-text)]" : "text-[var(--st-accent)] hover:underline"}`}>
          {inRequest ? "Back to editing" : "Ask for a bigger change"}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {inChat ? (
          assistant ?? <ChatPanel ownerName={ownerName || siteName} variant="compact" />
        ) : inRequest ? (
          <CustomChangeRequestPanel />
        ) : (
          <PropertiesEditor activeSection={activeSection} />
        )}
      </div>
    </>
  );

  if (readOnly) {
    return (
      <DashEmpty pose="website" title="The site editor is view-only here." job="Your live site is unchanged"
        action={<XaButtonLink href="/access-request">Get your own site</XaButtonLink>}
        secondary={siteUrl ? <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="text-[15px] font-medium text-[var(--st-accent)] hover:underline">View the live site</a> : undefined}>
        This is a demo you can look around. Changing the site, its layout and its words is off.
      </DashEmpty>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
      {viewportMode === null && (
        <div className="flex flex-1 items-center justify-center text-[14px] text-[var(--st-text-2)]" role="status">
          Opening your site
        </div>
      )}

      {viewportMode === "desktop" && (
        isEditing ? (
          <div className="flex flex-1 min-h-0">
            <SectionsRail
              pages={pageOptions}
              activePage={activePage}
              onPageChange={(value) => {
                setActivePage(value);
                setActiveSection(null);
              }}
              sections={pageSections}
              activeSection={activeSection}
              onSelect={(value) => {
                setActiveSection(value);
                setScrollToSection(value);
                setRightTab("properties");
              }}
            />

            <main className="flex-1 flex flex-col min-w-0">
              <SitePreview isEditing onToggleEdit={() => setIsEditing(false)} />
            </main>

            <aside
              className={`border-l border-[var(--st-line)] flex flex-col shrink-0 transition-[width] duration-200 ease-out ${
                rightCollapsed ? "w-[44px]" : "w-[360px] xl:w-[380px]"
              }`}
            >
              {rightCollapsed ? <CollapsedRight /> : rightPanelContent}
            </aside>
          </div>
        ) : (
          <main className="flex flex-1 min-w-0 flex-col">
            <SitePreview isEditing={false} onToggleEdit={() => setIsEditing(true)} />
          </main>
        )
      )}

      {viewportMode === "tablet" && (
        isEditing ? (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="h-[58%] border-b border-[var(--st-line)] shrink-0 flex min-h-0 flex-col">
              <div className="min-h-0 flex-1">
                <SitePreview isEditing onToggleEdit={() => setIsEditing(false)} />
              </div>
            </div>
            <div className="flex-1 flex flex-col min-h-0">
              {rightPanelContent}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col">
            <SitePreview isEditing={false} onToggleEdit={() => setIsEditing(true)} />
          </div>
        )
      )}

      {viewportMode === "mobile" && (
        isEditing ? (
          <div className="flex flex-1 min-h-0 flex-col">
            <div className="h-[46%] min-h-[260px] max-h-[430px] shrink-0 border-b border-[var(--st-line)]">
              <SitePreview isEditing onToggleEdit={() => setIsEditing(false)} />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              {rightPanelContent}
            </div>
          </div>
        ) : (
          <main className="flex flex-1 min-h-0 flex-col">
            <SitePreview isEditing={false} onToggleEdit={() => setIsEditing(true)} />
          </main>
        )
      )}

      </div>
      <div className="shrink-0">
        <PublishBar
          hasDrafts={hasAnyDraft}
          onPublish={handlePublishAll}
          onDiscard={handleDiscardDrafts}
          liveSyncEnabled={liveSyncEnabled}
        />
      </div>
    </div>
  );
}

function SectionsRail({
  pages,
  activePage,
  onPageChange,
  sections,
  activeSection,
  onSelect,
}: {
  pages: { value: string; label: string }[];
  activePage: string;
  onPageChange: (value: string) => void;
  sections: { value: string; label: string }[];
  activeSection: string | null;
  onSelect: (value: string) => void;
}) {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--st-line)] bg-[var(--st-sidebar)]" aria-label="Pages and parts">
      <label className="flex shrink-0 flex-col gap-2 border-b border-[var(--st-line)] px-4 py-3">
        <span className="text-[13px] font-medium text-[var(--st-text-3)]">Page</span>
        <span className="relative">
          <select
            value={activePage}
            onChange={(event) => onPageChange(event.target.value)}
            className="w-full appearance-none rounded-[var(--st-r-md)] border border-[var(--st-line)] bg-[var(--st-surface)] py-2 pl-3 pr-8 text-[14px] font-medium text-[var(--st-text)] outline-none focus-visible:border-[var(--st-accent)]"
          >
            {pages.map((page) => (
              <option key={page.value} value={page.value}>
                {page.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--st-text-3)]" strokeWidth={1.5} aria-hidden="true" />
        </span>
      </label>

      <p className="m-0 shrink-0 px-4 pb-1.5 pt-3.5 text-[13px] font-medium text-[var(--st-text-3)]">{sections.length} parts on this page</p>
      <div className="min-h-0 flex-1 space-y-px overflow-y-auto px-2.5 pb-2">
        {sections.map((section) => {
          const active = section.value === activeSection;
          return (
            <button
              key={section.value}
              type="button"
              onClick={() => onSelect(section.value)}
              aria-current={active ? "true" : undefined}
              className={`relative flex w-full items-center rounded-[var(--st-r-nav)] px-3 py-2 text-left text-[14px] transition-colors duration-(--motion-fast) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--st-accent)] ${
                active ? "bg-[var(--st-selected)] font-medium text-[var(--st-text)]" : "text-[var(--st-text-body)] hover:bg-[var(--st-hover)]"
              }`}
            >
              <span className="truncate">{section.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function CollapsedRight() {
  const { toggleRight } = useDashboard();
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <XaIconButton label="Open the editing panel" tone="plain" onClick={toggleRight}>
        <PanelRightOpen className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </XaIconButton>
    </div>
  );
}

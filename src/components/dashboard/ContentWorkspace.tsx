"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, PanelRightOpen } from "lucide-react";
import Link from "next/link";
import { useDashboard } from "./DashboardContext";
import { SitePreview } from "./SitePreview";
import { PropertiesEditor } from "./PropertiesEditor";
import { ChatPanel } from "./ChatPanel";
import { CustomChangeRequestPanel } from "./CustomChangeRequestPanel";
import { PublishBar, type PublishOutcome } from "./design/PublishBar";
import type { SectionData } from "./ContentBrowser";
import { SECTION_LABELS } from "@/components/ui/section-labels";
import { getDefaultPageConfig } from "@/lib/pageConfigDefaults";

interface ContentWorkspaceProps {
  siteName: string;
  ownerName: string;
  sectionData: Record<string, SectionData>;
  timestamps: Record<string, string>;
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
    setActiveSection(pageSections[0].value);
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
  }, [pageSections, activeSection, setActiveSection, setScrollToSection, setRightTab]);

  const inRequest = rightTab === "request";
  const inChat = rightTab === "chat";

  const rightPanelContent = (
    <>
      {/* One slim mode switch — Edit the selected element, or ask the AI */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-border bg-surface px-2 py-2 shrink-0">
        <div className="flex items-center gap-0.5 rounded-lg bg-gray-bg-alt p-0.5">
          {[
            { value: "properties", label: "Edit" },
            { value: "chat", label: "Ask AI" },
          ].map((item) => {
            const active = item.value === "chat" ? inChat : !inChat && !inRequest;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setRightTab(item.value as "properties" | "chat")}
                className={`flex h-7 items-center rounded-md px-3.5 text-[12px] font-medium transition-colors ${
                  active
                    ? "bg-surface text-warm-white shadow-sm"
                    : "text-gray-muted hover:text-warm-white"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setRightTab(inRequest ? "properties" : "request")}
          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
            inRequest ? "text-warm-white" : "text-gray-faint hover:text-gray-muted"
          }`}
        >
          Request a change
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {inChat ? (
          <ChatPanel ownerName={ownerName || siteName} variant="compact" />
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
      <div className="flex h-full flex-col items-center justify-center bg-surface-base px-6">
        <div className="max-w-md text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
            Read-only demo
          </p>
          <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.02em] text-warm-white">
            The site editor is view-only here
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-gray-muted">
            This is a live look at the dashboard. Editing the site, layout, and content is turned off in the demo.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/access-request"
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-accent px-4 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
            >
              Get your own site
            </Link>
            {siteUrl && (
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-gray-border px-4 text-[13px] font-medium text-gray-muted transition-colors hover:bg-surface-raised hover:text-warm-white"
              >
                View live site
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface-base">
      <div className="flex min-h-0 flex-1 flex-col">
      {viewportMode === null && (
        <div className="flex flex-1 items-center justify-center text-[12px] text-gray-muted">
          Loading editor...
        </div>
      )}

      {viewportMode === "desktop" && (
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
            <SitePreview />
          </main>

          <aside
            className={`border-l border-gray-border flex flex-col shrink-0 transition-[width] duration-200 ease-out ${
              rightCollapsed ? "w-[44px]" : "w-[360px] xl:w-[380px]"
            }`}
          >
            {rightCollapsed ? <CollapsedRight /> : rightPanelContent}
          </aside>
        </div>
      )}

      {viewportMode === "tablet" && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="h-[60%] border-b border-gray-border shrink-0 flex min-h-0 flex-col">
            <div className="min-h-0 flex-1">
              <SitePreview />
            </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            {rightPanelContent}
          </div>
        </div>
      )}

      {viewportMode === "mobile" && (
        <div className="flex flex-1 min-h-0 items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="text-lg font-medium text-warm-white mb-2">
            Site editor is not available on mobile
          </p>
          <p className="text-sm text-gray-muted mb-6">
            Use a tablet, laptop, or desktop to review {siteName} with the live preview and editing panel. The live site itself still works for visitors on mobile.
          </p>
          <div className="grid gap-2">
            <a
              href={siteUrl || "/"}
              className="inline-flex items-center justify-center rounded-lg bg-warm-white px-5 py-2.5 text-sm font-medium text-on-warm-white transition-colors hover:bg-warm-white/90"
            >
              View live site
            </a>
            <Link
              href={dashboardHref("/dashboard/chat")}
              className="inline-flex items-center justify-center rounded-lg border border-gray-border px-5 py-2.5 text-sm font-medium text-gray-muted transition-colors hover:bg-surface-raised hover:text-warm-white"
            >
              Ask AI
            </Link>
            <Link
              href={dashboardHref("/dashboard")}
              className="inline-flex items-center justify-center rounded-lg border border-gray-border px-5 py-2.5 text-sm font-medium text-gray-muted transition-colors hover:bg-surface-raised hover:text-warm-white"
            >
              Overview
            </Link>
          </div>
        </div>
        </div>
      )}

      </div>
      {viewportMode !== "mobile" && (
      <div className="shrink-0">
        <PublishBar
          hasDrafts={hasAnyDraft}
          onPublish={handlePublishAll}
          onDiscard={handleDiscardDrafts}
          liveSyncEnabled={liveSyncEnabled}
        />
      </div>
      )}
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
    <aside className="flex w-[212px] shrink-0 flex-col border-r border-gray-border bg-surface">
      <div className="shrink-0 border-b border-gray-border/60 p-3">
        <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-gray-faint">
          Page
        </span>
        <div className="relative">
          <select
            value={activePage}
            onChange={(event) => onPageChange(event.target.value)}
            className="w-full appearance-none rounded-lg border border-gray-border bg-surface-raised py-2 pl-3 pr-8 text-[12.5px] font-medium text-warm-white outline-none transition-colors hover:border-gray-muted focus:border-gray-muted"
            aria-label="Page"
          >
            {pages.map((page) => (
              <option key={page.value} value={page.value}>
                {page.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-muted"
            strokeWidth={1.5}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between px-3.5 pb-1.5 pt-3.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-faint">
          Sections
        </span>
        <span className="text-[10px] tabular-nums text-gray-faint/70">{sections.length}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-px overflow-y-auto px-2 pb-2">
        {sections.map((section, index) => {
          const active = section.value === activeSection;
          return (
            <button
              key={section.value}
              type="button"
              onClick={() => onSelect(section.value)}
              className={`group relative flex w-full items-center gap-2.5 rounded-lg py-2 pl-3.5 pr-2.5 text-left text-[12.5px] transition-colors ${
                active
                  ? "bg-surface-raised font-medium text-warm-white"
                  : "text-gray-muted hover:bg-surface-raised/50 hover:text-warm-white"
              }`}
            >
              <span
                className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
              <span className="w-3.5 shrink-0 text-[10px] tabular-nums text-gray-faint/60 group-hover:text-gray-faint">
                {index + 1}
              </span>
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
    <div className="flex flex-col items-center py-4 gap-2">
      <button
        onClick={toggleRight}
        className="w-8 h-8 rounded-md flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors duration-150"
        title="Expand panel"
      >
        <PanelRightOpen className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}

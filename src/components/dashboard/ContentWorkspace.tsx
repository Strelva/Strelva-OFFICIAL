"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PanelRightOpen } from "lucide-react";
import Link from "next/link";
import { useDashboard } from "./DashboardContext";
import { SitePreview } from "./SitePreview";
import { PropertiesEditor } from "./PropertiesEditor";
import { ChatPanel } from "./ChatPanel";
import { CustomChangeRequestPanel } from "./CustomChangeRequestPanel";
import { PublishBar, type PublishOutcome } from "./design/PublishBar";
import type { SectionData } from "./ContentBrowser";
import { SECTION_LABELS } from "@/components/ui/section-labels";

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
    if (activeSection || sectionOptions.length === 0) return;
    setActiveSection(sectionOptions[0].value);
  }, [activeSection, sectionOptions, setActiveSection]);

  useEffect(() => {
    const updateViewportMode = () => setViewportMode(getWorkspaceViewport());
    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);
    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

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
            sections={sectionOptions}
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
  sections,
  activeSection,
  onSelect,
}: {
  sections: { value: string; label: string }[];
  activeSection: string | null;
  onSelect: (value: string) => void;
}) {
  if (sections.length === 0) return null;
  return (
    <aside className="flex w-[196px] shrink-0 flex-col border-r border-gray-border bg-surface">
      <div className="shrink-0 px-3 py-2.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-gray-faint">
          Sections
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2">
        {sections.map((section) => {
          const active = section.value === activeSection;
          return (
            <button
              key={section.value}
              type="button"
              onClick={() => onSelect(section.value)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors ${
                active
                  ? "bg-surface-raised text-warm-white"
                  : "text-gray-muted hover:bg-surface-raised/50 hover:text-warm-white"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                  active ? "bg-accent" : "bg-gray-border"
                }`}
              />
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

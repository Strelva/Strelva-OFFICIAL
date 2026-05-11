"use client";

import { useCallback, useEffect, useMemo } from "react";
import { LayoutList, PanelRightOpen, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useDashboard } from "./DashboardContext";
import { SitePreview } from "./SitePreview";
import { PropertiesEditor } from "./PropertiesEditor";
import { LayoutPanel } from "./LayoutPanel";
import { PublishBar } from "./design/PublishBar";
import type { SectionData } from "./ContentBrowser";
import { SECTION_LABELS } from "@/components/ui/section-labels";

interface ContentWorkspaceProps {
  siteName: string;
  ownerName: string;
  sectionData: Record<string, SectionData>;
  timestamps: Record<string, string>;
}

export function ContentWorkspace({
  siteName,
  sectionData,
  timestamps,
}: ContentWorkspaceProps) {
  const {
    activeSection,
    setActiveSection,
    rightTab,
    setRightTab,
    rightCollapsed,
    siteUrl,
    dashboardHref,
    hasDraft,
    hasPageConfigDraft,
    setHasDraft,
    setHasPageConfigDraft,
    reloadDraftState,
    triggerRefresh,
  } = useDashboard();
  void timestamps;

  const sectionOptions = useMemo(
    () =>
      Object.keys(sectionData).map((section) => ({
        value: section,
        label: SECTION_LABELS[section] || sectionData[section]?.preview || section,
      })),
    [sectionData],
  );

  const hasAnyDraft = Object.values(hasDraft).some(Boolean) || hasPageConfigDraft;

  const handlePublishAll = useCallback(async () => {
    const res = await fetch(dashboardHref("/api/publish"), {
      method: "POST",
      credentials: "same-origin",
    });
    if (!res.ok) {
      throw new Error("Publish failed");
    }
    setHasDraft({});
    setHasPageConfigDraft(false);
    triggerRefresh();
    await reloadDraftState();
  }, [dashboardHref, reloadDraftState, setHasDraft, setHasPageConfigDraft, triggerRefresh]);

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
    triggerRefresh();
    await reloadDraftState();
  }, [dashboardHref, reloadDraftState, setHasDraft, setHasPageConfigDraft, triggerRefresh]);

  useEffect(() => {
    setRightTab("properties");
  }, [setRightTab]);

  useEffect(() => {
    if (activeSection || sectionOptions.length === 0) return;
    setActiveSection(sectionOptions[0].value);
  }, [activeSection, sectionOptions, setActiveSection]);

  const rightPanelContent = (
    <>
      <div className="border-b border-gray-border bg-surface p-2 shrink-0">
        <div className="grid grid-cols-2 gap-1">
          {[
            { value: "properties", label: "Content", icon: <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} /> },
            { value: "layout", label: "Layout", icon: <LayoutList className="h-3.5 w-3.5" strokeWidth={1.5} /> },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setRightTab(item.value as "properties" | "layout" | "chat")}
              className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium transition-colors ${
                rightTab === item.value
                  ? "bg-surface-raised text-warm-white shadow-sm"
                  : "text-gray-muted hover:bg-surface-raised/60 hover:text-warm-white"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {rightTab === "properties" ? (
          <PropertiesEditor activeSection={activeSection} />
        ) : rightTab === "layout" ? (
          <LayoutPanel />
        ) : (
          <PropertiesEditor activeSection={activeSection} />
        )}
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full bg-surface-base">
      <div className="flex min-h-0 flex-1 flex-col">
      {/* Desktop: preview + right panel */}
      <div className="hidden lg:flex flex-1 min-h-0">
        <main className="flex-1 flex flex-col min-w-0">
          <SitePreview />
        </main>

        {/* Right: Properties + Chat */}
        <aside
          className={`border-l border-gray-border flex flex-col shrink-0 transition-[width] duration-200 ease-out ${
            rightCollapsed ? "w-[44px]" : "w-[360px] xl:w-[380px]"
          }`}
        >
          {rightCollapsed ? (
            <CollapsedRight />
          ) : (
            rightPanelContent
          )}
        </aside>
      </div>

      {/* Tablet: vertical split. */}
      <div className="hidden md:flex lg:hidden flex-col flex-1 min-h-0">
        <div className="h-[60%] border-b border-gray-border shrink-0 flex min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <SitePreview />
          </div>
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          {rightPanelContent}
        </div>
      </div>

      {/* Mobile: fallback message — editor isn't usable at this size */}
      <div className="flex md:hidden flex-1 min-h-0 items-center justify-center px-6">
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
              className="inline-flex items-center justify-center rounded-lg bg-warm-white px-5 py-2.5 text-sm font-medium text-warm-black transition-colors hover:bg-warm-white/90"
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

      </div>
      <PublishBar
        hasDrafts={hasAnyDraft}
        onPublish={handlePublishAll}
        onDiscard={handleDiscardDrafts}
      />
    </div>
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

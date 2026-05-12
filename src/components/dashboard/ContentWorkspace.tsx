"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, GitBranch, LayoutList, MessageCircle, PanelRightOpen, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useDashboard } from "./DashboardContext";
import type { EditReceipt } from "./DashboardContext";
import { SitePreview } from "./SitePreview";
import { PropertiesEditor } from "./PropertiesEditor";
import { LayoutPanel } from "./LayoutPanel";
import { ChatPanel } from "./ChatPanel";
import { CustomChangeRequestPanel } from "./CustomChangeRequestPanel";
import { PublishBar } from "./design/PublishBar";
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

function shorten(value: string, max = 58): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
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
    editReceipts,
    markDraftReceipts,
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
  const draftSections = useMemo(
    () => Object.entries(hasDraft).filter(([, value]) => value).map(([section]) => section),
    [hasDraft],
  );
  const draftReceipts = useMemo(
    () => editReceipts.filter((receipt) => receipt.status === "draft"),
    [editReceipts],
  );

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
    markDraftReceipts("published");
    triggerRefresh();
    await reloadDraftState();
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

  const rightPanelContent = (
    <>
      <div className="border-b border-gray-border bg-surface p-2 shrink-0">
        <div className="grid grid-cols-4 gap-1">
          {[
            { value: "properties", label: "Content", icon: <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} /> },
            { value: "chat", label: "AI", icon: <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
            { value: "layout", label: "Layout", icon: <LayoutList className="h-3.5 w-3.5" strokeWidth={1.5} /> },
            { value: "request", label: "Request", icon: <GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} /> },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setRightTab(item.value as "properties" | "chat" | "layout" | "request")}
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

      {hasAnyDraft && (
        <ReadyToPublishPanel receipts={draftReceipts} draftSections={draftSections} hasPageConfigDraft={hasPageConfigDraft} />
      )}

      {/* Tab content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {rightTab === "properties" ? (
          <PropertiesEditor activeSection={activeSection} />
        ) : rightTab === "chat" ? (
          <ChatPanel ownerName={ownerName || siteName} variant="compact" />
        ) : rightTab === "layout" ? (
          <LayoutPanel />
        ) : rightTab === "request" ? (
          <CustomChangeRequestPanel />
        ) : (
          <PropertiesEditor activeSection={activeSection} />
        )}
      </div>
    </>
  );

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
      )}

      </div>
      {viewportMode !== "mobile" && (
      <div className="shrink-0">
        <PublishBar
          hasDrafts={hasAnyDraft}
          onPublish={handlePublishAll}
          onDiscard={handleDiscardDrafts}
        />
      </div>
      )}
    </div>
  );
}

function ReadyToPublishPanel({
  receipts,
  draftSections,
  hasPageConfigDraft,
}: {
  receipts: EditReceipt[];
  draftSections: string[];
  hasPageConfigDraft: boolean;
}) {
  const visibleReceipts = receipts.slice(0, 3);
  const hiddenCount = Math.max(0, receipts.length - visibleReceipts.length);
  const sectionLabels = draftSections
    .map((section) => SECTION_LABELS[section] || section)
    .slice(0, 3);

  return (
    <div className="border-b border-gray-border bg-amber-500/[0.035] px-3 py-3">
      <div className="mb-2 flex items-start gap-2">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-400/10 text-amber-300">
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.7} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-warm-white">Ready to publish</p>
          <p className="mt-0.5 text-[10px] leading-4 text-gray-faint">
            {receipts.length > 0
              ? `${receipts.length} saved ${receipts.length === 1 ? "edit is" : "edits are"} in the draft preview.`
              : `${draftSections.length + (hasPageConfigDraft ? 1 : 0)} draft ${draftSections.length + (hasPageConfigDraft ? 1 : 0) === 1 ? "change is" : "changes are"} waiting for review.`}
          </p>
        </div>
      </div>

      {visibleReceipts.length > 0 ? (
        <div className="space-y-1.5">
          {visibleReceipts.map((receipt) => (
            <div key={receipt.id} className="rounded-md border border-gray-border/70 bg-surface/70 px-2.5 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-medium text-gray-muted">
                  {receipt.sectionLabel} / {receipt.fieldLabel}
                </span>
                <span className="shrink-0 text-[9px] uppercase tracking-[0.08em] text-amber-300">
                  Draft
                </span>
              </div>
              <div className="grid gap-1 text-[10px] leading-4">
                <p className="truncate text-gray-faint">Before: {shorten(receipt.before)}</p>
                <p className="truncate text-warm-white">After: {shorten(receipt.after)}</p>
              </div>
            </div>
          ))}
          {hiddenCount > 0 && (
            <p className="pl-1 text-[10px] text-gray-faint">+{hiddenCount} more saved {hiddenCount === 1 ? "edit" : "edits"}</p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-gray-border/70 bg-surface/70 px-2.5 py-2 text-[10px] text-gray-muted">
          <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          <span className="truncate">
            {sectionLabels.length > 0 ? sectionLabels.join(", ") : "Layout"} draft waiting in preview.
          </span>
        </div>
      )}
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

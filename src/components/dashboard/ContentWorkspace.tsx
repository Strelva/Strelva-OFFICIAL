"use client";

import { useEffect, useMemo } from "react";
import { MessageCircle, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useDashboard } from "./DashboardContext";
import { SitePreview } from "./SitePreview";
import { ChatPanel } from "./ChatPanel";
import { PropertiesEditor } from "./PropertiesEditor";
import { Tabs } from "@/components/ui/Tabs";
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

  useEffect(() => {
    setRightTab("properties");
  }, [setRightTab]);

  useEffect(() => {
    if (activeSection || sectionOptions.length === 0) return;
    setActiveSection(sectionOptions[0].value);
  }, [activeSection, sectionOptions, setActiveSection]);

  const sectionSelector = (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-gray-border bg-surface px-4 py-2">
      <div className="min-w-0">
        <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-gray-muted">
          Site
        </p>
        <p className="truncate text-[12px] text-gray-faint">
          Pick a section, edit on the right, or ask AI from the secondary tab.
        </p>
      </div>
      <label className="flex shrink-0 items-center gap-2 text-[11px] text-gray-muted">
        Section
        <select
          value={activeSection || ""}
          onChange={(event) => setActiveSection(event.target.value || null)}
          className="h-8 min-w-[190px] rounded-lg border border-gray-border bg-surface-raised px-3 text-[12px] text-warm-white outline-none transition-colors focus:border-accent/45"
        >
          {sectionOptions.map((section) => (
            <option key={section.value} value={section.value}>
              {section.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const rightPanelContent = (
    <>
      {/* Tab switcher */}
      <div className="h-10 border-b border-gray-border shrink-0 bg-surface flex items-center">
        <Tabs
          variant="underline"
          items={[
            { value: "properties", label: "Edit", icon: <SlidersHorizontal className="w-[13px] h-[13px]" strokeWidth={1.5} /> },
            { value: "chat", label: "AI Chat", icon: <MessageCircle className="w-[13px] h-[13px]" strokeWidth={1.5} /> },
          ]}
          value={rightTab}
          onChange={(v) => setRightTab(v as "properties" | "chat")}
          className="h-full"
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {rightTab === "properties" ? (
          <PropertiesEditor activeSection={activeSection} />
        ) : (
          <ChatPanel ownerName={ownerName} />
        )}
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full bg-surface-base">
      {/* Desktop (lg+): preview + right panel */}
      <div className="hidden lg:flex flex-1 min-h-0">
        <main className="flex-1 flex flex-col min-w-0">
          {sectionSelector}
          <SitePreview />
        </main>

        {/* Right: Properties + Chat */}
        <aside
          className={`border-l border-gray-border flex flex-col shrink-0 transition-[width] duration-200 ease-out ${
            rightCollapsed ? "w-[44px]" : "w-[360px]"
          }`}
        >
          {rightCollapsed ? (
            <CollapsedRight />
          ) : (
            rightPanelContent
          )}
        </aside>
      </div>

      {/* Tablet (md to lg): vertical split -- preview top, editor bottom */}
      <div className="hidden md:flex lg:hidden flex-col flex-1 min-h-0">
        <div className="h-[52%] border-b border-gray-border shrink-0 flex min-h-0 flex-col">
          {sectionSelector}
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
            Site editing works best on desktop
          </p>
          <p className="text-sm text-gray-muted mb-6">
            Use a larger screen to review {siteName} with the live preview and editing panel side by side.
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M15 3v18" />
          <path d="m8 9 3 3-3 3" />
        </svg>
      </button>
    </div>
  );
}

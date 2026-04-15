"use client";

import { MessageCircle, SlidersHorizontal } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { SitePreview } from "./SitePreview";
import { ChatPanel } from "./ChatPanel";
import { PropertiesEditor } from "./PropertiesEditor";
import { Tabs } from "@/components/ui/Tabs";
import type { SectionData } from "./ContentBrowser";

interface ContentWorkspaceProps {
  siteName: string;
  ownerName: string;
  sectionData: Record<string, SectionData>;
  timestamps: Record<string, string>;
}

export function ContentWorkspace({
  ownerName,
}: ContentWorkspaceProps) {
  const {
    activeSection,
    rightTab,
    setRightTab,
    rightCollapsed,
    siteUrl,
  } = useDashboard();

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
        {/* Center: Site Preview — right-click to edit */}
        <main className="flex-1 flex flex-col min-w-0">
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
        <div className="h-[45%] border-b border-gray-border shrink-0">
          <SitePreview />
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          {rightPanelContent}
        </div>
      </div>

      {/* Mobile: fallback message — editor isn't usable at this size */}
      <div className="flex md:hidden flex-1 min-h-0 items-center justify-center px-6">
        <div className="text-center max-w-xs">
          <p className="text-lg font-medium text-warm-white mb-2">
            Edit your site on a larger screen
          </p>
          <p className="text-sm text-gray-muted mb-6">
            Right-click anything on your site to edit it.
          </p>
          <a
            href={siteUrl || "/dashboard"}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-warm-white text-warm-black text-sm font-medium hover:bg-warm-white/90 transition-colors"
          >
            View your live site
          </a>
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

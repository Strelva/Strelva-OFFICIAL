"use client";

import { MessageCircle, SlidersHorizontal } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { ContentBrowser, type SectionData } from "./ContentBrowser";
import { SitePreview } from "./SitePreview";
import { ChatPanel } from "./ChatPanel";
import { PropertiesEditor } from "./PropertiesEditor";
import { MiniPreview } from "./MiniPreview";
import { Tabs } from "@/components/ui/Tabs";

interface DashboardWorkspaceProps {
  ownerName: string;
  sectionData: Record<string, SectionData>;
  timestamps: Record<string, string>;
}

export function DashboardWorkspace({
  ownerName,
  sectionData,
  timestamps,
}: DashboardWorkspaceProps) {
  const {
    activePanel,
    activeSection,
    rightTab,
    setRightTab,
    leftCollapsed,
    rightCollapsed,
  } = useDashboard();

  const rightPanelContent = (
    <>
      {/* Tab switcher */}
      <div className="h-10 border-b border-gray-border shrink-0 bg-white">
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
    <div className="flex flex-col flex-1 min-h-0 bg-[#faf9f7]">
      {/* Desktop (lg+): 3-panel layout */}
      <div className="hidden lg:flex flex-1 min-h-0">
        {/* Left: Content Browser */}
        <aside
          className={`border-r border-gray-border flex flex-col shrink-0 transition-[width] duration-200 ease-out ${
            leftCollapsed ? "w-[44px]" : "w-[320px]"
          }`}
        >
          <ContentBrowser sectionData={sectionData} timestamps={timestamps} />
        </aside>

        {/* Center: Site Preview */}
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

      {/* Tablet (md to lg): vertical split — preview top, editor bottom */}
      <div className="hidden md:flex lg:hidden flex-col flex-1 min-h-0">
        <div className="h-[45%] border-b border-gray-border shrink-0">
          <SitePreview />
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          {rightPanelContent}
        </div>
      </div>

      {/* Mobile: single panel with mini-preview */}
      <div className="flex md:hidden flex-1 min-h-0">
        <div className="flex-1 flex flex-col overflow-hidden">
          {activePanel === "content" && (
            <ContentBrowser sectionData={sectionData} timestamps={timestamps} />
          )}
          {activePanel === "preview" && <SitePreview />}
          {activePanel === "chat" && (
            <>
              <MiniPreview />
              <div className="flex-1 min-h-0">
                <ChatPanel ownerName={ownerName} />
              </div>
            </>
          )}
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

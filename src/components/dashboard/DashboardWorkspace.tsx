"use client";

import { MessageCircle, SlidersHorizontal } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { ContentBrowser, type SectionData } from "./ContentBrowser";
import { SitePreview } from "./SitePreview";
import { ChatPanel } from "./ChatPanel";
import { PropertiesEditor } from "./PropertiesEditor";
import { BottomToolbar } from "./BottomToolbar";
import { MobileTabBar } from "./MobileTabBar";
import { MiniPreview } from "./MiniPreview";
import { OverlaySheet } from "./OverlaySheet";
import BookingsPage from "@/app/dashboard/bookings/page";
import SettingsPage from "@/app/dashboard/settings/page";

interface DashboardWorkspaceProps {
  siteName: string;
  ownerName: string;
  sectionData: Record<string, SectionData>;
  timestamps: Record<string, string>;
  overviewContent: React.ReactNode;
}

export function DashboardWorkspace({
  siteName,
  ownerName,
  sectionData,
  timestamps,
  overviewContent,
}: DashboardWorkspaceProps) {
  const {
    activePanel,
    activeSection,
    rightTab,
    setRightTab,
    leftCollapsed,
    rightCollapsed,
    overlayView,
    setOverlayView,
  } = useDashboard();

  const rightPanelContent = (
    <>
      {/* Tab switcher */}
      <div className="flex items-center h-9 border-b border-[#e8e8e8] shrink-0 bg-white">
        <button
          onClick={() => setRightTab("properties")}
          className={`flex items-center gap-1.5 h-full px-4 text-[11px] font-medium transition-colors duration-150 border-b-2 ${
            rightTab === "properties"
              ? "text-[#1a1a1a] border-b-[#7c9a8e]"
              : "text-[#999] border-b-transparent hover:text-[#666]"
          }`}
        >
          <SlidersHorizontal className="w-[13px] h-[13px]" strokeWidth={1.5} />
          Edit
        </button>
        <button
          onClick={() => setRightTab("chat")}
          className={`flex items-center gap-1.5 h-full px-4 text-[11px] font-medium transition-colors duration-150 border-b-2 ${
            rightTab === "chat"
              ? "text-[#1a1a1a] border-b-[#7c9a8e]"
              : "text-[#999] border-b-transparent hover:text-[#666]"
          }`}
        >
          <MessageCircle className="w-[13px] h-[13px]" strokeWidth={1.5} />
          AI Chat
        </button>
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
    <div className="flex flex-col h-screen bg-[#fafafa]">
      {/* Desktop (lg+): 3-panel layout */}
      <div className="hidden lg:flex flex-1 min-h-0">
        {/* Left: Content Browser */}
        <aside
          className={`border-r border-[#e8e8e8] flex flex-col shrink-0 transition-[width] duration-200 ease-out ${
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
          className={`border-l border-[#e8e8e8] flex flex-col shrink-0 transition-[width] duration-200 ease-out ${
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
        <div className="h-[45%] border-b border-[#e8e8e8] shrink-0">
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

      {/* Bottom toolbar (desktop) */}
      <BottomToolbar siteName={siteName} />

      {/* Mobile tab bar */}
      <MobileTabBar />

      {/* Overlay sheets */}
      {overlayView === "overview" && (
        <OverlaySheet title="Overview" onClose={() => setOverlayView(null)}>
          {overviewContent}
        </OverlaySheet>
      )}
      {overlayView === "bookings" && (
        <OverlaySheet title="Bookings" onClose={() => setOverlayView(null)}>
          <BookingsPage />
        </OverlaySheet>
      )}
      {overlayView === "settings" && (
        <OverlaySheet title="Settings" onClose={() => setOverlayView(null)}>
          <SettingsPage />
        </OverlaySheet>
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
        className="w-8 h-8 rounded-md flex items-center justify-center text-[#999] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors duration-150"
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

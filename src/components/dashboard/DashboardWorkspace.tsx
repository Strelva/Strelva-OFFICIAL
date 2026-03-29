"use client";

import { useDashboard } from "./DashboardContext";
import { ContentBrowser, type SectionData } from "./ContentBrowser";
import { SitePreview } from "./SitePreview";
import { ChatPanel } from "./ChatPanel";
import { BottomToolbar } from "./BottomToolbar";
import { MobileTabBar } from "./MobileTabBar";
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
    leftCollapsed,
    rightCollapsed,
    overlayView,
    setOverlayView,
  } = useDashboard();

  return (
    <div className="flex flex-col h-screen bg-[#fafafa]">
      {/* Desktop: 3-panel layout */}
      <div className="hidden md:flex flex-1 min-h-0">
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

        {/* Right: Chat */}
        <aside
          className={`border-l border-[#e8e8e8] flex flex-col shrink-0 transition-[width] duration-200 ease-out ${
            rightCollapsed ? "w-[44px]" : "w-[360px]"
          }`}
        >
          {rightCollapsed ? (
            <CollapsedChat />
          ) : (
            <ChatPanel ownerName={ownerName} />
          )}
        </aside>
      </div>

      {/* Mobile: single panel */}
      <div className="flex md:hidden flex-1 min-h-0">
        <div className="flex-1 overflow-hidden">
          {activePanel === "content" && (
            <ContentBrowser sectionData={sectionData} timestamps={timestamps} />
          )}
          {activePanel === "preview" && <SitePreview />}
          {activePanel === "chat" && <ChatPanel ownerName={ownerName} />}
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

function CollapsedChat() {
  const { toggleRight } = useDashboard();

  return (
    <div className="flex flex-col items-center py-4 gap-2">
      <button
        onClick={toggleRight}
        className="w-8 h-8 rounded-md flex items-center justify-center text-[#999] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors duration-150"
        title="Expand chat panel"
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

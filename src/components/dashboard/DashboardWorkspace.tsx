"use client";

import { useRef, useEffect } from "react";
import { MessageCircle, SlidersHorizontal } from "lucide-react";
import gsap from "gsap";
import { useDashboard } from "./DashboardContext";
import { ContentBrowser, type SectionData } from "./ContentBrowser";
import { SitePreview } from "./SitePreview";
import { ChatPanel } from "./ChatPanel";
import { PropertiesEditor } from "./PropertiesEditor";
import { BottomToolbar } from "./BottomToolbar";
import { MobileTabBar } from "./MobileTabBar";
import { MiniPreview } from "./MiniPreview";
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

  const overviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (overlayView !== "overview") return;
    const el = overviewRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // Accent line draws in
      const accent = el.querySelector('[data-ov="accent"]');
      if (accent) {
        gsap.set(accent, { scaleX: 0, transformOrigin: "left" });
        tl.to(accent, { scaleX: 1, duration: 0.6 }, 0);
      }

      // Headline fades up
      const headline = el.querySelector('[data-ov="headline"]');
      if (headline) {
        gsap.set(headline, { opacity: 0, y: 16 });
        tl.to(headline, { opacity: 1, y: 0, duration: 0.5 }, 0.1);
      }

      // Metric cards stagger in with scale
      const metrics = el.querySelectorAll('[data-ov="metric"]');
      if (metrics.length) {
        gsap.set(metrics, { opacity: 0, y: 16, scale: 0.97 });
        tl.to(metrics, { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.08 }, 0.25);
      }

      // Suggestions card
      const suggestions = el.querySelector('[data-ov="suggestions"]');
      if (suggestions) {
        gsap.set(suggestions, { opacity: 0, y: 12 });
        tl.to(suggestions, { opacity: 1, y: 0, duration: 0.4 }, 0.5);
      }

      // Site map card
      const sitemap = el.querySelector('[data-ov="sitemap"]');
      if (sitemap) {
        gsap.set(sitemap, { opacity: 0, y: 12 });
        tl.to(sitemap, { opacity: 1, y: 0, duration: 0.4 }, 0.6);
      }

      // Site map icons pop in
      const icons = el.querySelectorAll('[data-ov="icon"]');
      if (icons.length) {
        gsap.set(icons, { opacity: 0, scale: 0.8 });
        tl.to(icons, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.04 }, 0.7);
      }

      // Activity card
      const activity = el.querySelector('[data-ov="activity"]');
      if (activity) {
        gsap.set(activity, { opacity: 0, y: 12 });
        tl.to(activity, { opacity: 1, y: 0, duration: 0.4 }, 0.85);
      }
    }, el);

    return () => ctx.revert();
  }, [overlayView]);

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
    <div className="flex flex-col h-screen bg-[#faf9f7]">
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

        {/* Center: Site Preview or Overlay Content */}
        <main className="flex-1 flex flex-col min-w-0">
          {overlayView === "overview" || overlayView === "bookings" || overlayView === "settings" ? (
            <div className="flex-1 flex items-start justify-center overflow-y-auto bg-[#faf9f7]">
              <div
                key={overlayView}
                ref={overlayView === "overview" ? overviewRef : undefined}
                className={`w-full max-w-xl py-8 ${overlayView !== "overview" ? "animate-overview-enter" : ""}`}
              >
                {overlayView === "overview" && overviewContent}
                {overlayView === "bookings" && <BookingsPage />}
                {overlayView === "settings" && <SettingsPage />}
              </div>
            </div>
          ) : (
            <SitePreview />
          )}
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
          {overlayView === "overview" || overlayView === "bookings" || overlayView === "settings" ? (
            <div className="h-full overflow-y-auto bg-[#faf9f7]">
              <div
                key={overlayView}
                ref={overlayView === "overview" ? overviewRef : undefined}
                className={`w-full max-w-xl mx-auto py-6 ${overlayView !== "overview" ? "animate-overview-enter" : ""}`}
              >
                {overlayView === "overview" && overviewContent}
                {overlayView === "bookings" && <BookingsPage />}
                {overlayView === "settings" && <SettingsPage />}
              </div>
            </div>
          ) : (
            <SitePreview />
          )}
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          {rightPanelContent}
        </div>
      </div>

      {/* Mobile: single panel with mini-preview */}
      <div className="flex md:hidden flex-1 min-h-0">
        <div className="flex-1 flex flex-col overflow-hidden">
          {overlayView ? (
            <div className="flex-1 overflow-y-auto bg-[#faf9f7]">
              <div
                key={overlayView}
                ref={overlayView === "overview" ? overviewRef : undefined}
                className={`w-full max-w-xl mx-auto py-6 ${overlayView !== "overview" ? "animate-overview-enter" : ""}`}
              >
                {overlayView === "overview" && overviewContent}
                {overlayView === "bookings" && <BookingsPage />}
                {overlayView === "settings" && <SettingsPage />}
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Bottom toolbar (desktop) */}
      <BottomToolbar siteName={siteName} />

      {/* Mobile tab bar */}
      <MobileTabBar />

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

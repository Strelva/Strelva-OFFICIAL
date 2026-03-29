"use client";

import {
  FileStack,
  Globe,
  MessageCircle,
  MoreHorizontal,
  LayoutDashboard,
  CalendarDays,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { useDashboard } from "./DashboardContext";

type Panel = "content" | "preview" | "chat";

const TABS: { id: Panel; label: string; icon: typeof FileStack }[] = [
  { id: "content", label: "Content", icon: FileStack },
  { id: "preview", label: "Site", icon: Globe },
  { id: "chat", label: "Chat", icon: MessageCircle },
];

const MORE_ITEMS = [
  { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
  { id: "bookings" as const, label: "Bookings", icon: CalendarDays },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

export function MobileTabBar() {
  const { activePanel, setActivePanel, setOverlayView } = useDashboard();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="relative md:hidden">
      {/* More popover */}
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-full right-2 mb-2 z-50 bg-white border border-[#e8e8e8] rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
            {MORE_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setOverlayView(item.id);
                  setMoreOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors duration-150"
              >
                <item.icon className="w-[14px] h-[14px] text-[#999]" strokeWidth={1.5} />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Tab bar */}
      <div className="flex items-center border-t border-[#e8e8e8] bg-white h-12">
        {TABS.map((tab) => {
          const active = activePanel === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActivePanel(tab.id)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors duration-150 ${
                active ? "text-[#7c9a8e]" : "text-[#999]"
              }`}
            >
              {active && (
                <div className="absolute top-0 w-8 h-[2px] bg-[#7c9a8e] rounded-b" />
              )}
              <tab.icon className="w-5 h-5" strokeWidth={1.5} />
            </button>
          );
        })}
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors duration-150 ${
            moreOpen ? "text-[#7c9a8e]" : "text-[#999]"
          }`}
        >
          <MoreHorizontal className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

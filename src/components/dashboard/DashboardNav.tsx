"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileStack,
  CalendarDays,
  Settings,
  ExternalLink,
  MessageCircle,
  MoreHorizontal,
} from "lucide-react";
import { useDashboard } from "./DashboardContext";

interface DashboardNavProps {
  siteName: string;
}

const NAV_ITEMS = [
  { label: "Home", href: "/dashboard", overlay: "overview" as const, icon: LayoutDashboard },
  { label: "Content", href: "/dashboard", overlay: null, icon: FileStack },
  { label: "Bookings", href: "/dashboard/bookings", overlay: "bookings" as const, icon: CalendarDays },
  { label: "Settings", href: "/dashboard/settings", overlay: "settings" as const, icon: Settings },
];

export function DashboardNav({ siteName }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { editMode, setEditMode, setOverlayView, overlayView, setActivePanel } = useDashboard();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleNavClick = (item: (typeof NAV_ITEMS)[number]) => {
    // Set overlay for backwards compat with DashboardWorkspace
    if (item.overlay) {
      setOverlayView(item.overlay);
    } else {
      setOverlayView(null);
    }
    router.push(item.href);
  };

  const isActive = (item: (typeof NAV_ITEMS)[number]) => {
    if (item.overlay && overlayView === item.overlay) return true;
    if (!item.overlay && pathname === item.href && !overlayView) return true;
    return false;
  };

  return (
    <>
      {/* Desktop nav (lg+) */}
      <nav className="hidden lg:flex items-center h-12 border-b border-[#e8e8e8] bg-white shrink-0 px-4">
        {/* Left: site name + status dot + toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-[5px] h-[5px] rounded-full transition-colors ${
                editMode === "draft" ? "bg-amber-400" : "bg-emerald-500"
              }`}
            />
            <span className="font-mono text-[10px] text-[#999]">{siteName}</span>
          </div>

          <button
            type="button"
            onClick={() => setEditMode(editMode === "live" ? "draft" : "live")}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#f5f5f5] hover:bg-[#e8e8e8] transition-colors"
            title={editMode === "live" ? "Switch to draft mode" : "Switch to live mode"}
          >
            <span
              className={`text-[9px] font-medium uppercase tracking-wider transition-colors ${
                editMode === "live" ? "text-emerald-600" : "text-[#ccc]"
              }`}
            >
              Live
            </span>
            <div
              className={`relative w-6 h-3.5 rounded-full transition-colors ${
                editMode === "draft" ? "bg-amber-400" : "bg-emerald-500"
              }`}
            >
              <div
                className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform ${
                  editMode === "draft" ? "left-[13px]" : "left-[1px]"
                }`}
              />
            </div>
            <span
              className={`text-[9px] font-medium uppercase tracking-wider transition-colors ${
                editMode === "draft" ? "text-amber-600" : "text-[#ccc]"
              }`}
            >
              Draft
            </span>
          </button>
        </div>

        {/* Center: nav items */}
        <div className="flex items-center gap-1 mx-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <button
                key={item.label}
                onClick={() => handleNavClick(item)}
                className={`flex items-center gap-1.5 px-3 h-12 text-[11px] font-medium transition-colors duration-150 border-b-2 ${
                  active
                    ? "text-[#7c9a8e] border-b-[#7c9a8e]"
                    : "text-[#999] border-b-transparent hover:text-[#1a1a1a]"
                }`}
              >
                <item.icon className="w-4 h-4" strokeWidth={1.5} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Right: Open Site */}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium text-[#999] hover:text-[#1a1a1a] transition-colors duration-150"
        >
          <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
          Open Site
        </a>
      </nav>

      {/* Mobile nav (<lg): bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
        {/* More popover */}
        {moreOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
            <div className="absolute bottom-full right-2 mb-2 z-50 bg-white border border-[#e8e8e8] rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
              <button
                onClick={() => {
                  handleNavClick(NAV_ITEMS[2]); // Bookings
                  setMoreOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors duration-150"
              >
                <CalendarDays className="w-[14px] h-[14px] text-[#999]" strokeWidth={1.5} />
                Bookings
              </button>
              <button
                onClick={() => {
                  handleNavClick(NAV_ITEMS[3]); // Settings
                  setMoreOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors duration-150"
              >
                <Settings className="w-[14px] h-[14px] text-[#999]" strokeWidth={1.5} />
                Settings
              </button>
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors duration-150"
                onClick={() => setMoreOpen(false)}
              >
                <ExternalLink className="w-[14px] h-[14px] text-[#999]" strokeWidth={1.5} />
                Open Site
              </a>
            </div>
          </>
        )}

        {/* Tab bar */}
        <div className="flex items-center border-t border-[#e8e8e8] bg-white h-14">
          {/* Home */}
          <button
            onClick={() => handleNavClick(NAV_ITEMS[0])}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors duration-150 ${
              isActive(NAV_ITEMS[0]) ? "text-[#7c9a8e]" : "text-[#999]"
            }`}
          >
            {isActive(NAV_ITEMS[0]) && (
              <div className="absolute top-0 w-8 h-[2px] bg-[#7c9a8e] rounded-b" />
            )}
            <LayoutDashboard className="w-5 h-5" strokeWidth={1.5} />
            <span className="text-[10px] font-medium">Home</span>
          </button>

          {/* Content */}
          <button
            onClick={() => handleNavClick(NAV_ITEMS[1])}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors duration-150 ${
              isActive(NAV_ITEMS[1]) ? "text-[#7c9a8e]" : "text-[#999]"
            }`}
          >
            {isActive(NAV_ITEMS[1]) && (
              <div className="absolute top-0 w-8 h-[2px] bg-[#7c9a8e] rounded-b" />
            )}
            <FileStack className="w-5 h-5" strokeWidth={1.5} />
            <span className="text-[10px] font-medium">Content</span>
          </button>

          {/* Chat */}
          <button
            onClick={() => setActivePanel("chat")}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors duration-150 text-[#999]`}
          >
            <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
            <span className="text-[10px] font-medium">Chat</span>
          </button>

          {/* More */}
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors duration-150 ${
              moreOpen ? "text-[#7c9a8e]" : "text-[#999]"
            }`}
          >
            <MoreHorizontal className="w-5 h-5" strokeWidth={1.5} />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}

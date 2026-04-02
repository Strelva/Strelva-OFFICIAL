"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileStack,
  CalendarDays,
  Settings,
  ExternalLink,
  MessageCircle,
  MoreHorizontal,
  ImageIcon,
} from "lucide-react";
import { useDashboard } from "./DashboardContext";

interface DashboardNavProps {
  siteName: string;
  bookingUrl?: string;
}

const NAV_ITEMS = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Content", href: "/dashboard/content", icon: FileStack },
  { label: "Photos", href: "/dashboard/photos", icon: ImageIcon },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function DashboardNav({ siteName, bookingUrl }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { editMode, setEditMode, setChatDrawerOpen, setActivePanel } = useDashboard();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close More menu on Escape
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [moreOpen]);

  const handleNavClick = (item: (typeof NAV_ITEMS)[number]) => {
    router.push(item.href);
  };

  const isActive = (item: (typeof NAV_ITEMS)[number]) => {
    if (item.href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(item.href);
  };

  return (
    <>
      {/* Desktop nav (lg+) */}
      <nav className="hidden lg:flex items-center h-12 border-b border-gray-border bg-white shrink-0 px-4">
        {/* Left: site name + status dot + toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-[5px] h-[5px] rounded-full transition-colors ${
                editMode === "draft" ? "bg-amber-400" : "bg-emerald-500"
              }`}
            />
            <span className="font-mono text-[11px] text-gray-muted">{siteName}</span>
          </div>

          <button
            type="button"
            onClick={() => setEditMode(editMode === "live" ? "draft" : "live")}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-bg hover:bg-gray-border transition-colors"
            title={editMode === "live" ? "Switch to draft mode" : "Switch to live mode"}
          >
            <span
              className={`text-[11px] font-medium uppercase tracking-wider transition-colors ${
                editMode === "live" ? "text-emerald-600" : "text-gray-subtle"
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
              className={`text-[11px] font-medium uppercase tracking-wider transition-colors ${
                editMode === "draft" ? "text-amber-600" : "text-gray-subtle"
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
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 px-3 h-12 text-[11px] font-medium transition-colors duration-150 border-b-2 ${
                  active
                    ? "text-sage border-b-sage"
                    : "text-gray-muted border-b-transparent hover:text-warm-black"
                }`}
              >
                <item.icon className="w-4 h-4" strokeWidth={1.5} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Right: external links */}
        <div className="flex items-center gap-1">
          <a
            href={bookingUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Manage bookings on Vagaro"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium text-gray-muted hover:text-warm-black transition-colors duration-150"
          >
            <CalendarDays className="w-4 h-4" strokeWidth={1.5} />
            Bookings
          </a>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open site in new tab"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium text-gray-muted hover:text-warm-black transition-colors duration-150"
          >
            <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
            Open Site
          </a>
        </div>
      </nav>

      {/* Mobile nav (<lg): bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
        {/* More popover */}
        {moreOpen && (
          <>
            <div className="fixed inset-0 bottom-14 z-40" onClick={() => setMoreOpen(false)} />
            <div className="absolute bottom-full right-2 mb-2 z-50 bg-white border border-gray-border rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden animate-fade-in-up">
              <a
                href={bookingUrl || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-warm-black hover:bg-gray-bg transition-colors duration-150"
                onClick={() => setMoreOpen(false)}
              >
                <CalendarDays className="w-[14px] h-[14px] text-gray-muted" strokeWidth={1.5} />
                Bookings
                <ExternalLink className="w-3 h-3 text-gray-subtle ml-auto" strokeWidth={1.5} />
              </a>
              <button
                onClick={() => {
                  handleNavClick(NAV_ITEMS[3]); // Settings
                  setMoreOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-warm-black hover:bg-gray-bg transition-colors duration-150"
              >
                <Settings className="w-[14px] h-[14px] text-gray-muted" strokeWidth={1.5} />
                Settings
              </button>
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-warm-black hover:bg-gray-bg transition-colors duration-150"
                onClick={() => setMoreOpen(false)}
              >
                <ExternalLink className="w-[14px] h-[14px] text-gray-muted" strokeWidth={1.5} />
                Open Site
              </a>
            </div>
          </>
        )}

        {/* Tab bar */}
        <div className="flex items-center border-t border-gray-border bg-white h-14">
          {/* Home */}
          <button
            onClick={() => handleNavClick(NAV_ITEMS[0])}
            aria-current={isActive(NAV_ITEMS[0]) ? "page" : undefined}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors duration-150 ${
              isActive(NAV_ITEMS[0]) ? "text-sage" : "text-gray-muted"
            }`}
          >
            {isActive(NAV_ITEMS[0]) && (
              <div className="absolute top-0 w-8 h-[2px] bg-sage rounded-b" />
            )}
            <LayoutDashboard className="w-5 h-5" strokeWidth={1.5} />
            <span className="text-[11px] font-medium">Home</span>
          </button>

          {/* Content */}
          <button
            onClick={() => handleNavClick(NAV_ITEMS[1])}
            aria-current={isActive(NAV_ITEMS[1]) ? "page" : undefined}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors duration-150 ${
              isActive(NAV_ITEMS[1]) ? "text-sage" : "text-gray-muted"
            }`}
          >
            {isActive(NAV_ITEMS[1]) && (
              <div className="absolute top-0 w-8 h-[2px] bg-sage rounded-b" />
            )}
            <FileStack className="w-5 h-5" strokeWidth={1.5} />
            <span className="text-[11px] font-medium">Content</span>
          </button>

          {/* Photos */}
          <button
            onClick={() => handleNavClick(NAV_ITEMS[2])}
            aria-current={isActive(NAV_ITEMS[2]) ? "page" : undefined}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors duration-150 ${
              isActive(NAV_ITEMS[2]) ? "text-sage" : "text-gray-muted"
            }`}
          >
            {isActive(NAV_ITEMS[2]) && (
              <div className="absolute top-0 w-8 h-[2px] bg-sage rounded-b" />
            )}
            <ImageIcon className="w-5 h-5" strokeWidth={1.5} />
            <span className="text-[11px] font-medium">Photos</span>
          </button>

          {/* More */}
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            aria-label="More options"
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors duration-150 ${
              moreOpen ? "text-sage" : "text-gray-muted"
            }`}
          >
            <MoreHorizontal className="w-5 h-5" strokeWidth={1.5} />
            <span className="text-[11px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}

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
  Mail,
  Star,
  Globe,
} from "lucide-react";
import { useDashboard } from "./DashboardContext";

interface DashboardNavProps {
  siteName: string;
  bookingUrl?: string;
  siteUrl?: string;
}

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  templates?: string[]; // if set, only show for these templates
};

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Your Site", href: "/dashboard/content", icon: FileStack },
  { label: "Photos", href: "/dashboard/photos", icon: ImageIcon },
  { label: "Subscribers", href: "/dashboard/subscribers", icon: Mail },
  {
    label: "Rewards",
    href: "/dashboard/rewards",
    icon: Star,
    templates: ["food-brand"],
  },
  { label: "Domains", href: "/dashboard/domains", icon: Globe },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function DashboardNav({ siteName, bookingUrl, siteUrl }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { editMode, setEditMode, setChatDrawerOpen, setActivePanel, template } = useDashboard();
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.templates || item.templates.includes(template)
  );

  // Close More menu on Escape
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [moreOpen]);

  const handleNavClick = (item: NavItem) => {
    router.push(item.href);
  };

  const isActive = (item: NavItem) => {
    if (item.href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(item.href);
  };

  return (
    <>
      {/* Desktop nav (lg+) */}
      <nav className="hidden lg:flex items-center h-12 border-b border-gray-border bg-surface shrink-0 px-4">
        {/* Left: site name + status dot + toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-[5px] h-[5px] rounded-full transition-colors ${
                editMode === "draft" ? "bg-amber-400" : "bg-emerald-500"
              }`}
            />
            <span className="font-mono text-[13px] text-gray-muted">{siteName}</span>
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
          {visibleNavItems.map((item) => {
            const active = isActive(item);
            return (
              <button
                key={item.label}
                onClick={() => handleNavClick(item)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 px-3 h-12 text-[13px] font-medium transition-colors duration-150 border-b-2 ${
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
          {bookingUrl && (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Manage bookings"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] font-medium text-gray-muted hover:text-warm-black transition-colors duration-150"
            >
              <CalendarDays className="w-4 h-4" strokeWidth={1.5} />
              Bookings
            </a>
          )}
          <a
            href={siteUrl || "/"}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open site in new tab"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] font-medium text-gray-muted hover:text-warm-black transition-colors duration-150"
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
              {bookingUrl && (
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-warm-black hover:bg-gray-bg transition-colors duration-150"
                  onClick={() => setMoreOpen(false)}
                >
                  <CalendarDays className="w-[14px] h-[14px] text-gray-muted" strokeWidth={1.5} />
                  Bookings
                  <ExternalLink className="w-3 h-3 text-gray-subtle ml-auto" strokeWidth={1.5} />
                </a>
              )}
              <button
                onClick={() => {
                  router.push("/dashboard/subscribers");
                  setMoreOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-warm-black hover:bg-gray-bg transition-colors duration-150"
              >
                <Mail className="w-[14px] h-[14px] text-gray-muted" strokeWidth={1.5} />
                Subscribers
              </button>
              {template === "food-brand" && (
                <button
                  onClick={() => {
                    router.push("/dashboard/rewards");
                    setMoreOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-warm-black hover:bg-gray-bg transition-colors duration-150"
                >
                  <Star className="w-[14px] h-[14px] text-gray-muted" strokeWidth={1.5} />
                  Rewards
                </button>
              )}
              <button
                onClick={() => {
                  router.push("/dashboard/domains");
                  setMoreOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-warm-black hover:bg-gray-bg transition-colors duration-150"
              >
                <Globe className="w-[14px] h-[14px] text-gray-muted" strokeWidth={1.5} />
                Domains
              </button>
              <button
                onClick={() => {
                  router.push("/dashboard/settings");
                  setMoreOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-[12px] text-warm-black hover:bg-gray-bg transition-colors duration-150"
              >
                <Settings className="w-[14px] h-[14px] text-gray-muted" strokeWidth={1.5} />
                Settings
              </button>
              <a
                href={siteUrl || "/"}
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
        <div className="flex items-center border-t border-gray-border bg-surface h-14">
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
            <span className="text-[12px] font-medium">Overview</span>
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
            <span className="text-[12px] font-medium">Your Site</span>
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
            <span className="text-[12px] font-medium">Photos</span>
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
            <span className="text-[12px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}

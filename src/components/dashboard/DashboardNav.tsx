"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileStack,
  Settings,
  ExternalLink,
  ImageIcon,
  CalendarDays,
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
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Site", href: "/dashboard/content", icon: FileStack },
  { label: "Photos", href: "/dashboard/photos", icon: ImageIcon },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function DashboardNav({ siteName, bookingUrl, siteUrl }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { editMode, setEditMode } = useDashboard();

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
      <nav className="hidden lg:flex items-center h-12 border-b border-gray-border bg-surface shrink-0 px-5">
        {/* Left: site name + mode toggle */}
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-mono uppercase tracking-[0.06em] text-gray-muted">{siteName}</span>

          <button
            type="button"
            onClick={() => setEditMode(editMode === "live" ? "draft" : "live")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-border hover:border-gray-faint transition-colors"
            title={editMode === "live" ? "Switch to draft mode" : "Switch to live mode"}
          >
            <span
              className={`text-[10px] font-mono uppercase tracking-[0.06em] transition-colors ${
                editMode === "live" ? "text-emerald-400" : "text-gray-muted"
              }`}
            >
              Live
            </span>
            <div
              className={`relative w-6 h-3.5 rounded-full transition-colors ${
                editMode === "draft" ? "bg-gray-faint" : "bg-emerald-500"
              }`}
            >
              <div
                className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${
                  editMode === "draft" ? "left-[13px]" : "left-[1px]"
                }`}
              />
            </div>
            <span
              className={`text-[10px] font-mono uppercase tracking-[0.06em] transition-colors ${
                editMode === "draft" ? "text-white" : "text-gray-muted"
              }`}
            >
              Draft
            </span>
          </button>
        </div>

        {/* Center: nav pills */}
        <div className="flex items-center gap-0.5 mx-auto bg-gray-bg rounded-full p-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <button
                key={item.label}
                onClick={() => handleNavClick(item)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium tracking-[-0.01em] transition-all duration-150 ${
                  active
                    ? "bg-surface-raised text-white shadow-sm"
                    : "text-gray-muted hover:text-white"
                }`}
              >
                <item.icon className="w-3.5 h-3.5" strokeWidth={1.5} />
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-gray-muted hover:text-white transition-colors duration-150"
            >
              <CalendarDays className="w-3.5 h-3.5" strokeWidth={1.5} />
              Bookings
            </a>
          )}
          <a
            href={siteUrl || "/"}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open site in new tab"
            className="flex items-center justify-center w-8 h-8 rounded-full text-gray-muted hover:text-white hover:bg-gray-bg transition-colors duration-150"
          >
            <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
          </a>
        </div>
      </nav>

      {/* Mobile nav (<lg): bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
        <div className="flex items-center border-t border-gray-border bg-surface h-14">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={() => handleNavClick(item)}
              aria-current={isActive(item) ? "page" : undefined}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors duration-150 ${
                isActive(item) ? "text-white" : "text-gray-muted"
              }`}
            >
              {isActive(item) && (
                <div className="absolute top-0 w-8 h-[2px] bg-white rounded-b" />
              )}
              <item.icon className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-[10px] font-medium tracking-[-0.01em]">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

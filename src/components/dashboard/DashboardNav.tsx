"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileStack,
  Settings,
  ExternalLink,
  ImageIcon,
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
      {/* Desktop nav (lg+) — floating, minimal chrome */}
      <nav className="hidden lg:flex items-center h-14 shrink-0 px-6">
        {/* Left: site name */}
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-medium text-gray-fg">{siteName}</span>
          <button
            type="button"
            onClick={() => setEditMode(editMode === "live" ? "draft" : "live")}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] text-gray-muted hover:text-warm-black hover:bg-white/[0.04] transition-colors"
            title={editMode === "live" ? "Switch to draft mode" : "Switch to live mode"}
          >
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${editMode === "live" ? "bg-emerald-400" : "bg-gray-faint"}`} />
            {editMode === "live" ? "Live" : "Draft"}
          </button>
        </div>

        {/* Center: nav items — no container, just floating text */}
        <div className="flex items-center gap-1 mx-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <button
                key={item.label}
                onClick={() => handleNavClick(item)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-[14px] transition-all duration-150 ${
                  active
                    ? "text-warm-black bg-white/[0.06]"
                    : "text-gray-muted hover:text-warm-black hover:bg-white/[0.03]"
                }`}
              >
                <item.icon className="w-4 h-4" strokeWidth={1.5} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Right: site link */}
        <div className="flex items-center gap-1">
          <a
            href={siteUrl || "/"}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open site in new tab"
            className="flex items-center justify-center w-8 h-8 rounded-xl text-gray-muted hover:text-warm-black hover:bg-white/[0.04] transition-colors duration-150"
          >
            <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
          </a>
        </div>
      </nav>

      {/* Mobile nav (<lg): bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
        <div className="flex items-center bg-surface-base/80 backdrop-blur-xl h-16 px-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={() => handleNavClick(item)}
              aria-current={isActive(item) ? "page" : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 h-full transition-colors duration-150 ${
                isActive(item) ? "text-warm-black" : "text-gray-muted"
              }`}
            >
              <item.icon className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-[11px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

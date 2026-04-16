"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  House,
  Globe,
  Image,
  Settings,
  Unplug,
  Plus,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface DashboardSidebarProps {
  siteName: string;
  ownerName?: string;
  recentChats?: Array<{ id: string; label: string }>;
}

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: House },
  { label: "My Site", href: "/dashboard/content", icon: Globe },
  { label: "Photos", href: "/dashboard/photos", icon: Image },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

const CONNECTIONS_ITEM: NavItem = {
  label: "Connections",
  href: "/dashboard/connections",
  icon: Unplug,
};

const DEFAULT_RECENT: Array<{ id: string; label: string }> = [
  { id: "1", label: "Add Saturday yoga class" },
  { id: "2", label: "Update holiday hours" },
  { id: "3", label: "Write spring wellness blog" },
  { id: "4", label: "How's my site doing?" },
];

export function DashboardSidebar({ siteName, ownerName, recentChats }: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const recent = recentChats ?? DEFAULT_RECENT;

  const isActive = (item: NavItem) => {
    if (item.href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(item.href);
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-[260px] h-full bg-surface-base shrink-0 py-4 px-2.5 gap-2">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="w-8 h-8 rounded-[10px] bg-surface-raised flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-accent" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col gap-px min-w-0">
            <span className="text-[14px] font-semibold text-warm-black truncate">{siteName}</span>
            <div className="flex items-center gap-[5px]">
              <div className="w-[6px] h-[6px] rounded-full bg-success" />
              <span className="text-[11px] text-gray-muted">Online</span>
            </div>
          </div>
        </div>

        {/* New chat button */}
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 w-full rounded-xl bg-surface-raised border border-glass-border px-3.5 py-2.5 text-gray-muted hover:text-warm-black hover:bg-gray-bg-hover transition-colors"
        >
          <Plus className="w-[15px] h-[15px]" strokeWidth={1.5} />
          <span className="text-[13px]">New chat</span>
        </button>

        <div className="h-2" />

        {/* Main nav */}
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <button
                key={item.label}
                onClick={() => router.push(item.href)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 w-full rounded-[10px] px-3 py-[9px] text-[13px] transition-colors ${
                  active
                    ? "bg-gray-bg-hover text-warm-black font-medium"
                    : "text-gray-muted hover:bg-gray-bg hover:text-warm-black"
                }`}
              >
                <item.icon className={`w-4 h-4 ${active ? "text-warm-black" : "text-gray-faint"}`} strokeWidth={1.5} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="px-3 py-1">
          <div className="h-px bg-glass-border" />
        </div>

        {/* Connections (special accent when active) */}
        <button
          onClick={() => router.push(CONNECTIONS_ITEM.href)}
          aria-current={isActive(CONNECTIONS_ITEM) ? "page" : undefined}
          className={`flex items-center gap-2.5 w-full rounded-[10px] px-3 py-[9px] text-[13px] transition-colors ${
            isActive(CONNECTIONS_ITEM)
              ? "bg-gray-bg-hover text-warm-black font-medium"
              : "text-gray-muted hover:bg-gray-bg hover:text-warm-black"
          }`}
        >
          <Unplug className={`w-4 h-4 ${isActive(CONNECTIONS_ITEM) ? "text-accent" : "text-gray-faint"}`} strokeWidth={1.5} />
          {CONNECTIONS_ITEM.label}
        </button>

        {/* Recent chats */}
        {recent.length > 0 && (
          <div className="flex flex-col px-1">
            <div className="px-2.5 py-1.5">
              <span className="text-[11px] font-medium text-gray-faint tracking-wide">Recent</span>
            </div>
            {recent.map((chat) => (
              <button
                key={chat.id}
                className="flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-gray-muted hover:bg-gray-bg hover:text-warm-black transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5 text-gray-faint shrink-0" strokeWidth={1.5} />
                <span className="text-[12px] truncate">{chat.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User */}
        <div className="flex items-center gap-2.5 rounded-xl bg-glass px-2 py-3">
          <div className="w-[30px] h-[30px] rounded-full bg-accent-dim flex items-center justify-center">
            <span className="text-[12px] font-semibold text-accent">
              {(ownerName || "U")[0].toUpperCase()}
            </span>
          </div>
          <span className="text-[13px] text-warm-black">{ownerName || "User"}</span>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
        <div className="flex items-center bg-surface-base/90 backdrop-blur-xl h-16 px-2 border-t border-gray-border">
          {NAV_ITEMS.slice(0, 4).map((item) => {
            const active = isActive(item);
            return (
              <button
                key={item.label}
                onClick={() => router.push(item.href)}
                aria-current={active ? "page" : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-1 h-full transition-colors ${
                  active ? "text-warm-black" : "text-gray-muted"
                }`}
              >
                <item.icon className="w-5 h-5" strokeWidth={1.5} />
                <span className="text-[11px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

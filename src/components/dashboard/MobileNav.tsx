"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Inbox, LayoutPanelLeft, MessageCircle, Link2 } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { useDashboard } from "./DashboardContext";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Today", icon: House },
  { href: "/dashboard/chat", label: "Ask AI", icon: MessageCircle },
  { href: "/dashboard/review", label: "Needs You", icon: Inbox },
  { href: "/dashboard/site", label: "Site", icon: LayoutPanelLeft },
  { href: "/dashboard/sources", label: "Sources", icon: Link2 },
];

export function MobileNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();
  const { dashboardBasePath, dashboardHref } = useDashboard();
  const effectivePathname =
    dashboardBasePath && pathname?.startsWith(dashboardBasePath)
      ? pathname.slice(dashboardBasePath.length) || "/dashboard"
      : pathname;
  const navRef = useRef<HTMLDivElement>(null);
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });

  const getActiveIndex = useCallback(() => {
    return NAV_ITEMS.findIndex((item) =>
      item.href === "/dashboard"
        ? effectivePathname === "/dashboard"
        : effectivePathname?.startsWith(item.href)
    );
  }, [effectivePathname]);

  useEffect(() => {
    const activeIndex = getActiveIndex();
    if (activeIndex === -1 || !navRef.current) return;

    const buttons = navRef.current.querySelectorAll<HTMLAnchorElement>("a");
    const activeButton = buttons[activeIndex];
    if (!activeButton) return;

    const navRect = navRef.current.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();

    setPillStyle({
      left: buttonRect.left - navRect.left,
      width: buttonRect.width,
    });
  }, [getActiveIndex]);

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-base/92 border-t border-glass-border pb-safe backdrop-blur-xl"
      data-dashboard
      aria-label="Primary navigation"
    >
      <div className="relative flex items-center justify-around h-16" ref={navRef}>
        <div
          className="mobile-nav-pill absolute top-1 h-[calc(100%-8px)] rounded-xl bg-gray-bg-hover shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] pointer-events-none"
          style={{
            left: pillStyle.left,
            width: pillStyle.width,
            opacity: pillStyle.width > 0 ? 1 : 0,
          }}
        />
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/dashboard"
            ? effectivePathname === "/dashboard"
            : effectivePathname?.startsWith(item.href);
          const Icon = item.icon;
          const showBadge = item.href === "/dashboard/review" && pendingCount > 0;

          return (
            <Link
              key={item.href}
              href={dashboardHref(item.href)}
              prefetch={false}
              className={`relative flex flex-col items-center justify-center gap-1 w-[60px] h-14 rounded-xl transition-colors ${
                isActive ? "text-warm-black" : "text-gray-muted"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="relative">
                <Icon className="w-5 h-5" strokeWidth={1.5} />
                {showBadge && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 text-[9px] font-semibold bg-accent text-surface-base rounded-full flex items-center justify-center">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </div>
              <span className="max-w-[54px] truncate text-[9px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

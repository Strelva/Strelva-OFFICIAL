"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useDashboard } from "./DashboardContext";
import { useDashboardSurfaces } from "./DashboardSurfacesContext";
import { SURFACE_ICONS, SURFACE_MATCH } from "./surface-nav";

export function MobileNav() {
  const pathname = usePathname();
  const { dashboardBasePath, dashboardHref } = useDashboard();
  const surfaces = useDashboardSurfaces();
  // The bottom bar shows only fully-active tabs, capped at 5 so a fully-connected
  // business doesn't overflow a phone bar — the rest stay in the hamburger nav.
  // "Connect to unlock" nudges live in Today/desktop. Memoized so it's a stable
  // reference — otherwise the active-pill effect loops forever.
  const navItems = useMemo(() => surfaces.filter((s) => s.state === "shown").slice(0, 5), [surfaces]);
  const effectivePathname =
    dashboardBasePath && pathname?.startsWith(dashboardBasePath)
      ? pathname.slice(dashboardBasePath.length) || "/dashboard"
      : pathname;
  const navRef = useRef<HTMLDivElement>(null);
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });

  const getActiveIndex = useCallback(() => {
    return navItems.findIndex((item) =>
      item.id === "today"
        ? effectivePathname === "/dashboard"
        : SURFACE_MATCH[item.id].some((m) => effectivePathname?.startsWith(m)),
    );
  }, [effectivePathname, navItems]);

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
        {navItems.map((item) => {
          const isActive = item.id === "today"
            ? effectivePathname === "/dashboard"
            : SURFACE_MATCH[item.id].some((m) => effectivePathname?.startsWith(m));
          const Icon = SURFACE_ICONS[item.id];
          return (
            <Link
              key={item.id}
              href={dashboardHref(item.href)}
              prefetch={false}
              className={`relative flex flex-col items-center justify-center gap-1 w-[60px] h-14 rounded-xl transition-colors ${
                isActive ? "text-warm-black" : "text-gray-muted"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="relative">
                <Icon className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <span className="max-w-[54px] truncate text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

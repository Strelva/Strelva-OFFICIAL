"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useDashboard } from "./DashboardContext";
import { useDashboardSurfaces } from "./DashboardSurfacesContext";
import { SURFACE_ICONS, SURFACE_MATCH } from "./surface-nav";
import type { DashboardSurface, SurfaceId } from "@/lib/dashboard-surfaces";

// What a phone owner actually reaches for, highest-priority first. A phone bar
// fits 5, and a fully-connected local business has 6 shown tabs — so when we
// have to drop one, we keep Reviews (owners check reviews on their phone) and
// let the Website site-editor fall back to the hamburger (rarely edited from a
// phone). Any id not listed sorts last.
export const MOBILE_KEEP_PRIORITY: SurfaceId[] = [
  "today",
  "ask-ai",
  "reviews",
  "analytics",
  "google-business",
  "website",
];

/** The phone bottom bar shows only fully-active tabs, capped at 5 so a
 *  fully-connected business doesn't overflow. We pick the 5 by owner priority
 *  (so Reviews survives, not just the first five in nav order) but return them
 *  in the natural nav order left-to-right. */
export function pickMobileNavSurfaces(surfaces: DashboardSurface[]): DashboardSurface[] {
  const shown = surfaces.filter((s) => s.state === "shown");
  const rank = (id: SurfaceId) => {
    const i = MOBILE_KEEP_PRIORITY.indexOf(id);
    return i === -1 ? MOBILE_KEEP_PRIORITY.length : i;
  };
  const keep = new Set(
    [...shown]
      .sort((a, b) => rank(a.id) - rank(b.id))
      .slice(0, 5)
      .map((s) => s.id),
  );
  return shown.filter((s) => keep.has(s.id));
}

export function MobileNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();
  const { dashboardBasePath, dashboardHref } = useDashboard();
  const surfaces = useDashboardSurfaces();
  // "Connect to unlock" nudges live in Today/desktop, so the bar carries only
  // fully-active tabs. Memoized so it's a stable reference — otherwise the
  // active-pill effect loops forever.
  const navItems = useMemo(() => pickMobileNavSurfaces(surfaces), [surfaces]);
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
          // Surface the approval queue on the phone bar — an owner needs to know
          // something is waiting on them without opening the hamburger. Rides on
          // Today, which is always the first kept tab.
          const showBadge = item.id === "today" && pendingCount > 0;
          return (
            <Link
              key={item.id}
              href={dashboardHref(item.href)}
              prefetch={false}
              className={`relative flex flex-col items-center justify-center gap-1 w-[60px] h-14 rounded-xl transition-colors ${
                isActive ? "text-warm-black" : "text-gray-muted"
              }`}
              aria-current={isActive ? "page" : undefined}
              aria-label={showBadge ? `${item.label}, ${pendingCount} waiting for approval` : undefined}
            >
              <div className="relative">
                <Icon className="w-5 h-5" strokeWidth={1.5} />
                {showBadge && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-on-accent"
                  >
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </div>
              <span className="max-w-[54px] truncate text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "./DashboardContext";

/**
 * The secondary nav for the Website tab, which folds Preview + Content + Media
 * behind one top-level pillar. Rendered once in the shell and shown only on those
 * routes; null everywhere else. Routes are unchanged — this just groups them.
 */
const SUBNAVS: { href: string; label: string }[][] = [
  [
    { href: "/dashboard/site", label: "Preview" },
    { href: "/dashboard/collections", label: "Content" },
    { href: "/dashboard/assets", label: "Media" },
    { href: "/dashboard/history", label: "History" },
  ],
];

export function SectionSubNav() {
  const pathname = usePathname();
  const { dashboardBasePath, dashboardHref } = useDashboard();
  const eff =
    dashboardBasePath && pathname?.startsWith(dashboardBasePath)
      ? pathname.slice(dashboardBasePath.length) || "/dashboard"
      : pathname || "";

  const items = SUBNAVS.find((group) => group.some((i) => eff.startsWith(i.href)));
  if (!items) return null;

  return (
    <nav className="shrink-0 border-b border-glass-border bg-surface-base/70 px-4 lg:px-6" aria-label="Section">
      <div className="flex h-11 items-center gap-1">
        {items.map((item) => {
          const isActive = eff.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={dashboardHref(item.href)}
              prefetch={false}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-gray-bg-hover text-warm-black"
                  : "text-gray-muted hover:bg-gray-bg hover:text-warm-black"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

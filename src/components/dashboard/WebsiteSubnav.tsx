"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe, ShoppingBag, type LucideIcon } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { getWebsiteSections, type WebsiteSection } from "@/lib/dashboard-surfaces";

const SECTION_ICONS: Record<WebsiteSection["id"], LucideIcon> = {
  site: Globe,
  store: ShoppingBag,
};

/**
 * Sub-tabs inside the Website surface. Store folds in here (never a top-level
 * tab) and only when the site has a store. With just one section there's nothing
 * to switch between, so the strip renders nothing — a plain site is unchanged.
 * Blog / Photos slot into `getWebsiteSections` later without touching this.
 */
export function WebsiteSubnav({ hasStore }: { hasStore: boolean }) {
  const pathname = usePathname();
  const { dashboardBasePath, dashboardHref } = useDashboard();
  const sections = getWebsiteSections({ hasStore });
  if (sections.length < 2) return null;

  const effectivePathname =
    dashboardBasePath && pathname?.startsWith(dashboardBasePath)
      ? pathname.slice(dashboardBasePath.length) || "/dashboard"
      : pathname;

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-gray-border bg-surface px-3 py-2">
      {sections.map((section) => {
        const Icon = SECTION_ICONS[section.id];
        const isActive = effectivePathname?.startsWith(section.href);
        return (
          <Link
            key={section.id}
            href={dashboardHref(section.href)}
            prefetch={false}
            className={`inline-flex min-h-[34px] items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors ${
              isActive
                ? "bg-gray-bg-hover text-warm-black"
                : "text-gray-muted hover:bg-gray-bg hover:text-warm-black"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}

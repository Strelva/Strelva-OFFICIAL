"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "./DashboardContext";
import { segmentPill, segmentTrack } from "./segment-pill";

/**
 * The ONE sub-nav for the Website pillar. Folds every Website sub-section —
 * Preview (the site editor), Content, Media, Brand Kit (the voice/business
 * context the AI writes from), Store (only when the tenant runs a storefront),
 * and History — behind a single strip, rendered once in the shell and shown only
 * on those routes; null everywhere else. This is the only Website sub-nav (the
 * old per-page WebsiteSubnav was removed), so nothing means "editor" twice.
 * Brand Kit also keeps its Settings → Shortcuts entry; this is a second entry
 * point to the same page, not a second home. Routes are unchanged.
 *
 * October 16: History left this strip. It is What changed, its own place in
 * the rail (as in the workspace), so one page never has two names or lives
 * in two sections.
 */
const WEBSITE_ROUTES = [
  "/dashboard/site",
  "/dashboard/collections",
  "/dashboard/assets",
  "/dashboard/brand-kit",
  "/dashboard/store",
];

export function SectionSubNav({ hasStore = false }: { hasStore?: boolean }) {
  const pathname = usePathname();
  const { dashboardBasePath, dashboardHref } = useDashboard();
  const eff =
    dashboardBasePath && pathname?.startsWith(dashboardBasePath)
      ? pathname.slice(dashboardBasePath.length) || "/dashboard"
      : pathname || "";

  if (!WEBSITE_ROUTES.some((r) => eff.startsWith(r))) return null;

  const items = [
    { href: "/dashboard/site", label: "Your site" },
    { href: "/dashboard/collections", label: "Lists" },
    { href: "/dashboard/assets", label: "Photos" },
    { href: "/dashboard/brand-kit", label: "Brand" },
    ...(hasStore ? [{ href: "/dashboard/store", label: "Store" }] : []),
  ];

  return (
    <nav
      className="shrink-0 px-4 pt-4 md:px-[88px] md:pt-6"
      aria-label="Website sections"
    >
      <div className={segmentTrack}>
        {items.map((item) => {
          const isActive = eff.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={dashboardHref(item.href)}
              prefetch={false}
              className={segmentPill(isActive)}
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

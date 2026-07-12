"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "./DashboardContext";
import { segmentPill } from "./segment-pill";

/**
 * The ONE sub-nav for the Website pillar. Folds every Website sub-section —
 * Preview (the site editor), Content, Media, Brand Kit (the voice/business
 * context the AI writes from), Store (only when the tenant runs a storefront),
 * and History — behind a single strip, rendered once in the shell and shown only
 * on those routes; null everywhere else. This is the only Website sub-nav (the
 * old per-page WebsiteSubnav was removed), so nothing means "editor" twice.
 * Brand Kit also keeps its Settings → Shortcuts entry; this is a second entry
 * point to the same page, not a second home. Routes are unchanged.
 */
const WEBSITE_ROUTES = [
  "/dashboard/site",
  "/dashboard/collections",
  "/dashboard/assets",
  "/dashboard/brand-kit",
  "/dashboard/store",
  "/dashboard/history",
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
    { href: "/dashboard/site", label: "Preview" },
    { href: "/dashboard/collections", label: "Content" },
    { href: "/dashboard/assets", label: "Media" },
    { href: "/dashboard/brand-kit", label: "Brand Kit" },
    ...(hasStore ? [{ href: "/dashboard/store", label: "Store" }] : []),
    { href: "/dashboard/history", label: "History" },
  ];

  return (
    <nav
      className="shrink-0 overflow-x-auto border-b border-glass-border px-4 py-3 sm:px-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Website sections"
    >
      <div className="flex items-center gap-1.5">
        {items.map((item) => {
          const isActive = eff.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={dashboardHref(item.href)}
              prefetch={false}
              className={`min-h-[36px] shrink-0 ${segmentPill(isActive)}`}
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

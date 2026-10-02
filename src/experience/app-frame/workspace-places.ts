/**
 * Where everything in the workspace lives (October 2, 2026 navigation).
 *
 * Plain places, with Strelva as the only actor:
 * - Home: what needs you, what Strelva handled, what is in progress.
 * - Customers: the people who reach the business.
 * - Requests: things someone asked for that have an end.
 * - Running: what Strelva keeps doing, named by the sentence it keeps true.
 * The business menu holds Business details, People & access and Help. The
 * website and apps are pinned by their own names; "apps", "work" and
 * "products" stay addressable as the full list so existing links keep working.
 * Every caller that needs to know which place a view belongs to, what it is
 * called, or how to link to it asks this module instead of keeping its own
 * mapping.
 */
export type StrelvaSection = "home" | "customers" | "requests" | "ongoing" | "apps" | "work" | "access" | "settings" | "products" | "help" | "account";

const APP_VIEWS: ReadonlySet<StrelvaSection> = new Set(["apps", "work", "products"]);
const DIRECT_VIEWS: ReadonlySet<string> = new Set(["customers", "requests", "apps", "work", "ongoing", "products", "access", "settings", "help"]);
const WORK_DETAIL_VIEWS: ReadonlySet<string> = new Set(["tracker", "inquiries", "document", "plan"]);

const TITLES: Record<StrelvaSection, string> = {
  home: "Home",
  customers: "Customers",
  requests: "Requests",
  ongoing: "Running",
  apps: "Apps",
  work: "Apps",
  products: "Apps",
  settings: "Business details",
  access: "People & access",
  help: "Help",
  account: "Account",
};

/** The sidebar place that owns a section. Every view of the app list counts as Apps. */
export function placeForSection(section: StrelvaSection | undefined): StrelvaSection | undefined {
  return section && APP_VIEWS.has(section) ? "apps" : section;
}

/** Reads a `view` URL value, including links written before these places. */
export function sectionFromView(view: string | null | undefined): StrelvaSection {
  if (view === "operations") return "ongoing";
  if (view === "delivery") return "requests";
  if (view && WORK_DETAIL_VIEWS.has(view)) return "work";
  return view && DIRECT_VIEWS.has(view) ? view as StrelvaSection : "home";
}

/** The header title for a section. */
export function sectionTitle(section: StrelvaSection): string {
  return TITLES[section];
}

export function workspaceSectionHref(section: StrelvaSection, base = "", workspaceId?: string): string {
  const path = section === "account" ? `${base}/workspace/account` : `${base}/workspace`;
  const params = new URLSearchParams();
  if (section !== "home" && section !== "account") params.set("view", section);
  if (workspaceId && section !== "account") params.set("workspaceId", workspaceId);
  return `${path}${params.size ? `?${params}` : ""}`;
}

export interface StrelvaPinnedItem {
  id: string;
  title: string;
  href: string;
  kind?: "website" | "app";
  onOpen?: () => void;
}

/** Websites assigned to the business are pinned first, in their given order. */
export function pinnedWebsites(sites: readonly { id: string; title: string; href: string }[]): StrelvaPinnedItem[] {
  return sites.map(site => ({ id: `site-${site.id}`, title: site.title, href: site.href, kind: "website" }));
}

const PINNED_APP_PRODUCTS: ReadonlySet<string> = new Set(["applications", "custom-applications"]);
const PINNED_APP_LIMIT = 6;

/** Apps the business runs, pinned by name after its websites. Saved files stay in the full list. */
export function pinnedApps(work: readonly { id: string; title: string; productId: string; unavailableReason?: string }[], href: (id: string) => string, open?: (id: string) => void): StrelvaPinnedItem[] {
  return work
    .filter(item => PINNED_APP_PRODUCTS.has(item.productId) && !item.unavailableReason)
    .slice(0, PINNED_APP_LIMIT)
    .map(item => ({ id: `app-${item.id}`, title: item.title, href: href(item.id), kind: "app", onOpen: open ? () => open(item.id) : undefined }));
}

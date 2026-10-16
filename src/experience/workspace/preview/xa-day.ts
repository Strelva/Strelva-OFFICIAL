/**
 * One fixture day for every /preview/strelva/xa harness (October 16 coherence
 * pass). The walkthrough read as five businesses because each lane invented
 * its own morning. Every XA and XS preview now reads these constants, so the
 * same Harbor Dental morning shows the same Systems, people, minutes and date
 * from the door to the agency's Home.
 *
 * Monday, November 23, 2026, 8:14 am in Buffalo. Yesterday at 4:12 pm Maya at
 * North Studio asked to close online booking for Thanksgiving (Thursday,
 * November 26); it waits for Dr. Lin this morning. Fictional; preview only.
 */

/** The morning, as a timestamp and in the words screens use. */
export const XA_DAY = {
  date: "2026-11-23",
  /** 8:14 am Eastern. Previews pass this as `now` instead of the wall clock. */
  now: Date.parse("2026-11-23T08:14:00-05:00"),
  weekday: "Monday",
  short: "Mon, Nov 23",
  long: "Monday, November 23, 2026",
  weekOf: "Nov 23",
  thanksgiving: "2026-11-26",
  /** When Strelva last checked every System this morning. */
  checkedAt: "2026-11-23T07:02:00-05:00",
} as const;

/** An ISO time on the fixture day (or `dayOffset` days from it), Eastern. */
export function xaDayAt(time: string, dayOffset = 0): string {
  return new Date(Date.parse(`${XA_DAY.date}T${time}:00-05:00`) + dayOffset * 86_400_000).toISOString();
}

/** An ISO time `hours` before 8:14 am on the fixture day. */
export function xaHoursAgo(hours: number): string {
  return new Date(XA_DAY.now - hours * 3_600_000).toISOString();
}

/** A YYYY-MM-DD date `days` before the fixture day. */
export function xaDaysAgo(days: number): string {
  return new Date(Date.parse(`${XA_DAY.date}T12:00:00-05:00`) - days * 86_400_000).toISOString().slice(0, 10);
}

/** The owner's business. */
export const XA_HARBOR = {
  name: "Harbor Dental",
  owner: "Dr. Amy Lin",
  ownerShort: "Dr. Lin",
  address: "1180 Elmwood Ave",
  city: "Buffalo, NY 14222",
  domain: "harbordental.com",
  email: "dr.lin@harbordental.example",
} as const;

/** The agency that runs it. */
export const XA_NORTH = {
  name: "North Studio",
  person: "Maya Okafor",
  first: "Maya",
  email: "maya@northstudio.example",
} as const;

/**
 * Harbor Dental's Systems, in sidebar order, with the one fact each shows.
 * GLOSSARY kind labels: the inbox System is Inquiries; the form is a Draft.
 */
export const XA_SYSTEMS = {
  website: { name: "Website", detail: XA_HARBOR.domain, lifecycle: "live" },
  bookings: { name: "Bookings", detail: "7 this week", lifecycle: "live" },
  inquiries: { name: "Inquiries", detail: "3 new", lifecycle: "live" },
  form: { name: "New-patient form", detail: "Draft", lifecycle: "draft" },
} as const;

/** What waits on the owner this morning: one thing. */
export const XA_OWNER_WAITING = { count: 1, title: "Close online booking for Thanksgiving" } as const;

/**
 * North Studio's four clients and the minutes recorded for each this month.
 * Three things wait on the agency: North Coast Realty's calendar, Lakeview
 * Mediation's open request, and an improvement ready to offer Harbor Dental.
 */
export const XA_CLIENTS = [
  { key: "harbor", name: "Harbor Dental", owner: "Dr. Amy Lin", minutes: 96 },
  { key: "north", name: "North Coast Realty", owner: "Dana Whitfield", minutes: 74 },
  { key: "lakeview", name: "Lakeview Mediation", owner: "Ruth Adler", minutes: 39 },
  { key: "fieldwork", name: "Fieldwork Studio", owner: "Ana Reyes", minutes: 22 },
] as const;

export type XaClientKey = (typeof XA_CLIENTS)[number]["key"];

export function xaClient(key: XaClientKey) {
  return XA_CLIENTS.find(client => client.key === key)!;
}

/** The agency's waiting count on the fixture day. */
export const XA_AGENCY_WAITING = { count: 3 } as const;

/* ---------- Preview navigation: every sidebar link opens its own preview screen ---------- */

const XA_BASE = "/preview/strelva/xa";

/** Where each Harbor Dental System opens in the previews (XA-4 · Systems up close). */
export const XA_SYSTEM_HREFS = {
  website: `${XA_BASE}/xa4-systems/website`,
  bookings: `${XA_BASE}/xa4-systems/bookings`,
  inquiries: `${XA_BASE}/xa4-systems/inbox`,
  form: `${XA_BASE}/xa4-systems/form`,
} as const;

export type XaSystemKey = keyof typeof XA_SYSTEM_HREFS;

type PinnedKind = "website" | "bookings" | "inquiries" | "app";
const PINNED_KIND: Record<XaSystemKey, PinnedKind> = { website: "website", bookings: "bookings", inquiries: "inquiries", form: "app" };

/**
 * Harbor Dental's sidebar Systems, the same four on every preview. `current`
 * marks the open one; `overrides` lets a screen say an exception (a waiting
 * dot, "Live" after the form's yes) without inventing a different business.
 */
export function xaOwnerPinned(options: { current?: XaSystemKey; overrides?: Partial<Record<XaSystemKey, { detail?: string; state?: "waits" | "draft" | "down"; href?: string; onOpen?: () => void }>> } = {}) {
  return (Object.keys(XA_SYSTEMS) as XaSystemKey[]).map(key => {
    const base = XA_SYSTEMS[key];
    const override = options.overrides?.[key] ?? {};
    const exception = override.state ?? (base.lifecycle === "draft" && override.detail === undefined ? "draft" as const : undefined);
    return {
      id: key, kind: PINNED_KIND[key], title: base.name, href: override.href ?? XA_SYSTEM_HREFS[key],
      ...(override.onOpen ? { onOpen: override.onOpen } : {}),
      ...(options.current === key ? { current: true } : {}),
      ...(exception ? { state: exception } : { detail: override.detail ?? base.detail }),
    };
  });
}

/** Where each agency client opens in the previews: Harbor Dental has its own client screen (AG3). */
export function xaAgencyClientHref(key: XaClientKey): string {
  return key === "harbor" ? `${XA_BASE}/xa6-agency/client` : `${XA_BASE}/xa6-agency/client?client=${key}`;
}

/**
 * What ⌘K finds in the previews, in the shape the real shell passes
 * (WorkspaceSearchItem). With these the palette and the sidebar's Search
 * open in place instead of leaving the preview.
 */
export function xaSearchItems(who: "owner" | "agency" = "owner") {
  if (who === "agency") return [
    { id: "agency-home", title: "Home", detail: XA_NORTH.name, href: `${XA_BASE}/xa6-agency/today` },
    { id: "agency-queue", title: "Queue", detail: `${XA_AGENCY_WAITING.count} wait on you`, href: `${XA_BASE}/xa6-agency/queue`, waits: true },
    { id: "agency-library", title: "Library", detail: "Apps and client Versions", href: `${XA_BASE}/xa6-agency/library` },
    { id: "agency-time", title: "Time this month", detail: `${XA_CLIENTS.reduce((sum, client) => sum + client.minutes, 0)} minutes`, href: `${XA_BASE}/xa6-agency/minutes` },
    ...XA_CLIENTS.map(client => ({ id: `client-${client.key}`, title: client.name, detail: `${client.minutes} minutes this month`, href: xaAgencyClientHref(client.key) })),
  ];
  return [
    ...(Object.keys(XA_SYSTEMS) as XaSystemKey[]).map(key => ({ id: `system-${key}`, title: XA_SYSTEMS[key].name, detail: XA_SYSTEMS[key].detail, href: XA_SYSTEM_HREFS[key], kind: PINNED_KIND[key] })),
    { id: "owner-home", title: "Home", detail: "What waits for you and what changed", href: `${XA_BASE}/xa3-owner-today/o2` },
    { id: "owner-requests", title: "Requests", detail: "Open and done", href: `${XA_BASE}/xa3-owner-today/o5` },
    { id: "owner-running", title: "Running", detail: "What Strelva keeps true", href: `${XA_BASE}/xa3-owner-today/o6` },
    { id: "owner-details", title: "Business details", detail: `${XA_HARBOR.address}, ${XA_HARBOR.city}`, href: `${XA_BASE}/xa8-record/record` },
  ];
}

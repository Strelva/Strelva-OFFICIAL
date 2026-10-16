/**
 * XA-6 preview fixtures: North Studio (Maya Okafor) running four fictional
 * clients. Harbor Dental is Dr. Amy Lin's practice at 1180 Elmwood Ave.
 * Minutes this month are 96 / 74 / 39 / 22. Nothing here reaches a real
 * business; the router answers the agency's own reads in place of the server.
 * Names, minutes and the morning come from the one fixture day (xa-day.ts).
 */
import type { AgencyClientRow, AgencyClientsPage, AgencyLibrary, AgencyQueueItem } from "../agency-clients";
import type { AgencyTimeList } from "@/platform/care-reports/contracts";
import type { WorkspaceSnapshot } from "../contracts";
import type { SystemView } from "@/experience/systems/model";
import { XA_DAY, XA_HARBOR, XA_NORTH, xaClient, xaDaysAgo } from "./xa-day";

export const XA_AGENCY = "a0000000-0000-4000-8000-000000000001";
/** Chosen so each client keeps the colour it has on the board. */
export const XA_CLIENT = {
  harbor: "a1000000-0000-4000-8000-000000000004",
  north: "a2000000-0000-4000-8000-000000000000",
  lakeview: "a3000000-0000-4000-8000-000000000004",
  fieldwork: "a4000000-0000-4000-8000-000000000002",
} as const;
const sys = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export type XaAgencyState = "ready" | "empty" | "loading" | "error" | "waiting" | "done";
export type XaAgencyScreen = "today" | "clients" | "queue" | "client" | "prepare" | "library" | "minutes";
export const XA_AGENCY_SCREENS: readonly XaAgencyScreen[] = ["today", "clients", "queue", "client", "prepare", "library", "minutes"];
export const XA_AGENCY_STATES: readonly XaAgencyState[] = ["ready", "empty", "loading", "error", "waiting", "done"];

const hoursAgo = (hours: number, now: number) => new Date(now - hours * 3_600_000).toISOString();

export function xaAgencySnapshot(): WorkspaceSnapshot {
  return {
    actor: { email: XA_NORTH.email, localPreview: true }, workspaceId: XA_AGENCY,
    workspaces: [
      { id: XA_AGENCY, kind: "agency", name: XA_NORTH.name, access: "member", role: "owner" },
      { id: XA_CLIENT.harbor, kind: "customer", name: "Harbor Dental", access: "provider_seat" },
      { id: XA_CLIENT.north, kind: "customer", name: "North Coast Realty", access: "provider_seat" },
      { id: XA_CLIENT.lakeview, kind: "customer", name: "Lakeview Mediation", access: "provider_seat" },
      { id: XA_CLIENT.fieldwork, kind: "customer", name: "Fieldwork Studio", access: "provider_seat" },
    ],
    work: [], handoffs: [], delegations: [], products: [], releases: { systems: true },
  } as WorkspaceSnapshot;
}

function client(id: string, name: string, systems: AgencyClientRow["systems"], extra: Partial<AgencyClientRow> = {}): AgencyClientRow {
  // Every fixture client was added by North Studio and claimed by its owner.
  return { workspaceId: id, name, reach: "agency", role: "agency", provider: true, status: "ready", systems, needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: null, ownerClaimWaiting: false, ownerClaimed: true, ...extra };
}

const healthy = (at: string) => ({ status: "healthy" as const, summary: "Passed its last check", lastVerifiedAt: at });

/** `state` "done" is the morning after Maya reconnected Google: nothing waits on her. */
export function xaAgencyClients(state: XaAgencyState, now: number = XA_DAY.now): AgencyClientsPage {
  if (state === "empty") return { agencyWorkspaceId: XA_AGENCY, clients: [], queue: [], team: [], total: 0, nextCursor: null, providersRead: true, queueComplete: true };
  const fixed = state === "done";
  const checked = hoursAgo(1, now);
  const clients: AgencyClientRow[] = [
    client(XA_CLIENT.harbor, "Harbor Dental", [
      { id: sys(1), name: "harbordental.com", kind: "website", lifecycle: "live", versionContext: null, health: healthy(checked) },
      { id: sys(2), name: "Bookings", kind: "bookings", lifecycle: "live", versionContext: null, health: healthy(checked) },
      { id: sys(3), name: "Inquiries", kind: "inquiries", lifecycle: "live", versionContext: null, health: healthy(checked) },
    ], { needsYou: { count: 1, oldestAt: hoursAgo(30, now) }, lastReceiptAt: hoursAgo(64, now) }),
    client(XA_CLIENT.north, "North Coast Realty", [
      { id: sys(4), name: "Showings calendar", kind: "bookings", lifecycle: "live", versionContext: null, health: fixed ? healthy(checked) : { status: "blocked", summary: "Google signed North Studio out at 6:14 am. Showing requests are being saved.", lastVerifiedAt: hoursAgo(3, now) } },
      { id: sys(5), name: "northcoastrealty.com", kind: "website", lifecycle: "live", versionContext: null, health: healthy(checked) },
    ], { lastReceiptAt: hoursAgo(20, now) }),
    client(XA_CLIENT.fieldwork, "Fieldwork Studio", [
      { id: sys(6), name: "Intake form", kind: "onboarding", lifecycle: "draft", versionContext: null, health: healthy(checked) },
      { id: sys(7), name: "fieldwork.studio", kind: "website", lifecycle: "live", versionContext: null, health: healthy(checked) },
    ], { needsYou: { count: 1, oldestAt: hoursAgo(18, now) }, lastReceiptAt: hoursAgo(90, now) }),
    client(XA_CLIENT.lakeview, "Lakeview Mediation", [
      { id: sys(8), name: "lakeviewmediation.com", kind: "website", lifecycle: "live", versionContext: null, health: healthy(checked) },
    ], fixed ? { lastReceiptAt: hoursAgo(30, now) } : { openRequests: 1, lastReceiptAt: hoursAgo(30, now) }),
  ];
  const queue: AgencyQueueItem[] = [
    ...(fixed ? [] : [{ id: "health:north", kind: "health" as const, workspaceId: XA_CLIENT.north, clientName: "North Coast Realty", title: "Showings calendar stopped syncing with Google Calendar", systemId: sys(4), workId: null, since: hoursAgo(3, now), label: "Google signed North Studio out" }]),
    ...(fixed ? [] : [{ id: "request:lakeview", kind: "request" as const, workspaceId: XA_CLIENT.lakeview, clientName: "Lakeview Mediation", title: "Ruth asked for a Spanish version of the intake form", systemId: null, workId: null, since: hoursAgo(26, now) }]),
    { id: "improvement:harbor", kind: "improvement", workspaceId: XA_CLIENT.harbor, clientName: "Harbor Dental", title: "After-hours reply is ready to offer", systemId: null, workId: null, since: hoursAgo(22, now) },
    { id: "decision:harbor", kind: "needs_you", workspaceId: XA_CLIENT.harbor, clientName: "Harbor Dental", title: "New cleaning prices on harbordental.com/services", systemId: sys(1), workId: null, since: hoursAgo(30, now) },
    { id: "decision:fieldwork", kind: "needs_you", workspaceId: XA_CLIENT.fieldwork, clientName: "Fieldwork Studio", title: "Confirm print prices before the intake form goes public", systemId: sys(6), workId: null, since: hoursAgo(18, now) },
  ];
  return { agencyWorkspaceId: XA_AGENCY, clients, queue, team: [], total: clients.length, nextCursor: null, providersRead: true, queueComplete: true };
}

function entries(minutes: number[], notes: string[], who: string[]): AgencyTimeList {
  return minutes.map((value, index) => ({
    id: `c0000000-0000-4000-8000-${String(index + 1 + who.length * 10 + value).padStart(12, "0")}`,
    minutes: value, category: "delivery", occurredOn: xaDaysAgo(1 + index),
    note: notes[index] ?? null, recordedBy: who[index % who.length]!, recordedAt: `${xaDaysAgo(1)}T13:00:00.000Z`, voided: false,
  }));
}

/** Minutes this month per client, summing to the fixture day's 96 / 74 / 39 / 22. */
export const XA_MINUTES: Record<string, AgencyTimeList> = {
  [XA_CLIENT.harbor]: entries([40, 26, 18, 12], ["Cleaning prices", "Thanksgiving hours", "Two inquiry follow-ups", "Two inquiry follow-ups"], ["maya@northstudio.example", "jonah@northstudio.example"]),
  [XA_CLIENT.north]: entries([50, 24], ["Pages for six new listings", "Google Calendar this morning"], ["jonah@northstudio.example", "maya@northstudio.example"]),
  [XA_CLIENT.lakeview]: entries([25, 14], ["Started the Spanish intake form", "Intake form questions"], ["jonah@northstudio.example"]),
  [XA_CLIENT.fieldwork]: entries([22], ["The intake form draft"], ["maya@northstudio.example"]),
};
// The sums above are the shared fixture's minutes; keep them in step.
for (const key of ["harbor", "north", "lakeview", "fieldwork"] as const) {
  const total = XA_MINUTES[XA_CLIENT[key]]!.reduce((sum, entry) => sum + entry.minutes, 0);
  if (total !== xaClient(key).minutes) throw new Error(`xa fixture minutes drifted for ${key}`);
}

const source = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const version = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function xaAgencyLibrary(state: XaAgencyState, resolved: ReadonlySet<string> = new Set()): AgencyLibrary {
  if (state === "empty") return { agencyWorkspaceId: XA_AGENCY, reviewEnabled: true, sources: [] };
  const v = (id: number, workspaceId: string, clientName: string, systemName: string, stateName: AgencyLibrary["sources"][number]["versions"][number]["state"], extra: Partial<AgencyLibrary["sources"][number]["versions"][number]> = {}) => ({
    versionId: `v-${id}`, workspaceId, clientName, systemId: version(id), systemName, context: { kind: "agency_client" as const, label: clientName },
    baselineRevision: stateName === "up_to_date" ? 3 : 2, currentRelease: 1, improvementRevision: stateName === "up_to_date" ? null : 3, localChanges: 0, state: stateName,
    conflicts: [], missingBindings: [], declinedReason: null, ...extra,
  });
  const revision = (number: number, summary: string, publishedAt: string) => ({ number, label: null, summary, publishedAt, requiredConnections: [] });
  const done = state === "done";
  return {
    agencyWorkspaceId: XA_AGENCY, reviewEnabled: true,
    sources: [
      { systemId: source(1), workspaceId: XA_AGENCY, name: "After-hours reply", hidden: false,
        revisions: [revision(3, "When an inquiry arrives after closing, the person gets a reply right away with your hours and when you'll answer.", "2026-11-11T15:00:00.000Z"), revision(2, "First after-hours reply.", "2026-10-29T14:00:00.000Z")],
        versions: [
          v(1, XA_CLIENT.harbor, "Harbor Dental", "Inquiries", "up_to_date"),
          v(2, XA_CLIENT.lakeview, "Lakeview Mediation", "Inquiry form", done ? "up_to_date" : "ready"),
          resolved.has("v-3") ? v(3, XA_CLIENT.north, "North Coast Realty", "Contact form", "up_to_date") : v(3, XA_CLIENT.north, "North Coast Realty", "Contact form", "conflicts", { conflicts: [{ path: "reply.message", local: "Thanks! An agent will text you shortly.", upstream: "Thanks. We're closed now and answer by 9 tomorrow." }] }),
          v(4, XA_CLIENT.fieldwork, "Fieldwork Studio", "Intake form", done ? "up_to_date" : "ready"),
        ] },
      { systemId: source(2), workspaceId: XA_AGENCY, name: "Holiday hours, every page at once", hidden: false,
        revisions: [revision(2, "One change to hours updates the website, the booking page and the Google listing together.", "2026-11-16T15:00:00.000Z")],
        versions: [v(5, XA_CLIENT.harbor, "Harbor Dental", "harbordental.com", "up_to_date"), v(6, XA_CLIENT.north, "North Coast Realty", "northcoastrealty.com", "up_to_date"), v(7, XA_CLIENT.fieldwork, "Fieldwork Studio", "fieldwork.studio", "up_to_date")] },
      { systemId: source(3), workspaceId: XA_AGENCY, name: "Booking reminder, two days out", hidden: false,
        revisions: [revision(1, "A text two days before each visit, with a link to move it.", "2026-11-06T15:00:00.000Z")],
        versions: [v(8, XA_CLIENT.harbor, "Harbor Dental", "Bookings", "up_to_date"), v(9, XA_CLIENT.lakeview, "Lakeview Mediation", "Bookings", "missing_accounts", { missingBindings: ["google_calendar"] })] },
      { systemId: source(4), workspaceId: XA_AGENCY, name: "Review request after a visit", hidden: false,
        revisions: [revision(1, "Asks for a Google review the day after a visit, once per person.", "2026-11-08T15:00:00.000Z")],
        versions: [v(10, XA_CLIENT.harbor, "Harbor Dental", "Reviews", "up_to_date")] },
    ],
  };
}

/** Harbor Dental's shared Systems, as the agency sees them inside the client (AG3). */
export function xaHarborSystems(): SystemView[] {
  const base = { surface: "workspace", connections: [], possibilities: [], versions: [] } as unknown as Pick<SystemView, "surface" | "connections" | "possibilities" | "versions">;
  const health = { state: "healthy", summary: "Passed its last check", lastVerifiedAt: "2026-11-23T08:02:00.000Z" } as SystemView["health"];
  return [
    { ...base, id: sys(1), kind: "website", name: "Website", detail: "harbordental.com", lifecycle: "live", health },
    { ...base, id: sys(3), kind: "inquiries", name: "Inquiries", detail: "Contact form and replies", lifecycle: "live", health },
    { ...base, id: sys(2), kind: "bookings", name: "Bookings", detail: "harbordental.com/book", lifecycle: "live", health },
    { ...base, id: sys(9), kind: "listing", name: "Google listing", detail: `${XA_HARBOR.name}, ${XA_HARBOR.address}`, lifecycle: "live", health },
    { ...base, id: sys(10), kind: "app", name: "Patient recall tracker", detail: "An internal tool", lifecycle: "live", health },
  ] as SystemView[];
}

/** One client's Systems as the agency sees them inside that client, from the same client list read. */
export function xaClientSystems(workspaceId: string): SystemView[] {
  const row = xaAgencyClients("ready").clients.find(entry => entry.workspaceId === workspaceId);
  const base = { surface: "workspace", connections: [], possibilities: [], versions: [] } as unknown as Pick<SystemView, "surface" | "connections" | "possibilities" | "versions">;
  return (row?.systems ?? []).map(entry => ({
    ...base, id: entry.id, kind: entry.kind, name: entry.name, detail: entry.kind === "website" ? entry.name : "", lifecycle: entry.lifecycle,
    health: { state: entry.health?.status === "healthy" ? "healthy" : "blocked", summary: entry.health?.summary ?? "", lastVerifiedAt: entry.health?.lastVerifiedAt },
  })) as SystemView[];
}

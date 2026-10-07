/**
 * Local fixture for the agency home's batched read (`agency-clients.ts`).
 *
 * Answers `/api/workspace/agency-clients` and `/api/workspace/agency-library`
 * for the `agency` and `agency-systems` preview scenarios. Every business,
 * person, count and value below is fictional fixture data, including the
 * Twin Trees and Mooney rows that mirror the spec's walkthrough. No request
 * leaves the browser.
 *
 * `/preview/strelva?scenario=agency-systems&systems=on&agency=<state>`:
 * - `full` (default): 50 clients, one unavailable until retried
 * - `many`: 130 clients, paged by cursor
 * - `loading`, `empty`, `error`: the clients read hangs, is empty, or fails
 * - `delegated`: the actor only reads the agency (no agency tools)
 * - `library-empty`, `library-error`: the Library read is empty or fails
 */
import type { AgencyBulkReviewResult, AgencyClientRow, AgencyClientsPage, AgencyLibrary, AgencyQueueItem, AgencyTeamMember } from "../agency-clients";

export const AGENCY_PREVIEW_STATES = ["full", "many", "loading", "empty", "error", "delegated", "library-empty", "library-error"] as const;
export type AgencyPreviewState = typeof AGENCY_PREVIEW_STATES[number];
export function agencyPreviewState(value: string | null | undefined): AgencyPreviewState {
  return AGENCY_PREVIEW_STATES.includes(value as AgencyPreviewState) ? value as AgencyPreviewState : "full";
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const DAY = 86_400_000;
const hex = (prefix: string, index: number) => `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;
const clientId = (index: number) => hex("d1000000", index);
const systemId = (index: number, n: number) => hex(`d2${String(n).padStart(6, "0")}`, index);

const TWIN_TREES = clientId(1);
const MOONEY = clientId(2);
const MCCLEARS = clientId(3);
const HARBOR = clientId(4);
const ELMWOOD = clientId(5);

const NAMES = [
  "Lake Bakery", "Northside Physical Therapy", "Cobblestone Books", "Grant Street Auto", "Delaware Park Yoga", "Hertel Hardware",
  "Riverbend Veterinary", "Two Rivers Accounting", "Allen Street Barbers", "Larkin Floral", "Canalside Kayak", "Parkside Pediatrics",
  "Southtowns Roofing", "Elm Street Tailor", "Main Place Dental", "Orchard Park Plumbing", "Lockport Landscaping", "Ellicott Law",
  "Seneca Coffee", "Abbott Road Pet Care", "Amherst Music School", "Kenmore Optical", "Bidwell Interiors", "Colvin Cleaners",
  "Niagara Square Notary", "Forest Lawn Masonry", "Black Rock Brewing", "Lancaster Tutoring", "Clarence Equestrian", "Wellness on Delaware",
  "Ridge Road Chiropractic", "Hamburg Home Inspections", "Eden Valley Farm Stand", "Tonawanda Marine", "Williamsville Bridal", "Snyder Speech Therapy",
  "Cheektowaga Electric", "West Side Bikes", "Old First Ward Pub", "Linwood Counseling", "Kaisertown Deli", "Grand Island Charters",
  "Lackawanna Tile", "Depew Movers", "Alden Orchards",
];

function at(daysAgo: number, now: number, hours = 0): string {
  return new Date(now - daysAgo * DAY - hours * 3_600_000).toISOString();
}

function clientRows(count: number, now: number, mcClearsReady: boolean): AgencyClientRow[] {
  const named: AgencyClientRow[] = [
    {
      workspaceId: TWIN_TREES, name: "Twin Trees", reach: "member", role: "admin", provider: true, status: "ready",
      systems: [
        { id: systemId(1, 1), name: "Twin Trees website", kind: "website", lifecycle: "live", versionContext: "Camillus" },
        { id: systemId(1, 2), name: "Twin Trees website", kind: "website", lifecycle: "live", versionContext: "Fayetteville" },
      ],
      needsYou: { count: 1, oldestAt: at(2, now) }, openRequests: 0, improvementsWaiting: 1, lastReceiptAt: at(1, now, 3),
    },
    {
      workspaceId: MOONEY, name: "The Mooney Firm", reach: "member", role: "admin", provider: true, status: "ready",
      systems: [
        { id: systemId(2, 1), name: "attymooney.com", kind: "website", lifecycle: "live", versionContext: null },
        { id: systemId(2, 2), name: "Inquiries", kind: "inquiries", lifecycle: "live", versionContext: null },
        { id: systemId(2, 3), name: "Mediation sessions", kind: "bookings", lifecycle: "draft", versionContext: null },
      ],
      needsYou: { count: 2, oldestAt: at(6, now) }, openRequests: 1, improvementsWaiting: 0, lastReceiptAt: at(0, now, 5),
    },
    mcClearsReady ? {
      workspaceId: MCCLEARS, name: "McClear’s", reach: "member", role: "admin", provider: true, status: "ready",
      systems: [{ id: systemId(3, 1), name: "mcclears.example", kind: "website", lifecycle: "live", versionContext: null }],
      needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: at(4, now),
    } : {
      workspaceId: MCCLEARS, name: "McClear’s", reach: "member", role: "admin", provider: true, status: "unavailable",
      systems: [], needsYou: { count: 0, oldestAt: null }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: null,
    },
    {
      workspaceId: HARBOR, name: "Harbor Dental", reach: "agency", role: "agency", provider: false, status: "ready",
      systems: [{ id: systemId(4, 1), name: "New-patient intake", kind: "app", lifecycle: "draft", versionContext: null }],
      needsYou: { count: 0, oldestAt: null }, openRequests: 2, improvementsWaiting: 1, lastReceiptAt: null,
    },
    {
      workspaceId: ELMWOOD, name: "Elmwood Physical Therapy", reach: "member", role: "admin", provider: true, status: "ready",
      systems: [
        { id: systemId(5, 1), name: "elmwoodpt.example", kind: "website", lifecycle: "live", versionContext: null },
        { id: systemId(5, 2), name: "Appointment requests", kind: "inquiries", lifecycle: "paused", versionContext: null },
      ],
      needsYou: { count: 1, oldestAt: at(9, now) }, openRequests: 0, improvementsWaiting: 0, lastReceiptAt: at(12, now),
    },
  ];
  const rest = Array.from({ length: Math.max(0, count - named.length) }, (_, offset): AgencyClientRow => {
    const index = offset + named.length + 1;
    const name = NAMES[offset % NAMES.length]! + (offset >= NAMES.length ? ` ${Math.floor(offset / NAMES.length) + 1}` : "");
    const waiting = offset % 7 === 0 ? 1 : 0;
    return {
      workspaceId: clientId(index), name, reach: "member", role: "admin", provider: true, status: "ready",
      systems: [{ id: systemId(index, 1), name: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`, kind: "website", lifecycle: offset % 11 === 0 ? "draft" : "live", versionContext: null }],
      needsYou: { count: waiting, oldestAt: waiting ? at(1 + (offset % 4), now) : null },
      openRequests: offset % 5 === 0 ? 1 : 0, improvementsWaiting: 0, lastReceiptAt: offset % 9 === 0 ? null : at(offset % 15, now, 2),
    };
  });
  return [...named, ...rest];
}

function queue(now: number): AgencyQueueItem[] {
  return [
    { id: "q-elmwood", kind: "needs_you", workspaceId: ELMWOOD, clientName: "Elmwood Physical Therapy", title: "Owner hasn’t seen the new booking hours", systemId: systemId(5, 2), workId: null, since: at(9, now) },
    { id: "q-mooney-facts", kind: "needs_you", workspaceId: MOONEY, clientName: "The Mooney Firm", title: "Confirm 40 flagged facts on the rebuilt site", systemId: systemId(2, 1), workId: null, since: at(6, now) },
    { id: "q-mooney-dates", kind: "request", workspaceId: MOONEY, clientName: "The Mooney Firm", title: "Let attorneys request a session date from attymooney.com", systemId: null, workId: null, since: at(3, now) },
    { id: "q-twin", kind: "improvement", workspaceId: TWIN_TREES, clientName: "Twin Trees", title: "Camillus got a new hours section. Bring it to Fayetteville?", systemId: systemId(1, 2), workId: null, since: at(2, now) },
    { id: "q-harbor-1", kind: "request", workspaceId: HARBOR, clientName: "Harbor Dental", title: "Add insurance card upload to new-patient intake", systemId: null, workId: null, since: at(1, now) },
    { id: "q-harbor-2", kind: "improvement", workspaceId: HARBOR, clientName: "Harbor Dental", title: "Inquiry intake revision 4 is ready", systemId: systemId(4, 1), workId: null, since: at(0, now, 4) },
    { id: "q-lake", kind: "needs_you", workspaceId: clientId(6), clientName: "Lake Bakery", title: "Approve the holiday hours change", systemId: null, workId: null, since: at(1, now, 6) },
  ];
}

function team(rows: readonly AgencyClientRow[]): AgencyTeamMember[] {
  const reach = (filter: (row: AgencyClientRow, index: number) => boolean) => rows.filter(filter).map((row) => ({ workspaceId: row.workspaceId, name: row.name }));
  return [
    { userId: hex("d3000000", 1), email: "jacob@strelva.example", role: "owner", clients: reach(() => true) },
    { userId: hex("d3000000", 2), email: "operations@strelva.example", role: "admin", clients: reach((_, index) => index < 12) },
    { userId: hex("d3000000", 3), email: "sam@strelva.example", role: "member", clients: reach((row) => row.workspaceId === TWIN_TREES || row.workspaceId === MOONEY) },
  ];
}

function library(agencyWorkspaceId: string, now: number): AgencyLibrary {
  const version = (index: number, workspaceId: string, clientName: string, state: AgencyLibrary["sources"][number]["versions"][number]["state"], extra: Partial<AgencyLibrary["sources"][number]["versions"][number]> = {}) => ({
    versionId: `v-intake-${index}`, workspaceId, clientName, systemId: systemId(index, 9), systemName: "Inquiry intake",
    context: { kind: "agency_client" as const, label: clientName }, baselineRevision: state === "up_to_date" ? 4 : 3, currentRelease: 2,
    state, conflicts: [], missingBindings: [], declinedReason: null, ...extra,
  });
  return {
    agencyWorkspaceId,
    sources: [
      {
        systemId: hex("d4000000", 1), workspaceId: agencyWorkspaceId, name: "Inquiry intake for professional practices", hidden: false,
        revisions: [
          { number: 3, label: "Routing", summary: "Route each inquiry to the person named for that practice area.", publishedAt: at(40, now) },
          { number: 4, label: "Follow-up", summary: "Follow up when nobody replies within one business day, and say who will reply.", publishedAt: at(3, now) },
        ],
        versions: [
          version(2, MOONEY, "The Mooney Firm", "conflicts", { conflicts: [{ path: "followUp.message", local: "We'll call you within one business day.", upstream: "Thanks for reaching out. Someone from the office will reply by the end of the next business day." }] }),
          version(4, HARBOR, "Harbor Dental", "ready"),
          version(6, clientId(6), "Lake Bakery", "ready"),
          version(7, clientId(7), "Northside Physical Therapy", "ready"),
          version(8, clientId(8), "Cobblestone Books", "ready"),
          version(9, clientId(9), "Grant Street Auto", "ready"),
          version(5, ELMWOOD, "Elmwood Physical Therapy", "missing_accounts", { missingBindings: ["google_calendar"] }),
        ],
      },
      {
        systemId: hex("d4000000", 2), workspaceId: TWIN_TREES, name: "Twin Trees website", hidden: true,
        revisions: [{ number: 2, label: "Hours", summary: "Camillus got a new hours section with holiday closures.", publishedAt: at(2, now) }],
        versions: [
          { ...version(1, TWIN_TREES, "Twin Trees", "up_to_date"), versionId: "v-twin-camillus", systemId: systemId(1, 1), systemName: "Twin Trees website", context: { kind: "location", label: "Camillus" }, baselineRevision: 2 },
          { ...version(1, TWIN_TREES, "Twin Trees", "ready"), versionId: "v-twin-fayetteville", systemId: systemId(1, 2), systemName: "Twin Trees website", context: { kind: "location", label: "Fayetteville" }, baselineRevision: 1 },
        ],
      },
    ],
  };
}

const PAGE = 100;

/** Wraps the scenario's request with the agency reads. Other scenarios pass through untouched. */
export function withAgencyPreview(base: typeof fetch, scenario: string, state: AgencyPreviewState): typeof fetch {
  if (scenario !== "agency" && scenario !== "agency-systems") return base;
  const now = Date.now();
  // Dev StrictMode reads twice on mount; McClear’s loads from the first retry on.
  // Dev StrictMode reads twice on mount, so McClear's loads from the first Retry on.
  let clientReads = 0;
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://preview.invalid");
    const method = init?.method || "GET";
    const agencyWorkspaceId = url.searchParams.get("workspaceId") || "";

    if (url.pathname === "/api/workspace/agency-clients" && method === "GET") {
      if (state === "loading") await new Promise((resolve) => setTimeout(resolve, 600_000));
      if (state === "error") return json({ error: "Clients could not be loaded." }, 503);
      clientReads += 1;
      const rows = state === "empty" ? [] : clientRows(state === "many" ? 130 : 50, now, clientReads > 2);
      const offset = Number(url.searchParams.get("cursor") || 0) || 0;
      const slice = rows.slice(offset, offset + PAGE);
      const page: AgencyClientsPage = {
        agencyWorkspaceId, clients: slice.map(client => ({ ...client, systems: client.systems.map(system => ({ ...system,
          health: { status: client.workspaceId === ELMWOOD ? "blocked" as const : "unknown" as const,
            summary: client.workspaceId === ELMWOOD ? "Fixture: the domain check failed." : "Fixture: no recent health evidence.",
            lastVerifiedAt: client.workspaceId === ELMWOOD ? at(0, now) : null },
        })) })), queue: offset === 0 && rows.length ? queue(now).map(item => ({ ...item,
          ...(item.systemId ? { href: `/workspace?view=system&system=${item.systemId}&workspaceId=${item.workspaceId}` } : {}),
        })) : [], team: team(slice), queueComplete: true, queueGaps: [],
        total: rows.length, nextCursor: offset + PAGE < rows.length ? String(offset + PAGE) : null, providersRead: true,
      };
      return json(page);
    }

    if ((url.pathname === "/api/workspace/agency-authoring" || url.pathname === "/api/workspace/versions/manage") && method === "GET") {
      const agencyId = url.searchParams.get("agencyWorkspaceId") || agencyWorkspaceId;
      if (state === "loading") return new Promise<Response>(() => undefined);
      if (state === "error") return json({ error: "Agency sources could not be read." }, 503);
      if (state === "delegated") return json({ error: "This agency is shared read-only." }, 403);
      const source = library(agencyId, now).sources[0]!;
      if (url.pathname === "/api/workspace/versions/manage") return json({ workspaceId: agencyId, sources: state === "empty" ? [] : [{
        systemId: source.systemId, name: source.name, revisions: [{ source: { businessId: agencyId, systemId: source.systemId,
          revisionId: hex("d5000000", 1), number: 4 }, summary: "Follow up after one business day" }],
      }] });
      return json({ workspaceId: agencyId, choices: state === "empty" ? [] : [{ systemId: source.systemId, name: source.name,
        revision: 4, fingerprint: "fixture:source:4", definition: { title: "Inquiry intake", followUp: { message: "Someone will reply by the end of the next business day." } } }], unavailable: [] });
    }

    if (url.pathname === "/api/workspace/agency-authoring" && method === "POST" && url.searchParams.get("action") === "package") {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { workspaceId?: string; systemId?: string };
      if (state === "delegated") return json({ error: "This agency is shared read-only." }, 403);
      return json({ workspaceId: body.workspaceId, systemId: body.systemId, revision: 5, revisionId: hex("d5000000", 2) });
    }

    if (url.pathname === "/api/workspace/versions/manage" && method === "POST") {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { action?: string; workspaceId?: string; commandId?: string };
      if (body.action === "create") {
        if (state === "delegated") return json({ error: "This agency is shared read-only." }, 403);
        return json({ workspaceId: body.workspaceId, systemId: body.commandId, versionId: hex("d6000000", 1), rowRevision: 1, outcome: "created" }, 201);
      }
    }

    if (url.pathname === "/api/workspace/agency-library" && method === "GET") {
      if (state === "library-error") return json({ error: "The library could not be loaded." }, 503);
      return json(state === "library-empty" || state === "empty" ? { agencyWorkspaceId, sources: [] } : library(agencyWorkspaceId, now));
    }

    if (url.pathname === "/api/workspace/agency-library" && method === "POST") {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { workspaceId?: string; sourceSystemId?: string; revision?: number; versionIds?: string[] };
      const source = library(body.workspaceId || "", now).sources.find((item) => item.systemId === body.sourceSystemId);
      if (!source) return json({ error: "This source is not in the local preview. Nothing was changed." }, 404);
      const result: AgencyBulkReviewResult = {
        sourceSystemId: source.systemId, revision: body.revision || 1,
        results: source.versions.filter((version) => body.versionIds?.includes(version.versionId)).map((version) => version.clientName === "Grant Street Auto"
          ? { versionId: version.versionId, workspaceId: version.workspaceId, clientName: version.clientName, outcome: "failed" as const, detail: "The owner’s approval settings could not be read" }
          : { versionId: version.versionId, workspaceId: version.workspaceId, clientName: version.clientName, outcome: "prepared" as const, detail: "" }),
      };
      return json(result);
    }

    const response = await base(input, init);
    if (state !== "delegated" || url.pathname !== "/api/workspace" || method !== "GET" || !response.ok) return response;
    const snapshot = await response.json() as { workspaces?: Array<{ kind: string; access?: string; role?: string }> };
    return json({ ...snapshot, workspaces: snapshot.workspaces?.map((workspace) => workspace.kind === "agency" ? { ...workspace, access: "delegated_read", role: undefined } : workspace) });
  };
}

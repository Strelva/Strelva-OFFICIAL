/**
 * Fictional data for the XS · shell states preview (October 16). Harbor
 * Dental (Dr. Amy Lin, 1180 Elmwood Ave) served by North Studio (Maya
 * Okafor). Shapes are the server's own; nothing here reaches a business.
 */
import type { ServiceRequest } from "@/platform/service-requests";
import type { WorkspaceSnapshot } from "../contracts";
import type { WorkspaceSearchItem } from "../workspace-search";

export const XS_BASE = "/preview/strelva/xa/xs-shell-states";
export const XS_SCREENS = ["account", "search", "switcher", "dialog", "help", "not-found", "error", "marketing-error", "not-open", "getting-started-off", "loading", "unopened", "shared-empty"] as const;
export type XsScreen = typeof XS_SCREENS[number];
export const XS_STATES = ["ready", "empty", "loading", "error", "waiting", "done", "unconfirmed", "closed", "continuation", "agency", "query", "none", "busy", "sign-in", "forbidden", "gone", "no-agency", "no-business", "start"] as const;
export type XsState = typeof XS_STATES[number];

export const HARBOR = { id: "d2960000-0000-4000-8000-000000000001", name: "Harbor Dental", owner: "Dr. Amy Lin", email: "amy@harbordental.com", address: "1180 Elmwood Ave, Buffalo, NY 14222" } as const;
export const NORTH = { id: "d2960000-0000-4000-8000-0000000000a1", name: "North Studio", person: "Maya Okafor", email: "maya@northstudio.co" } as const;
export const CLIENTS = [
  { id: "d2960000-0000-4000-8000-000000000001", name: "Harbor Dental", minutes: 96 },
  { id: "d2960000-0000-4000-8000-000000000002", name: "North Coast Realty", minutes: 74 },
  { id: "d2960000-0000-4000-8000-000000000003", name: "Lakeview Mediation", minutes: 39 },
  { id: "d2960000-0000-4000-8000-000000000004", name: "Fieldwork Studio", minutes: 22 },
] as const;

export function ownerSnapshot(): WorkspaceSnapshot {
  return { actor: { email: HARBOR.email, localPreview: true }, workspaceId: HARBOR.id, workspaces: [
    { id: "d2960000-0000-4000-8000-0000000000p1", name: "Amy’s own work", kind: "personal", role: "owner" },
    { id: HARBOR.id, name: HARBOR.name, kind: "customer", role: "owner" },
    { id: "d2960000-0000-4000-8000-000000000009", name: "Harbor Dental Orchard Park", kind: "customer", role: "admin" },
  ], work: [], handoffs: [], delegations: [], products: [] };
}

export function agencySnapshot(): WorkspaceSnapshot {
  return { actor: { email: NORTH.email, localPreview: true }, workspaceId: CLIENTS[0].id, workspaces: [
    { id: NORTH.id, name: NORTH.name, kind: "agency", role: "owner" },
    ...CLIENTS.map((client, index) => ({ id: client.id, name: client.name, kind: "customer" as const, access: index === 2 ? "delegated_read" as const : "provider_seat" as const, role: "admin" as const })),
  ], work: [], handoffs: [], delegations: [], products: [] };
}

export function accountWorkspaces(kind: "owner" | "agency") {
  return kind === "agency"
    // Maya reaches her clients through North Studio's seat, never as a member of the business.
    ? [{ id: NORTH.id, kind: "agency" as const, name: NORTH.name, access: "member" as const }, ...CLIENTS.slice(0, 3).map((client, index) => ({ id: client.id, kind: "customer" as const, name: client.name, access: index === 2 ? "delegated_read" as const : "provider_seat" as const }))]
    : ownerSnapshot().workspaces.map(item => ({ id: item.id, kind: item.kind, name: item.name, access: "member" as const }));
}

/** Each result says its kind in plain words and wears its clay; only the request that waits says so. */
export const SEARCH_ITEMS: readonly WorkspaceSearchItem[] = [
  { id: "s1", title: "harbordental.com", detail: "Website", kind: "website", href: `${XS_BASE}/search` },
  { id: "s2", title: "Bookings", detail: "Bookings · Mon to Fri 8 to 5, Sat 9 to 1", kind: "bookings", href: `${XS_BASE}/search` },
  { id: "s3", title: "New patient form", detail: "Form · Maya at North Studio is preparing it", kind: "form", href: `${XS_BASE}/search` },
  { id: "s4", title: "Close for Thanksgiving, Nov 26 and 27", detail: "Request", kind: "documents", waits: true, href: `${XS_BASE}/search` },
  { id: "s5", title: "Insurance we take", detail: "Business record · Delta Dental, Cigna, MetLife", href: `${XS_BASE}/search` },
  { id: "s6", title: "Google listing", detail: "Listing · 1180 Elmwood Ave", kind: "listing", href: `${XS_BASE}/search` },
  { id: "s7", title: "October care plan report", detail: "Document from North Studio", kind: "documents", href: `${XS_BASE}/search` },
];

/** The person's websites from before workspaces, named by domain. */
export const ACCOUNT_SITES = [{ id: "harbor-legacy", domain: "harbordental.com", href: "/preview/strelva/website" }] as const;

const request = (id: string, text: string, status: ServiceRequest["providerAcceptance"]["status"], day: string, extra: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id, businessId: HARBOR.id, status: "requested", request: text, outcome: text, context: { source: "workspace_help" }, scope: ["help_request"],
  provider: { kind: "agency", agencyWorkspaceId: NORTH.id }, providerAcceptance: { status, actorId: null, acceptedAt: null, note: null },
  installationId: null, deliveryId: null, revision: 1, createdBy: "d2960000-0000-4000-8000-0000000000b1", createdAt: `2026-10-${day}T14:00:00Z`, updatedAt: `2026-10-${day}T14:00:00Z`, ...extra,
});

export const SAVED_REQUESTS: readonly ServiceRequest[] = [
  request("d2960000-0000-4000-8000-0000000000r1", "Let patients text to reschedule instead of calling the front desk.", "pending", "14"),
  request("d2960000-0000-4000-8000-0000000000r2", "Add Saturday hours to the website and the Google listing.", "accepted", "09"),
  request("d2960000-0000-4000-8000-0000000000r3", "Move the new patient form above the fold on phones.", "declined", "02"),
];

/** The help page's reads and its one write, answered locally. */
export function helpTransport(state: XsState): typeof fetch {
  let requests: ServiceRequest[] = state === "empty" || state === "no-agency" ? [] : [...SAVED_REQUESTS];
  return async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/service-requests")) {
      if (state === "loading") return new Promise<Response>(() => undefined);
      if (url.includes("providersBusinessId=")) return Response.json({ providers: state === "no-agency" ? [] : [{ agencyWorkspaceId: NORTH.id, name: NORTH.name, providerOfRecord: true }] });
      if (state === "error" && init?.method !== "POST") return Response.json({ error: { message: "Your requests couldn’t be read just now. Nothing about them changed." } }, { status: 503 });
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { request: string; outcome: string; scope: string[]; context: Record<string, unknown>; provider: ServiceRequest["provider"] };
        await new Promise(resolve => setTimeout(resolve, 700));
        const saved = { ...request("d2960000-0000-4000-8000-0000000000r9", body.request, "pending", "16"), outcome: body.outcome, scope: body.scope, context: body.context, provider: body.provider };
        requests = [saved, ...requests];
        return Response.json({ request: saved });
      }
      return Response.json({ requests });
    }
    if (url.startsWith("/api/workspace/agencies")) {
      return Response.json({ directory: [
        { agencyWorkspaceId: NORTH.id, name: NORTH.name, summary: "Websites and booking for dental and health practices." },
        { agencyWorkspaceId: "d2960000-0000-4000-8000-0000000000a2", name: "Strelva Agency", summary: "Managed websites, done for you." },
      ], agencies: state === "no-agency" ? [] : [{ agencyWorkspaceId: NORTH.id, name: NORTH.name, seat: true, ofRecord: true, scopes: [{ scope: "website", level: "full_control", status: "active" }, { scope: "bookings", level: "prepare", status: "active" }] }] });
    }
    return Response.json({ error: "Not in this preview." }, { status: 404 });
  };
}

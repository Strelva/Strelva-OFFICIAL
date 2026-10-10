import { beforeEach, describe, expect, it, vi } from "vitest";
import { QUEUE_KINDS, OperatorQueueAccessError, type QueueContext, type QueueItemRaw } from "@/platform/operator-queue/contracts";
import { projectQueue } from "@/platform/operator-queue/project";
import { addAgencyOperatorOverview } from "@/experience/workspace/agency/operator-overview";
import { clientSystemLabel } from "@/experience/workspace/agency-home";
import type { AgencyClientsPage } from "@/experience/workspace/agency-clients";
import type { SiteHealthSnapshot } from "@/platform/operator-queue/site-coverage";
import { readAgencyClientsPage } from "@/experience/workspace/agency-server";
const reads = vi.hoisted(() => ({ queue: vi.fn(), health: vi.fn() }));
vi.mock("@/server/operator-queue/service", () => ({ readOperatorQueue: reads.queue }));
vi.mock("@/platform/operator-queue/site-health-store", () => ({ readSiteHealth: reads.health }));

const now = Date.parse("2026-10-07T14:00:00Z"), at = new Date(now).toISOString();
const agency = crypto.randomUUID(), business = crypto.randomUUID(), other = crypto.randomUUID(), system = crypto.randomUUID();
const actor = { userId: crypto.randomUUID(), verifiedEmail: "agency-overview@example.test" };
const context: QueueContext = { links: [{ tenantId: "fixture", tenantStableId: crypto.randomUUID(), workspaceId: business, workspaceName: "Fixture", systemId: system }],
  businesses: [{ id: business, name: "Fixture" }, { id: other, name: "Private client" }], delegations: [], documentHealth: [], operators: [], marks: [], readbackFailures: [] };
function page(): AgencyClientsPage {
  return { agencyWorkspaceId: agency, clients: [{ workspaceId: business, name: "Fixture", reach: "member", role: "admin", provider: true,
    status: "ready", systems: [{ id: system, name: "Website", kind: "website", lifecycle: "live", versionContext: null }], needsYou: { count: 1, oldestAt: at },
    openRequests: 1, improvementsWaiting: 1, lastReceiptAt: null }], queue: [
    { id: "decision:1", kind: "owner_email", workspaceId: business, clientName: "Fixture", title: "Owner email bounced", systemId: system, workId: null, since: at },
    { id: "improvement:1", kind: "improvement", workspaceId: business, clientName: "Fixture", title: "Improvement ready", systemId: system, workId: null, since: at },
    { id: "request:1", kind: "request", workspaceId: business, clientName: "Fixture", title: "Old request projection", systemId: null, workId: null, since: at },
  ], team: [], total: 1, nextCursor: null, providersRead: true };
}
function shared(rows: QueueItemRaw[]) {
  return { ...projectQueue({ reads: QUEUE_KINDS.map(kind => ({ kind, source: kind, ok: true, rows: rows.filter(row => row.kind === kind) })), context, tenants: [], emailPaused: true, now }), context };
}
function raw(kind: QueueItemRaw["kind"], overrides: Partial<QueueItemRaw> = {}): QueueItemRaw {
  return { kind, sourceRef: kind, title: kind, openedAt: at, workspaceId: business, tenantId: null, systemId: system, href: "/admin", ...overrides };
}
const health: SiteHealthSnapshot = { checkedAt: at, results: [{ tenantId: "fixture", stableId: null, siteName: "Fixture", deliveryModel: "custom_repo",
  status: "blocked", reasons: [], lastVerifiedAt: at, stale: false, domainEvidence: "domain-monitor" }] };
beforeEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("one agency operator Queue", () => {
  it("uses the original RPC with flags off and reads no new queue or health store", async () => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0");
    const input = page(), rpc = vi.fn(async () => ({ data: input, error: null }));
    expect(await readAgencyClientsPage(actor, agency, null, { rpc })).toEqual(input);
    expect(rpc).toHaveBeenCalledWith("agency_client_overview", expect.objectContaining({ p_agency_workspace_id: agency, p_cursor: null }));
    expect(reads.queue).not.toHaveBeenCalled(); expect(reads.health).not.toHaveBeenCalled();
  });
  it("uses the additive scoped RPC and shared Queue with the flag on", async () => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "1");
    const input = page(), rpc = vi.fn(async () => ({ data: input, error: null }));
    reads.queue.mockResolvedValue(shared([])); reads.health.mockResolvedValue(null);
    const result = await readAgencyClientsPage(actor, agency, null, { rpc });
    expect(rpc).toHaveBeenCalledWith("agency_client_overview_v2", expect.objectContaining({ p_agency_workspace_id: agency }));
    expect(reads.queue).toHaveBeenCalledOnce(); expect(result.clients[0]!.systems[0]!.health?.status).toBe("unknown");
  });
  it("keeps client decisions and offers, adds shared health/work and excludes other clients and internal data", async () => {
    const queue = vi.fn(async () => shared([raw("site_health"), raw("service_request", { systemId: null }),
      raw("ops_alert"), raw("prospect_lead"), raw("readback_failed"), raw("operational_exception", { workspaceId: other }),
      raw("assignment_offer", { systemId: crypto.randomUUID() })]));
    const result = await addAgencyOperatorOverview(actor, page(), { queue, health: async () => health }, now);
    expect(queue).toHaveBeenCalledOnce();
    expect(result.queue.map(item => item.kind).sort()).toEqual(["health", "improvement", "operator", "owner_email"]);
    expect(result.queue.find(item => item.kind === "health")?.href).toBe(`/workspace?view=system&system=${system}&workspaceId=${business}`);
    expect(result.clients[0]!.systems[0]!.health?.status).toBe("blocked");
    expect(clientSystemLabel(result.clients[0]!.systems[0]!)).toBe("Website · Live · Blocked");
    expect(result.queueComplete).toBe(true);
  });
  it("never widens a delegated client's work or discloses that client's health", async () => {
    const input = page(); input.clients[0]!.reach = "agency";
    const result = await addAgencyOperatorOverview(actor, input, { queue: async () => shared([raw("site_health"), raw("operational_exception")]), health: async () => health }, now);
    expect(result.queue).toEqual(input.queue);
    expect(result.clients[0]!.systems[0]!.health).toBeUndefined();
  });
  it("leaves a non-operator's SQL-scoped view unchanged and reads no portfolio health", async () => {
    const input = page(), healthReader = vi.fn(async () => health);
    expect(await addAgencyOperatorOverview(actor, input, { queue: async () => { throw new OperatorQueueAccessError(); }, health: healthReader }, now)).toBe(input);
    expect(healthReader).not.toHaveBeenCalled();
  });
  it("reports partial source failures and stale or missing health as unverified", async () => {
    const queue = shared([]); queue.gaps = [{ kind: "service_request", source: "Requests", reason: "Unavailable" }];
    queue.complete = false;
    const stale = { ...health, checkedAt: new Date(now - 27 * 3600_000).toISOString() };
    const result = await addAgencyOperatorOverview(actor, page(), { queue: async () => queue, health: async () => stale }, now);
    expect(result.queueComplete).toBe(false);
    expect(result.queueGaps).toContain("Requests: Unavailable");
    expect(result.clients[0]!.systems[0]!.health?.status).toBe("unknown");
    const unavailable = await addAgencyOperatorOverview(actor, page(), { queue: async () => shared([]), health: async () => { throw new Error("offline"); } }, now);
    expect(unavailable.queueGaps).toContain("System health could not be read.");
    expect(unavailable.clients[0]!.systems[0]!.health?.status).toBe("unknown");
  });
});

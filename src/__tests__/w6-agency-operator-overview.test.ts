import { beforeEach, describe, expect, it, vi } from "vitest";
import { addAgencyOperatorOverview } from "@/experience/workspace/agency/operator-overview";
import { clientSystemLabel } from "@/experience/workspace/agency-home";
import type { AgencyClientsPage } from "@/experience/workspace/agency-clients";
import type { BusinessSystems } from "@/platform/systems";
import type { Observation } from "@/platform/system-health";
import { readAgencyClientsPage } from "@/experience/workspace/agency-server";
const reads = vi.hoisted(() => ({ systems: vi.fn(), evidence: vi.fn() }));
vi.mock("@/platform/systems", async original => ({ ...await original<typeof import("@/platform/systems")>(), listBusinessSystems: reads.systems }));
vi.mock("@/experience/systems/server", () => ({ readSystemsEvidence: reads.evidence }));

const now = Date.parse("2026-10-07T14:00:00Z"), at = new Date(now).toISOString();
const agency = crypto.randomUUID(), business = crypto.randomUUID(), system = crypto.randomUUID();
const actor = { userId: crypto.randomUUID(), verifiedEmail: "agency-overview@example.test" };
function page(): AgencyClientsPage {
  return { agencyWorkspaceId: agency, clients: [{ workspaceId: business, name: "Fixture", reach: "agency", role: "admin", provider: true,
    status: "ready", systems: [{ id: system, name: "Website", kind: "website", lifecycle: "live", versionContext: null }], needsYou: { count: 1, oldestAt: at },
    openRequests: 1, improvementsWaiting: 1, lastReceiptAt: null }], queue: [
    { id: "decision:1", kind: "needs_you", workspaceId: business, clientName: "Fixture", title: "Review website", systemId: system, workId: null, since: at },
    { id: "request:1", kind: "request", workspaceId: business, clientName: "Fixture", title: "Website request", systemId: null, workId: null, since: at },
  ], team: [], total: 1, nextCursor: null, providersRead: true };
}
function listing(id = system): BusinessSystems {
  return { businessId: business, systems: [{ system: { id, businessId: business, name: "Website", kind: "website", lifecycle: "live", purpose: null,
    currentRevision: null, origin: null, changeNumber: 1, createdAt: at, updatedAt: at }, provenance: "stored", basis: null,
    references: { savedWorkId: null, tenantStableId: null, tenantId: null } }], connections: [] };
}
const observation: Observation = { subjectId: system, signal: "domain.uptime", outcome: "fail", impact: "blocking", observedAt: at, maxAgeSeconds: 3600, source: "domain-monitor", message: "The website did not respond." };
beforeEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); reads.systems.mockResolvedValue(listing()); reads.evidence.mockResolvedValue([]); });

describe("ordinary agency client Queue", () => {
  it.each(["0", "1"])("reads the scoped projection regardless of operator flag %s", async flag => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", flag);
    const rpc = vi.fn(async () => ({ data: page(), error: null }));
    const result = await readAgencyClientsPage(actor, agency, null, { rpc });
    expect(rpc).toHaveBeenCalledWith("agency_client_overview_v3", expect.objectContaining({ p_agency_workspace_id: agency, p_cursor: null }));
    expect(reads.systems).toHaveBeenCalledWith(actor, business, expect.objectContaining({ store: expect.anything() }));
    expect(result.clients[0]!.systems[0]!.health?.status).toBe("unknown");
  });
  it("retains exact service items and adds health through an ordinary client grant", async () => {
    const systems = vi.fn(async () => listing()), evidence = vi.fn(async () => [observation]);
    const result = await addAgencyOperatorOverview(actor, page(), { systems, evidence }, now);
    expect(systems).toHaveBeenCalledWith(actor, business);
    expect(result.queue.map(item => item.kind)).toEqual(["needs_you", "request", "health"]);
    expect(result.queue.find(item => item.kind === "health")?.href).toBe(`/workspace?view=system&system=${system}&workspaceId=${business}`);
    expect(clientSystemLabel(result.clients[0]!.systems[0]!)).toBe("Website · Live · Not working");
    expect(result.queueComplete).toBe(true);
  });
  it("does not hydrate evidence for Systems outside the portfolio's scoped rows", async () => {
    const extra = listing(crypto.randomUUID()).systems[0]!;
    const evidence = vi.fn(async (_listing: BusinessSystems, _now?: number): Promise<Observation[]> => []);
    await addAgencyOperatorOverview(actor, page(), { systems: async () => ({ ...listing(), systems: [...listing().systems, extra] }), evidence }, now);
    expect(evidence.mock.calls[0]?.[0]).toMatchObject({ systems: [{ system: { id: system } }] });
  });
  it("names failures and preserves known service rows without claiming a complete Queue", async () => {
    const result = await addAgencyOperatorOverview(actor, page(), { systems: async () => { throw new Error("revoked"); }, evidence: async () => [] }, now);
    expect(result.queue).toEqual(page().queue);
    expect(result.queueComplete).toBe(false);
    expect(result.queueGaps).toContain("Fixture: System health could not be read.");
  });
  it("keeps missing/stale evidence unknown and pagination incomplete", async () => {
    const input = page(); input.nextCursor = crypto.randomUUID();
    const result = await addAgencyOperatorOverview(actor, input, { systems: async () => listing(), evidence: async () => [{ ...observation, observedAt: new Date(now - 7200_000).toISOString() }] }, now);
    expect(result.clients[0]!.systems[0]!.health?.status).toBe("unknown");
    expect(result.queueComplete).toBe(false);
  });
});

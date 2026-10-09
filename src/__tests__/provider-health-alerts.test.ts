import { describe, expect, it, vi } from "vitest";
import { addAgencyProviderAlerts } from "@/experience/workspace/agency/provider-alerts";
import { agencyClientsPageSchema, type AgencyClientsPage } from "@/experience/workspace/agency-clients";
import type { DomainHealthSnapshot } from "@/platform/infra/domain-health";
import type { SiteHealthSnapshot } from "@/platform/operator-queue/site-coverage";

const agency = crypto.randomUUID(), business = crypto.randomUUID(), other = crypto.randomUUID(), system = crypto.randomUUID();
const now = Date.parse("2026-10-08T16:00:00Z"), at = new Date(now).toISOString();
const actor = { userId: crypto.randomUUID(), verifiedEmail: "Agency@example.test" };
function page(): AgencyClientsPage { return { agencyWorkspaceId: agency, clients: [{ workspaceId: business, name: "Fixture", reach: "member", role: "admin", provider: true,
  status: "ready", systems: [{ id: system, name: "Website", kind: "website", lifecycle: "live", versionContext: null }], needsYou: { count: 0, oldestAt: null }, openRequests: 0,
  improvementsWaiting: 0, lastReceiptAt: null }], queue: [], team: [], total: 1, nextCursor: null, providersRead: true }; }
function context() { return { workspaceIds: [business], links: [{ workspaceId: business, tenantId: "fixture", systemId: system }], alerts: [
  { id: "listing:1", workspaceId: business, systemId: null, title: "Google accepted reply; read-back failed. Do not resend.", since: at, label: "Read-back failed" },
  { id: "calendar:1", workspaceId: business, systemId: null, title: "Booking calendar needs reconnecting.", since: at, label: "Booking calendar" },
] }; }
function ports() {
  const domains: DomainHealthSnapshot = { scannedAt: at, results: [{ tenantId: "fixture", siteName: "Fixture", ownerName: "Owner", primaryHost: "fixture.example.test", worst: "down", nearestExpiryDays: 3,
    checks: [{ host: "fixture.example.test", kind: "custom", url: "https://fixture.example.test", httpStatus: 503, bytes: null, state: "down", expiresAt: at, daysToExpiry: 3,
      sslExpiresAt: at, sslDaysToExpiry: 7, checkedAt: at, latencyMs: 10 }] }] };
  const health: SiteHealthSnapshot = { checkedAt: at, results: [{ tenantId: "fixture", stableId: null, siteName: "Fixture", deliveryModel: "custom_repo", status: "blocked",
    reasons: [], lastVerifiedAt: at, stale: false, domainEvidence: "domain-monitor" }] };
  return { domains: vi.fn(async () => domains), health: vi.fn(async () => health) };
}
describe("current provider health queue", () => {
  it("shows domain, SSL, health, calendar and accepted read-back alerts without operator status", async () => {
    const rpc = vi.fn(async () => ({ data: context(), error: null }));
    const result = await addAgencyProviderAlerts(actor, page(), { rpc }, ports(), now);
    expect(rpc).toHaveBeenCalledWith("read_provider_health_alerts", { p_agency_workspace_id: agency, p_user_id: actor.userId,
      p_verified_email: "agency@example.test", p_workspace_ids: [business] });
    expect(result.queue.map(item => item.label)).toEqual(["Read-back failed", "Booking calendar", "Domain", "Domain expiry", "SSL expiry", "Site health"]);
    expect(result.queue.every(item => item.workspaceId === business && !item.href?.startsWith("/admin"))).toBe(true);
    expect(result.queueComplete).toBe(true);
  });
  it("rechecks the provider rather than trusting the page's provider mark", async () => {
    const input = page(), deps = ports();
    expect(await addAgencyProviderAlerts(actor, input, { rpc: async () => ({ data: { workspaceIds: [], links: [], alerts: [] }, error: null }) }, deps, now)).toBe(input);
    expect(deps.domains).not.toHaveBeenCalled(); expect(deps.health).not.toHaveBeenCalled();
  });
  it("never falls back to portfolio data on refused or malformed SQL", async () => {
    for (const response of [{ data: null, error: { message: "business_record_access_denied" } }, { data: { workspaceIds: [business] }, error: null }]) {
      const deps = ports(), result = await addAgencyProviderAlerts(actor, page(), { rpc: async () => response }, deps, now);
      expect(result.queue).toEqual([]); expect(result.queueComplete).toBe(false);
      expect(deps.domains).not.toHaveBeenCalled(); expect(deps.health).not.toHaveBeenCalled();
    }
  });
  it("filters wrong-business and hidden-System rows even if a response contains them", async () => {
    const data = context(); data.workspaceIds.push(other); data.links.push({ workspaceId: business, tenantId: "secret", systemId: crypto.randomUUID() });
    data.alerts.push({ id: "secret", workspaceId: other, systemId: null, title: "Private", since: at, label: "Read-back failed" });
    const result = await addAgencyProviderAlerts(actor, page(), { rpc: async () => ({ data, error: null }) }, ports(), now);
    expect(result.queue.some(item => item.title === "Private" || item.id.includes("secret"))).toBe(false);
  });
  it("reports stale and unavailable evidence while preserving receipt failures", async () => {
    const deps = ports(); const snapshot = await deps.domains(); snapshot.scannedAt = "invalid";
    deps.health.mockRejectedValue(new Error("unreachable"));
    const result = await addAgencyProviderAlerts(actor, page(), { rpc: async () => ({ data: context(), error: null }) }, deps, now);
    expect(result.queue).toHaveLength(2); expect(result.queueComplete).toBe(false); expect(result.queueGaps).toHaveLength(2);
  });
  it("keeps missing current hosted-revision evidence incomplete even with no cached tenant link", async () => {
    const deps = ports();
    const data = { workspaceIds: [business], links: [], alerts: [{ id: "hosted:1", workspaceId: business, systemId: system,
      title: "Published website revision has no matching health check.", since: at, label: "Site health", gap: "A published website revision has missing or stale health evidence." }] };
    const result = await addAgencyProviderAlerts(actor, page(), { rpc: async () => ({ data, error: null }) }, deps, now);
    expect(result.queue).toHaveLength(1); expect(result.queueComplete).toBe(false); expect(result.queueGaps).toEqual([data.alerts[0]!.gap]);
    expect(deps.domains).not.toHaveBeenCalled(); expect(deps.health).not.toHaveBeenCalled();
  });
  it("reads nothing when the page has no provider clients", async () => {
    const input = page(); input.clients[0]!.provider = false; const rpc = vi.fn(), deps = ports();
    expect(await addAgencyProviderAlerts(actor, input, { rpc }, deps, now)).toBe(input);
    expect(rpc).not.toHaveBeenCalled(); expect(deps.domains).not.toHaveBeenCalled();
  });
  it("keeps long source references within the agency page response contract", async () => {
    const data = context(); data.alerts[0]!.id = `domain:${"a".repeat(220)}`;
    const result = await addAgencyProviderAlerts(actor, page(), { rpc: async () => ({ data, error: null }) }, ports(), now);
    expect(agencyClientsPageSchema.safeParse(result).success).toBe(true);
  });
});

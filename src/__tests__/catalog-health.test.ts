import { describe, expect, it } from "vitest";
import { searchConsoleObservation, trafficObservation } from "@/platform/system-health/catalog-observations";
import { deriveSystemHealth } from "@/platform/system-health/derive";
import { projectWorkspaceSystems } from "@/experience/systems/server";
import { systemsFromExisting } from "@/platform/systems/from-existing";

const at = "2026-10-06T12:00:00.000Z";
const now = Date.parse(at);
describe("website traffic and Search Console health", () => {
  it("unreachable reads stay unavailable with a first-failure date, never zero", () => {
    const observation = searchConsoleObservation("website", { status: "unreachable", checkedAt: at, unreachableSince: "2026-10-01T12:00:00.000Z", clicks: null, impressions: null });
    expect(observation.outcome).toBe("unknown");
    expect(observation.message).toContain("not reachable since 2026-10-01");
    expect(observation.message).not.toContain("0 clicks");
    expect(searchConsoleObservation("website", null).outcome).toBe("unknown");
    expect(trafficObservation("website", null).outcome).toBe("unknown");
  });
  it("shows measured zeros only when a reachable read supplied them", () => {
    expect(searchConsoleObservation("website", { status: "available", checkedAt: at, unreachableSince: null, clicks: 0, impressions: 0 })).toMatchObject({ outcome: "pass", message: "Search Console: 0 clicks and 0 impressions in the last seven days." });
  });
  it("traffic drops and stale Search Console evidence never rewrite lifecycle", () => {
    const daily = Array.from({ length: 28 }, (_, i) => ({ date: new Date(now - (27 - i) * 86400_000).toISOString().slice(0, 10), pageViews: i < 21 ? 10 : 1, bookingClicks: 0 }));
    const traffic = trafficObservation("website", daily);
    expect(traffic.outcome).toBe("warn");
    const result = deriveSystemHealth({ systems: [{ id: "website", businessId: "business", name: "Website", kind: "website", lifecycle: "paused", operation: "ongoing" }], resources: [], connections: [], observations: [traffic, searchConsoleObservation("website", { status: "available", checkedAt: "2026-10-01T12:00:00.000Z", unreachableSince: null, clicks: 20, impressions: 100 })] }, now).get("website")!;
    expect(result.lifecycle).toBe("paused");
    expect(result.stale).toBe(true);
  });
  it("projects traffic, reachability and the read contract beside the website", async () => {
    const listing = systemsFromExisting({ businessId: "11111111-1111-4111-8111-111111111111", savedWork: [], managedWebsites: [{ link: "tenant_link", tenantStableId: "22222222-2222-4222-8222-222222222222", tenantId: "site", siteName: "Site", tenantActive: true, linkedAt: at }], inquiryWorkspaces: [], bookingGrants: [], calendarConnections: [] });
    const id = listing.systems[0]!.system.id;
    const projection = await projectWorkspaceSystems({ listing, siteDomains: new Map(), candidates: [], observations: [trafficObservation(id, null), searchConsoleObservation(id, null)], actorId: "actor", now });
    expect(projection.systems[0]!.health.signals).toContain("Traffic trend is unavailable; this is not zero visits.");
    expect(projection.connections).toContainEqual(expect.objectContaining({ sourceId: id, kind: "read", targetLabel: "Google Search Console", state: "stale", purpose: expect.stringContaining("Source of truth: Google. Freshness: daily, 07:00 UTC.") }));
    expect(projection.systems[0]!.lifecycle).toBe("live");
    const stale = await projectWorkspaceSystems({ listing, siteDomains: new Map(), candidates: [], observations: [searchConsoleObservation(id, { status: "available", checkedAt: "2026-10-01T00:00:00Z", unreachableSince: null, clicks: 10, impressions: 100 })], actorId: "actor", now });
    expect(stale.connections[0]!.state).toBe("stale");
  });
});

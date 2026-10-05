import { describe, expect, it } from "vitest";
import type { HeartbeatStatus } from "@/lib/heartbeat";
import {
  deriveBusinessHealth,
  deriveSystemHealth,
  healthGraphFromSystems,
  inquiryCapabilityObservation,
  type BusinessEvidence,
} from "@/platform/system-health";
import { systemsFromExisting } from "@/platform/systems";

const now = Date.parse("2026-10-04T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

const heartbeats: HeartbeatStatus[] = ["domain-monitor", "portfolio-scan", "inquiry-follow-ups"].map(cron => ({
  cron, lastSeen: minutesAgo(10), ageSeconds: 600, maxAgeSeconds: 99_999, stale: false, lastOk: true,
}));

function evidence(overrides: Partial<BusinessEvidence> = {}): BusinessEvidence {
  return {
    businessId: "business-1",
    website: {
      id: "website",
      name: "Northstar Roofing website",
      domain: {
        tenantId: "northstar", siteName: "Northstar Roofing", ownerName: "Dana", primaryHost: "northstarroofing.com", worst: "up", nearestExpiryDays: 200,
        checks: [{ host: "northstarroofing.com", kind: "custom", url: "https://northstarroofing.com", httpStatus: 200, bytes: 40_000, state: "up", expiresAt: "2027-04-20", daysToExpiry: 200, checkedAt: minutesAgo(20), latencyMs: 300 }],
      },
      domainScannedAt: minutesAgo(20),
      scan: { scannedAt: minutesAgo(600), grade: "B", overallScore: 84 },
    },
    heartbeats,
    bookings: [{
      id: "bookings",
      name: "Roof inspections",
      paused: false,
      provider: "google",
      calendar: { provider: "google", calendarName: "Inspections", status: "connected", tokenExpiresAt: null, lastCheckedAt: minutesAgo(30), lastError: null, updatedAt: minutesAgo(30) },
      obligations: { expiredHolds: [], needsRecovery: [] },
      readAt: minutesAgo(1),
    }],
    inquiries: [{ id: "inquiries", name: "Quote requests", capability: { status: "live", updatedAt: minutesAgo(60) } }],
    accounts: [{ id: "google-business", name: "Google Business Profile", connection: { provider: "google_business", status: "connected", lastSyncedAt: minutesAgo(120) } as never }],
    ...overrides,
  };
}

describe("system health stays separate from lifecycle", () => {
  it("reports a fully verified business as healthy and live", () => {
    const health = deriveBusinessHealth(evidence(), now);
    for (const id of ["website", "bookings", "inquiries"]) {
      expect(health.get(id)).toMatchObject({ lifecycle: "live", status: "healthy", stale: false });
    }
    expect(health.get("website")!.lastVerifiedAt).toBe(minutesAgo(10));
    expect(health.get("website")!.connections).toEqual([{ connectionId: "website->google-business", to: "google-business", kind: "read", state: "connected" }]);
  });

  it("keeps a Live booking System live while a revoked calendar degrades it", () => {
    const base = evidence();
    const health = deriveBusinessHealth({ ...base, bookings: [{ ...base.bookings![0]!, calendar: { ...base.bookings![0]!.calendar!, status: "revoked" } }] }, now);
    const bookings = health.get("bookings")!;
    expect(bookings.lifecycle).toBe("live");
    expect(bookings.availability.acceptsNew).toBe(true);
    expect(bookings.status).toBe("degraded");
    expect(bookings.reasons).toContainEqual(expect.objectContaining({ code: "dependency_blocked", via: { connectionId: "bookings->calendar", subjectId: "bookings:calendar" } }));
    expect(bookings.connections.find(item => item.kind === "depend")).toMatchObject({ state: "disconnected", reason: expect.stringMatching(/Reconnect/) });
    // A broken booking widget degrades the website it appears on.
    expect(health.get("website")!.status).toBe("degraded");
    expect(health.get("website")!.reasons).toContainEqual(expect.objectContaining({ code: "projection_stale", effect: "degraded" }));
  });

  it("treats a pause as intended: healthy, takes nothing new, keeps obligations, marks the website section stale", () => {
    const base = evidence();
    const health = deriveBusinessHealth({ ...base, bookings: [{ ...base.bookings![0]!, paused: true }] }, now);
    const bookings = health.get("bookings")!;
    expect(bookings).toMatchObject({ lifecycle: "paused", status: "healthy", availability: { acceptsNew: false, readable: true, keepsObligations: true } });
    expect(bookings.connections.find(item => item.kind === "appear")).toMatchObject({ state: "stale" });
    const website = health.get("website")!;
    expect(website.status).toBe("healthy");
    expect(website.reasons).toContainEqual(expect.objectContaining({ code: "projection_stale", effect: "notice", message: expect.stringMatching(/Roof inspections is paused/) }));
  });

  it("keeps a paused System's own failures visible instead of hiding them behind the pause", () => {
    const base = evidence();
    const health = deriveBusinessHealth({ ...base, bookings: [{ ...base.bookings![0]!, paused: true, calendar: { ...base.bookings![0]!.calendar!, status: "revoked" } }] }, now);
    expect(health.get("bookings")).toMatchObject({ lifecycle: "paused", status: "degraded" });
  });

  it("refuses to call old evidence healthy", () => {
    const base = evidence();
    const old = minutesAgo(3 * 60);
    const health = deriveBusinessHealth({
      ...base,
      website: { ...base.website!, domain: { ...base.website!.domain!, checks: base.website!.domain!.checks.map(check => ({ ...check, checkedAt: old })) } },
      heartbeats: heartbeats.map(item => item.cron === "domain-monitor" ? { ...item, lastSeen: old } : item),
    }, now);
    const website = health.get("website")!;
    expect(website.status).toBe("unknown");
    expect(website.stale).toBe(true);
    expect(website.reasons.filter(reason => reason.code === "evidence_stale").map(reason => reason.signal).sort()).toEqual(["cron.domain-monitor", "domain.expiry", "domain.uptime"]);
  });

  it("blocks a website whose domain is parked and warns before the registration lapses", () => {
    const base = evidence();
    const parked = deriveBusinessHealth({ ...base, website: { ...base.website!, domain: { ...base.website!.domain!, worst: "parked" } } }, now);
    expect(parked.get("website")).toMatchObject({ status: "blocked", lifecycle: "live" });
    const expiring = deriveBusinessHealth({ ...base, website: { ...base.website!, domain: { ...base.website!.domain!, nearestExpiryDays: 12 } } }, now);
    expect(expiring.get("website")!.status).toBe("degraded");
    expect(expiring.get("website")!.reasons[0]!.message).toMatch(/expires in 12 days/);
  });

  it("treats a dead monitor as unknown, not healthy", () => {
    const health = deriveBusinessHealth({ ...evidence(), heartbeats: [] }, now);
    expect(health.get("website")!.status).toBe("unknown");
    expect(health.get("inquiries")!.status).toBe("unknown");
  });

  it("separates an inquiry form's lifecycle from its verification", () => {
    const unverified = deriveBusinessHealth({ ...evidence(), inquiries: [{ id: "inquiries", name: "Quote requests", capability: { status: "live_unverified", updatedAt: minutesAgo(5) } }] }, now);
    expect(unverified.get("inquiries")).toMatchObject({ lifecycle: "live", status: "degraded" });
    const paused = deriveBusinessHealth({ ...evidence(), inquiries: [{ id: "inquiries", name: "Quote requests", capability: { status: "paused", updatedAt: minutesAgo(5) } }] }, now);
    expect(paused.get("inquiries")).toMatchObject({ lifecycle: "paused", status: "healthy" });
  });

  it("flags expired holds and unknown provider writes for a person", () => {
    const base = evidence();
    const holds = deriveBusinessHealth({ ...base, bookings: [{ ...base.bookings![0]!, obligations: { expiredHolds: [{}], needsRecovery: [] } }] }, now);
    expect(holds.get("bookings")!.reasons[0]!.message).toMatch(/1 hold\(s\) passed/);
    expect(holds.get("bookings")!.status).toBe("degraded");
  });

  it("marks a needs-reauth Google account disconnected without changing website lifecycle", () => {
    const health = deriveBusinessHealth({ ...evidence(), accounts: [{ id: "google-business", name: "Google Business Profile", connection: { provider: "google_business", status: "needs_reauth", lastSyncedAt: minutesAgo(5000) } as never }] }, now);
    const website = health.get("website")!;
    expect(website.connections[0]).toMatchObject({ state: "disconnected", reason: expect.stringMatching(/reconnected/) });
    // `read` connections report state; only `depend` propagates health.
    expect(website.status).toBe("healthy");
  });

  it("keeps a retained static report readable while paused, with no running worker", () => {
    const health = deriveBusinessHealth({ businessId: "business-1", documents: [{ id: "report", name: "Roof condition report", kind: "inspection_report", lifecycle: "paused" }] }, now);
    expect(health.get("report")).toMatchObject({ lifecycle: "paused", status: "healthy", availability: { readable: true, acceptsNew: false }, lastVerifiedAt: null, reasons: [] });
  });
});

describe("dependency propagation", () => {
  const system = (id: string, lifecycle: "draft" | "live" | "paused" = "live") => ({ id, businessId: "b", name: id, kind: "custom", lifecycle, operation: "ongoing" as const });
  const pass = (subjectId: string) => ({ subjectId, signal: "check", outcome: "pass" as const, observedAt: minutesAgo(1), maxAgeSeconds: 3600, source: "heartbeat" as const, message: "ok" });

  it("degrades every System upstream of a failure, transitively", () => {
    const health = deriveSystemHealth({
      systems: [system("portal"), system("pricing"), system("proposal")],
      resources: [{ id: "stripe", businessId: "b", name: "Stripe account", kind: "connected_account" }],
      connections: [
        { id: "c1", from: "portal", to: "pricing", kind: "depend" },
        { id: "c2", from: "pricing", to: "stripe", kind: "depend" },
        { id: "c3", from: "proposal", to: "pricing", kind: "read" },
      ],
      observations: [pass("portal"), pass("pricing"), pass("proposal"), { ...pass("stripe"), outcome: "fail", impact: "blocking", message: "Stripe key revoked" }],
    }, now);
    expect(health.get("pricing")!.status).toBe("degraded");
    expect(health.get("portal")!.status).toBe("degraded");
    expect(health.get("portal")!.reasons[0]).toMatchObject({ code: "dependency_degraded", via: { subjectId: "pricing" } });
    expect(health.get("proposal")!.status).toBe("healthy");
  });

  it("reports a draft dependency as not live, and a missing one as blocked", () => {
    const health = deriveSystemHealth({
      systems: [system("site"), system("calculator", "draft")],
      connections: [{ id: "c1", from: "site", to: "calculator", kind: "depend" }, { id: "c2", from: "site", to: "deleted", kind: "depend" }],
      observations: [pass("site"), pass("calculator")],
    }, now);
    const site = health.get("site")!;
    expect(site.status).toBe("blocked");
    expect(site.connections.map(item => item.state)).toEqual(["stale", "disconnected"]);
    expect(site.reasons.map(reason => reason.code)).toEqual(["dependency_not_live", "dependency_missing"]);
  });

  it("does not loop on a dependency cycle", () => {
    const health = deriveSystemHealth({
      systems: [system("a"), system("b")],
      connections: [{ id: "ab", from: "a", to: "b", kind: "depend" }, { id: "ba", from: "b", to: "a", kind: "depend" }],
      observations: [pass("a"), pass("b")],
    }, now);
    expect(health.get("a")!.status).not.toBe("healthy");
    expect(health.size).toBe(2);
  });

  it("calls an ongoing System with no evidence unknown", () => {
    const health = deriveSystemHealth({ systems: [system("lead-ops")], connections: [], observations: [] }, now);
    expect(health.get("lead-ops")).toMatchObject({ status: "unknown", reasons: [{ code: "no_evidence" }] });
  });
});

describe("health over the spine's Systems and Connections", () => {
  const BUSINESS = "5e000000-0000-4000-8000-000000000010";
  const TENANT = "5e000000-0000-4000-8000-0000000000b2";
  const INQUIRY = "5e000000-0000-4000-8000-0000000000c1";
  const CALENDAR = "5e000000-0000-4000-8000-0000000000e1";
  const AT = minutesAgo(30);
  const projected = (capabilityStatus: "live" | "failed" | "paused") => systemsFromExisting({
    businessId: BUSINESS,
    savedWork: [{ id: "5e000000-0000-4000-8000-0000000000a3", productId: "scheduling", resourceKind: "schedule", title: "Tastings", createdAt: AT, updatedAt: AT }],
    managedWebsites: [{ link: "tenant_link", tenantStableId: TENANT, tenantId: "juniper-catering", siteName: "Juniper Catering", tenantActive: true, linkedAt: AT }],
    inquiryWorkspaces: [{ id: INQUIRY, tenantStableId: TENANT, businessId: "default", createdAt: AT, updatedAt: AT, capabilityStatus }],
    bookingGrants: [],
    calendarConnections: [{ id: CALENDAR, provider: "google", calendarName: "Front desk", status: "revoked" }],
  });

  it("keeps a failed inquiry form Live and reports the failure as health, on the site too", () => {
    const { systems, connections } = projected("failed");
    const inquiry = systems.find(({ system }) => system.kind === "inquiry")!.system;
    const site = systems.find(({ system }) => system.kind === "website")!.system;
    expect(inquiry.lifecycle).toBe("live");
    const graph = healthGraphFromSystems({
      systems: systems.map(({ system }) => system),
      connections: connections.map(({ connection }) => connection),
      observations: [inquiryCapabilityObservation(inquiry.id, { status: "failed", updatedAt: minutesAgo(5) })],
    });
    // The revoked calendar's spine Connection is disconnected, so health does not walk it.
    expect(graph.connections.map((c) => c.kind)).toEqual(["appear"]);
    const health = deriveSystemHealth(graph, now);
    expect(health.get(inquiry.id)).toMatchObject({ lifecycle: "live", status: "blocked", availability: { acceptsNew: true } });
    expect(health.get(site.id)!.reasons).toContainEqual(expect.objectContaining({ code: "projection_stale", effect: "degraded" }));
  });

  it("treats a paused inquiry form as intent: a notice on the site, not a failure", () => {
    const { systems, connections } = projected("paused");
    const inquiry = systems.find(({ system }) => system.kind === "inquiry")!.system;
    const site = systems.find(({ system }) => system.kind === "website")!.system;
    expect(inquiry.lifecycle).toBe("paused");
    const health = deriveSystemHealth(healthGraphFromSystems({
      systems: systems.map(({ system }) => system),
      connections: connections.map(({ connection }) => connection),
      observations: [inquiryCapabilityObservation(inquiry.id, { status: "paused", updatedAt: minutesAgo(5) })],
    }), now);
    expect(health.get(inquiry.id)).toMatchObject({ lifecycle: "paused", status: "healthy", availability: { acceptsNew: false, keepsObligations: true } });
    expect(health.get(site.id)!.reasons).toContainEqual(expect.objectContaining({ code: "projection_stale", effect: "notice" }));
  });
});

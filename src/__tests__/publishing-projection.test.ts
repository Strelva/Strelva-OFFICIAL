import { describe, expect, it } from "vitest";
import { systemsFromExisting } from "@/platform/systems/from-existing";
import { systemOriginId } from "@/platform/systems/invariants";
import { addPublishingSystems, type PublishingSnapshot } from "@/products/publishing/projection";
import { listingHealth, listingObservation } from "@/products/google-listing/health";

// Publishing in the Systems model: Google listing and newsletter as their own
// Systems, blog and collections as parts of the website. Fictional fixtures.

const BUSINESS = "ab000000-0000-4000-8000-000000000010";
const MOONEY = "ab000000-0000-4000-8000-0000000000b1";
const UPTOWN = "ab000000-0000-4000-8000-0000000000b2";
const BINDING = "ab000000-0000-4000-8000-0000000000d1";
const NOW = Date.parse("2026-10-06T15:00:00Z");

const base = systemsFromExisting({
  businessId: BUSINESS, savedWork: [], inquiryWorkspaces: [], bookingGrants: [], calendarConnections: [],
  managedWebsites: [
    { link: "tenant_link", tenantStableId: MOONEY, tenantId: "mooney", siteName: "attymooney.com", tenantActive: true, linkedAt: "2026-10-01T00:00:00Z" },
    { link: "tenant_link", tenantStableId: UPTOWN, tenantId: "mooney-uptown", siteName: "Mooney Uptown", tenantActive: true, linkedAt: "2026-10-01T00:00:00Z" },
  ],
});

function binding(over: Record<string, unknown> = {}) {
  return {
    id: BINDING, workspaceId: BUSINESS, provider: "google" as const, subject: null, originTenantStableId: MOONEY, originTenantId: "mooney",
    scopes: ["https://www.googleapis.com/auth/business.manage", "https://www.googleapis.com/auth/webmasters.readonly"],
    tokenExpiresAt: null, status: "connected" as const, lastCheckedAt: "2026-10-06T12:00:00Z", lastError: null, migratedFrom: "redis" as const,
    createdAt: "2026-10-06T00:00:00Z", updatedAt: "2026-10-06T00:00:00Z",
    locations: [{ accountId: "accounts/111", locationId: "333", title: "The Mooney Firm", isPrimary: true }],
    ...over,
  };
}

function snapshot(over: Partial<PublishingSnapshot> = {}): PublishingSnapshot {
  return { businessId: BUSINESS, scope: "business", bindings: [binding()], receipts: [], ...over };
}

describe("the Google listing System", () => {
  it("shows a connected tenant's listing by its profile name, Live, with its Connections", () => {
    const out = addPublishingSystems(base, snapshot(), { now: NOW });
    const listing = out.listing.systems.find((item) => item.system.kind === "listing")!;
    expect(listing.system).toMatchObject({ name: "The Mooney Firm", lifecycle: "live", origin: { kind: "google_location", ref: `${BINDING}:333` } });
    expect(listing.system.id).toBe(systemOriginId(BUSINESS, { kind: "google_location", ref: `${BINDING}:333` }));
    const mine = out.listing.connections.filter(({ connection }) => connection.source.systemId === listing.system.id).map(({ connection }) => connection);
    expect(mine.find((c) => c.kind === "act")?.target).toEqual({ type: "account_binding", bindingId: `google:${BINDING}` });
    expect(mine.filter((c) => c.kind === "read").map((c) => c.target)).toContainEqual({ type: "business_resource", resource: "business_record:hours" });
    const website = out.listing.systems.find((item) => item.references.tenantId === "mooney" && item.system.kind === "website")!;
    expect(out.listing.connections.some(({ connection }) => connection.source.systemId === website.system.id && connection.kind === "read"
      && connection.target.type === "account_binding")).toBe(true);
    expect(out.listings[0]).toMatchObject({ health: "ok" });
  });

  it("is additive: every existing System keeps its id and place", () => {
    const out = addPublishingSystems(base, snapshot(), { now: NOW });
    expect(out.listing.systems.slice(0, base.systems.length)).toEqual(base.systems);
  });

  it("offers Connect Google for a site with no grant, instead of an empty listing", () => {
    const out = addPublishingSystems(base, snapshot(), { now: NOW });
    expect(out.offers).toEqual([expect.objectContaining({ kind: "connect_google", label: "Connect Google to manage Mooney Uptown on Google" })]);
    const none = addPublishingSystems(base, snapshot({ bindings: [] }), { now: NOW });
    expect(none.listing.systems.some((item) => item.system.kind === "listing")).toBe(false);
    expect(none.offers).toHaveLength(2);
  });

  it("a disconnected grant changes health, not lifecycle", () => {
    const out = addPublishingSystems(base, snapshot({ bindings: [binding({ status: "needs_reauth" })] }), { now: NOW });
    expect(out.listing.systems.find((item) => item.system.kind === "listing")?.system.lifecycle).toBe("live");
    expect(out.listings[0]?.health).toBe("google_disconnected");
    expect(out.listing.connections.find(({ connection }) => connection.kind === "act")?.connection.state).toBe("disconnected");
    expect(out.observations[0]).toMatchObject({ outcome: "fail", impact: "blocking" });
  });

  it("a grant with no location yet makes no listing System", () => {
    const out = addPublishingSystems(base, snapshot({ bindings: [binding({ locations: [] })] }), { now: NOW });
    expect(out.listing.systems.some((item) => item.system.kind === "listing")).toBe(false);
    expect(out.offers).toHaveLength(1);
  });

  it("an agency sees no business-level publishing", () => {
    const out = addPublishingSystems(base, snapshot({ scope: "assigned" }), { now: NOW });
    expect(out.listing.systems.some((item) => item.system.kind === "listing")).toBe(false);
    expect(out.offers).toEqual([]);
  });
});

describe("listing health", () => {
  const input = (over: Record<string, unknown> = {}, receipts: Array<{ status: never; error: string | null; createdAt: string }> = []) =>
    ({ binding: { status: "connected" as const, scopes: null, lastCheckedAt: "2026-10-06T12:00:00Z", ...over }, receipts, now: NOW });

  it("names each state", () => {
    expect(listingHealth(input()).health).toBe("ok");
    expect(listingHealth(input({ status: "revoked" })).health).toBe("google_disconnected");
    expect(listingHealth(input({ scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] })).health).toBe("scope_missing");
    expect(listingHealth(input({ lastCheckedAt: "2026-10-03T00:00:00Z" })).health).toBe("stale");
    expect(listingHealth(input({ lastCheckedAt: null })).health).toBe("stale");
    expect(listingHealth(input({}, [{ status: "failed" as never, error: "Google API access is still pending.", createdAt: "x" }])).health).toBe("api_access_pending");
    expect(listingHealth(input({}, [{ status: "held_by_google" as never, error: null, createdAt: "x" }])).health).toBe("edits_pending");
    expect(listingHealth({ ...input(), suspended: true }).health).toBe("profile_suspended");
  });

  it("access pending is a warning, not a failure", () => {
    expect(listingObservation("s", input({}, [{ status: "failed" as never, error: "Google API access is still pending.", createdAt: "x" }])).outcome).toBe("warn");
  });
});

describe("the newsletter System and website parts", () => {
  it("makes a newsletter System only for a site with active subscribers", () => {
    const out = addPublishingSystems(base, snapshot(), { now: NOW, newsletters: [{ tenantId: "mooney", activeSubscribers: 42 }, { tenantId: "mooney-uptown", activeSubscribers: 0 }] });
    const newsletters = out.listing.systems.filter((item) => item.system.kind === "newsletter");
    expect(newsletters.map((item) => item.system.name)).toEqual(["attymooney.com newsletter"]);
    expect(newsletters[0]!.system.origin).toEqual({ kind: "tenant_newsletter", ref: MOONEY });
    expect(newsletters[0]!.basis).toContain("42 active subscribers");
    const targets = out.listing.connections.filter(({ connection }) => connection.source.systemId === newsletters[0]!.system.id).map(({ connection }) => connection.target.type);
    expect(targets.sort()).toEqual(["audience", "system"]);
  });

  it("lists blog and collections as parts of the website System, not Systems", () => {
    const out = addPublishingSystems(base, snapshot(), { now: NOW, collections: [{ tenantId: "mooney", types: [{ type: "blog", published: 12, drafts: 1 }, { type: "videos", published: 0, drafts: 0 }] }] });
    const website = out.listing.systems.find((item) => item.references.tenantId === "mooney" && item.system.kind === "website")!;
    expect(out.websiteParts[website.system.id]).toEqual([{ kind: "collection", type: "blog", label: "Blog", published: 12, drafts: 1 }]);
    expect(out.listing.systems.some((item) => item.system.kind === "blog")).toBe(false);
  });
});

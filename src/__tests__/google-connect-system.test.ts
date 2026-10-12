import { describe, expect, it } from "vitest";
import { systemsFromExisting } from "@/platform/systems/from-existing";
import { systemOriginId } from "@/platform/systems/invariants";
import { addPublishingSystems } from "@/products/publishing/projection";

const BUSINESS = "ab000000-0000-4000-8000-000000000020";
const BINDING = "ab000000-0000-4000-8000-0000000000e1";
const base = systemsFromExisting({ businessId: BUSINESS, savedWork: [], inquiryWorkspaces: [], bookingGrants: [], calendarConnections: [], managedWebsites: [] });

describe("an owner-connected Google listing is a brought-in System", () => {
  it("appears with origin google_location for a native grant with no website or tenant", () => {
    const out = addPublishingSystems(base, { businessId: BUSINESS, scope: "business", receipts: [], bindings: [{
      id: BINDING, workspaceId: BUSINESS, provider: "google", subject: "g-1", originTenantStableId: null, originTenantId: null,
      scopes: ["openid", "https://www.googleapis.com/auth/business.manage"], tokenExpiresAt: null, status: "connected", lastCheckedAt: null, lastError: null,
      migratedFrom: "oauth", createdAt: "2026-10-12T00:00:00Z", updatedAt: "2026-10-12T00:00:00Z",
      locations: [{ accountId: "accounts/123", locationId: "456", title: "Synthetic Bakery", isPrimary: true }],
    }] }, { now: Date.parse("2026-10-12T01:00:00Z") });
    const listing = out.listing.systems.find(item => item.system.kind === "listing")!;
    expect(listing.system).toMatchObject({ name: "Synthetic Bakery", origin: { kind: "google_location", ref: `${BINDING}:456` } });
    expect(listing.system.id).toBe(systemOriginId(BUSINESS, { kind: "google_location", ref: `${BINDING}:456` }));
    expect(out.listing.connections.some(item => item.connection.source.systemId === listing.system.id && item.connection.kind === "act")).toBe(true);
  });
});

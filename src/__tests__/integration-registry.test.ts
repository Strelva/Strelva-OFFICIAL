import { describe, expect, it } from "vitest";
import {
  DISCOVERABLE_INTEGRATIONS,
  filterIntegrations,
  getIntegrationDefinition,
  normalizeIntegrationStatus,
} from "../lib/integration-registry";

describe("integration registry", () => {
  it("uses one discoverable registry for list and detail entries", () => {
    expect(getIntegrationDefinition("google-search-console")).toBeDefined();
    expect(getIntegrationDefinition("vegaro")).toBeDefined();
    expect(DISCOVERABLE_INTEGRATIONS.map((integration) => integration.id)).toEqual(
      expect.arrayContaining(["google-search-console", "vegaro"])
    );
  });

  it("filters by display name, provider id, id, and description", () => {
    expect(filterIntegrations(DISCOVERABLE_INTEGRATIONS, "Search Console").map((i) => i.id)).toEqual([
      "google-search-console",
    ]);
    expect(filterIntegrations(DISCOVERABLE_INTEGRATIONS, "vegaro").map((i) => i.id)).toEqual([
      "vegaro",
    ]);
    expect(filterIntegrations(DISCOVERABLE_INTEGRATIONS, "reviews").map((i) => i.id)).toEqual(
      expect.arrayContaining(["google-business", "yelp"])
    );
  });

  it("does not mark Google Analytics connected without a real source of truth", () => {
    const analytics = getIntegrationDefinition("google-analytics");
    expect(analytics).toBeDefined();
    expect(normalizeIntegrationStatus(analytics!)).toBe("not_configured");
  });

  it("derives newsletter status from tenant settings instead of static metadata", () => {
    const newsletter = getIntegrationDefinition("newsletter");
    expect(newsletter).toBeDefined();
    expect(
      normalizeIntegrationStatus(newsletter!, {
        settings: { newsletter: true },
        settingsLoaded: true,
      })
    ).toBe("connected");
    expect(
      normalizeIntegrationStatus(newsletter!, {
        settings: { newsletter: false },
        settingsLoaded: true,
      })
    ).toBe("not_configured");
  });

  it("normalizes connection errors without false connected states", () => {
    const yelp = getIntegrationDefinition("yelp");
    expect(yelp).toBeDefined();
    expect(
      normalizeIntegrationStatus(yelp!, {
        connection: { provider: "yelp", connected: false, status: "error" },
        connectionLoaded: true,
      })
    ).toBe("sync_failed");
    expect(
      normalizeIntegrationStatus(yelp!, {
        connection: { provider: "yelp", connected: false, status: "needs_reauth" },
        connectionLoaded: true,
      })
    ).toBe("needs_reauth");
  });
});

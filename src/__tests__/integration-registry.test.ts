import { describe, expect, it } from "vitest";
import {
  DISCOVERABLE_INTEGRATIONS,
  deriveIntelligenceStatus,
  filterIntegrations,
  getIntegrationDefinition,
  normalizeIntegrationStatus,
} from "../lib/integration-registry";

describe("integration registry", () => {
  it("uses one discoverable registry for list and detail entries", () => {
    expect(getIntegrationDefinition("google-search-console")).toBeDefined();
    expect(getIntegrationDefinition("yelp")).toBeDefined();
    expect(DISCOVERABLE_INTEGRATIONS.map((integration) => integration.id)).toEqual(
      expect.arrayContaining(["google-search-console", "yelp"])
    );
    // Vegaro was previously included as a `coming_soon` placeholder. It was
    // removed to keep the Sources page honest — re-add this assertion when
    // the integration is actually built.
    expect(getIntegrationDefinition("vegaro")).toBeUndefined();
  });

  it("filters by display name, provider id, id, and description", () => {
    expect(filterIntegrations(DISCOVERABLE_INTEGRATIONS, "Search Console").map((i) => i.id)).toEqual([
      "google-search-console",
    ]);
    expect(filterIntegrations(DISCOVERABLE_INTEGRATIONS, "yelp").map((i) => i.id)).toEqual([
      "yelp",
    ]);
    expect(filterIntegrations(DISCOVERABLE_INTEGRATIONS, "reviews").map((i) => i.id)).toEqual(
      expect.arrayContaining(["google-business", "yelp"])
    );
  });

  it("does not mark external sources connected without a real source of truth", () => {
    const searchConsole = getIntegrationDefinition("google-search-console");
    expect(searchConsole).toBeDefined();
    expect(normalizeIntegrationStatus(searchConsole!)).toBe("not_configured");
    expect(deriveIntelligenceStatus(searchConsole!, "not_configured")).toBe("no_signal");
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

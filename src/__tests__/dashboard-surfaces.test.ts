import { describe, it, expect } from "vitest";
import {
  getDashboardSurfaces,
  getVisibleSurfaces,
  getPresenceProfile,
  tenantHasStore,
  getWebsiteSections,
  type DashboardSurface,
  type SurfaceId,
} from "../lib/dashboard-surfaces";
import type { Connection } from "../lib/types";

function conn(provider: Connection["provider"], status: Connection["status"] = "connected"): Connection {
  return { provider, tenantId: "t", accessToken: "x", status };
}

const at = (surfaces: DashboardSurface[], id: SurfaceId) => surfaces.find((s) => s.id === id)!;

describe("getPresenceProfile", () => {
  it("classifies local templates as local", () => {
    for (const template of ["wellness", "restaurant", "trades", "professional"]) {
      expect(getPresenceProfile({ template })).toBe("local");
    }
  });

  it("classifies online templates as online", () => {
    for (const template of ["food-brand", "fashion-stylist"]) {
      expect(getPresenceProfile({ template })).toBe("online");
    }
  });

  it("defaults an unknown template to local", () => {
    expect(getPresenceProfile({ template: "something-new" })).toBe("local");
  });

  it("honors an explicit businessModel override over the template", () => {
    expect(getPresenceProfile({ template: "wellness", businessModel: "online" })).toBe("online");
    expect(getPresenceProfile({ template: "food-brand", businessModel: "local" })).toBe("local");
    expect(getPresenceProfile({ template: "food-brand", businessModel: "hybrid" })).toBe("hybrid");
  });

  it('falls back to template inference when businessModel is "" (not answered) or unrecognized', () => {
    expect(getPresenceProfile({ template: "wellness", businessModel: "" })).toBe("local");
    expect(getPresenceProfile({ template: "food-brand", businessModel: "" })).toBe("online");
    expect(getPresenceProfile({ template: "food-brand", businessModel: "storefront" })).toBe("online");
  });
});

describe("getDashboardSurfaces — the 6-item conditional nav", () => {
  it("emits exactly the target surface set in order", () => {
    const ids = getDashboardSurfaces({ tenantConfig: { template: "wellness" }, connections: [] }).map((s) => s.id);
    expect(ids).toEqual(["today", "ask-ai", "website", "google-business", "analytics", "reviews"]);
  });

  it("uses owner-language labels (Today / Ask Strelva / Analytics)", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "wellness" }, connections: [] });
    expect(at(s, "today").label).toBe("Today");
    expect(at(s, "ask-ai").label).toBe("Ask Strelva");
    expect(at(s, "website").label).toBe("Website");
    expect(at(s, "google-business").label).toBe("Google Business");
    expect(at(s, "analytics").label).toBe("Analytics");
    expect(at(s, "reviews").label).toBe("Reviews");
  });

  it("points Analytics at the merged /dashboard/analytics surface", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "wellness" }, connections: [] });
    expect(at(s, "analytics").href).toBe("/dashboard/analytics");
    expect(at(s, "analytics").state).toBe("shown");
  });

  it("no longer exposes Leads, Store, or Health as top-level surfaces", () => {
    const ids = getDashboardSurfaces({ tenantConfig: { template: "food-brand", features: ["commerce"] }, connections: [] }).map((s) => s.id);
    expect(ids).not.toContain("leads");
    expect(ids).not.toContain("store");
    expect(ids).not.toContain("health");
  });
});

describe("getDashboardSurfaces — businessModel drives the presence tabs", () => {
  it('businessModel="online" hides Google Business and Reviews even on a local template', () => {
    const s = getDashboardSurfaces({
      tenantConfig: { template: "wellness", businessModel: "online" },
      connections: [],
    });
    expect(at(s, "google-business").state).toBe("hidden");
    expect(at(s, "reviews").state).toBe("hidden");
  });

  it('businessModel="local" surfaces Google Business and Reviews even on an online template', () => {
    const s = getDashboardSurfaces({
      tenantConfig: { template: "food-brand", businessModel: "local" },
      connections: [],
    });
    expect(at(s, "google-business").state).toBe("connect");
    expect(at(s, "reviews").state).toBe("connect");
  });

  it("unset businessModel infers from the template", () => {
    const local = getDashboardSurfaces({ tenantConfig: { template: "wellness" }, connections: [] });
    expect(at(local, "google-business").state).toBe("connect");
    const online = getDashboardSurfaces({ tenantConfig: { template: "food-brand" }, connections: [] });
    expect(at(online, "google-business").state).toBe("hidden");
  });
});

describe("getDashboardSurfaces — Google Business", () => {
  it("is hidden for an online brand", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "food-brand" }, connections: [] });
    expect(at(s, "google-business").state).toBe("hidden");
  });

  it("is connect for a local business with no Google connection", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "wellness" }, connections: [] });
    const gbp = at(s, "google-business");
    expect(gbp.state).toBe("connect");
    expect(gbp.href).toBe("/dashboard/google");
  });

  it("is shown once Google is connected", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "wellness" }, connections: [conn("google")] });
    expect(at(s, "google-business").state).toBe("shown");
  });

  it("ignores a disconnected Google connection", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "wellness" }, connections: [conn("google", "disconnected")] });
    expect(at(s, "google-business").state).toBe("connect");
  });
});

describe("getDashboardSurfaces — Reviews", () => {
  it("is shown when a Google place id is configured", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "wellness", reviewsConfig: { googlePlaceId: "p" } }, connections: [] });
    const r = at(s, "reviews");
    expect(r.state).toBe("shown");
    expect(r.href).toBe("/dashboard/reviews");
  });

  it("is shown when a Yelp business id is configured", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "wellness", reviewsConfig: { yelpBusinessId: "y" } }, connections: [] });
    expect(at(s, "reviews").state).toBe("shown");
  });

  it("is shown when a live Yelp connection exists", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "wellness" }, connections: [conn("yelp")] });
    expect(at(s, "reviews").state).toBe("shown");
  });

  it("is connect for a local business with no review source, still pointing at the Reviews surface", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "wellness" }, connections: [] });
    const r = at(s, "reviews");
    expect(r.state).toBe("connect");
    // Even in the connect state, Reviews lands on its own surface (whose empty
    // state pitches connecting Google), not the generic integrations list.
    expect(r.href).toBe("/dashboard/reviews");
  });

  it("is hidden for an online brand with no review source", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "food-brand" }, connections: [] });
    expect(at(s, "reviews").state).toBe("hidden");
  });
});

describe("tenantHasStore — drives the Store sub-tab inside Website", () => {
  it("is false for a plain site", () => {
    expect(tenantHasStore({ tenantConfig: {} })).toBe(false);
  });

  for (const feature of ["commerce", "products", "shop"]) {
    it(`is true when the tenant has the "${feature}" feature`, () => {
      expect(tenantHasStore({ tenantConfig: { features: [feature] } })).toBe(true);
    });
  }

  it("is true when the caller passes hasCommerce (e.g. tenant has products)", () => {
    expect(tenantHasStore({ tenantConfig: {}, hasCommerce: true })).toBe(true);
  });

  it("hasCommerce=false falls back to the features flag", () => {
    expect(tenantHasStore({ tenantConfig: { features: ["shop"] }, hasCommerce: false })).toBe(true);
    expect(tenantHasStore({ tenantConfig: {}, hasCommerce: false })).toBe(false);
  });
});

describe("getWebsiteSections — Website sub-tabs", () => {
  it("is Site-only (no strip) for a plain site", () => {
    const sections = getWebsiteSections({ hasStore: false });
    expect(sections.map((x) => x.id)).toEqual(["site"]);
  });

  it("folds Store in as a sub-section when the site has a store", () => {
    const sections = getWebsiteSections({ hasStore: true });
    expect(sections.map((x) => x.id)).toEqual(["site", "store"]);
    expect(sections.find((x) => x.id === "store")!.href).toBe("/dashboard/store");
  });
});

describe("getDashboardSurfaces — always-on pillars", () => {
  it("today / ask-ai / website / analytics are always shown", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "food-brand" }, connections: [] });
    for (const id of ["today", "ask-ai", "website", "analytics"] as SurfaceId[]) {
      expect(at(s, id).state).toBe("shown");
    }
  });
});

describe("getVisibleSurfaces", () => {
  it("drops hidden surfaces — an online brand sees no Google Business or Reviews tab", () => {
    const ids = getVisibleSurfaces({ tenantConfig: { template: "food-brand" }, connections: [] }).map((s) => s.id);
    expect(ids).not.toContain("google-business");
    expect(ids).not.toContain("reviews");
    expect(ids).toEqual(expect.arrayContaining(["today", "ask-ai", "website", "analytics"]));
  });

  it("keeps connect-state surfaces for a local business", () => {
    const ids = getVisibleSurfaces({ tenantConfig: { template: "wellness" }, connections: [] }).map((s) => s.id);
    expect(ids).toContain("google-business");
    expect(ids).toContain("reviews");
  });
});

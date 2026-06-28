import { describe, it, expect } from "vitest";
import {
  getDashboardSurfaces,
  getVisibleSurfaces,
  getPresenceProfile,
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

  it("is connect for a local business with no review source", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "wellness" }, connections: [] });
    const r = at(s, "reviews");
    expect(r.state).toBe("connect");
    expect(r.href).toBe("/dashboard/integrations");
  });

  it("is hidden for an online brand with no review source", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "food-brand" }, connections: [] });
    expect(at(s, "reviews").state).toBe("hidden");
  });
});

describe("getDashboardSurfaces — Store", () => {
  it("is hidden for a non-commerce site", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "wellness" }, connections: [] });
    expect(at(s, "store").state).toBe("hidden");
  });

  for (const feature of ["commerce", "products", "shop"]) {
    it(`is shown when the tenant has the "${feature}" feature`, () => {
      const s = getDashboardSurfaces({ tenantConfig: { template: "food-brand", features: [feature] }, connections: [] });
      const store = at(s, "store");
      expect(store.state).toBe("shown");
      expect(store.href).toBe("/dashboard/store");
    });
  }

  it("appears in the visible nav for a commerce tenant", () => {
    const ids = getVisibleSurfaces({ tenantConfig: { template: "food-brand", features: ["products"] }, connections: [] }).map((x) => x.id);
    expect(ids).toContain("store");
  });

  it("is dropped from the visible nav for a non-commerce tenant", () => {
    const ids = getVisibleSurfaces({ tenantConfig: { template: "wellness" }, connections: [] }).map((x) => x.id);
    expect(ids).not.toContain("store");
  });

  it("is shown when the caller passes hasCommerce (e.g. tenant has products) even without a features flag", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "food-brand" }, connections: [], hasCommerce: true });
    expect(at(s, "store").state).toBe("shown");
  });

  it("hasCommerce=false falls back to the features flag", () => {
    const withFlag = getDashboardSurfaces({ tenantConfig: { template: "food-brand", features: ["shop"] }, connections: [], hasCommerce: false });
    expect(at(withFlag, "store").state).toBe("shown");
    const without = getDashboardSurfaces({ tenantConfig: { template: "food-brand" }, connections: [], hasCommerce: false });
    expect(at(without, "store").state).toBe("hidden");
  });
});

describe("getDashboardSurfaces — always-on pillars", () => {
  it("today / ask-ai / website / analytics / health are always shown", () => {
    const s = getDashboardSurfaces({ tenantConfig: { template: "food-brand" }, connections: [] });
    for (const id of ["today", "ask-ai", "website", "analytics", "health"] as SurfaceId[]) {
      expect(at(s, id).state).toBe("shown");
    }
  });
});

describe("getVisibleSurfaces", () => {
  it("drops hidden surfaces — an online brand sees no Google Business or Reviews tab", () => {
    const ids = getVisibleSurfaces({ tenantConfig: { template: "food-brand" }, connections: [] }).map((s) => s.id);
    expect(ids).not.toContain("google-business");
    expect(ids).not.toContain("reviews");
    expect(ids).toEqual(expect.arrayContaining(["today", "ask-ai", "website", "analytics", "health"]));
  });

  it("keeps connect-state surfaces for a local business", () => {
    const ids = getVisibleSurfaces({ tenantConfig: { template: "wellness" }, connections: [] }).map((s) => s.id);
    expect(ids).toContain("google-business");
    expect(ids).toContain("reviews");
  });
});

import { describe, it, expect } from "vitest";
import { pickMobileNavSurfaces, MOBILE_KEEP_PRIORITY } from "@/components/dashboard/MobileNav";
import { getDashboardSurfaces } from "@/lib/dashboard-surfaces";
import type { Connection } from "@/lib/types";

function conn(provider: Connection["provider"], status: Connection["status"] = "connected"): Connection {
  return { provider, tenantId: "t", accessToken: "x", status };
}

describe("pickMobileNavSurfaces — the phone bottom-bar pick", () => {
  it("keeps Reviews for a fully-connected local business (drops Website, not Reviews)", () => {
    // Local template + Google connected + a review source → all 7 surfaces shown
    // (Reports is now its own tab), two over the 5-tab phone cap.
    const surfaces = getDashboardSurfaces({
      tenantConfig: { template: "wellness", reviewsConfig: { googlePlaceId: "p" } },
      connections: [conn("google")],
    });
    expect(surfaces.filter((s) => s.state === "shown")).toHaveLength(7);

    const bar = pickMobileNavSurfaces(surfaces).map((s) => s.id);
    expect(bar).toHaveLength(5);
    expect(bar).toContain("reviews");
    // Website is the intended sacrifice — rarely edited from a phone.
    expect(bar).not.toContain("website");
  });

  it("renders the kept tabs in natural nav order, not priority order", () => {
    const surfaces = getDashboardSurfaces({
      tenantConfig: { template: "wellness", reviewsConfig: { googlePlaceId: "p" } },
      connections: [conn("google")],
    });
    expect(pickMobileNavSurfaces(surfaces).map((s) => s.id)).toEqual([
      "today",
      "ask-ai",
      "google-business",
      "analytics",
      "reviews",
    ]);
  });

  it("keeps every tab when 5 or fewer are shown (online brand)", () => {
    // food-brand → Google Business + Reviews hidden, so only 5 shown (Reports is
    // its own tab now) — still within the 5-tab cap, so all are kept.
    const surfaces = getDashboardSurfaces({
      tenantConfig: { template: "food-brand" },
      connections: [],
    });
    const bar = pickMobileNavSurfaces(surfaces).map((s) => s.id);
    expect(bar).toEqual(["today", "ask-ai", "website", "analytics", "reports"]);
  });

  it("never puts a connect-state or hidden surface in the bar", () => {
    // Local business with nothing connected → Google Business + Reviews are
    // "connect", not "shown".
    const surfaces = getDashboardSurfaces({ tenantConfig: { template: "wellness" }, connections: [] });
    const bar = pickMobileNavSurfaces(surfaces);
    expect(bar.every((s) => s.state === "shown")).toBe(true);
    expect(bar.map((s) => s.id)).not.toContain("google-business");
    expect(bar.map((s) => s.id)).not.toContain("reviews");
  });

  it("ranks Reviews above Google Business and Website in the keep priority", () => {
    // Guards the ordering that makes Reviews survive the cut.
    expect(MOBILE_KEEP_PRIORITY.indexOf("reviews")).toBeLessThan(
      MOBILE_KEEP_PRIORITY.indexOf("google-business"),
    );
    expect(MOBILE_KEEP_PRIORITY.indexOf("reviews")).toBeLessThan(
      MOBILE_KEEP_PRIORITY.indexOf("website"),
    );
  });
});

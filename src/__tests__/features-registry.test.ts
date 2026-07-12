import { describe, it, expect } from "vitest";
import { ALL_TENANT_FEATURES } from "../lib/types";
import {
  CORE_FEATURES,
  isCore,
  isKnownFeature,
  cleanFeatureIds,
  expandSets,
  getSetSurfaces,
  getToggleableRegistry,
} from "../lib/features/registry";

describe("feature registry — core", () => {
  it("marks the five core features as core", () => {
    for (const id of CORE_FEATURES) expect(isCore(id)).toBe(true);
  });
  it("does not mark set/conditional features as core", () => {
    expect(isCore("schedule")).toBe(false);
    expect(isCore("google-business")).toBe(false);
    expect(isCore("nonsense")).toBe(false);
  });
});

describe("feature registry — isKnownFeature / cleanFeatureIds", () => {
  it("recognizes registry ids, set ids, and legacy features", () => {
    expect(isKnownFeature("schedule")).toBe(true);   // registry/set member
    expect(isKnownFeature("wellness")).toBe(true);    // set id
    expect(isKnownFeature("booking")).toBe(true);     // legacy TenantFeature
    expect(isKnownFeature("bogus")).toBe(false);
  });
  it("filters an arbitrary array to recognized ids", () => {
    expect(cleanFeatureIds(["schedule", "bogus", 42, "reviews"])).toEqual(["schedule", "reviews"]);
    expect(cleanFeatureIds("not-an-array")).toEqual([]);
  });

  it("never strips a valid TenantFeature — every union value round-trips (no drift possible)", () => {
    for (const f of ALL_TENANT_FEATURES) {
      expect(isKnownFeature(f)).toBe(true);
    }
    expect(cleanFeatureIds([...ALL_TENANT_FEATURES])).toEqual([...ALL_TENANT_FEATURES]);
  });
});

describe("feature registry — expandSets", () => {
  it("expands a set id into its member features", () => {
    expect(expandSets(["wellness"])).toEqual(["schedule", "members", "roster"]);
  });
  it("expands e-commerce to the legacy store flag", () => {
    expect(expandSets(["ecommerce"])).toEqual(["commerce"]);
  });
  it("leaves plain feature ids as-is and dedupes", () => {
    expect(expandSets(["reviews", "wellness", "schedule"])).toEqual([
      "reviews", "schedule", "members", "roster",
    ]);
  });
});

describe("feature registry — getSetSurfaces", () => {
  it("returns nothing when no set-member features are enabled", () => {
    expect(getSetSurfaces([])).toEqual([]);
    expect(getSetSurfaces(["reviews", "google-business"])).toEqual([]);
  });
  it("returns the wellness surfaces in registry order for enabled members", () => {
    const surfaces = getSetSurfaces(["schedule", "members", "roster"]);
    expect(surfaces.map((s) => s.id)).toEqual(["schedule", "members", "roster"]);
    expect(surfaces.every((s) => s.state === "shown" && s.group === "set")).toBe(true);
    expect(surfaces[0]).toMatchObject({ id: "schedule", href: "/dashboard/schedule", label: "Schedule" });
  });
  it("only surfaces the members that are actually enabled", () => {
    expect(getSetSurfaces(["schedule", "roster"]).map((s) => s.id)).toEqual(["schedule", "roster"]);
  });
  it("does not add a surface for the e-commerce store flag (Store stays a Website sub-tab)", () => {
    expect(getSetSurfaces(["commerce"])).toEqual([]);
  });
});

describe("feature registry — getToggleableRegistry", () => {
  it("groups core / conditional / sets for the UI", () => {
    const { core, conditional, sets } = getToggleableRegistry();
    expect(core.map((f) => f.id)).toEqual(["today", "ask-ai", "website", "analytics", "reports"]);
    expect(conditional.map((f) => f.id)).toEqual(["google-business", "reviews"]);
    const wellness = sets.find((s) => s.id === "wellness")!;
    expect(wellness.label).toBe("Wellness");
    expect(wellness.members.map((m) => m.id)).toEqual(["schedule", "members", "roster"]);
  });
});

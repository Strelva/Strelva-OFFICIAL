import { describe, it, expect } from "vitest";
import { applyFeatureChange, FeatureGuardError } from "../lib/features/registry";

describe("applyFeatureChange — core lock", () => {
  it("rejects removing a core feature that was present", () => {
    expect(() => applyFeatureChange(["website", "reviews"], ["reviews"])).toThrow(FeatureGuardError);
    expect(() => applyFeatureChange(["website"], [])).toThrow(/core feature/);
  });

  it("allows a change that keeps core in place", () => {
    expect(applyFeatureChange(["website", "reviews"], ["website", "schedule"])).toEqual(["website", "schedule"]);
  });

  it("is a no-op guard when core was not stored (core is always-on in the resolver anyway)", () => {
    // current has no core → nothing to protect; the change is allowed.
    expect(applyFeatureChange(["reviews"], ["schedule"])).toEqual(["schedule"]);
  });
});

describe("applyFeatureChange — clean + expand + dedupe", () => {
  it("expands a set id into its members", () => {
    expect(applyFeatureChange([], ["wellness"])).toEqual(["schedule", "members", "roster"]);
  });

  it("drops unknown ids", () => {
    expect(applyFeatureChange([], ["schedule", "bogus", 7 as unknown as string])).toEqual(["schedule"]);
  });

  it("dedupes when a set and its member are both passed", () => {
    expect(applyFeatureChange([], ["wellness", "schedule"])).toEqual(["schedule", "members", "roster"]);
  });

  it("removing a set turns off all its members", () => {
    // Was fully wellness-enabled; next has none of them → result is empty (no core stored to protect).
    expect(applyFeatureChange(["schedule", "members", "roster"], [])).toEqual([]);
  });

  it("canonicalizes legacy store flags on the next feature write", () => {
    expect(applyFeatureChange(["products"], ["products", "shop"]))
      .toEqual(["commerce"]);
  });
});

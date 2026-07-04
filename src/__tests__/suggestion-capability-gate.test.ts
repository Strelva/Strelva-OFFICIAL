import { describe, it, expect } from "vitest";
import { recommendationConflictsWithCapabilities } from "@/lib/suggestions";

const withStore = { hasStore: true, productCount: 4, hasBlog: false };
const noStore = { hasStore: false, productCount: 0, hasBlog: false };

describe("recommendationConflictsWithCapabilities — don't recommend what exists", () => {
  it("suppresses an 'enable e-commerce store' recommendation when products already exist", () => {
    const reco = {
      title: "Enable E-commerce Store",
      description:
        "Implement direct online sales functionality to allow customers to purchase your apple snaps.",
    };
    expect(recommendationConflictsWithCapabilities(reco, withStore)).toBe(true);
  });

  it("suppresses 'set up a shop' / 'sell online' variants for a store that exists", () => {
    expect(
      recommendationConflictsWithCapabilities(
        { title: "Set up a shop", description: "Start selling your apple snaps online." },
        withStore,
      ),
    ).toBe(true);
  });

  it("keeps a store recommendation for a business that has no store yet", () => {
    const reco = { title: "Start selling online", description: "Add an online store for your snaps." };
    expect(recommendationConflictsWithCapabilities(reco, noStore)).toBe(false);
  });

  it("keeps a normal, non-store recommendation even when a store exists", () => {
    const reco = {
      title: "Show off your best-selling apple snaps",
      description: "Feature your top flavor on the homepage so first-time visitors see it right away.",
    };
    expect(recommendationConflictsWithCapabilities(reco, withStore)).toBe(false);
  });
});

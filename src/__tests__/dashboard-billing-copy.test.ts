import { describe, expect, it } from "vitest";
import { getCurrentPlanDisplay } from "@/components/dashboard/billing-display";

describe("dashboard billing display", () => {
  it("does not invent a Growth subscription when no subscription is connected", () => {
    expect(getCurrentPlanDisplay({
      status: "none",
      isFounderComp: false,
      commercialPlanLabel: "Growth",
      commercialPlanMonthlyCents: 19_900,
    })).toBe("No subscription connected");
  });

  it("keeps one-off or canceled accounts free of an invented monthly amount", () => {
    expect(getCurrentPlanDisplay({
      status: "cancelled",
      isFounderComp: false,
      commercialPlanLabel: "Growth",
      commercialPlanMonthlyCents: 19_900,
    })).toBe("No active subscription");
  });

  it("preserves grandfathered founder comp copy", () => {
    expect(getCurrentPlanDisplay({
      status: "none",
      isFounderComp: true,
      commercialPlanLabel: "Growth",
      commercialPlanMonthlyCents: 19_900,
    })).toBe("Founder comp");
  });

  it("shows the accepted monthly plan when a subscription is active", () => {
    expect(getCurrentPlanDisplay({
      status: "active",
      isFounderComp: false,
      commercialPlanLabel: "Presence",
      commercialPlanMonthlyCents: 9_900,
    })).toBe("Presence · $99/mo");
  });
});

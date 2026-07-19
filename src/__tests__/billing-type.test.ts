import { describe, expect, it } from "vitest";
import {
  resolveBillingType,
  isBillingConfigured,
  billingMonthlyCents,
  billingLabel,
} from "@/lib/billing-type";

describe("billing-type", () => {
  it("resolves the explicit billingType when set", () => {
    expect(resolveBillingType({ billingType: "custom", planMonthlyCents: 18500 })).toBe("custom");
    expect(resolveBillingType({ billingType: "case_study" })).toBe("case_study");
    expect(resolveBillingType({ billingType: "none" })).toBe("none");
  });

  it("derives from legacy fields when billingType is unset (back-compat)", () => {
    expect(resolveBillingType({ planOverride: "founder_comp" })).toBe("case_study");
    expect(resolveBillingType({ subscriptionPlan: "growth" })).toBe("tier");
    expect(resolveBillingType({ subscriptionStatus: "active" })).toBe("tier");
    expect(resolveBillingType({ planMonthlyCents: 4500 })).toBe("custom");
    expect(resolveBillingType({})).toBe("none");
  });

  it("only 'none' is unconfigured", () => {
    expect(isBillingConfigured({ billingType: "tier", subscriptionPlan: "presence" })).toBe(true);
    expect(isBillingConfigured({ billingType: "custom", planMonthlyCents: 18500 })).toBe(true);
    expect(isBillingConfigured({ billingType: "case_study" })).toBe(true);
    expect(isBillingConfigured({ billingType: "none" })).toBe(false);
    expect(isBillingConfigured({})).toBe(false);
  });

  it("computes MRR from the billing type", () => {
    expect(billingMonthlyCents({ billingType: "tier", subscriptionPlan: "presence" })).toBe(9900);
    expect(billingMonthlyCents({ billingType: "tier", subscriptionPlan: "scale" })).toBe(49900);
    expect(billingMonthlyCents({ billingType: "custom", planMonthlyCents: 18500 })).toBe(18500);
    expect(billingMonthlyCents({ billingType: "case_study" })).toBe(0);
    expect(billingMonthlyCents({ billingType: "none" })).toBe(0);
    // Legacy active Stripe sub with no recorded plan → anchor Growth price.
    expect(billingMonthlyCents({ subscriptionStatus: "active" })).toBe(19900);
  });

  it("labels each billing state for admin display", () => {
    expect(billingLabel({ billingType: "tier", subscriptionPlan: "growth" })).toContain("Growth");
    expect(billingLabel({ billingType: "custom", planMonthlyCents: 18500 })).toContain("185");
    expect(billingLabel({ billingType: "case_study" })).toBe("Case study (free)");
    expect(billingLabel({ billingType: "none" })).toBe("No plan set");
  });
});

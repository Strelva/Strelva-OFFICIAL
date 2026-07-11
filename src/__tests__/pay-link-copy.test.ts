import { describe, expect, it } from "vitest";
import {
  payLinkStartAmountCents,
  payLinkDoorBadge,
  payLinkDoorTerms,
  payLinkReassurance,
  payLinkProductName,
  payLinkProductDescription,
} from "@/lib/pay-link-copy";

describe("payLinkStartAmountCents", () => {
  it("prefers a fixed amount, falls back to the range floor, else undefined", () => {
    expect(payLinkStartAmountCents({ door: "build", amountCents: 150_000 })).toBe(150_000);
    expect(payLinkStartAmountCents({ door: "managed_start", minCents: 49_900, maxCents: 99_900 })).toBe(49_900);
    expect(payLinkStartAmountCents({ door: "build" })).toBeUndefined();
  });
});

describe("door badge + product name", () => {
  it("maps each door to its badge", () => {
    expect(payLinkDoorBadge("build")).toBe("One-time build");
    expect(payLinkDoorBadge("managed_start")).toContain("Managed");
  });

  it("builds the Stripe product name per door", () => {
    expect(payLinkProductName({ door: "build", clientName: "Acme" })).toBe("Website build: Acme");
    expect(payLinkProductName({ door: "managed_start", clientName: "Acme" })).toBe("Managed plan start: Acme");
  });
});

describe("offer terms copy carries the right facts", () => {
  it("build door: one-time, 3 months included, then $99/mo", () => {
    const terms = payLinkDoorTerms({ door: "build", amountCents: 150_000 });
    expect(terms).toContain("one-time");
    expect(terms).toContain("3 months");
    expect(terms).toContain("$99");
    expect(payLinkReassurance({ door: "build" })).toContain("first 3 months");
  });

  it("managed door: $199/mo, 12-month minimum, own-after, and the start amount", () => {
    const cfg = { door: "managed_start" as const, amountCents: 49_900 };
    const terms = payLinkDoorTerms(cfg);
    expect(terms).toContain("$499"); // the start amount
    expect(terms).toContain("$199");
    expect(terms).toContain("12-month minimum");
    expect(terms).toContain("the site is yours");
    expect(payLinkProductDescription(cfg)).toContain("$199");
    expect(payLinkProductDescription(cfg)).toContain("12-month");
  });
});

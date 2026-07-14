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
    expect(payLinkDoorBadge("build")).toBe("One-time project");
    expect(payLinkDoorBadge("managed_start")).toContain("Legacy");
  });

  it("builds the Stripe product name per door", () => {
    expect(payLinkProductName({ door: "build", clientName: "Acme" })).toBe("One-time project: Acme");
    expect(payLinkProductName({ door: "managed_start", clientName: "Acme" })).toBe("Legacy start payment: Acme");
  });
});

describe("offer terms copy carries the right facts", () => {
  it("build door is explicitly separate from subscriptions", () => {
    const terms = payLinkDoorTerms({ door: "build", amountCents: 150_000 });
    expect(terms).toContain("one-time");
    expect(terms).toContain("does not start or change");
    expect(payLinkReassurance({ door: "build" })).toContain("separate from recurring");
  });

  it("legacy managed-start links retain the amount without inventing current terms", () => {
    const cfg = { door: "managed_start" as const, amountCents: 49_900 };
    const terms = payLinkDoorTerms(cfg);
    expect(terms).toContain("$499"); // the start amount
    expect(terms).toContain("agreed directly");
    expect(terms).toContain("does not create a new subscription");
    expect(payLinkProductDescription(cfg)).toContain("separately agreed terms");
  });
});

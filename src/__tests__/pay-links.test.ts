import { describe, expect, it } from "vitest";
import {
  buildPayLinkConfig,
  resolvePayLinkChargeCents,
  formatPayLinkAmount,
  isFixedAmount,
  normalizePayLinkSlug,
  PayLinkValidationError,
  PAY_LINK_MIN_CENTS,
  PAY_LINK_MAX_CENTS,
  type PayLinkConfig,
} from "@/lib/pay-links";

describe("normalizePayLinkSlug", () => {
  it("accepts lowercase letters, numbers, and hyphens", () => {
    expect(normalizePayLinkSlug("acme-coffee")).toBe("acme-coffee");
    expect(normalizePayLinkSlug("  Acme-Coffee  ")).toBe("acme-coffee");
    expect(normalizePayLinkSlug("shop123")).toBe("shop123");
  });

  it("rejects malformed slugs", () => {
    expect(normalizePayLinkSlug("acme coffee")).toBeNull();
    expect(normalizePayLinkSlug("acme_coffee")).toBeNull();
    expect(normalizePayLinkSlug("-acme")).toBeNull();
    expect(normalizePayLinkSlug("acme-")).toBeNull();
    expect(normalizePayLinkSlug("")).toBeNull();
    expect(normalizePayLinkSlug(42)).toBeNull();
  });
});

describe("buildPayLinkConfig", () => {
  it("builds a fixed-amount build (Door 1) link", () => {
    const config = buildPayLinkConfig({
      slug: "acme-coffee",
      clientName: "Acme Coffee",
      door: "build",
      tenantId: "acme",
      amountCents: 200_000,
    });
    expect(config).toMatchObject({
      slug: "acme-coffee",
      clientName: "Acme Coffee",
      door: "build",
      tenantId: "acme",
      amountCents: 200_000,
    });
    expect(config.minCents).toBeUndefined();
    expect(config.maxCents).toBeUndefined();
    expect(isFixedAmount(config)).toBe(true);
    expect(typeof config.createdAt).toBe("string");
  });

  it("builds a managed_start (Door 2) link for a pre-tenant lead", () => {
    const config = buildPayLinkConfig({
      slug: "lead-bakery",
      clientName: "Lead Bakery",
      door: "managed_start",
      leadSlug: "lead-bakery",
      amountCents: 49_900,
    });
    expect(config.tenantId).toBeUndefined();
    expect(config.leadSlug).toBe("lead-bakery");
    expect(config.door).toBe("managed_start");
  });

  it("builds a range (slider) link", () => {
    const config = buildPayLinkConfig({
      slug: "range-co",
      clientName: "Range Co",
      door: "build",
      tenantId: "range",
      minCents: 150_000,
      maxCents: 250_000,
    });
    expect(config.amountCents).toBeUndefined();
    expect(config.minCents).toBe(150_000);
    expect(config.maxCents).toBe(250_000);
    expect(isFixedAmount(config)).toBe(false);
  });

  it("keeps customCopy and returnUrl when valid", () => {
    const config = buildPayLinkConfig({
      slug: "acme-coffee",
      clientName: "Acme Coffee",
      door: "build",
      tenantId: "acme",
      amountCents: 200_000,
      customCopy: "Thanks for trusting us with this.",
      returnUrl: "https://acmecoffee.com",
    });
    expect(config.customCopy).toBe("Thanks for trusting us with this.");
    expect(config.returnUrl).toBe("https://acmecoffee.com");
  });

  it("rejects a malformed slug", () => {
    expect(() =>
      buildPayLinkConfig({
        slug: "Acme Coffee!",
        clientName: "Acme",
        door: "build",
        tenantId: "acme",
        amountCents: 200_000,
      }),
    ).toThrow(PayLinkValidationError);
  });

  it("rejects an unknown door", () => {
    expect(() =>
      buildPayLinkConfig({
        slug: "acme",
        clientName: "Acme",
        door: "donation",
        tenantId: "acme",
        amountCents: 200_000,
      }),
    ).toThrow(/door must be one of/);
  });

  it("rejects when neither tenantId nor leadSlug is given", () => {
    expect(() =>
      buildPayLinkConfig({
        slug: "acme",
        clientName: "Acme",
        door: "build",
        amountCents: 200_000,
      }),
    ).toThrow(/tenantId or a leadSlug/);
  });

  it("rejects when both fixed and range pricing are given", () => {
    expect(() =>
      buildPayLinkConfig({
        slug: "acme",
        clientName: "Acme",
        door: "build",
        tenantId: "acme",
        amountCents: 200_000,
        minCents: 100_000,
        maxCents: 300_000,
      }),
    ).toThrow(/either amountCents OR minCents/);
  });

  it("rejects when no pricing is given", () => {
    expect(() =>
      buildPayLinkConfig({
        slug: "acme",
        clientName: "Acme",
        door: "build",
        tenantId: "acme",
      }),
    ).toThrow(/Provide amountCents/);
  });

  it("rejects amounts below the floor or above the ceiling", () => {
    expect(() =>
      buildPayLinkConfig({
        slug: "acme",
        clientName: "Acme",
        door: "build",
        tenantId: "acme",
        amountCents: PAY_LINK_MIN_CENTS - 1,
      }),
    ).toThrow(PayLinkValidationError);
    expect(() =>
      buildPayLinkConfig({
        slug: "acme",
        clientName: "Acme",
        door: "build",
        tenantId: "acme",
        amountCents: PAY_LINK_MAX_CENTS + 1,
      }),
    ).toThrow(PayLinkValidationError);
  });

  it("rejects an inverted range (min > max)", () => {
    expect(() =>
      buildPayLinkConfig({
        slug: "acme",
        clientName: "Acme",
        door: "build",
        tenantId: "acme",
        minCents: 300_000,
        maxCents: 100_000,
      }),
    ).toThrow(PayLinkValidationError);
  });

  it("rejects a range whose span is not a whole $50 (5000-cent) multiple", () => {
    // Span = 250_000 - 150_000 - 1 = 99_999 cents, not divisible by 5_000, so
    // the advertised max could never be reached by the $50-step slider.
    expect(() =>
      buildPayLinkConfig({
        slug: "acme",
        clientName: "Acme",
        door: "build",
        tenantId: "acme",
        minCents: 150_000,
        maxCents: 249_999,
      }),
    ).toThrow(/whole multiple of 5000/);
  });

  it("accepts a range whose span IS a whole $50 multiple", () => {
    const config = buildPayLinkConfig({
      slug: "acme",
      clientName: "Acme",
      door: "build",
      tenantId: "acme",
      minCents: 150_000,
      maxCents: 250_000, // span 100_000 = 20 × $50
    });
    expect(config.minCents).toBe(150_000);
    expect(config.maxCents).toBe(250_000);
  });

  it("rejects a present-but-non-numeric cents field", () => {
    expect(() =>
      buildPayLinkConfig({
        slug: "acme",
        clientName: "Acme",
        door: "build",
        tenantId: "acme",
        amountCents: "not a number",
      }),
    ).toThrow(/amountCents must be a number/);
  });

  it("rejects a missing client name", () => {
    expect(() =>
      buildPayLinkConfig({
        slug: "acme",
        clientName: "   ",
        door: "build",
        tenantId: "acme",
        amountCents: 200_000,
      }),
    ).toThrow(/clientName is required/);
  });

  it("rejects a malformed returnUrl", () => {
    expect(() =>
      buildPayLinkConfig({
        slug: "acme",
        clientName: "Acme",
        door: "build",
        tenantId: "acme",
        amountCents: 200_000,
        returnUrl: "not a url",
      }),
    ).toThrow(/returnUrl must be a valid/);
  });
});

describe("resolvePayLinkChargeCents", () => {
  const fixed: PayLinkConfig = {
    slug: "acme",
    clientName: "Acme",
    door: "build",
    tenantId: "acme",
    amountCents: 200_000,
    createdAt: "2026-06-09T00:00:00.000Z",
  };
  const range: PayLinkConfig = {
    slug: "range-co",
    clientName: "Range Co",
    door: "build",
    tenantId: "range",
    minCents: 150_000,
    maxCents: 250_000,
    createdAt: "2026-06-09T00:00:00.000Z",
  };

  it("treats the submitted amount as WHOLE DOLLARS for both number and string", () => {
    // $2,000 fixed link: 2000 (number) and "2000" (string) both resolve to the
    // same 200_000 cents. This is the single units contract.
    expect(resolvePayLinkChargeCents(fixed, 2000)).toBe(200_000);
    expect(resolvePayLinkChargeCents(fixed, "2000")).toBe(200_000);
    // A numeric 750 to a $1,500–2,500 range link is $750 (below floor -> null),
    // NOT $7.50 misread as 750 cents. Prior bug: number was read as cents.
    expect(resolvePayLinkChargeCents(range, 750)).toBeNull();
    expect(resolvePayLinkChargeCents(range, "750")).toBeNull();
  });

  it("range link: number and numeric-string dollars resolve identically", () => {
    expect(resolvePayLinkChargeCents(range, 2000)).toBe(200_000);
    expect(resolvePayLinkChargeCents(range, "2000")).toBe(200_000);
    expect(resolvePayLinkChargeCents(range, 1750)).toBe(175_000);
    expect(resolvePayLinkChargeCents(range, "1750")).toBe(175_000);
  });

  it("fixed link accepts only the exact configured dollar amount", () => {
    expect(resolvePayLinkChargeCents(fixed, 2000)).toBe(200_000);
    expect(resolvePayLinkChargeCents(fixed, "2000")).toBe(200_000);
    // A raw cents figure is now wrong input: 200_000 dollars != $2,000.
    expect(resolvePayLinkChargeCents(fixed, 200_000)).toBeNull();
    expect(resolvePayLinkChargeCents(fixed, 1500)).toBeNull();
    expect(resolvePayLinkChargeCents(fixed, "$1,500")).toBeNull();
  });

  it("range link accepts the inclusive boundary values", () => {
    expect(resolvePayLinkChargeCents(range, 1500)).toBe(150_000); // min
    expect(resolvePayLinkChargeCents(range, "1500")).toBe(150_000);
    expect(resolvePayLinkChargeCents(range, 2500)).toBe(250_000); // max
    expect(resolvePayLinkChargeCents(range, "2500")).toBe(250_000);
  });

  it("range link rejects amounts just outside the bounds (both types)", () => {
    expect(resolvePayLinkChargeCents(range, 1499)).toBeNull();
    expect(resolvePayLinkChargeCents(range, "1499")).toBeNull();
    expect(resolvePayLinkChargeCents(range, 2501)).toBeNull();
    expect(resolvePayLinkChargeCents(range, "2501")).toBeNull();
  });

  it("rejects non-numeric / non-number-or-string input", () => {
    expect(resolvePayLinkChargeCents(range, "not money")).toBeNull();
    expect(resolvePayLinkChargeCents(range, null)).toBeNull();
    expect(resolvePayLinkChargeCents(range, undefined)).toBeNull();
    expect(resolvePayLinkChargeCents(range, Number.NaN)).toBeNull();
    expect(resolvePayLinkChargeCents(range, {})).toBeNull();
  });
});

describe("formatPayLinkAmount", () => {
  it("formats whole-dollar USD", () => {
    expect(formatPayLinkAmount(200_000)).toBe("$2,000");
    expect(formatPayLinkAmount(49_900)).toBe("$499");
  });
});

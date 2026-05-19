import { describe, expect, it } from "vitest";
import {
  ROHLAX_PAYMENT_MAX_CENTS,
  ROHLAX_PAYMENT_MIN_CENTS,
  formatRohlaxPaymentAmount,
  parseRohlaxPaymentAmount,
} from "@/lib/rohlax-payment";

describe("Rohlax payment amount", () => {
  it("accepts amounts inside the $300-$1,000 range", () => {
    expect(parseRohlaxPaymentAmount("300")).toBe(ROHLAX_PAYMENT_MIN_CENTS);
    expect(parseRohlaxPaymentAmount("$500")).toBe(50_000);
    expect(parseRohlaxPaymentAmount(1000)).toBe(ROHLAX_PAYMENT_MAX_CENTS);
  });

  it("rejects amounts outside the allowed range", () => {
    expect(parseRohlaxPaymentAmount("299.99")).toBeNull();
    expect(parseRohlaxPaymentAmount("1000.01")).toBeNull();
    expect(parseRohlaxPaymentAmount("not money")).toBeNull();
  });

  it("formats the allowed range for customer-facing copy", () => {
    expect(formatRohlaxPaymentAmount(ROHLAX_PAYMENT_MIN_CENTS)).toBe("$300");
    expect(formatRohlaxPaymentAmount(ROHLAX_PAYMENT_MAX_CENTS)).toBe("$1,000");
  });
});

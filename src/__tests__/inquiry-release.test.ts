import { describe, expect, it } from "vitest";
import { inquiryReleaseEnabled } from "@/products/inquiries/release";

describe("inquiry release exposure", () => {
  it("requires an explicit enable value", () => {
    for (const value of [undefined, "", "0", "true"]) {
      expect(inquiryReleaseEnabled({ STRELVA_INQUIRIES_RELEASE: value })).toBe(false);
    }
    expect(inquiryReleaseEnabled({ STRELVA_INQUIRIES_RELEASE: "1" })).toBe(true);
  });
});

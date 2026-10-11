import { describe, expect, it } from "vitest";
import { isSameOriginBookingForm } from "@/platform/bookings/public-form";
describe("email-link form origin proof", () => {
  it.each([
    ["https://app.example.test", "same-origin", true],
    ["null", "same-origin", true],
    ["null", "cross-site", false],
    ["null", "none", false],
    ["https://evil.example.test", "same-origin", false],
    ["https://app.example.test", "cross-site", false],
    [null, "same-origin", false],
  ] as const)("origin=%s fetch-site=%s accepts=%s", (origin, site, allowed) => {
    const headers = new Headers({ "sec-fetch-site": site }); if (origin) headers.set("origin", origin);
    expect(isSameOriginBookingForm(new Request("https://app.example.test/b/email-only-token/action", { method: "POST", headers }))).toBe(allowed);
  });
});

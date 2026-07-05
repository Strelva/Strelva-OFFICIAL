import { describe, it, expect } from "vitest";

import { buildBookingEmbedUrl, resolveBookingProvider } from "../ScaffoldBooking";

describe("resolveBookingProvider", () => {
  it("infers calendly from the url and honors an explicit provider", () => {
    expect(resolveBookingProvider("https://calendly.com/x/y")).toBe("calendly");
    expect(resolveBookingProvider("https://acuityscheduling.com/x")).toBe("iframe");
    expect(resolveBookingProvider("https://calendly.com/x", "iframe")).toBe("iframe");
  });
});

describe("buildBookingEmbedUrl", () => {
  it("returns null with no url (fail-silent)", () => {
    expect(buildBookingEmbedUrl(undefined, undefined)).toBeNull();
    expect(buildBookingEmbedUrl("calendly", "")).toBeNull();
    expect(buildBookingEmbedUrl("iframe", "   ")).toBeNull();
  });

  it("rejects a non-http(s) url", () => {
    expect(buildBookingEmbedUrl("iframe", "javascript:alert(1)")).toBeNull();
    expect(buildBookingEmbedUrl(undefined, "/relative/path")).toBeNull();
  });

  it("passes a generic iframe url through unchanged", () => {
    const url = "https://app.acuityscheduling.com/schedule.php?owner=123";
    expect(buildBookingEmbedUrl("iframe", url)).toBe(url);
  });

  it("appends calendly inline embed params, preserving existing query", () => {
    const url = buildBookingEmbedUrl("calendly", "https://calendly.com/green-leaf/cleaning?month=2024-06");
    expect(url).toContain("month=2024-06");
    expect(url).toContain("embed_type=Inline");
    expect(url).toContain("hide_gdpr_banner=1");
  });

  it("infers calendly when provider is omitted and toggles optional params", () => {
    const url = buildBookingEmbedUrl(undefined, "https://calendly.com/x/y", {
      hideGdprBanner: false,
      hideEventTypeDetails: true,
    });
    expect(url).toContain("embed_type=Inline");
    expect(url).not.toContain("hide_gdpr_banner");
    expect(url).toContain("hide_event_type_details=1");
  });
});

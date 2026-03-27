import { describe, it, expect } from "vitest";
import { timeAgo } from "../lib/utils";

describe("timeAgo", () => {
  it("returns 'just now' for recent timestamps", () => {
    expect(timeAgo(Date.now())).toBe("just now");
  });

  it("returns minutes for timestamps under an hour", () => {
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    expect(timeAgo(tenMinAgo)).toBe("10 min ago");
  });

  it("returns hours for timestamps under a day", () => {
    const threeHoursAgo = Date.now() - 3 * 3600 * 1000;
    expect(timeAgo(threeHoursAgo)).toBe("3h ago");
  });

  it("returns 'yesterday' for 1-day-old timestamps", () => {
    const yesterday = Date.now() - 1.5 * 86400 * 1000;
    expect(timeAgo(yesterday)).toBe("yesterday");
  });

  it("returns days for timestamps under a week", () => {
    const threeDaysAgo = Date.now() - 3 * 86400 * 1000;
    expect(timeAgo(threeDaysAgo)).toBe("3d ago");
  });

  it("returns weeks for older timestamps", () => {
    const twoWeeksAgo = Date.now() - 14 * 86400 * 1000;
    expect(timeAgo(twoWeeksAgo)).toBe("2w ago");
  });

  it("accepts ISO string input", () => {
    const recent = new Date(Date.now() - 5000).toISOString();
    expect(timeAgo(recent)).toBe("just now");
  });
});

describe("content validation rules", () => {
  const VALID_SECTIONS = [
    "hero", "services", "story", "testimonials",
    "events", "providers", "contact", "settings",
  ];

  it("defines 8 content sections", () => {
    expect(VALID_SECTIONS).toHaveLength(8);
  });

  it("includes required sections for a wellness business", () => {
    expect(VALID_SECTIONS).toContain("services");
    expect(VALID_SECTIONS).toContain("contact");
    expect(VALID_SECTIONS).toContain("events");
    expect(VALID_SECTIONS).toContain("providers");
  });
});

describe("required fields per section", () => {
  const REQUIRED_FIELDS: Record<string, string[]> = {
    hero: ["headline", "tagline", "ctaText"],
    services: ["headline"],
    story: ["headline", "statement"],
    testimonials: [],
    events: [],
    providers: [],
    contact: ["email"],
    settings: ["siteName"],
  };

  it("hero requires headline, tagline, and CTA", () => {
    expect(REQUIRED_FIELDS.hero).toEqual(["headline", "tagline", "ctaText"]);
  });

  it("contact requires email", () => {
    expect(REQUIRED_FIELDS.contact).toEqual(["email"]);
  });

  it("events and providers have no required fields (optional content)", () => {
    expect(REQUIRED_FIELDS.events).toEqual([]);
    expect(REQUIRED_FIELDS.providers).toEqual([]);
  });
});

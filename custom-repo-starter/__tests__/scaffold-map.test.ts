import { describe, it, expect } from "vitest";

import { buildMapEmbedUrl } from "../ScaffoldMap";

describe("buildMapEmbedUrl", () => {
  it("returns null with no location (fail-silent)", () => {
    expect(buildMapEmbedUrl({})).toBeNull();
    expect(buildMapEmbedUrl({ address: "   " })).toBeNull();
    expect(buildMapEmbedUrl({ query: "" })).toBeNull();
    // a lone coordinate is not enough — both lat AND lng are required
    expect(buildMapEmbedUrl({ lat: 42.88 })).toBeNull();
  });

  it("builds a keyless embed url from an address", () => {
    const url = buildMapEmbedUrl({ address: "12 Main St, Buffalo, NY 14201" });
    expect(url).toBe(
      "https://maps.google.com/maps?q=12%20Main%20St%2C%20Buffalo%2C%20NY%2014201&z=14&output=embed",
    );
  });

  it("prefers coordinates over an address and honors zoom", () => {
    const url = buildMapEmbedUrl({ address: "ignored", lat: 42.8864, lng: -78.8784, zoom: 15 });
    expect(url).toContain("q=42.8864%2C-78.8784");
    expect(url).toContain("z=15");
  });

  it("falls back to query and clamps a garbage zoom to the default range", () => {
    expect(buildMapEmbedUrl({ query: "Green Leaf Dental Buffalo" })).toContain(
      "q=Green%20Leaf%20Dental%20Buffalo",
    );
    expect(buildMapEmbedUrl({ query: "x", zoom: 999 })).toContain("z=20");
    expect(buildMapEmbedUrl({ query: "x", zoom: -5 })).toContain("z=1");
  });
});

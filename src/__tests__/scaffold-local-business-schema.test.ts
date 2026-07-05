import { describe, it, expect } from "vitest";

import { buildLocalBusinessSchema } from "../../custom-repo-starter/ScaffoldLocalBusinessSchema";

describe("buildLocalBusinessSchema", () => {
  it("emits a valid LocalBusiness schema with every field provided", () => {
    const schema = buildLocalBusinessSchema({
      name: "Green Leaf Dental",
      url: "https://greenleafdental.com",
      phone: "+1-716-555-0100",
      email: "hi@greenleafdental.com",
      description: "Family dentistry in Buffalo.",
      image: "https://greenleafdental.com/og.jpg",
      priceRange: "$$",
      address: {
        streetAddress: "12 Main St",
        addressLocality: "Buffalo",
        addressRegion: "NY",
        postalCode: "14201",
        addressCountry: "US",
      },
      geo: { latitude: 42.8864, longitude: -78.8784 },
      hours: ["Mo-Fr 09:00-17:00", "Sa 10:00-14:00"],
      sameAs: ["https://facebook.com/greenleaf"],
    });

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("LocalBusiness");
    expect(schema.name).toBe("Green Leaf Dental");
    expect(schema.telephone).toBe("+1-716-555-0100");
    expect(schema.priceRange).toBe("$$");
    expect(schema.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "12 Main St",
      addressLocality: "Buffalo",
      addressRegion: "NY",
      postalCode: "14201",
      addressCountry: "US",
    });
    expect(schema.geo).toEqual({ "@type": "GeoCoordinates", latitude: 42.8864, longitude: -78.8784 });
    expect(schema.openingHours).toEqual(["Mo-Fr 09:00-17:00", "Sa 10:00-14:00"]);
    expect(schema.sameAs).toEqual(["https://facebook.com/greenleaf"]);
  });

  it("omits every field that is not provided (no empty/fake values)", () => {
    const schema = buildLocalBusinessSchema({ name: "Solo Shop" });
    expect(Object.keys(schema).sort()).toEqual(["@context", "@type", "name"]);
    expect("telephone" in schema).toBe(false);
    expect("address" in schema).toBe(false);
    expect("geo" in schema).toBe(false);
    expect("openingHours" in schema).toBe(false);
  });

  it("drops empty address sub-fields and omits the address if all are empty", () => {
    const schema = buildLocalBusinessSchema({
      name: "Shop",
      address: { streetAddress: "12 Main St", addressLocality: "", addressRegion: "  " },
    });
    expect(schema.address).toEqual({ "@type": "PostalAddress", streetAddress: "12 Main St" });

    const noAddress = buildLocalBusinessSchema({ name: "Shop", address: { streetAddress: "", addressLocality: "" } });
    expect("address" in noAddress).toBe(false);
  });

  it("omits geo when a coordinate is not a finite number", () => {
    const schema = buildLocalBusinessSchema({
      name: "Shop",
      geo: { latitude: NaN, longitude: -78.8784 },
    });
    expect("geo" in schema).toBe(false);
  });

  it("honors a more specific @type and multi-image arrays, filtering blanks", () => {
    const schema = buildLocalBusinessSchema({
      name: "Bella Trattoria",
      type: "Restaurant",
      image: ["https://x.com/a.jpg", "", "https://x.com/b.jpg"],
    });
    expect(schema["@type"]).toBe("Restaurant");
    expect(schema.image).toEqual(["https://x.com/a.jpg", "https://x.com/b.jpg"]);
  });
});

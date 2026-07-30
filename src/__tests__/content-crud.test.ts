import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { getContent, setContent } from "../lib/storage";
import type { ContentSection } from "../lib/types";

/**
 * Content CRUD tests.
 *
 * Exercises getContent / setContent through the dev-file storage path.
 * Also tests the validateBody logic extracted from the content API route
 * to verify schema enforcement without needing a running Next.js server.
 */

const TEST_TENANT = "__test_content_crud";

function devContentPath(tenant: string): string {
  return path.join(process.cwd(), `dev-content-${tenant}.json`);
}

async function cleanupTenantFile(tenant: string) {
  try {
    await fs.unlink(devContentPath(tenant));
  } catch {
    // file didn't exist — fine
  }
}

// --- Validation logic (extracted from route.ts to test independently) ---

const REQUIRED_FIELDS: Partial<Record<ContentSection, string[]>> = {
  hero: ["headline", "tagline", "ctaText"],
  services: ["headline"],
  story: ["headline", "statement"],
  contact: ["email"],
  settings: ["siteName"],
  products: ["headline"],
};

function validateBody(
  section: ContentSection,
  body: Record<string, unknown>
): string | null {
  const required = REQUIRED_FIELDS[section] ?? [];
  for (const field of required) {
    const value = body[field];
    if (typeof value !== "string" || value.trim() === "") {
      return `"${field}" is required and cannot be empty`;
    }
  }

  if (section === "contact" && typeof body.email === "string") {
    if (!body.email.includes("@") || !body.email.includes(".")) {
      return "Invalid email address";
    }
  }

  if (section === "services" && Array.isArray(body.services)) {
    for (let i = 0; i < body.services.length; i++) {
      const s = body.services[i] as Record<string, unknown>;
      if (typeof s.name !== "string" || s.name.trim() === "") {
        return `Service ${i + 1} is missing a name`;
      }
    }
  }

  if (section === "testimonials" && Array.isArray(body.testimonials)) {
    for (let i = 0; i < body.testimonials.length; i++) {
      const t = body.testimonials[i] as Record<string, unknown>;
      if (typeof t.quote !== "string" || t.quote.trim() === "") {
        return `Testimonial ${i + 1} is missing a quote`;
      }
    }
  }

  if (section === "events" && Array.isArray(body.events)) {
    for (let i = 0; i < body.events.length; i++) {
      const e = body.events[i] as Record<string, unknown>;
      if (typeof e.title !== "string" || e.title.trim() === "") {
        return `Event ${i + 1} is missing a title`;
      }
    }
  }

  if (section === "providers" && Array.isArray(body.providers)) {
    for (let i = 0; i < body.providers.length; i++) {
      const p = body.providers[i] as Record<string, unknown>;
      if (typeof p.name !== "string" || p.name.trim() === "") {
        return `Provider ${i + 1} is missing a name`;
      }
    }
  }

  if (section === "products" && Array.isArray(body.products)) {
    for (let i = 0; i < body.products.length; i++) {
      const p = body.products[i] as Record<string, unknown>;
      if (typeof p.name !== "string" || p.name.trim() === "") {
        return `Product ${i + 1} is missing a name`;
      }
      if (typeof p.price !== "string" || p.price.trim() === "") {
        return `Product ${i + 1} is missing a price`;
      }
    }
  }

  return null;
}

// --- Tests ---

describe("content CRUD — storage round-trips", () => {
  beforeAll(async () => {
    await cleanupTenantFile(TEST_TENANT);
  });

  afterAll(async () => {
    await cleanupTenantFile(TEST_TENANT);
  });

  it("returns defaults when no content has been written", async () => {
    const hero = await getContent("hero", TEST_TENANT);
    expect(hero.headline).toContain("Move Better");
    expect(hero.ctaText).toBe("Book a Session");
  });

  it("round-trips hero content (write then read)", async () => {
    const hero = {
      headline: "Test Headline",
      subheadline: "Test Sub",
      tagline: "Test Tagline",
      ctaText: "Click Me",
      ctaLink: "/test",
      backgroundImageUrl: "/test.jpg",
    };

    await setContent("hero", hero, TEST_TENANT);
    const read = await getContent("hero", TEST_TENANT);

    expect(read.headline).toBe("Test Headline");
    expect(read.tagline).toBe("Test Tagline");
    expect(read.ctaText).toBe("Click Me");
    expect(read.ctaLink).toBe("/test");
    expect(read.backgroundImageUrl).toBe("/test.jpg");
  });

  it("round-trips services content with array items", async () => {
    const services = {
      sectionLabel: "Services",
      headline: "What We Do",
      description: "Test desc",
      services: [
        {
          id: "s1",
          name: "Stretch",
          description: "A stretch",
          duration: "60 min",
          price: "50",
          featured: true,
          who_its_for: "Everyone",
          booking_link: "/book",
          comingSoon: false,
          image_url: "",
        },
      ],
    };

    await setContent("services", services, TEST_TENANT);
    const read = await getContent("services", TEST_TENANT);

    expect(read.headline).toBe("What We Do");
    expect(read.services).toHaveLength(1);
    expect(read.services[0]!.name).toBe("Stretch");
    expect(read.services[0]!.price).toBe("50");
  });

  it("round-trips contact content", async () => {
    const contact = {
      email: "test@example.com",
      phone: "555-1234",
      address: "123 Main St",
      hours: "9-5",
      locationTitle: "Downtown",
      locationDescription: "Near the park",
      instagramUrl: "https://instagram.com/test",
      facebookUrl: "https://facebook.com/test",
    };

    await setContent("contact", contact, TEST_TENANT);
    const read = await getContent("contact", TEST_TENANT);

    expect(read.email).toBe("test@example.com");
    expect(read.phone).toBe("555-1234");
    expect(read.instagramUrl).toBe("https://instagram.com/test");
  });

  it("overwriting a section replaces the previous content", async () => {
    const v1 = {
      headline: "Version 1",
      subheadline: "",
      tagline: "V1",
      ctaText: "V1 CTA",
      ctaLink: "/v1",
      backgroundImageUrl: "",
    };
    const v2 = {
      headline: "Version 2",
      subheadline: "",
      tagline: "V2",
      ctaText: "V2 CTA",
      ctaLink: "/v2",
      backgroundImageUrl: "",
    };

    await setContent("hero", v1, TEST_TENANT);
    await setContent("hero", v2, TEST_TENANT);
    const read = await getContent("hero", TEST_TENANT);

    expect(read.headline).toBe("Version 2");
    expect(read.ctaText).toBe("V2 CTA");
  });

  it("writing one section doesn't clobber another", async () => {
    // Contact was set in an earlier test
    const settings = {
      siteName: "Test Site",
      siteTagline: "Testing",
      siteDescription: "A test",
      footerTagline: "Footer",
      copyrightText: "2026",
    };

    await setContent("settings", settings, TEST_TENANT);

    const contact = await getContent("contact", TEST_TENANT);
    expect(contact.email).toBe("test@example.com");

    const readSettings = await getContent("settings", TEST_TENANT);
    expect(readSettings.siteName).toBe("Test Site");
  });
});

describe("content validation — required fields", () => {
  it("hero: accepts valid data", () => {
    const err = validateBody("hero", {
      headline: "Hello",
      tagline: "World",
      ctaText: "Click",
    });
    expect(err).toBeNull();
  });

  it("hero: rejects missing headline", () => {
    const err = validateBody("hero", {
      tagline: "World",
      ctaText: "Click",
    });
    expect(err).toBe('"headline" is required and cannot be empty');
  });

  it("hero: rejects empty string headline", () => {
    const err = validateBody("hero", {
      headline: "   ",
      tagline: "World",
      ctaText: "Click",
    });
    expect(err).toBe('"headline" is required and cannot be empty');
  });

  it("contact: accepts valid email", () => {
    const err = validateBody("contact", { email: "a@b.com" });
    expect(err).toBeNull();
  });

  it("contact: rejects email without @", () => {
    const err = validateBody("contact", { email: "notanemail.com" });
    expect(err).toBe("Invalid email address");
  });

  it("contact: rejects email without dot", () => {
    const err = validateBody("contact", { email: "bad@nodot" });
    expect(err).toBe("Invalid email address");
  });

  it("settings: rejects missing siteName", () => {
    const err = validateBody("settings", {});
    expect(err).toBe('"siteName" is required and cannot be empty');
  });

  it("services: accepts headline with no services array", () => {
    const err = validateBody("services", { headline: "Our Services" });
    expect(err).toBeNull();
  });

  it("services: rejects service item missing name", () => {
    const err = validateBody("services", {
      headline: "Services",
      services: [{ name: "", description: "test" }],
    });
    expect(err).toBe("Service 1 is missing a name");
  });

  it("testimonials: rejects testimonial missing quote", () => {
    const err = validateBody("testimonials", {
      testimonials: [{ quote: "Great!" }, { quote: "" }],
    });
    expect(err).toBe("Testimonial 2 is missing a quote");
  });

  it("events: rejects event missing title", () => {
    const err = validateBody("events", {
      events: [{ title: "" }],
    });
    expect(err).toBe("Event 1 is missing a title");
  });

  it("providers: rejects provider missing name", () => {
    const err = validateBody("providers", {
      providers: [{ name: "Good" }, { name: "  " }],
    });
    expect(err).toBe("Provider 2 is missing a name");
  });

  it("products: rejects product missing name", () => {
    const err = validateBody("products", {
      headline: "Products",
      products: [{ name: "", price: "5.99" }],
    });
    expect(err).toBe("Product 1 is missing a name");
  });

  it("products: rejects product missing price", () => {
    const err = validateBody("products", {
      headline: "Products",
      products: [{ name: "Widget", price: "" }],
    });
    expect(err).toBe("Product 1 is missing a price");
  });

  it("events: passes validation with no required fields when array absent", () => {
    // events has no top-level required fields
    const err = validateBody("events", {});
    expect(err).toBeNull();
  });
});

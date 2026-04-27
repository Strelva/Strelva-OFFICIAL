import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { getContent, setContent } from "../lib/storage";

/**
 * Tenant isolation tests.
 *
 * These exercise the dev-file storage path (no Sanity env vars set)
 * to verify that content reads/writes are scoped per tenant and
 * that one tenant can never see another's data.
 */

const TENANT_A = "__test_tenant_a";
const TENANT_B = "__test_tenant_b";
const MISSING_TENANT = "__test_tenant_missing";

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

describe("tenant isolation", () => {
  beforeAll(async () => {
    await cleanupTenantFile(TENANT_A);
    await cleanupTenantFile(TENANT_B);
    await cleanupTenantFile(MISSING_TENANT);
  });

  afterAll(async () => {
    await cleanupTenantFile(TENANT_A);
    await cleanupTenantFile(TENANT_B);
    await cleanupTenantFile(MISSING_TENANT);
  });

  // --- getTenantConfig ---

  it("getTenantConfig returns correct config for a known tenant", async () => {
    // getTenantConfig reads from dev-tenants.json
    const { getTenantConfig } = await import("../lib/tenants");
    const config = await getTenantConfig("gldf");
    expect(config).toBeDefined();
    expect(config!.id).toBe("gldf");
    expect(config!.siteName).toBe("Great Lakes Dried Fruit");
  });

  it("getTenantConfig returns undefined for a non-existent tenant", async () => {
    const { getTenantConfig } = await import("../lib/tenants");
    const config = await getTenantConfig("__does_not_exist");
    expect(config).toBeUndefined();
  });

  // --- Content scoping ---

  it("content write to tenant A is not visible from tenant B", async () => {
    const heroA = {
      headline: "Tenant A headline",
      subheadline: "",
      tagline: "Tenant A tagline",
      ctaText: "Book A",
      ctaLink: "/a",
      backgroundImageUrl: "",
    };

    await setContent("hero", heroA, TENANT_A);
    const readFromB = await getContent("hero", TENANT_B);

    // Tenant B should get defaults, not tenant A's data
    expect(readFromB.headline).not.toBe("Tenant A headline");
  });

  it("two tenants can store different content for the same section", async () => {
    const heroA = {
      headline: "A Headline",
      subheadline: "",
      tagline: "A Tagline",
      ctaText: "CTA A",
      ctaLink: "/a",
      backgroundImageUrl: "",
    };
    const heroB = {
      headline: "B Headline",
      subheadline: "",
      tagline: "B Tagline",
      ctaText: "CTA B",
      ctaLink: "/b",
      backgroundImageUrl: "",
    };

    await setContent("hero", heroA, TENANT_A);
    await setContent("hero", heroB, TENANT_B);

    const readA = await getContent("hero", TENANT_A);
    const readB = await getContent("hero", TENANT_B);

    expect(readA.headline).toBe("A Headline");
    expect(readB.headline).toBe("B Headline");
  });

  it("content write to one section doesn't bleed into another section", async () => {
    const contact = {
      email: "a@test.com",
      locationTitle: "",
      locationDescription: "",
      instagramUrl: "",
      facebookUrl: "",
    };

    await setContent("contact", contact, TENANT_A);
    const hero = await getContent("hero", TENANT_A);

    // Hero should still be what we set earlier, not contact data
    expect(hero.headline).toBe("A Headline");
  });

  // --- Missing tenant fallback ---

  it("reading content for a tenant with no stored data returns defaults", async () => {
    const hero = await getContent("hero", MISSING_TENANT);
    // defaults.hero has this headline (generic placeholder)
    expect(hero.headline).toContain("Move Better");
  });

  // --- File-level isolation ---

  it("each tenant writes to its own file on disk", async () => {
    // After previous writes, both tenant files should exist
    const fileA = devContentPath(TENANT_A);
    const fileB = devContentPath(TENANT_B);

    const statA = await fs.stat(fileA);
    const statB = await fs.stat(fileB);

    expect(statA.isFile()).toBe(true);
    expect(statB.isFile()).toBe(true);

    // And their contents should differ
    const rawA = JSON.parse(await fs.readFile(fileA, "utf-8"));
    const rawB = JSON.parse(await fs.readFile(fileB, "utf-8"));

    expect(rawA.hero.headline).toBe("A Headline");
    expect(rawB.hero.headline).toBe("B Headline");
  });
});

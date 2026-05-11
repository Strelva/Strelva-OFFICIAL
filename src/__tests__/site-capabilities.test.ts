import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantConfig } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  tenantConfig: {
    id: "demo",
    active: true,
    template: "wellness",
    customRepo: {
      contractVersion: "v1",
      supportsDraftPreview: true,
      supportsInlineEditing: true,
      supportedDesignTokens: ["colors", "fonts"],
    },
  } as TenantConfig,
}));

vi.mock("@/lib/tenants", () => ({
  getTenantConfig: vi.fn(() => Promise.resolve(mocks.tenantConfig)),
}));

vi.mock("@/components/templates/registry", () => ({
  getTemplateForTenant: vi.fn(() =>
    Promise.resolve({
      id: "wellness",
      components: { hero: () => null, services: () => null, cta: () => null },
      contentSections: ["hero", "services", "settings", "theme", "navigation", "footer"],
    })
  ),
}));

describe("site capability manifest", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mocks.tenantConfig = {
      id: "demo",
      active: true,
      template: "wellness",
      customRepo: {
        contractVersion: "v1",
        supportsDraftPreview: true,
        supportsInlineEditing: true,
        supportedDesignTokens: ["colors", "fonts"],
      },
    } as TenantConfig;
  });

  it("builds default section variants and design token support", async () => {
    const { getSiteCapabilityManifest } = await import("@/lib/site-capabilities");

    const manifest = await getSiteCapabilityManifest("demo");

    expect(manifest.designTokens).toEqual(["colors", "fonts"]);
    expect(manifest.sections.hero.variants).toContain("editorial");
    expect(manifest.sections.services.variants).toContain("compact");
    expect(manifest.supportsDraftPreview).toBe(true);
  });

  it("merges a valid remote custom repo manifest when configured", async () => {
    mocks.tenantConfig.customRepo = {
      ...mocks.tenantConfig.customRepo,
      capabilityManifestUrl: "https://client.example.com/api/reb-capabilities",
    };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      contractVersion: "v1",
      sections: {
        hero: {
          variants: ["default", "cinematic"],
          editableFields: ["headline"],
          styleProps: ["variant"],
        },
      },
      designTokens: ["colors"],
      supportsPageConfig: true,
      supportsNavigationConfig: true,
      supportsFooterConfig: true,
      supportsDraftPreview: true,
      supportsInlineEditing: false,
      customOnlyFeatures: ["cart"],
      customRequestEndpoint: "/api/reb-custom-request",
      customComponents: [],
    }), { status: 200 }))));

    const { getSiteCapabilityManifest } = await import("@/lib/site-capabilities");

    const manifest = await getSiteCapabilityManifest("demo");

    expect(manifest.sections.hero.variants).toEqual(["default", "cinematic"]);
    expect(manifest.supportsInlineEditing).toBe(false);
    expect(manifest.customOnlyFeatures).toEqual(["cart"]);
    expect(manifest.customRequestEndpoint).toBe("/api/reb-custom-request");
  });
});

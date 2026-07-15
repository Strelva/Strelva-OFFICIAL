import { describe, it, expect } from "vitest";
import type { TenantConfig } from "@/lib/types";
import {
  composeTenantConfig,
  decomposeTenantConfig,
} from "@/lib/tenant/projection";

/**
 * A TenantConfig with EVERY field populated with a realistic value (plus a few
 * intentionally left `undefined`). This is the guarantee the decomposition covers
 * every field — if a field were dropped from all four sub-models, the round-trip
 * below would lose it and the assertion would fail.
 */
const fullFixture: TenantConfig = {
  // identity
  id: "gldf",
  subdomain: "gldf",
  siteName: "Good Life Dog Food",
  createdAt: "2026-01-15",
  updatedAt: "2026-07-14T12:00:00.000Z",
  active: true,
  // profile
  ownerName: "Dana Rivera",
  ownerEmail: "dana@goodlifedogfood.com",
  ownerPhone: "+17165551234",
  industry: "pet food",
  businessHours: {
    schedule: [
      { day: 1, open: "09:00", close: "17:00", closed: false },
      { day: 0, open: "00:00", close: "00:00", closed: true },
    ],
    holidays: [{ date: "2026-12-25", label: "Christmas" }],
    timezone: "America/New_York",
  },
  branding: {
    initials: "GL",
    tagline: "Real food for real dogs",
    bgColor: "#0b1f14",
    accentColor: "#447a4f",
    fgColor: "#ffffff",
  },
  personality: "warm and casual",
  businessRules: "Never promise vet advice. Always mention free local delivery.",
  socialConfig: { connectedPlatforms: ["instagram", "facebook"] },
  reviewsConfig: { googlePlaceId: "ChIJ-place-id", yelpBusinessId: "gldf-buffalo" },
  referredBy: "rohlax",
  // site
  template: "food-brand",
  deliveryModel: "custom_repo",
  customRepo: {
    repoName: "gldf-site",
    repoUrl: "https://github.com/strelva/gldf-site",
    localPath: "/Users/jacob/gldf-site",
    productionUrl: "https://goodlifedogfood.com",
    deploymentProvider: "vercel",
    deploymentProjectId: "prj_abc123",
    lastDeploymentUrl: "https://gldf-site-abc.vercel.app",
    lastDeploymentAt: "2026-07-10T08:00:00.000Z",
    supportedSections: ["hero", "products", "contact"],
    capabilityManifestUrl: "https://goodlifedogfood.com/api/capabilities",
    supportedDesignTokens: ["colors", "fonts"],
    supportsPageConfig: true,
    supportsDraftPreview: true,
    supportsInlineEditing: false,
    customFeatures: ["subscription-box"],
    externalDependencies: [
      {
        id: "dep-1",
        name: "Stripe",
        provider: "stripe",
        purpose: "checkout",
        status: "healthy",
        severity: "info",
        detectedAt: "2026-06-01T00:00:00.000Z",
        lastCheckedAt: "2026-07-14T00:00:00.000Z",
        source: "manifest",
        actionUrl: "https://dashboard.stripe.com",
        owner: "jacob",
        notes: "live account",
      },
    ],
    contractVersion: "2026-07-01",
    revalidationHealth: "healthy",
    buildCommand: "pnpm build",
    testCommand: "pnpm test",
    rollbackPlan: "revert last deploy",
    notes: "flagship food-brand build",
  },
  siteCapabilities: {
    contractVersion: "2026-07-01",
    supportsPageConfig: true,
    supportsNavigationConfig: true,
    supportsFooterConfig: true,
    supportsDraftPreview: true,
    supportsInlineEditing: false,
    designTokens: ["colors", "fonts"],
    customOnlyFeatures: ["commerce"],
    customComponents: [],
    sections: {
      hero: { variants: ["default"], editableFields: ["headline"], styleProps: ["bg"] },
    },
  },
  features: ["commerce", "reviews", "blog"],
  integrations: ["google", "instagram"],
  customDomains: ["goodlifedogfood.com", "www.goodlifedogfood.com"],
  domainClaims: [
    {
      domain: "goodlifedogfood.com",
      tenantId: "gldf",
      role: "production",
      status: "verified",
      dnsStatus: "configured",
      sslStatus: "issued",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      verification: ["TXT=abc"],
      vercelProjectId: "prj_abc123",
    },
  ],
  productionDomain: "goodlifedogfood.com",
  adminDomain: "admin.goodlifedogfood.com",
  siteUrl: "https://goodlifedogfood.com",
  revalidateUrl: "https://goodlifedogfood.com/api/revalidate",
  revalidationSecret: "revalidate-secret-xyz",
  resendDomain: "updates.goodlifedogfood.com",
  visibility: {
    trade: "pet food",
    towns: ["Buffalo, NY", "Cheektowaga, NY"],
    competitors: [{ name: "Chow Town", domain: "chowtown.com" }],
    queriesPerWeek: 3,
    enabled: true,
  },
  // commercial
  stripeCustomerId: "cus_abc123",
  stripeSubscriptionId: "sub_abc123",
  subscriptionStatus: "active",
  subscriptionStartedAt: "2026-06-26T00:00:00.000Z",
  subscriptionPastDueSince: undefined,
  commitmentEndsAt: "2027-06-26",
  planOverride: "founder_comp",
  subscriptionPlan: "growth",
  planMonthlyCents: 19900,
  planCurrency: "usd",
  // policy
  autoPublish: true,
  autoApproveThreshold: 3,
  bookingProvider: "calendly",
  bookingUrl: "https://calendly.com/gldf",
  beholdFeedId: "behold-feed-123",
  slackWebhookUrl: "https://hooks.slack.com/services/xxx",
  googleSearchConsoleKey: '{"type":"service_account"}',
  instagramAccessToken: "ig-token-abc",
};

/**
 * A minimal TenantConfig — only the required fields set, every optional left off.
 * Proves optional-field round-trip: absent keys stay semantically absent.
 */
const sparseFixture: TenantConfig = {
  id: "starter",
  subdomain: "starter",
  siteName: "Starter Site",
  ownerName: "",
  industry: "",
  active: false,
  createdAt: "2026-07-14",
  template: "wellness",
};

describe("tenant projection round-trip", () => {
  it("recomposes a fully-populated TenantConfig losslessly", () => {
    const recomposed = composeTenantConfig(decomposeTenantConfig(fullFixture));
    expect(recomposed).toEqual(fullFixture);
  });

  it("recomposes a sparse (mostly-undefined) TenantConfig losslessly", () => {
    const recomposed = composeTenantConfig(decomposeTenantConfig(sparseFixture));
    expect(recomposed).toEqual(sparseFixture);
  });

  it("assigns every field to exactly one sub-model (no field lost, none duplicated)", () => {
    const parts = decomposeTenantConfig(fullFixture);
    const keysPerModel = [
      Object.keys(parts.identity),
      Object.keys(parts.profile),
      Object.keys(parts.site),
      Object.keys(parts.commercial),
      Object.keys(parts.policy),
    ];
    const allKeys = keysPerModel.flat();
    // Disjoint: no key appears in two sub-models.
    expect(new Set(allKeys).size).toBe(allKeys.length);
    // Complete: the union equals the TenantConfig's own keys.
    expect(new Set(allKeys)).toEqual(new Set(Object.keys(fullFixture)));
  });
});

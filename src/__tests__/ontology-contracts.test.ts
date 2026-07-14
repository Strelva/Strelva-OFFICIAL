import { describe, expect, it } from "vitest";
import { siteSettingsSchema } from "@/lib/schemas";
import { resolveEditableSections } from "@/lib/agent-shared";
import { AGENT_TOOL_CATALOG, getAllTools } from "@/lib/capabilities";
import { computeMrrDollars } from "@/lib/portfolio";
import { PRESENCE_PROFILES, type SiteCapabilityManifest } from "@/lib/types";
import { FEATURE_SETS } from "@/lib/features/registry";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("ontology contracts", () => {
  it("preserves every supported site-settings field through validation", () => {
    const parsed = siteSettingsSchema.parse({
      siteName: "Acme",
      siteTagline: "Tagline",
      siteDescription: "Description",
      footerTagline: "Footer",
      copyrightText: "Copyright",
      trustBadge: "Licensed and insured",
      brandVoice: "Direct and neighborly",
      businessModel: "local",
    });
    expect(parsed).toMatchObject({
      trustBadge: "Licensed and insured",
      brandVoice: "Direct and neighborly",
      businessModel: "local",
    });
  });

  it("never turns arbitrary manifest or component keys into writable content", () => {
    const manifest = {
      contractVersion: "1",
      sections: {
        hero: { variants: [], editableFields: [], styleProps: [], allowedActions: ["draft"] },
        Header: { variants: [], editableFields: [], styleProps: [], allowedActions: ["draft"] },
        invented_section: { variants: [], editableFields: [], styleProps: [], allowedActions: ["draft"] },
        faq: { variants: [], editableFields: [], styleProps: [], allowedActions: ["draft"] },
      },
      designTokens: [],
      supportsPageConfig: true,
      supportsNavigationConfig: true,
      supportsFooterConfig: true,
      supportsDraftPreview: true,
      supportsInlineEditing: true,
      customOnlyFeatures: [],
      customComponents: [],
    } satisfies SiteCapabilityManifest;

    const result = resolveEditableSections(
      { contentSections: ["hero"], components: { Header: {} } },
      manifest,
    );
    expect(result.agentEditableSections).toEqual(["hero", "faq"]);
  });

  it("advertises only real catalogued tools and records their execution surfaces", () => {
    expect(getAllTools("chat").has("draft_newsletter")).toBe(true);
    expect(getAllTools("chat").has("save_entry")).toBe(true);
    expect(getAllTools("chat").has("reply_to_review")).toBe(true);
    expect([...getAllTools("chat")]).not.toContain("send_newsletter");
    expect(AGENT_TOOL_CATALOG.create_gbp_post).toContain("background");
  });

  it("sums tenant-specific commercial amounts instead of assuming one price", () => {
    expect(computeMrrDollars([
      { id: "a", subscriptionStatus: "active", subscriptionPlan: "presence", planMonthlyCents: 9_900 },
      { id: "b", subscriptionStatus: "active", subscriptionPlan: "scale", planMonthlyCents: 49_900 },
    ])).toBe(598);
  });

  it("guards the Store route with the same commerce capability family as navigation", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/dashboard/store/page.tsx"),
      "utf8",
    );
    expect(source).toContain('requireDashboardFeature(["commerce", "products", "shop"])');
  });

  it("keeps presence profile, feature sets, and commercial plans as independent vocabularies", () => {
    expect(PRESENCE_PROFILES).toEqual(["local", "online", "hybrid"]);
    expect(Object.keys(FEATURE_SETS).sort()).toEqual(["ecommerce", "wellness"]);
    expect(Object.keys(FEATURE_SETS)).not.toContain("growth");
    expect(FEATURE_SETS.wellness.scope).toMatch(/operational-lite/i);
  });

  it("keeps live Analytics and interpreted Reports as distinct surfaces", () => {
    const analytics = readFileSync(
      path.join(process.cwd(), "src/app/dashboard/analytics/page.tsx"),
      "utf8",
    );
    const reports = readFileSync(
      path.join(process.cwd(), "src/app/dashboard/reports/page.tsx"),
      "utf8",
    );
    expect(analytics).toContain("AnalyticsLiveView");
    expect(analytics).not.toContain("WeeklyBriefClient");
    expect(reports).toContain("WeeklyBriefClient");
    expect(reports).not.toContain("AnalyticsLiveView");
  });

  it("publishes the canonical glossary required by the domain model", () => {
    const ontology = readFileSync(
      path.join(process.cwd(), "docs/product-ontology.md"),
      "utf8",
    );
    for (const term of [
      "Tenant",
      "Site Property",
      "Actor",
      "Platform Membership",
      "Customer Inquiry",
      "Commercial Plan",
      "Presence Profile",
      "Feature Set",
      "Tenant Capability",
      "Site Capability",
      "Agent Capability",
      "Surface",
      "Provider",
      "Connection",
      "Signal",
      "Workflow Event",
      "Activity",
      "Audit",
      "Version",
      "Draft",
      "Report",
    ]) {
      expect(ontology).toContain(term);
    }
  });
});

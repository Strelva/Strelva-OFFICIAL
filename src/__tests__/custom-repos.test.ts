import { describe, expect, it } from "vitest";
import {
  getBlockingCustomRepoDependencies,
  getCustomRepoDependencies,
  getTenantEditablePreviewUrl,
  getWorstCustomRepoDependencyStatus,
} from "@/lib/custom-repos";
import { prepareEditablePreviewHtml, prepareLivePreviewHtml } from "@/lib/preview-html";
import type { TenantConfig } from "@/lib/types";

const baseTenant: TenantConfig = {
  id: "gldf",
  subdomain: "gldf",
  siteName: "Great Lakes Dried Fruit",
  ownerName: "Great Lakes Dried Fruit",
  industry: "food",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  template: "food-brand",
};

describe("custom repo preview URLs", () => {
  it("uses the custom storefront for editable custom-repo previews", () => {
    expect(
      getTenantEditablePreviewUrl(
        {
          ...baseTenant,
          deliveryModel: "custom_repo",
          customRepo: { productionUrl: "https://greatlakesdriedfruit.com" },
        },
        {
          requestOrigin: "http://localhost:3000",
          siteUrl: "https://greatlakesdriedfruit.com",
        }
      )
    ).toBe("https://greatlakesdriedfruit.com");
  });

  it("keeps platform templates on the local dashboard origin", () => {
    expect(
      getTenantEditablePreviewUrl(
        {
          ...baseTenant,
          deliveryModel: "platform_template",
          productionDomain: "greatlakesdriedfruit.com",
        },
        {
          requestOrigin: "http://localhost:3000",
          siteUrl: "https://greatlakesdriedfruit.com",
        }
      )
    ).toBe("http://localhost:3000");
  });
});

describe("custom repo dependency health", () => {
  it("seeds GLDF Supabase as paused until tenant metadata overrides it", () => {
    const dependencies = getCustomRepoDependencies({
      ...baseTenant,
      deliveryModel: "custom_repo",
      customRepo: { repoName: "gldf-storefront" },
    });

    expect(dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "gldf-supabase",
          provider: "Supabase",
          status: "paused",
          severity: "critical",
          detectedAt: "2026-05-06",
        }),
      ])
    );
    expect(getBlockingCustomRepoDependencies({ ...baseTenant, deliveryModel: "custom_repo" })).toHaveLength(1);
  });

  it("does not duplicate GLDF Supabase when custom repo metadata has its own record", () => {
    const dependencies = getCustomRepoDependencies({
      ...baseTenant,
      deliveryModel: "custom_repo",
      customRepo: {
        externalDependencies: [
          {
            id: "supabase-production",
            name: "Supabase production",
            provider: "Supabase",
            purpose: "Storefront data",
            status: "healthy",
            severity: "info",
          },
        ],
      },
    });

    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].id).toBe("supabase-production");
  });

  it("summarizes the worst dependency state", () => {
    expect(
      getWorstCustomRepoDependencyStatus([
        {
          id: "stripe",
          name: "Stripe",
          provider: "Stripe",
          purpose: "Payments",
          status: "healthy",
          severity: "info",
        },
        {
          id: "supabase",
          name: "Supabase",
          provider: "Supabase",
          purpose: "Rewards",
          status: "paused",
          severity: "critical",
        },
      ])
    ).toEqual({ status: "paused", severity: "critical" });
  });
});

describe("preview HTML preparation", () => {
  it("keeps live preview inert while preserving asset base", () => {
    const html = prepareLivePreviewHtml(
      '<html><head></head><body><section data-reb-section="hero">Hi</section><script>alert(1)</script></body></html>',
      "https://greatlakesdriedfruit.com/"
    );

    expect(html).toContain('<base href="https://greatlakesdriedfruit.com/">');
    expect(html).toContain('data-reb-section="hero"');
    expect(html).not.toContain("alert(1)");
  });

  it("injects the edit bridge for managed custom storefront previews", () => {
    const html = prepareEditablePreviewHtml(
      '<html><head></head><body><section data-reb-section="hero"><h1 data-reb-field="headline">Hi</h1></section></body></html>',
      "https://greatlakesdriedfruit.com/"
    );

    expect(html).toContain('id="reb-edit-preview-bridge"');
    expect(html).toContain("reb-inline-edit");
    expect(html).toContain('contenteditable", "true"');
  });
});

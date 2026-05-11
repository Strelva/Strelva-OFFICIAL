import { describe, expect, it } from "vitest";
import { getTenantEditablePreviewUrl } from "@/lib/custom-repos";
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

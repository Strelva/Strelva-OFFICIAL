import { describe, expect, it } from "vitest";
import { websiteDomainRequestSchema as platform } from "@/platform/needs-you/sources/website-domain-store";
import { websiteDomainRequestSchema as product } from "@/products/websites/client";
import { normalizeTenantDomain as legacy } from "@/lib/tenant-urls";
import { normalizeTenantDomain as infrastructure } from "@/platform/infra/domain-normalization";
import { exactBusinessPageUrl as publicAcknowledgement } from "@/products/connected-sites/client";
import { exactBusinessPageUrl as internalAcknowledgement } from "@/products/connected-sites/acknowledgement";

describe("boundary contract owners", () => {
  it("uses the single stored domain schema from the public browser entry", () => { expect(product).toBe(platform); });
  it("retains the legacy normalizer as the exact canonical function", () => {
    expect(legacy).toBe(infrastructure);
    expect(legacy(" https://WWW.Example.COM/path ")).toBe("www.example.com");
    expect(legacy(undefined)).toBeNull();
  });
  it("exposes the same exact public-page acknowledgement guard", () => { expect(publicAcknowledgement).toBe(internalAcknowledgement); });
});

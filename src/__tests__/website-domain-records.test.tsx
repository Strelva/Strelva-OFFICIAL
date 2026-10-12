import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WebsiteDomainRecords } from "@/experience/websites/WebsiteDomainRecords";
import type { WebsiteDomainView } from "@/products/websites/rebuild-contracts";

const domain: WebsiteDomainView = { hostname: "business.example.test", status: "verified", checkedAt: "2026-10-09T18:02:00Z", records: [{ type: "CNAME", name: "www", value: "provider.example.test" }] };
const render = (props: Partial<Parameters<typeof WebsiteDomainRecords>[0]> = {}) => renderToStaticMarkup(createElement(WebsiteDomainRecords, { domain, ...props }));

describe("website domain recommendations", () => {
  it("shows exact provider values and distinguishes domain verification from record checks", () => {
    const html = render();
    expect(html).toContain("provider.example.test");
    expect(html).toContain("Domain verified");
    expect(html).toContain("Not checked separately");
    expect(html).toContain("Mail records stay as they are.");
    expect(html).toContain("Registration, renewal date and where each hostname sends visitors are not available here yet.");
  });
  it("does not expose a hostname or values without permission", () => {
    const html = render({ canSee: false });
    expect(html).toContain("don’t have permission");
    expect(html).not.toContain("business.example.test");
    expect(html).not.toContain("provider.example.test");
    expect(html).not.toContain("Copy");
  });
  it("shows loading and error instead of stale records", () => {
    expect(render({ loading: true })).toContain('aria-label="Loading domain records"');
    expect(render({ loading: true })).not.toContain("provider.example.test");
    expect(render({ error: "Records unavailable" })).toContain("Records unavailable");
    expect(render({ error: "Records unavailable" })).not.toContain("provider.example.test");
  });
  it("does not substitute records when a domain or recommendations are missing", () => {
    expect(render({ domain: null })).toContain("No domain is recorded");
    const html = render({ domain: { ...domain, records: [] } });
    expect(html).toContain("No recommended records were returned");
    expect(html).not.toContain("provider.example.test");
  });
});

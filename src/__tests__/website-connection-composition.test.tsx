import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectSiteExperience, type ConnectableSite } from "@/experience/connected-sites/ConnectSiteExperience";

const site: ConnectableSite = { id: "7a000000-0000-4000-8000-000000000003", siteHost: "business.example.test", siteUrl: "https://business.example.test/", status: "active", verifiedAt: "2026-10-09T18:02:00Z", systemId: "7a000000-0000-4000-8000-000000000002", snippet: { script: '<script data-strelva-site="private-install-value"></script>', meta: '<meta name="strelva-site-verification" content="private-verification-value">' } };
const render = (canManage: boolean, verifiedAt: string | null) => renderToStaticMarkup(createElement(ConnectSiteExperience, { workspaceId: "7a000000-0000-4000-8000-000000000001", canManage, initialSites: [{ ...site, verifiedAt }] }));

describe("connected website presentation", () => {
  it("does not redisplay installation values on a verified site", () => {
    for (const canManage of [true, false]) {
      const html = render(canManage, site.verifiedAt);
      expect(html).toContain("business.example.test is connected");
      expect(html).not.toContain("private-install-value");
      expect(html).not.toContain("private-verification-value");
    }
  });
  it("retains both exact installation lines and manual verification before collection", () => {
    const html = render(true, null);
    expect(html).toContain("private-install-value");
    expect(html).toContain("private-verification-value");
    expect(html).toContain("Check my site");
    expect(html).toContain("Nothing is collected until then.");
    expect(html).not.toContain("listening");
  });
});

// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readCheck: vi.fn(), attribution: vi.fn(), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), redirect: mocks.redirect, notFound: () => { throw new Error("not found"); } }));
vi.mock("@/platform/agency-prospecting/server", () => ({ resolveAgencyAttribution: mocks.attribution }));
vi.mock("@/products/getting-started/server", () => ({ gettingStarted: { readCheck: mocks.readCheck } }));

import AccessRequest from "@/app/access-request/page";
import BusinessCheck from "@/app/(product)/audit/page";
import AiVisibility from "@/app/(product)/ai-visibility/page";
import { WebsiteEntry } from "@/experience/websites/WebsiteEntry";
import { websiteEntryPath } from "@/experience/websites/site-navigation";

const WS = "11111111-1111-4111-8111-111111111111";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function expectNeutralAgencyEntry(html: string) {
  expect(html).toContain('href="/agencies"');
  expect(html).toContain("Find an agency");
  expect(html).not.toContain("Strelva Agency");
  expect(html).not.toContain("<form");
}
const inputValues = (html: string) => [...html.matchAll(/<input[^>]*>/g)].map(match => match[0].match(/value="([^"]*)"/)?.[1] ?? "");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((href: string) => { throw new Error(`redirect:${href}`); });
  vi.unstubAllEnvs();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "1");
  mocks.attribution.mockResolvedValue(undefined);
  mocks.readCheck.mockResolvedValue({ resultId: "scan_abc", kind: "ai_visibility", name: "Northside Bakery", website: "https://northside.example/" });
});

describe("one website, typed once", () => {
  it("carries the check's business and website into the neutral account and agency entry", async () => {
    const html = renderToStaticMarkup(await AccessRequest({ searchParams: Promise.resolve({ ref: "ai-visibility", scan: "scan_abc" }) }));
    expectNeutralAgencyEntry(html);
    expect(mocks.readCheck).toHaveBeenCalledWith("scan_abc");
    expect(html).toContain("Northside Bakery");
    expect(html).toContain("northside.example");
    expect(html).toContain(`href="/sign-up?next=${encodeURIComponent("/workspace?save=scan_abc")}"`);
  });

  it("does not read or carry the check when the owner door is off (negative control)", async () => {
    vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "0");
    const html = renderToStaticMarkup(await AccessRequest({ searchParams: Promise.resolve({ ref: "ai-visibility", scan: "scan_abc" }) }));
    expectNeutralAgencyEntry(html);
    expect(mocks.readCheck).not.toHaveBeenCalled();
    expect(html).not.toContain("Northside Bakery");
    expect(html).not.toContain("https://northside.example/");
  });

  it("preserves the prefilled business and website through the legacy AI-check redirect", async () => {
    await expect(AiVisibility({ searchParams: Promise.resolve({ business: "Northside Bakery", url: "https://northside.example/" }) }))
      .rejects.toThrow("redirect:/audit?business=Northside+Bakery&url=https%3A%2F%2Fnorthside.example%2F");
  });

  it("prefills the current business check regardless of the owner signup flag", async () => {
    for (const enabled of ["1", "0"]) {
      vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", enabled);
      const html = renderToStaticMarkup(await BusinessCheck({ searchParams: Promise.resolve({ business: "Northside Bakery", url: "https://northside.example/" }) }));
      expect(inputValues(html)).toEqual(expect.arrayContaining(["Northside Bakery", "https://northside.example/"]));
    }
  });

  it("prefills connect and rebuild from the business's one website", () => {
    const render = (connected: boolean, rebuild: boolean, businessWebsite?: string) => renderToStaticMarkup(createElement(WebsiteEntry, { workspaceId: WS, connectedEnabled: connected, rebuildEnabled: rebuild, path: websiteEntryPath(connected, rebuild, null), canManage: true, businessWebsite }));
    expect(inputValues(render(true, false, "https://northside.example/"))).toContain("https://northside.example/");
    expect(inputValues(render(false, true, "https://northside.example/"))).toContain("https://northside.example/");
    expect(inputValues(render(true, false))).not.toContain("https://northside.example/");
    expect(inputValues(render(false, true))).not.toContain("https://northside.example/");
  });
});

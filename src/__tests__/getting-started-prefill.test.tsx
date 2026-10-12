import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readCheck: vi.fn(), attribution: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), notFound: () => { throw new Error("not found"); } }));
vi.mock("@/platform/agency-prospecting/server", () => ({ resolveAgencyAttribution: mocks.attribution }));
vi.mock("@/products/getting-started/server", () => ({ gettingStarted: { readCheck: mocks.readCheck } }));

import AccessRequest from "@/app/access-request/page";
import AiVisibility from "@/app/(product)/ai-visibility/page";
import { WebsiteEntry } from "@/experience/websites/WebsiteEntry";
import { websiteEntryPath } from "@/experience/websites/site-navigation";

const WS = "11111111-1111-4111-8111-111111111111";
const value = (html: string, id: string) => html.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`))?.[1] ?? html.match(new RegExp(`value="([^"]*)"[^>]*id="${id}"`))?.[1] ?? null;
const inputValues = (html: string) => [...html.matchAll(/<input[^>]*>/g)].map(match => match[0].match(/value="([^"]*)"/)?.[1] ?? "");

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "1");
  mocks.attribution.mockResolvedValue(undefined);
  mocks.readCheck.mockResolvedValue({ resultId: "scan_abc", kind: "ai_visibility", name: "Northside Bakery", website: "https://northside.example/" });
});

describe("one website, typed once", () => {
  it("prefills the access request from the check that sent the person there", async () => {
    const html = renderToStaticMarkup(await AccessRequest({ searchParams: Promise.resolve({ ref: "ai-visibility", scan: "scan_abc" }) }));
    expect(mocks.readCheck).toHaveBeenCalledWith("scan_abc");
    expect(value(html, "business-name")).toBe("Northside Bakery");
    expect(value(html, "current-website")).toBe("https://northside.example/");
  });

  it("leaves the access request blank when the owner door is off (negative control)", async () => {
    vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "0");
    const html = renderToStaticMarkup(await AccessRequest({ searchParams: Promise.resolve({ ref: "ai-visibility", scan: "scan_abc" }) }));
    expect(mocks.readCheck).not.toHaveBeenCalled();
    expect(value(html, "business-name")).toBe("");
    expect(value(html, "current-website")).toBe("");
  });

  it("carries the business name and website into the AI check only with the owner door on", async () => {
    const on = renderToStaticMarkup(await AiVisibility({ searchParams: Promise.resolve({ business: "Northside Bakery", url: "https://northside.example/" }) }));
    expect(inputValues(on)).toEqual(expect.arrayContaining(["Northside Bakery", "https://northside.example/"]));
    vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "0");
    const off = renderToStaticMarkup(await AiVisibility({ searchParams: Promise.resolve({ business: "Northside Bakery", url: "https://northside.example/" }) }));
    expect(inputValues(off)).not.toContain("Northside Bakery");
    expect(inputValues(off)).not.toContain("https://northside.example/");
  });

  it("prefills connect and rebuild from the business's one website", () => {
    const render = (connected: boolean, rebuild: boolean, businessWebsite?: string) => renderToStaticMarkup(createElement(WebsiteEntry, { workspaceId: WS, connectedEnabled: connected, rebuildEnabled: rebuild, path: websiteEntryPath(connected, rebuild, null), canManage: true, businessWebsite }));
    expect(inputValues(render(true, false, "https://northside.example/"))).toContain("https://northside.example/");
    expect(inputValues(render(false, true, "https://northside.example/"))).toContain("https://northside.example/");
    expect(inputValues(render(true, false))).not.toContain("https://northside.example/");
    expect(inputValues(render(false, true))).not.toContain("https://northside.example/");
  });
});

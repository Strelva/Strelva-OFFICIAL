// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
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
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); root = undefined; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function openAgencyForm(node: React.ReactElement) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(node));
  expect(container.querySelector("form")).toBeNull();
  const choose = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Ask Strelva Agency to do it for you"));
  expect(choose).toBeTruthy();
  await act(async () => choose!.click());
  return container;
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
  it("prefills the access request from the check that sent the person there", async () => {
    const form = await openAgencyForm(await AccessRequest({ searchParams: Promise.resolve({ ref: "ai-visibility", scan: "scan_abc" }) }));
    expect(mocks.readCheck).toHaveBeenCalledWith("scan_abc");
    expect(form.querySelector<HTMLInputElement>("#business-name")!.value).toBe("Northside Bakery");
    expect(form.querySelector<HTMLInputElement>("#current-website")!.value).toBe("https://northside.example/");
  });

  it("leaves the access request blank when the owner door is off (negative control)", async () => {
    vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "0");
    const form = await openAgencyForm(await AccessRequest({ searchParams: Promise.resolve({ ref: "ai-visibility", scan: "scan_abc" }) }));
    expect(mocks.readCheck).not.toHaveBeenCalled();
    expect(form.querySelector<HTMLInputElement>("#business-name")!.value).toBe("");
    expect(form.querySelector<HTMLInputElement>("#current-website")!.value).toBe("");
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

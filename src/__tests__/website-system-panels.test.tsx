// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemPage } from "@/experience/systems/SystemPage";
import { systemHref, type SystemView } from "@/experience/systems/model";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { previewWebsiteDetail } from "@/experience/workspace/preview/website-detail-fixture";

const BUSINESS = "76000000-0000-4000-8000-000000000001";
const SITE = "76000000-0000-4000-8000-000000000002";
const site: SystemView = {
  id: SITE, kind: "website", name: "attymooney.com", detail: "The Mooney Firm", lifecycle: "live",
  health: { state: "healthy", summary: "The latest checks passed." },
  surface: { kind: "website", domain: "attymooney.com", liveUrl: "https://www.attymooney.com", previewSrc: "https://www.attymooney.com", previewLabel: "attymooney.com, as visitors see it now" },
  operatedBy: "Strelva", connections: [], versions: [], possibilities: [],
};
const props = { system: site, systems: [site], workspaceId: BUSINESS, readOnly: false, sources: [], systemHref: (id: string) => systemHref("", BUSINESS, id), onHome: () => undefined, onAsk: () => undefined };
const html = (overrides: Partial<Parameters<typeof SystemPage>[0]>) => renderToStaticMarkup(createElement(SystemPage, { ...props, ...overrides }));

describe("website System page: domains, Waiting on you, Requests and History", () => {
  it("shows each list from the server, with domain verification state and History in one list", () => {
    const page = html({ websiteDetail: { status: "ready", detail: previewWebsiteDetail(SITE, "full") } });
    for (const heading of ["Domains", "Waiting on you", "Requests", "History"]) expect(page).toContain(`>${heading}<`);
    expect(page).toContain("www.attymooney.com"); expect(page).toContain("DNS misconfigured"); expect(page).toContain("Verified");
    expect(page).toContain("Put the spring consultation offer at the top of the homepage until May 1");
    expect(page).toContain("A change to the questions and answers is ready for review");
    expect(page).toContain("Add a private consultations page"); expect(page).toContain("In progress");
    expect(page).toContain("New office hours in the footer"); expect(page).toContain("Deploy · Strelva");
    expect(page).toContain("Saved copy"); expect(page).toContain("Content · You");
  });
  it("omits empty context blocks and keeps the one next-action link", () => {
    const page = html({ websiteDetail: { status: "ready", detail: previewWebsiteDetail(SITE, "empty") } });
    for (const heading of ["Domains", "Waiting on you", "Requests", "History"]) expect(page).not.toContain(`>${heading}<`);
    expect(page).toContain("Ask what else attymooney.com could become.");
  });
  it("names a source it could not read rather than showing it as empty", () => {
    const page = html({ websiteDetail: { status: "ready", detail: previewWebsiteDetail(SITE, "partial") } });
    expect(page).toContain("Couldn’t read domains just now");
    expect(page).not.toContain("No domain is recorded for this site yet.");
    expect(page).toContain("Couldn’t read content history just now");
  });
  it("shows loading and error states without claiming anything about the site", () => {
    expect(html({ websiteDetail: { status: "loading" } })).toContain("Loading domains, requests and history");
    const failed = html({ websiteDetail: { status: "error", message: "This business is unavailable to your account." } });
    expect(failed).toContain("This business is unavailable to your account. The site itself is unchanged.");
    expect(failed).not.toContain(">History<");
  });
  it("disables asking for a change when the page is read-only", () => {
    const page = html({ readOnly: true, websiteDetail: { status: "ready", detail: previewWebsiteDetail(SITE, "empty") } });
    const node = document.createElement("div");node.innerHTML = page;
    expect([...node.querySelectorAll("button")].find(button => button.textContent === "Ask for a change")?.disabled).toBe(true);
  });
  it("does not show website lists on other kinds of System", () => {
    const tool: SystemView = { ...site, kind: "app", surface: { kind: "work", workId: "w", productId: "unknown" } };
    expect(html({ system: tool, systems: [tool], websiteDetail: { status: "ready", detail: previewWebsiteDetail(SITE, "full") } })).not.toContain(">Waiting on you<");
  });
});

describe("website System page reads its lists from the server", () => {
  const roots: ReturnType<typeof createRoot>[] = [];
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
  afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
  async function mount(request: typeof fetch) {
    const node = document.createElement("div"); document.body.appendChild(node);
    const root = createRoot(node); roots.push(root);
    await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(SystemPage, props))));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    return node;
  }
  it("asks for this System only and renders the answer", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ detail: previewWebsiteDetail(SITE, "full") }), { status: 200 }));
    const node = await mount(request as unknown as typeof fetch);
    expect(request).toHaveBeenCalledWith(`/api/workspace/systems/website?workspaceId=${BUSINESS}&systemId=${SITE}`);
    expect(node.textContent).toContain("Add a private consultations page");
  });
  it("shows the server's refusal as an error", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ error: "This business is unavailable to your account." }), { status: 403 }));
    const node = await mount(request as unknown as typeof fetch);
    expect(node.querySelector("[role=alert]")?.textContent).toContain("This business is unavailable to your account.");
  });
  it("survives an unreachable server", async () => {
    const node = await mount((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch);
    expect(node.textContent).toContain("could not be reached");
  });
});

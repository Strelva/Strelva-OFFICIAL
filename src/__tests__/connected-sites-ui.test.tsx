// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebsiteSystemPanels } from "@/experience/systems/WebsiteSystemPanels";
import { ConnectSiteExperience } from "@/experience/connected-sites/ConnectSiteExperience";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { buildWebsiteSystemDetail, type ConnectedSiteDetail } from "@/experience/systems/website-detail";

const BUSINESS = "7a000000-0000-4000-8000-000000000001";
const SYSTEM = "7a000000-0000-4000-8000-000000000002";
const SITE = "7a000000-0000-4000-8000-000000000003";
const install = { script: '<script src="https://app.strelva.com/connect.js" data-strelva-site="sk_pub_abcdefghijklmnopqrstuvwx" defer></script>', meta: `<meta name="strelva-site-verification" content="${"c".repeat(32)}">` };
const connected = (overrides: Partial<ConnectedSiteDetail> = {}): ConnectedSiteDetail => ({ siteId: SITE, siteHost: "bakery.example", verified: false, install, lastEventAt: null, activity: {}, inquiries: [], ...overrides });
const detail = (site: ConnectedSiteDetail) => buildWebsiteSystemDetail({ systemId: SYSTEM, actorId: "a", domains: [], decisions: [], draftSections: [], siteReview: null, changeRequests: [], serviceRequests: [], contentVersions: [], snapshots: [], documentRevisions: [], linkedPublications: [], connectedSite: site, unavailable: [] });
const panels = (site: ConnectedSiteDetail, readOnly = false) => renderToStaticMarkup(createElement(WebsiteSystemPanels, { workspaceId: BUSINESS, systemId: SYSTEM, state: { status: "ready", detail: detail(site) }, onAsk: () => undefined, readOnly }));

describe("a connected site on its website System page", () => {
  it("asks the owner to prove the site, with the exact two lines", () => {
    const page = panels(connected());
    expect(page).toContain("Connected site");
    expect(page).toContain("Prove bakery.example is yours");
    expect(page).toContain("strelva-site-verification");
    expect(page).toContain("Check now");
    expect(page).toContain("It never edits your pages.");
  });
  it("tells a member who cannot finish it, without the token", () => {
    const page = panels(connected({ install: null }), true);
    expect(page).toContain("An owner or admin of this business can finish connecting it.");
    expect(page).not.toContain("strelva-site-verification");
  });
  it("shows what a proven site reports and its inquiries", () => {
    const page = panels(connected({ verified: true, install: null, lastEventAt: "2026-10-07T12:00:00Z", activity: { visit: 12, call_click: 1 }, inquiries: [{ id: "i1", name: "Pat Visitor", email: "pat@example.test", message: "A cake for Friday?", capturedAt: "2026-10-07T13:00:00Z" }] }));
    expect(page).toContain("Last 30 days: 12 visits, 1 call tap.");
    expect(page).toContain("Pat Visitor"); expect(page).toContain("A cake for Friday?");
    expect(page).not.toContain("Prove bakery.example is yours");
    expect(panels(connected({ verified: true, install: null }))).toContain("No visits reported yet.");
  });
});

describe("bringing the website a business already has", () => {
  const roots: ReturnType<typeof createRoot>[] = [];
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
  afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
  async function mount(request: typeof fetch, props: Partial<Parameters<typeof ConnectSiteExperience>[0]> = {}) {
    const node = document.createElement("div"); document.body.appendChild(node);
    const root = createRoot(node); roots.push(root);
    await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(ConnectSiteExperience, { workspaceId: BUSINESS, canManage: true, initialSites: [], ...props }))));
    return node;
  }
  const site = { id: SITE, siteHost: "bakery.example", siteUrl: "https://bakery.example/", status: "active" as const, verifiedAt: null, systemId: SYSTEM, snippet: install };
  it("connects, shows the lines, then confirms and links to the website System", async () => {
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { action: string };
      return new Response(JSON.stringify({ site: body.action === "connect" ? site : { ...site, verifiedAt: "2026-10-08T01:00:00Z" } }), { status: 200 });
    });
    const node = await mount(request as unknown as typeof fetch);
    const input = node.querySelector("input")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "bakery.example"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(node.textContent).toContain("Add these two lines to bakery.example");
    await act(async () => { [...node.querySelectorAll("button")].find(item => item.textContent?.includes("Check my site"))!.click(); });
    expect(node.textContent).toContain("bakery.example is connected");
    expect(node.querySelector(`a[href*="system=${SYSTEM}"]`)).toBeTruthy();
  });
  it("shows the server's refusal and changes nothing", async () => {
    const node = await mount((async () => new Response(JSON.stringify({ error: "We couldn't find your verification tag or Strelva script on the live page yet." }), { status: 409 })) as unknown as typeof fetch, { initialSites: [site] });
    await act(async () => { [...node.querySelectorAll("button")].find(item => item.textContent?.includes("Check my site"))!.click(); });
    expect(node.querySelector("[role=alert]")?.textContent).toContain("verification tag");
    expect(node.textContent).toContain("Add these two lines");
  });
  it("keeps existing sites available while connecting another, and retains rejected inputs", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ error: "This address could not be verified" }), { status: 409 }));
    const node = await mount(request as unknown as typeof fetch, { initialSites: [{ ...site, verifiedAt: "2026-10-08T01:00:00Z" }] });
    await act(async () => { [...node.querySelectorAll("button")].find(item => item.textContent === "Connect another website")!.click(); });
    const field = node.querySelector("input")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "second.example"); field.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(field.value).toBe("second.example"); expect(node.querySelector('[role="alert"]')?.textContent).toContain("could not be verified");
    expect(node.querySelector('option[value="' + SITE + '"]')?.textContent).toBe("bakery.example");
  });
  it("tells a member an owner or admin connects the site", async () => {
    const node = await mount(vi.fn() as unknown as typeof fetch, { canManage: false });
    expect(node.textContent).toContain("An owner or admin of this business connects its website.");
    expect(node.querySelector("form")).toBeNull();
  });
});

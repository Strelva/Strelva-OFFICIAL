// @vitest-environment jsdom
import { act, createElement } from "react";
import { createHash, randomUUID } from "node:crypto";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectSiteExperience } from "@/experience/connected-sites/ConnectSiteExperience";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { PLATFORMS } from "@/products/connected-sites/contracts";
import { GUIDE_ORDER, INSTALL_GUIDES, installGuide, installStepsText } from "@/products/connected-sites/install-guides";
import { systemOriginId } from "@/platform/systems/invariants";

const BUSINESS = "7a000000-0000-4000-8000-000000000001";
const SITE = "7a000000-0000-4000-8000-000000000003";
const install = { script: '<script src="https://app.strelva.com/connect.js" data-strelva-site="sk_pub_abcdefghijklmnopqrstuvwx" defer></script>', meta: `<meta name="strelva-site-verification" content="${"c".repeat(32)}">` };
const site = { id: SITE, siteHost: "bakery.example", siteUrl: "https://bakery.example/", status: "active" as const, verifiedAt: null, systemId: systemOriginId(BUSINESS, { kind: "connected_site", ref: SITE }), snippet: install };

describe("install guides are one table", () => {
  it("covers every platform the connect form can save, and the owner-facing list has the required builders", () => {
    for (const platform of PLATFORMS) expect(INSTALL_GUIDES[platform]?.platform).toBe(platform);
    for (const required of ["wordpress", "wix", "squarespace", "webflow", "shopify", "godaddy", "duda", "custom", "unknown"] as const) {
      expect(GUIDE_ORDER).toContain(required);
      expect(installGuide(required).steps.length).toBeGreaterThan(1);
      if (required !== "godaddy") expect(installGuide(required).supported).toBe(true);
    }
    expect(installGuide("unknown").label).toBe("I'm not sure");
  });
  it("says plainly when a platform can't run the lines instead of inventing steps", () => {
    expect(installGuide("google-sites").supported).toBe(false);
    expect(installGuide("google-sites").steps.join(" ")).toContain("can't add code"); expect(installGuide("godaddy").supported).toBe(false);
  });
  it("builds copyable steps for a web person with the exact lines, the where-to-paste steps and no send", () => {
    const lines = [install.meta, install.script].join("\n");
    const text = installStepsText({ platform: "squarespace", siteHost: "bakery.example", lines });
    expect(text).toContain(lines);
    expect(text).toContain("Where they go (Squarespace):");
    expect(text).toContain("1. In Squarespace, open the Code Injection panel");
    expect(text).toContain("Note: Code Injection is only on Squarespace plans");
    expect(text).not.toContain("Check my site");
  });
});

describe("Keep your site shows where to paste the lines", () => {
  const roots: ReturnType<typeof createRoot>[] = [];
  let clipboard: string[] = [];
  beforeEach(() => {
    clipboard = [];
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("crypto", { randomUUID, subtle: { digest: async (_algorithm: string, bytes: Uint8Array) => Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer } });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { clipboard.push(value); } } });
  });
  afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
  async function mount(request: typeof fetch, props: Partial<Parameters<typeof ConnectSiteExperience>[0]> = {}) {
    const node = document.createElement("div"); document.body.appendChild(node);
    const root = createRoot(node); roots.push(root);
    await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(ConnectSiteExperience, { workspaceId: BUSINESS, canManage: true, initialSites: [], ...props }))));
    return node;
  }
  const select = async (node: HTMLElement, label: string, value: string) => {
    const field = [...node.querySelectorAll("select")].find(item => item.labels?.[0]?.textContent?.includes(label))!;
    await act(async () => { field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })); });
  };
  const button = (node: HTMLElement, text: string) => [...node.querySelectorAll("button")].find(item => item.textContent?.includes(text))!;

  it("follows the builder chosen before connecting and copies its steps for a web person", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ site: { ...site, platform: "wix" } }), { status: 201 }));
    const node = await mount(request as unknown as typeof fetch);
    const input = node.querySelector("input")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "bakery.example"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await select(node, "Built with", "wix");
    await act(async () => { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(JSON.parse(String((request.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ action: "connect", platform: "wix" });
    expect(node.textContent).toContain("Where to paste them");
    expect(node.textContent).toContain("Development & integrations → Custom Code");
    await act(async () => { button(node, "Copy steps for your web person").click(); });
    expect(clipboard[0]).toContain("Where they go (Wix):");
    expect(clipboard[0]).toContain(install.script);
    expect(node.textContent).toContain("Steps copied. Send them to whoever runs your site.");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("lets the owner switch guides without saving anything, and warns when the builder can't run the lines", async () => {
    const request = vi.fn();
    const node = await mount(request as unknown as typeof fetch, { initialSites: [{ ...site, platform: "wordpress" }] });
    expect(node.textContent).toContain("Code Snippets → Header & Footer");
    await select(node, "Your site is built with", "shopify");
    expect(node.textContent).toContain("layout/theme.liquid");
    await select(node, "Your site is built with", "google-sites");
    expect(node.textContent).toContain("Google Sites can’t run these lines.");
    expect(button(node, "Copy steps for your web person")).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });
  it("falls back to the I'm not sure guide when the builder is unknown", async () => {
    const node = await mount(vi.fn() as unknown as typeof fetch, { initialSites: [site] });
    expect(node.textContent).toContain("Look for Custom code, Code injection, Site-wide code or Head HTML");
  });
});

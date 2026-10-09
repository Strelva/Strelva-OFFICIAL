// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
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
/** Every change to this site goes through Strelva as a Request. */
const managed: SystemView = { ...site, surface: { kind: "website", domain: "attymooney.com", liveUrl: "https://www.attymooney.com", previewSrc: "https://www.attymooney.com", previewLabel: "attymooney.com", editing: "request" } };
const props = { systems: [site], workspaceId: BUSINESS, readOnly: false, sources: [], systemHref: (id: string) => systemHref("", BUSINESS, id), onHome: () => undefined };

describe("Ask for a change on a managed website files a Request", () => {
  const roots: ReturnType<typeof createRoot>[] = [];
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
  afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
  async function mount(request: typeof fetch, system: SystemView, readOnly = false) {
    const onAsk = vi.fn();
    const node = document.createElement("div"); document.body.appendChild(node);
    const root = createRoot(node); roots.push(root);
    await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(SystemPage, { ...props, system, systems: [system], onAsk, readOnly }))));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    return { node, onAsk };
  }
  const buttons = (node: HTMLElement, text: string) => [...node.querySelectorAll("button")].filter(item => item.textContent === text);
  async function type(node: HTMLElement, value: string) {
    const field = node.querySelector("textarea")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  function server(ask: () => Response) {
    return vi.fn(async (url: string) => String(url).startsWith("/api/workspace/site-changes")
      ? ask()
      : new Response(JSON.stringify({ detail: previewWebsiteDetail(SITE, "empty") }), { status: 200 }));
  }
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

  it("opens a form, files the words as a Request to Strelva, and reads the Requests again", async () => {
    const request = server(() => new Response(JSON.stringify({ requestId: "76000000-0000-4000-8000-0000000000f1", requests: [] }), { status: 201 }));
    const { node, onAsk } = await mount(request as unknown as typeof fetch, managed);
    await act(async () => buttons(node, "Ask for a change")[0]!.click());
    expect(node.textContent).toContain("Tell Strelva what should change on attymooney.com");
    await type(node, "New office hours in the footer");
    await act(async () => buttons(node, "File the request")[0]!.click());
    await settle();
    const filed = request.mock.calls.find(([url]) => url === "/api/workspace/site-changes")!;
    const body = JSON.parse(String((filed as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ action: "ask", workspaceId: BUSINESS, systemId: SITE, request: "New office hours in the footer" });
    expect(body.idempotencyKey).toMatch(/^site-change:/);
    expect(node.querySelector("[role=status]")?.textContent).toContain("Filed for Strelva. It's at Asked");
    expect(node.querySelector("textarea")!.value).toBe("");
    expect(onAsk).not.toHaveBeenCalled();
    expect(request.mock.calls.filter(([url]) => String(url).startsWith("/api/workspace/systems/website")).length).toBe(2);
  });

  it("an empty Requests panel is hidden and the header opens the same form", async () => {
    const { node, onAsk } = await mount(server(() => new Response("{}", { status: 500 })) as unknown as typeof fetch, managed);
    const links = buttons(node, "Ask for a change");
    expect(links.length).toBe(1);
    expect(node.querySelector("ul[aria-label='Requests']")).toBeNull();
    await act(async () => links[0]!.click());
    expect(node.querySelector("textarea")).not.toBeNull();
    expect(onAsk).not.toHaveBeenCalled();
  });

  it("an unconfirmed permission-looking response preserves the words and request uncertainty", async () => {
    const request = server(() => new Response(JSON.stringify({ error: "Only an owner or admin of this business can ask for a change here." }), { status: 403 }));
    const { node } = await mount(request as unknown as typeof fetch, managed);
    await act(async () => buttons(node, "Ask for a change")[0]!.click());
    await type(node, "Change the hero photo");
    await act(async () => buttons(node, "File the request")[0]!.click());
    await settle();
    const alert = [...node.querySelectorAll("[role=alert]")].map(item => item.textContent).join(" ");
    expect(alert).toContain("Only an owner or admin");
    expect(alert).toContain("Your words are preserved.");
    expect(alert).toContain("The request couldn't be confirmed.");
    expect(alert).toContain("Check this same request");
    expect(node.querySelector("textarea")!.value).toBe("Change the hero photo");
  });

  it("a website Strelva doesn't manage still opens the composer; read-only can't ask", async () => {
    const { node, onAsk } = await mount(server(() => new Response("{}", { status: 500 })) as unknown as typeof fetch, site);
    await act(async () => buttons(node, "Ask for a change")[0]!.click());
    expect(onAsk).toHaveBeenCalledWith("About attymooney.com: ");
    expect(node.querySelector("textarea")).toBeNull();
    const readOnly = await mount(server(() => new Response("{}", { status: 500 })) as unknown as typeof fetch, managed, true);
    expect(buttons(readOnly.node, "Ask for a change").every(item => item.disabled)).toBe(true);
  });
});

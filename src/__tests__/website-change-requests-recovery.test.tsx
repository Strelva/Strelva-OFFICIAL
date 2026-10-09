// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebsiteChangeRequests, type WebsiteChangeRequestsProps } from "@/experience/websites/WebsiteChangeRequests";

const BUSINESS = "11111111-1111-4111-8111-111111111111";
const SYSTEM = "22222222-2222-4222-8222-222222222222";
const REQUEST = "33333333-3333-4333-8333-333333333333";
const words = "Add a private events page";
const saved = (text = words) => ({ id: REQUEST, request: text, status: "requested", accepted: "pending", createdAt: "2026-10-09T00:00:00Z", updatedAt: "2026-10-09T00:00:00Z", receipts: [] });
const reply = (text = words) => new Response(JSON.stringify({ requestId: REQUEST, requests: [saved(text)] }), { status: 201 });
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function mount(request: typeof fetch, overrides: Partial<WebsiteChangeRequestsProps> = {}) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push(root);
  const props: WebsiteChangeRequestsProps = { workspaceId: BUSINESS, systemId: SYSTEM, siteLabel: "Bakery", editing: "request", canAsk: true, canDecide: true, operator: false, request, ...overrides };
  const render = async (changes: Partial<WebsiteChangeRequestsProps> = {}) => act(async () => root.render(createElement(WebsiteChangeRequests, { ...props, ...changes })));
  await render();
  return { node, render };
}
async function fill(node: HTMLElement, text = words) {
  const field = node.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, text); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
const submit = (node: HTMLElement) => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

it("admits one filing during same-batch submissions before the first response", async () => {
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  const request = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? pending : new Response('{"requests":[]}'));
  const { node } = await mount(request as unknown as typeof fetch); await fill(node);
  await act(async () => { submit(node); submit(node); });
  expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  await act(async () => finish(reply()));
  expect(node.querySelector("textarea")?.value).toBe("");
});

it.each(["lost reply", "failed list read", "wrong saved request"])("explicitly checks the immutable filing after %s without changing its key or words", async failure => {
  const bodies: string[] = [];
  const request = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method !== "POST") return new Response('{"requests":[]}');
    bodies.push(String(init.body));
    if (bodies.length === 1) {
      if (failure === "lost reply") throw new TypeError("Lost response");
      if (failure === "failed list read") return new Response('{"error":"Requests could not be read."}', { status: 503 });
      return reply("An unrelated request");
    }
    if (bodies.length === 2) return new Response('{"error":"Current access was refused."}', { status: 403 });
    return reply();
  });
  const { node } = await mount(request as unknown as typeof fetch); await fill(node);
  const pageField = node.querySelector("input:not([type=hidden])")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(pageField, "Events"); pageField.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { submit(node); });
  expect(node.querySelector("textarea")?.readOnly).toBe(true);
  expect(node.querySelector("textarea")?.value).toBe(words);
  expect(node.textContent).toContain("Check this request");
  expect(bodies).toHaveLength(1);
  await act(async () => { submit(node); });
  expect(node.querySelector("textarea")?.readOnly).toBe(true);
  expect(node.querySelector('[role="alert"]')?.textContent).toContain("Current access was refused.");
  await act(async () => { submit(node); });
  expect(bodies).toHaveLength(3);
  expect(new Set(bodies).size).toBe(1);
  expect(JSON.parse(bodies[0]!)).toMatchObject({ workspaceId: BUSINESS, systemId: SYSTEM, request: words, page: "Events" });
  expect(node.querySelector("textarea")?.value).toBe("");
  expect(node.textContent).toContain("Filed for Strelva");
});

it("does not attach an old pending result or attempt to another business/System", async () => {
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  const bodies: Record<string, unknown>[] = [];
  const request = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method !== "POST") return new Response('{"requests":[]}');
    const body = JSON.parse(String(init.body)); bodies.push(body);
    return bodies.length === 1 ? pending : reply(body.request);
  });
  const { node, render } = await mount(request as unknown as typeof fetch); await fill(node);
  await act(async () => { submit(node); });
  const otherBusiness = "44444444-4444-4444-8444-444444444444";
  const otherSystem = "55555555-5555-4555-8555-555555555555";
  await render({ workspaceId: otherBusiness, systemId: otherSystem });
  await act(async () => finish(reply()));
  expect(node.textContent).not.toContain("Filed for Strelva");
  expect(node.querySelector("textarea")?.value).toBe("");
  await fill(node, "Change this other business");
  await act(async () => { submit(node); });
  expect(bodies[1]).toMatchObject({ workspaceId: otherBusiness, systemId: otherSystem, request: "Change this other business" });
  expect(bodies[1]?.idempotencyKey).not.toBe(bodies[0]?.idempotencyKey);
});

it("locks an unknown receipt effect until reload instead of inventing a retry key", async () => {
  const preview = { id: "66666666-6666-4666-8666-666666666666", kind: "preview", previewUrl: "https://preview.example.test", commitSha: null, deploymentUrl: null, readBack: null, note: null, recordedAt: "2026-10-09T00:00:00Z" };
  const request = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") throw new TypeError("Receipt committed but response lost");
    return new Response(JSON.stringify({ requests: [{ ...saved(), receipts: [preview] }] }));
  });
  const { node } = await mount(request as unknown as typeof fetch);
  const approve = [...node.querySelectorAll("button")].find(button => button.textContent === "Approve the preview")!;
  await act(async () => { approve.click(); approve.click(); });
  expect(approve.disabled).toBe(true);
  expect(node.querySelector('[role="alert"]')?.textContent).toContain("Reload the page to check its receipts before trying again.");
  await act(async () => approve.click());
  expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});

it.each([false, true])("accepts only the exact returned receipt target (wrong target: %s)", async wrongTarget => {
  const preview = { id: "66666666-6666-4666-8666-666666666666", kind: "preview", previewUrl: "https://preview.example.test", commitSha: null, deploymentUrl: null, readBack: null, note: null, recordedAt: "2026-10-09T00:00:00Z" };
  const approval = { ...preview, id: "77777777-7777-4777-8777-777777777777", kind: "approved", previewUrl: null };
  let recorded = false;
  const request = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      recorded = true;
      return new Response(JSON.stringify({ receipt: { ...approval, requestId: REQUEST, systemId: wrongTarget ? BUSINESS : SYSTEM } }));
    }
    return new Response(JSON.stringify({ requests: [{ ...saved(), receipts: recorded ? [preview, approval] : [preview] }] }));
  });
  const { node } = await mount(request as unknown as typeof fetch);
  await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === "Approve the preview")!.click());
  if (wrongTarget) {
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Reload the page");
    expect([...node.querySelectorAll("button")].find(button => button.textContent === "Approve the preview")?.disabled).toBe(true);
    expect(request.mock.calls.filter(([, init]) => !init?.method)).toHaveLength(1);
  } else {
    expect(node.textContent).toContain("Approved by the owner.");
    expect(node.querySelector('[role="alert"]')).toBeNull();
    expect(request.mock.calls.filter(([, init]) => !init?.method)).toHaveLength(2);
  }
});

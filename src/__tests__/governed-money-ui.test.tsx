// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionTerms } from "@/experience/workspace/money/CollectionTerms";
import type { GovernedMoneyGraph } from "@/platform/connect/governed-money-contract";
const workspaceId = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222", actor = "33333333-3333-4333-8333-333333333333";
const graph: GovernedMoneyGraph = { workspaceId, canPrepare: true, payer: { kind: "agency", workspaceId: other, customerConfigured: true }, prices: [{ version: "Explicit recorded CAD price", amountCents: 1700, currency: "cad", definitionId: null, effectiveFrom: "2026-01-01T00:00:00Z", effectiveUntil: null }], installations: [], terms: [], collectionDispatch: "not_configured" };
const roots: ReturnType<typeof createRoot>[] = [];
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
async function mount(value = graph, request = vi.fn<typeof fetch>().mockResolvedValue(reply(graph))) { const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root); await act(async () => root.render(createElement(CollectionTerms, { graph: value, request }))); return { node, root, request }; }
async function change(field: HTMLInputElement | HTMLSelectElement, value: string) { const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(prototype, "value")!.set!; await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }); }
async function fill(node: HTMLElement) { await change(node.querySelector("select")!, graph.prices[0]!.version); const inputs = node.querySelectorAll("input"); await change(inputs[0]!, "2099-01-01T10:00"); await change(inputs[1]!, "2099-02-01T10:00"); }
async function submit(node: HTMLElement) { await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function click(node: HTMLElement, name: string) { const button = [...node.querySelectorAll("button")].find(item => item.textContent === name)!; await act(async () => button.click()); }
function accepted(body: string) { const { action: _action, ...command } = JSON.parse(body); return { receipt: { ...command, acceptedBy: actor, acceptedAt: "2026-10-09T10:00:00Z" }, collectionDispatch: "not_configured" }; }
describe("ordinary recorded money terms", () => {
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
  afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
  it("offers no acceptance in unconfigured, read-only or missing-price states", async () => {
    for (const value of [{ ...graph, canPrepare: false }, { ...graph, payer: null }, { ...graph, prices: [] }]) { const { node } = await mount(value); expect(node.querySelector("form")).toBeNull(); expect(node.textContent).toContain("No collection terms have been accepted"); }
  });
  it("shows the exact quote, separate agency approval and no charge promise", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => reply(accepted(String(init!.body)))); const { node } = await mount(graph, request); await fill(node); await submit(node);
    const body = JSON.parse(String(request.mock.calls[0]![1]!.body)); expect(body).toMatchObject({ workspaceId, priceVersion: graph.prices[0]!.version, amountCents: 1700, currency: "cad", installationId: null }); expect(body).not.toHaveProperty("acceptedBy"); expect(body).not.toHaveProperty("customerId");
    expect(node.textContent).toContain("Agency approval to charge"); expect(node.textContent).toContain("No card was charged"); expect(node.textContent).toContain("Accepted history"); expect(node.querySelector("input")!.disabled).toBe(true);
  });
  it("keeps the exact uncertain command and blocks edits until current readback then retries identically", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(reply({ error: "Response lost." }, 500)).mockResolvedValueOnce(reply(graph)).mockImplementation(async (_url, init) => reply(accepted(String(init!.body)))); const { node } = await mount(graph, request); await fill(node); await submit(node); const body = request.mock.calls[0]![1]!.body;
    expect(node.querySelector("input")!.disabled).toBe(true); expect(node.textContent).not.toContain("Retry the exact acceptance"); await click(node, "Reload recorded terms"); expect(node.querySelector("input")!.disabled).toBe(true); await click(node, "Retry the exact acceptance"); expect(request.mock.calls[2]![1]!.body).toBe(body); expect(node.textContent).toContain("No card was charged");
  });
  it("refuses forged or cross-workspace acknowledgments without optimistic history", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => { const result = accepted(String(init!.body)); return reply({ ...result, receipt: { ...result.receipt, workspaceId: other } }); }); const { node } = await mount(graph, request); await fill(node); await submit(node); expect(node.querySelector("[role=alert]")!.textContent).toContain("did not match"); expect(node.textContent).toContain("No collection terms have been accepted"); expect(node.querySelector("input")!.disabled).toBe(true);
  });
  it("withdraws stale owner controls on current readback and rejects another workspace graph", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(reply({ ...graph, canPrepare: false })).mockResolvedValueOnce(reply({ ...graph, workspaceId: other })); const { node } = await mount(graph, request); await click(node, "Reload recorded terms"); expect(node.querySelector("form")).toBeNull(); await click(node, "Reload recorded terms"); expect(node.querySelector("[role=alert]")!.textContent).toContain("another workspace");
  });
  it("keeps the draft on refusal and preserves focus if the user navigated during the request", async () => {
    let resolve!: (value: Response) => void; const request = vi.fn<typeof fetch>().mockReturnValue(new Promise(done => { resolve = done; })); const { node } = await mount(graph, request);
    expect(document.activeElement).toBe(document.body); await fill(node);
    const start = node.querySelector("input")!.value; const submitButton = [...node.querySelectorAll("button")].find(button => button.textContent === "Accept these terms and period")!; submitButton.focus(); await submit(node);
    const elsewhere = document.createElement("input"); document.body.append(elsewhere); elsewhere.focus(); await act(async () => resolve(reply({ error: "Current owner authority changed." }, 403)));
    expect(node.querySelector("input")!.value).toBe(start); expect(node.querySelector("[role=alert]")!.textContent).toContain("Current owner authority changed"); expect(document.activeElement).toBe(elsewhere);
  });
  it("recovers a lost acceptance from exact server history without a duplicate POST", async () => {
    let recorded: ReturnType<typeof accepted>["receipt"];
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method === "POST") { recorded = accepted(String(init.body)).receipt; return reply({ error: "Lost response" }, 500); }
      return reply({ ...graph, terms: [recorded!] });
    });
    const { node } = await mount(graph, request); await fill(node); await submit(node); await click(node, "Reload recorded terms");
    expect(node.textContent).toContain("Your exact terms and period are recorded"); expect(node.textContent).not.toContain("Retry the exact acceptance"); expect(request.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
  });
  it("does not duplicate submissions and aborts old observations on workspace change", async () => {
    let resolve!: (value: Response) => void; const request = vi.fn<typeof fetch>().mockReturnValue(new Promise(done => { resolve = done; })); const { node, root } = await mount(graph, request); await fill(node); await submit(node); await submit(node); expect(request).toHaveBeenCalledTimes(1); const body = String(request.mock.calls[0]![1]!.body), signal = request.mock.calls[0]![1]!.signal!;
    await act(async () => root.render(createElement(CollectionTerms, { graph: { ...graph, workspaceId: other }, request }))); expect(signal.aborted).toBe(true); await act(async () => resolve(reply(accepted(body)))); expect(node.textContent).toContain("No collection terms have been accepted"); expect(node.textContent).not.toContain("Your exact terms and period are recorded");
  });
});

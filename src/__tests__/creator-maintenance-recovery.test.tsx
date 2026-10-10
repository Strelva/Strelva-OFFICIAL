// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatorMaintenanceGraph } from "@/platform/connect/creator-maintenance";
import CreatorMaintenance from "@/app/workspace/creator-maintenance/CreatorMaintenance";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const workspaceId = "11111111-1111-4111-8111-111111111111";
const listingId = "22222222-2222-4222-8222-222222222222";
const sourceRevisionId = "33333333-3333-4333-8333-333333333333";
const graph: CreatorMaintenanceGraph = { workspaceId, canMaintain: true, listings: [{ id: listingId, definitionId: "Fictional qualified listing", sourceRevisionId, agreementVersion: null, rateReference: null, maintainerState: "creator" as const, history: [] }], agreements: [] };
const roots: ReturnType<typeof createRoot>[] = [];
const mounted = new Map<HTMLElement, ReturnType<typeof createRoot>>();
function deferred() { let resolve!: (value: Response) => void; let reject!: (reason: Error) => void; const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function mount(value: CreatorMaintenanceGraph = graph) { const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root); mounted.set(node, root); await act(async () => root.render(createElement(CreatorMaintenance, { graph: value }))); return node; }
async function choose(node: HTMLElement, index: number, value: string) { const field = node.querySelectorAll("select")[index]!; await act(async () => { field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })); }); }
async function date(node: HTMLElement, value = "2099-01-01T10:00") { const field = node.querySelector("input")!; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; await act(async () => { setter.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function prepare(node: HTMLElement) { await choose(node, 0, listingId); await choose(node, 1, "takeover"); await date(node); }
function fire(node: HTMLElement) { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }
async function submit(node: HTMLElement) { await act(async () => fire(node)); }
const refused = () => new Response(JSON.stringify({ error: "Maintenance could not be confirmed." }), { status: 503 });
function success(transport: ReturnType<typeof vi.fn<typeof fetch>>, change: Record<string, unknown> = {}) { const body = JSON.parse(String(transport.mock.calls[0]![1]!.body)); return new Response(JSON.stringify({ id: "44444444-4444-4444-8444-444444444444", listing_id: listingId, maintainer_state: "takeover", agreement_version: null, rate_reference: null, effective_from: body.effectiveFrom, recorded_by: "55555555-5555-4555-8555-555555555555", recorded_at: "2026-10-09T12:00:00Z", ...change })); }
describe("creator maintenance command and recovery", () => {
 beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
 afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; mounted.clear(); vi.unstubAllGlobals(); });
 it("dispatches only one exact command for two same-batch submits", async () => { const wait = deferred(); const transport = vi.fn<typeof fetch>().mockReturnValue(wait.promise); vi.stubGlobal("fetch", transport); const node = await mount(); await prepare(node); await act(async () => { fire(node); fire(node); }); expect(transport).toHaveBeenCalledTimes(1); });
 it("retains the named command after an unknown result instead of sending changed terms", async () => { const transport = vi.fn<typeof fetch>().mockResolvedValue(refused()); vi.stubGlobal("fetch", transport); const node = await mount(); await prepare(node); await submit(node); expect(node.querySelector("[role=alert]")?.textContent).toContain("could not be confirmed"); const first = String(transport.mock.calls[0]![1]!.body); await date(node, "2099-01-02T10:00"); await submit(node); expect(transport.mock.calls.every(call => String(call[1]!.body) === first)).toBe(true); });
 it.each(["success", "error"])("returns focus to this form after %s when disabled control loses focus", async outcome => { const wait = deferred(); const transport = vi.fn<typeof fetch>().mockReturnValue(wait.promise); vi.stubGlobal("fetch", transport); const node = await mount(); await prepare(node); const button = node.querySelector("button")!; button.focus(); await submit(node); expect(button.disabled).toBe(true); button.disabled = false; button.blur(); button.disabled = true; expect(document.activeElement).toBe(document.body); await act(async () => wait.resolve(outcome === "success" ? success(transport) : refused())); expect(node.contains(document.activeElement)).toBe(true); });
 it.each(["success", "error"])("preserves deliberate outside focus after %s", async outcome => { const wait = deferred(); const transport = vi.fn<typeof fetch>().mockReturnValue(wait.promise); vi.stubGlobal("fetch", transport); const node = await mount(); await prepare(node); node.querySelector("button")!.focus(); await submit(node); const outside = document.createElement("button"); outside.textContent = "Other deliberate work"; document.body.append(outside); outside.focus(); await act(async () => wait.resolve(outcome === "success" ? success(transport) : refused())); expect(document.activeElement).toBe(outside); });

 it("guards date and state changes in the same batch as the first submit", async () => {
  const wait = deferred(); const transport = vi.fn<typeof fetch>().mockReturnValue(wait.promise); vi.stubGlobal("fetch", transport);
  const node = await mount(); await prepare(node);
  const field = node.querySelector("input")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { fire(node); setter.call(field, "2099-02-01T10:00"); field.dispatchEvent(new Event("input", { bubbles: true })); const state = node.querySelectorAll("select")[1]!; state.value = ""; state.dispatchEvent(new Event("change", { bubbles: true })); fire(node); });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(field.value).toBe("2099-01-01T10:00");
  expect(node.querySelectorAll("select")[1]!.value).toBe("takeover");
 });
 it.each([400, 401, 403, 409, 413, 415, 429])("keeps an initial route-proven %s refusal correctable", async status => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: "Initial refusal." }), { status })); vi.stubGlobal("fetch", transport);
  const node = await mount(); await prepare(node); await submit(node);
  expect(node.querySelector("input")!.disabled).toBe(false);
  await date(node, "2099-01-02T10:00"); await submit(node);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(transport.mock.calls[1]![1]!.body)).effectiveFrom).not.toBe(JSON.parse(String(transport.mock.calls[0]![1]!.body)).effectiveFrom);
 });
 it.each(["network", "unreadable", "missing", "date", "agreement", "rate", "listing", "state", "id"])("freezes %s uncertainty and offers a mounted history reload", async kind => {
  const transport = vi.fn<typeof fetch>();
  if (kind === "network") transport.mockRejectedValue(new Error("Synthetic transport failure"));
  else if (kind === "unreadable") transport.mockResolvedValue(new Response("not json"));
  else if (kind === "missing") transport.mockResolvedValue(new Response(JSON.stringify({ id: "incomplete" })));
  else transport.mockImplementation(async () => success(transport, { [kind === "date" ? "effective_from" : kind === "agreement" ? "agreement_version" : kind === "rate" ? "rate_reference" : kind === "listing" ? "listing_id" : kind === "state" ? "maintainer_state" : "id"]: kind === "date" ? "2099-01-02T10:00:00Z" : kind === "listing" ? "66666666-6666-4666-8666-666666666666" : kind === "state" ? "creator" : "unexpected" }));
  vi.stubGlobal("fetch", transport); const node = await mount(); await prepare(node); await submit(node);
  expect(node.querySelector("input")!.disabled).toBe(true);
  expect([...node.querySelectorAll("select")].every(field => field.disabled)).toBe(true);
  const reload = [...node.querySelectorAll("button")].find(button => button.textContent === "Reload maintenance history")!;
  expect(reload.disabled).toBe(false); expect(node.querySelector("[role=alert]")?.textContent).toContain("Reload its history");
  await date(node, "2099-02-01T10:00"); await submit(node);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(node.querySelector("input")!.value).toBe("2099-01-01T10:00");
  expect(mocks.refresh).not.toHaveBeenCalled();
 });
 it("does not interpret a later refusal as clearing a previous unknown", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(refused()).mockResolvedValue(new Response(JSON.stringify({ error: "Denied later." }), { status: 403 })); vi.stubGlobal("fetch", transport);
  const node = await mount(); await prepare(node); await submit(node); await submit(node);
  expect(transport).toHaveBeenCalledTimes(1); expect(node.querySelector("input")!.disabled).toBe(true);
  expect(node.querySelector("[role=alert]")?.textContent).toContain("could not be confirmed");
 });
 it("reloads the actual page without clearing unknown or sending another POST", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(refused()); vi.stubGlobal("fetch", transport);
  const node = await mount(); await prepare(node); await submit(node);
  const reload = vi.fn(); const original = window;
  vi.stubGlobal("window", new Proxy(original, { get(target, key) { return key === "location" ? { reload } : Reflect.get(target, key, target); } }));
  const action = [...node.querySelectorAll("button")].find(button => button.textContent === "Reload maintenance history")!;
  expect(action).toBeDefined();
  await act(async () => action.click());
  expect(reload).toHaveBeenCalledTimes(1); expect(transport).toHaveBeenCalledTimes(1);
  expect(node.querySelector("input")!.disabled).toBe(true);
 });
 it("preserves the submitted agreement when refreshed props reorder agreements", async () => {
  const first = { version: "Written agreement A", rateReference: "Rate A", rateBps: 1000, effectiveFrom: "2090-01-01T00:00:00Z", effectiveUntil: null };
  const second = { ...first, version: "Written agreement B", rateReference: "Rate B" };
  const transport = vi.fn<typeof fetch>().mockResolvedValue(refused()); vi.stubGlobal("fetch", transport);
  const node = await mount({ ...graph, agreements: [first, second] });
  await choose(node, 0, listingId); await choose(node, 1, "tapered"); await choose(node, 2, "0"); await date(node); await submit(node);
  await act(async () => mounted.get(node)!.render(createElement(CreatorMaintenance, { graph: { ...graph, agreements: [second, first] } })));
  expect(node.querySelectorAll("select")[2]!.selectedOptions[0]!.textContent).toContain("Written agreement A");
  expect(JSON.parse(String(transport.mock.calls[0]![1]!.body))).toMatchObject({ agreementVersion: "Written agreement A", rateReference: "Rate A" });
  await submit(node); expect(transport).toHaveBeenCalledTimes(1);
 });
 it.each([false, true])("uses stable history recovery on permission loss, outside movement %s", async outsideMovement => {
  const wait = deferred(); const transport = vi.fn<typeof fetch>().mockReturnValue(wait.promise); vi.stubGlobal("fetch", transport);
  const node = await mount(); await prepare(node); node.querySelector("button")!.focus(); await submit(node);
  const outside = document.createElement("button"); document.body.append(outside); if (outsideMovement) outside.focus();
  await act(async () => mounted.get(node)!.render(createElement(CreatorMaintenance, { graph: { ...graph, canMaintain: false } })));
  expect(node.querySelector("form")).toBeNull();
  expect(document.activeElement).toBe(outsideMovement ? outside : node.querySelector("h2"));
  await act(async () => wait.resolve(refused()));
  const reload = [...node.querySelectorAll("button")].find(button => button.textContent === "Reload maintenance history");
  expect(reload).toBeTruthy(); expect(transport).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(outsideMovement ? outside : node.querySelector("h2"));
 });
 it("accepts an exact offset-equivalent receipt and clears its notice when terms are deliberately edited", async () => {
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => { const body = JSON.parse(String(transport.mock.calls[0]![1]!.body)); return success(transport, { effective_from: String(body.effectiveFrom).replace(".000Z", "+00:00") }); });
  vi.stubGlobal("fetch", transport); const node = await mount(); await prepare(node); await submit(node);
  expect(node.textContent).toContain("No payment or provider change was made"); expect(mocks.refresh).toHaveBeenCalledTimes(1);
  await date(node, "2099-01-02T10:00");
  expect(node.textContent).not.toContain("No payment or provider change was made");
 });
 it("recovers repeated local validation without dispatch or overriding outside focus", async () => {
  const transport = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", transport); const node = await mount();
  node.querySelector("button")!.focus(); await submit(node);
  expect(document.activeElement).toBe(node.querySelector("[role=alert]"));
  node.querySelector("button")!.focus(); await submit(node);
  expect(document.activeElement).toBe(node.querySelector("[role=alert]"));
  const outside = document.createElement("button"); document.body.append(outside); outside.focus(); await submit(node);
  expect(document.activeElement).toBe(outside); expect(transport).not.toHaveBeenCalled();
 });
});

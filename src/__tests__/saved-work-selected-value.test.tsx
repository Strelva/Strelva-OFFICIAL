// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebsiteEntry } from "@/experience/websites/WebsiteEntry";
import { fixtureRebuild } from "@/experience/websites/rebuild-fixture";
import { parseRebuildView, RebuildUnconfirmedError, type RebuildTransport, type RebuildView } from "@/experience/websites/rebuild-transport";
import { actor, harness } from "./rebuild-recovery-independent-harness";

let root: Root; let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.append(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount(record: RebuildView, transport?: RebuildTransport) {
  await act(async () => root.render(createElement(WebsiteEntry, { workspaceId: record.workspaceId, initialWorkId: record.workId, rebuilds: [record], connectedEnabled: false, rebuildEnabled: true, path: "rebuild", canManage: true, transport })));
}
const select = () => node.querySelector("select")!;
const button = (label: string) => Array.from(node.querySelectorAll("button")).find(item => item.textContent?.trim() === label)!;
function description() {
  const descriptions = (select().getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean).map(id => document.getElementById(id));
  expect(descriptions).toHaveLength(1); expect(descriptions[0]?.tagName).toBe("P");
  return descriptions[0]!;
}

it("exposes the complete long selected title/status through its owned accessible description, only for saved work", async () => {
  const title = `Fictional bakery ${"LongBusinessIdentity".repeat(12)}`;
  const record = { ...fixtureRebuild(), title };
  const read = vi.fn(async () => record); const transport = { read, start: vi.fn(), mutate: vi.fn() };
  await mount(record, transport);
  expect(description().textContent).toBe(`Last known saved work: ${title} · review`);
  expect(select().selectedOptions[0]!.textContent).toBe(`${title} · review`);
  expect(node.querySelector("h1")!.textContent).toBe(title); expect(read).toHaveBeenCalledTimes(1);
  await act(async () => { select().value = ""; select().dispatchEvent(new Event("change", { bubbles: true })); });
  expect(select().getAttribute("aria-describedby")).toBeNull();
  expect(node.textContent).not.toContain("Last known saved work:");
});

it("updates the full description from the actual default HTTP current read without another request, navigation or focus change", async () => {
  const h = harness(); const envelope = await h.create(); const current = parseRebuildView(envelope);
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  const request = vi.fn<typeof fetch>(async path => {
    if (String(path).includes("/history?")) return Response.json({ revisions: [] });
    await pending; return Response.json(await h.service.read(actor, envelope.workId));
  });
  vi.stubGlobal("fetch", request);
  const navigation = vi.spyOn(window.history, "replaceState"); const address = window.location.href;
  await mount({ ...current, revision: 0, status: "building" });
  const picker = select(); picker.focus();
  await act(async () => release());
  expect(description().textContent).toBe(`Last known saved work: ${current.title} · review`);
  expect(select().selectedOptions[0]!.textContent).toBe(`${current.title} · review`);
  expect(request.mock.calls.filter(([path]) => String(path).includes("/rebuild?"))).toHaveLength(1);
  expect(request.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  expect(navigation).not.toHaveBeenCalled(); expect(window.location.href).toBe(address);
  expect(document.activeElement).toBe(picker);
});

it("keeps only last-known approval metadata during an unconfirmed correction and updates it after explicit current-state recovery", async () => {
  const prior = fixtureRebuild("contacts"); const current = { ...prior, revision: prior.revision + 1, title: "Fictional corrected business", status: "review" as const, approved: false };
  const read = vi.fn().mockResolvedValueOnce(prior).mockResolvedValueOnce(current);
  const mutate = vi.fn(async () => { throw new RebuildUnconfirmedError(); });
  await mount(prior, { read, mutate, start: vi.fn() });
  const details = node.querySelector("details")!; details.open = true;
  await act(async () => button("Edit fact").click());
  const field = node.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Fictional updated claim."); field.dispatchEvent(new Event("input", { bubbles: true })); });
  const picker = select(); picker.focus(); const address = window.location.href;
  await act(async () => button("Save correction").click());
  expect(description().textContent).toBe(`Last known saved work: ${prior.title} · approved`);
  expect(field.value).toBe("Fictional updated claim."); expect(field.disabled).toBe(true);
  expect(node.textContent).not.toContain("This exact preview is approved."); expect(node.textContent).not.toContain("This revision has been published.");
  expect(button("Reload current state")).toBeDefined(); expect(read).toHaveBeenCalledTimes(1); expect(mutate).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(picker);
  await act(async () => button("Reload current state").click());
  expect(description().textContent).toBe(`Last known saved work: ${current.title} · review`);
  expect(read).toHaveBeenCalledTimes(2); expect(mutate).toHaveBeenCalledTimes(1); expect(document.activeElement).toBe(picker); expect(window.location.href).toBe(address);
});

// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RebuildExperience } from "@/experience/websites/RebuildExperience";
import { fixtureRebuild } from "@/experience/websites/rebuild-fixture";
import { serverRebuildTransport, type RebuildTransport, type RebuildView } from "@/experience/websites/rebuild-transport";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const original = "We bake sourdough bread for Saturday pickup.";
const correction = "We bake sourdough bread and catering boxes for local offices.";
function approved(): RebuildView {
  const value = fixtureRebuild();
  value.status = "approved"; value.approved = true;
  value.candidate!.facts = { bread: { text: original, kind: "claim", highRisk: false, origin: "owner_stated", sources: [], verification: { supported: true, confidence: 1 } } };
  return value;
}
function changed(value: RebuildView): RebuildView {
  const next = structuredClone(value);
  next.revision += 1; next.approved = false; next.status = "review";
  next.candidate!.revision += 1; next.candidate!.contentHash = "c".repeat(64);
  next.candidate!.facts.bread!.text = correction;
  next.candidate!.facts.bread!.origin = "owner_confirmed";
  return next;
}
function button(name: string) { return Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === name)!; }
async function mount(record: RebuildView, mutate: RebuildTransport["mutate"], props = {}) {
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate };
  await act(async () => root.render(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport, ...props })));
}
async function edit() {
  container.querySelector("details")!.open = true;
  await act(async () => button("Edit fact").click());
  const field = container.querySelector<HTMLTextAreaElement>("textarea")!;
  expect(document.activeElement).toBe(field);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, correction);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return field;
}
async function save() { await act(async () => container.querySelector("details form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

describe("ordinary website fact revision", () => {
  it("edits an approved supported fact, adopts the new identity and requires the changed preview before reapproval", async () => {
    const record = approved(); const next = changed(record);
    const mutate = vi.fn(async () => next);
    await mount(record, mutate);
    expect(container.querySelector("summary")?.textContent).toBe("Edit website facts");
    expect(container.textContent).toContain("Provided by the business");
    await edit(); await save();
    expect(mutate).toHaveBeenCalledWith(record, "edit", { factId: "bread", text: correction });
    expect(container.textContent).toContain(correction);
    expect(container.textContent).toContain("Confirmed in review");
    expect(container.textContent).not.toContain("This exact preview is approved.");
    expect(button("Approve this preview").disabled).toBe(true);
    expect(document.activeElement).toBe(button("Edit fact"));
    const link = Array.from(container.querySelectorAll("a")).find(item => item.textContent?.includes("Export website"))!;
    expect(new URL(link.href).searchParams.get("contentHash")).toBe(next.candidate!.contentHash);
    const frame = container.querySelector("iframe")!;
    frame.contentDocument!.open();
    frame.contentDocument!.write(`<html><head><meta name="strelva-site-hash" content="${next.candidate!.contentHash}"></head><body></body></html>`);
    frame.contentDocument!.close();
    await act(async () => frame.dispatchEvent(new Event("load")));
    expect(button("Approve this preview").disabled).toBe(false);
    await act(async () => button("Edit fact").click());
    expect(container.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(correction);
    await act(async () => button("Cancel").click());
    expect(document.activeElement).toBe(button("Edit fact"));
    await act(async () => button("Edit fact").click());
    const field = container.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, `${correction} Contact orders@example.test.`);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await save();
    expect(mutate).toHaveBeenLastCalledWith(next, "edit", { factId: "bread", text: `${correction} Contact orders@example.test.` });
  });
  it("retains correction, old approval and useful input focus when current authority rejects the save", async () => {
    const mutate = vi.fn(async () => { throw new Error("Access changed. Reopen this website with an authorized account."); });
    await mount(approved(), mutate, { managed: true });
    const field = await edit(); await save();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Access changed");
    expect(field.value).toBe(correction); expect(document.activeElement).toBe(field);
    expect(container.textContent).toContain("This exact preview is approved.");
    expect(button("Save correction").disabled).toBe(false);
  });
  it("blocks read-only and in-flight edits without replacing the draft", async () => {
    const record = approved(); const mutate = vi.fn(async () => changed(record));
    await mount(record, mutate, { readOnly: true });
    expect(button("Edit fact").disabled).toBe(true);
    button("Edit fact").click(); expect(container.querySelector("textarea")).toBeNull(); expect(mutate).not.toHaveBeenCalled();
    let resolve!: (value: RebuildView) => void;
    const pending = vi.fn(() => new Promise<RebuildView>(done => { resolve = done; }));
    await mount(record, pending); const field = await edit(); await save();
    expect(field.disabled).toBe(true); expect(button("Save correction").disabled).toBe(true); expect(button("Cancel").disabled).toBe(true);
    await save(); expect(pending).toHaveBeenCalledOnce(); expect(field.value).toBe(correction);
    await act(async () => resolve(changed(record)));
    expect(document.activeElement).toBe(button("Edit fact"));
  });
  it("keeps sensitive decisions separate from ordinary editing and locks edits during a rebuild", async () => {
    const record = approved();
    record.candidate!.facts.sensitive = { text: "Guaranteed results", kind: "claim", highRisk: true, origin: "owner_stated", sources: [], verification: { supported: true, confidence: 1 } };
    record.status = "building";
    const mutate = vi.fn(async () => record);
    await mount(record, mutate);
    expect(container.textContent).toContain("1 decision needs you");
    expect(container.querySelector("details")!.textContent).not.toContain("Guaranteed results");
    expect(button("Edit fact").disabled).toBe(true); expect(mutate).not.toHaveBeenCalled();
  });
  it("accepts one submission in a React batch and releases the lock for an explicit retry after rejection", async () => {
    const record = approved(); const next = changed(record); const onSaved = vi.fn();
    let resolve!: (value: RebuildView) => void;
    let reject!: (error: Error) => void;
    const mutate = vi.fn(() => new Promise<RebuildView>((done, fail) => { resolve = done; reject = fail; }));
    await mount(record, mutate, { onSaved });
    const field = await edit(); const form = container.querySelector("details form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mutate).toHaveBeenCalledOnce();
    expect(field.value).toBe(correction); expect(field.disabled).toBe(true);
    expect(button("Save correction").disabled).toBe(true); expect(onSaved).not.toHaveBeenCalled();
    await act(async () => reject(new Error("The connection interrupted this save. Try again.")));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("connection interrupted");
    expect(field.value).toBe(correction); expect(field.disabled).toBe(false);
    expect(document.activeElement).toBe(field); expect(onSaved).not.toHaveBeenCalled();
    await save();
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate).toHaveBeenLastCalledWith(record, "edit", { factId: "bread", text: correction });
    await act(async () => resolve(next));
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(next.workId);
    expect(container.textContent).not.toContain("This exact preview is approved.");
    expect(button("Approve this preview").disabled).toBe(true);
    expect(document.activeElement).toBe(button("Edit fact"));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it.each([true,false])("removes only an ordinary contact and focuses a mounted destination when other facts remain: %s", async onlyContact => {
    const record = approved();
    const contact = { text: "orders@example.test", kind: "contact" as const, highRisk: false, origin: "owner_stated" as const, sources: [], verification: { supported: true, confidence: 1 } };
    record.candidate!.facts = { ...(onlyContact ? {} : record.candidate!.facts), email: contact };
    const next = structuredClone(record); delete next.candidate!.facts.email;
    next.revision++; next.candidate!.revision++; next.candidate!.contentHash = "d".repeat(64); next.status = "review"; next.approved = false;
    const mutate = vi.fn(async () => next); const onSaved = vi.fn();
    await mount(record,mutate,{ onSaved }); container.querySelector("details")!.open = true;
    const remove = button("Remove contact"); remove.focus(); await act(async () => remove.click());
    expect(mutate).toHaveBeenCalledExactlyOnceWith(record,"remove",{ factId: "email" });
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(next.workId);
    expect(container.textContent).not.toContain("orders@example.test"); expect(container.textContent).not.toContain("This exact preview is approved.");
    expect(button("Approve this preview").disabled).toBe(true);
    expect(document.activeElement).toBe(onlyContact ? container.querySelector("#rebuild-decisions-heading") : container.querySelector("summary"));
    if (!onlyContact) expect(container.querySelectorAll('details button')).toHaveLength(1);
  });
  it.each(["readOnly","building"] as const)("blocks ordinary contact removal in %s state", async state => {
    const record = approved(); record.candidate!.facts.bread!.kind = "contact"; record.candidate!.facts.bread!.text = "orders@example.test";
    if (state === "building") record.status = "building";
    const mutate = vi.fn(async () => record); await mount(record,mutate,{ readOnly: state === "readOnly" });
    expect(button("Remove contact").disabled).toBe(true); button("Remove contact").click(); expect(mutate).not.toHaveBeenCalled();
  });
  it("retains a correction after rejected removal, prevents same-batch duplicates and permits explicit retry", async () => {
    const record = approved(); record.candidate!.facts.bread!.kind = "contact"; record.candidate!.facts.bread!.text = "orders@example.test";
    const next = structuredClone(record); delete next.candidate!.facts.bread; next.approved = false; next.status = "review"; next.revision++; next.candidate!.revision++; next.candidate!.contentHash = "d".repeat(64);
    let resolve!: (value: RebuildView) => void; let reject!: (error: Error) => void;
    const mutate = vi.fn(() => new Promise<RebuildView>((done,fail) => { resolve = done; reject = fail; }));
    const onSaved = vi.fn(); await mount(record,mutate,{ onSaved }); const field = await edit();
    const remove = button("Remove contact"); remove.focus();
    await act(async () => { remove.click(); remove.click(); });
    expect(mutate).toHaveBeenCalledOnce(); expect(mutate).toHaveBeenLastCalledWith(record,"remove",{ factId: "bread" });
    expect(field.disabled).toBe(true); expect(field.value).toBe(correction); expect(button("Remove contact").disabled).toBe(true);
    await act(async () => reject(new Error("Access changed. Reopen the current website.")));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Access changed"); expect(field.value).toBe(correction); expect(document.activeElement).toBe(field);
    expect(container.textContent).toContain("This exact preview is approved."); expect(onSaved).not.toHaveBeenCalled();
    await act(async () => button("Remove contact").click()); expect(mutate).toHaveBeenCalledTimes(2);
    await act(async () => resolve(next));
    expect(container.querySelector("textarea")).toBeNull(); expect(document.activeElement).toBe(container.querySelector("#rebuild-decisions-heading"));
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(next.workId); expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it("returns focus to the mounted contact action after removal rejection without an open draft", async () => {
    const record = approved(); record.candidate!.facts.bread!.kind = "contact"; record.candidate!.facts.bread!.text = "orders@example.test";
    let reject!: (error: Error) => void;
    const mutate = vi.fn(() => new Promise<RebuildView>((_,fail) => { reject = fail; }));
    await mount(record,mutate); container.querySelector("details")!.open = true;
    const remove = button("Remove contact"); remove.focus(); await act(async () => remove.click());
    container.querySelector<HTMLAnchorElement>("a")!.focus(); expect(document.activeElement).not.toBe(remove);
    await act(async () => reject(new Error("This website changed. Reopen its current preview.")));
    expect(button("Remove contact").disabled).toBe(false); expect(document.activeElement).toBe(button("Remove contact"));
    expect(container.textContent).toContain("This exact preview is approved."); expect(container.querySelector('[role="alert"]')?.textContent).toContain("This website changed");
  });
  it.each(["edit","remove"] as const)("sends exact ordinary candidate identity for %s through HTTP and preserves a conflict", async action => {
    const record = approved();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: "This website changed. Reload its current preview." }), { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    await expect(serverRebuildTransport.mutate(record, action, { factId: "bread", ...(action === "edit" ? { text: correction } : {}) })).rejects.toThrow("This website changed");
    const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(`/api/websites/${record.workId}/facts/bread`);
    expect(JSON.parse(String(init.body))).toEqual({ action, ...(action === "edit" ? { text: correction } : {}), expectedRevision: record.revision, candidateRevision: record.candidate!.revision, candidateContentHash: record.candidate!.contentHash });
  });
});

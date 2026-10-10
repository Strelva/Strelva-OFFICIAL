// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceInquiryReply } from "@/experience/places/WorkspaceInquiryReply";
import { WebsiteConnectionSelector } from "@/experience/websites/WebsiteConnections";
import { RebuildExperience } from "@/experience/websites/RebuildExperience";
import { fixtureRebuild, fixtureSiteDocument } from "@/experience/websites/rebuild-fixture";
import type { RebuildTransport } from "@/experience/websites/rebuild-transport";

let root: Root;
let container: HTMLDivElement;
function button(name: string) { return Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === name)!; }
async function mount(element: ReturnType<typeof createElement>) {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(element));
}
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
function outsideButton() { const outside = document.createElement("button"); outside.textContent = "Other System"; document.body.append(outside); return outside; }

it("opens an inquiry reply at Subject and returns to Reply when the draft closes, retaining words", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await mount(createElement(WorkspaceInquiryReply, { workspaceId: "fictional", rowId: "row", name: "Pat", email: "pat@example.test" }));
  const opener = button("Reply to Pat"); opener.focus();
  await act(async () => opener.click()); expect(document.activeElement).toBe(container.querySelector("input"));
  const draft = container.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(draft, "Retained private draft"); draft.dispatchEvent(new Event("input", { bubbles: true })); });
  button("Close draft").focus(); await act(async () => button("Close draft").click());
  expect(document.activeElement).toBe(button("Reply to Pat"));
  await act(async () => button("Reply to Pat").click());
  expect(container.querySelector("textarea")!.value).toBe("Retained private draft"); expect(fetcher).not.toHaveBeenCalled();
});

it.each([false, true])("recovers the replaced Choose forms control after loading (empty=%s)", async empty => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ tenants: empty ? [] : [{ tenantId: "bakery", siteName: "Fictional bakery", inquiry: [], booking: [] }] })));
  await mount(createElement(WebsiteConnectionSelector, { workspaceId: "business", workId: "work", revision: 1, selected: null, disabled: false, onSaved: vi.fn() }));
  const choose = button("Choose forms"); choose.focus(); await act(async () => choose.click());
  expect(choose.isConnected).toBe(false);
  expect(document.activeElement).toBe(empty ? container.querySelector("h2") : container.querySelector("select"));
});

it("does not steal focus when forms finish loading after the customer moves to another System", async () => {
  let resolve!: (value: Response) => void; vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  await mount(createElement(WebsiteConnectionSelector, { workspaceId: "business", workId: "work", revision: 1, selected: null, disabled: false, onSaved: vi.fn() }));
  const choose = button("Choose forms"); choose.focus(); await act(async () => choose.click());
  const outside = outsideButton(); outside.focus();
  await act(async () => resolve(Response.json({ tenants: [] })));
  expect(document.activeElement).toBe(outside);
});

it.each([false, true])("hands off focus after native visitor forms save remounts the selector, unless the customer moved (moved=%s)", async moved => {
  const record = fixtureRebuild(); let resolve!: (value: Response) => void;
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") return new Promise<Response>(done => { resolve = done; });
    return Response.json({ tenants: [{ tenantId: "bakery", siteName: "Fictional bakery", inquiry: [{ capabilityId: "orders", version: 1, name: "Orders" }], booking: [] }] });
  }); vi.stubGlobal("fetch", fetcher);
  await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record }));
  button("Choose forms").focus(); await act(async () => button("Choose forms").click());
  const source = container.querySelector("select")!;
  await act(async () => { source.value = "bakery"; source.dispatchEvent(new Event("change", { bubbles: true })); });
  const inquiry = container.querySelectorAll("select")[1]!;
  await act(async () => { inquiry.value = "orders"; inquiry.dispatchEvent(new Event("change", { bubbles: true })); });
  const save = button("Update website preview"); save.focus(); await act(async () => save.click());
  const outside = outsideButton(); if (moved) outside.focus();
  const at = "2026-10-09T00:00:00Z";
  await act(async () => resolve(Response.json({ workId: record.workId, workspaceId: record.workspaceId, rebuild: { version: 2, revision: record.revision + 1, title: record.title, input: { requestId: "fictional-request", url: "https://example.test" }, status: "review_ready", publishedCapabilitySelection: { tenantId: "bakery", inquiryCapabilityId: "orders" }, stages: [], checkpoint: null, candidate: { revision: 2, contentHash: "a".repeat(64), document: fixtureSiteDocument, previewHref: `/api/websites/${record.workId}/preview` }, approvedCandidateRevision: null, tenantId: null, launch: { receipt: null, readBack: null }, lastError: null, createdBy: "owner", createdAt: at, history: [] } })));
  expect(save.isConnected).toBe(false);
  const heading = container.querySelector('[aria-label="Website visitor forms"] h2');
  expect(document.activeElement).toBe(moved ? outside : heading);
  expect(JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body))).toEqual({ expectedRevision: record.revision, selection: { tenantId: "bakery", inquiryCapabilityId: "orders" } });
});

it.each(["Confirm", "Remove"])("recovers focus when a flagged %s decision removes its active article", async action => {
  const record = fixtureRebuild(), next = structuredClone(record); next.revision += 1;
  if (action === "Confirm") next.candidate!.facts.sensitive!.origin = "owner_confirmed";
  else delete next.candidate!.facts.sensitive;
  const mutate = vi.fn(async () => next);
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate };
  await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
  const control = button(action); control.focus(); await act(async () => control.click());
  expect(control.isConnected).toBe(false); expect(document.activeElement).toBe(container.querySelector("#rebuild-decisions-heading"));
  expect(mutate).toHaveBeenCalledWith(record, action.toLowerCase(), { factId: "sensitive" });
});

it("preserves deliberate focus movement during a flagged decision", async () => {
  const record = fixtureRebuild(), next = structuredClone(record); next.candidate!.facts.sensitive!.origin = "owner_confirmed";
  let resolve!: (value: typeof record) => void;
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate: () => new Promise(done => { resolve = done; }) };
  await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
  button("Confirm").focus(); await act(async () => button("Confirm").click());
  const outside = outsideButton(); outside.focus(); await act(async () => resolve(next)); expect(document.activeElement).toBe(outside);
});

it("keeps the loading action recoverable after a refusal and permits an explicit retry", async () => {
  let reject!: (cause: Error) => void;
  const fetcher = vi.fn(() => new Promise<Response>((_, fail) => { reject = fail; })); vi.stubGlobal("fetch", fetcher);
  await mount(createElement(WebsiteConnectionSelector, { workspaceId: "business", workId: "work", revision: 1, selected: null, disabled: false, onSaved: vi.fn() }));
  button("Choose forms").focus(); await act(async () => button("Choose forms").click());
  await act(async () => reject(new Error("Available forms could not be read.")));
  const retry = button("Try loading forms again"); expect(retry.disabled).toBe(false);
  expect(document.activeElement).toBe(retry); expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be read");
  fetcher.mockImplementationOnce(async () => Response.json({ tenants: [] })); await act(async () => retry.click());
  expect(fetcher).toHaveBeenCalledTimes(2); expect(document.activeElement).toBe(container.querySelector("h2"));
});

it("guards read-only forms and admits one loading request per React batch", async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(done => { resolve = done; })); vi.stubGlobal("fetch", fetcher);
  const props = { workspaceId: "business", workId: "work", revision: 1, selected: null, onSaved: vi.fn() };
  await mount(createElement(WebsiteConnectionSelector, { ...props, disabled: true }));
  button("Choose forms").click(); expect(fetcher).not.toHaveBeenCalled();
  await act(async () => root.render(createElement(WebsiteConnectionSelector, { ...props, disabled: false })));
  const choose = button("Choose forms"); choose.focus(); await act(async () => { choose.click(); choose.click(); });
  expect(fetcher).toHaveBeenCalledOnce(); expect(choose.disabled).toBe(true);
  await act(async () => resolve(Response.json({ tenants: [] })));
});

it("retains the selection and focuses actual current-state recovery when the saved record is malformed", async () => {
  const record = fixtureRebuild();
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
    ? Response.json({ workId: record.workId, workspaceId: record.workspaceId, rebuild: { malformed: true } })
    : Response.json({ tenants: [{ tenantId: "bakery", siteName: "Fictional bakery", inquiry: [{ capabilityId: "orders", version: 1, name: "Orders" }], booking: [] }] }));
  vi.stubGlobal("fetch", fetcher);
  await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record }));
  await act(async () => button("Choose forms").click());
  const source = container.querySelector("select")!;
  await act(async () => { source.value = "bakery"; source.dispatchEvent(new Event("change", { bubbles: true })); });
  const inquiry = container.querySelectorAll("select")[1]!;
  await act(async () => { inquiry.value = "orders"; inquiry.dispatchEvent(new Event("change", { bubbles: true })); });
  const save = button("Update website preview"); save.focus(); await act(async () => save.click());
  expect(source.value).toBe("bakery"); expect(inquiry.value).toBe("orders"); expect(document.activeElement).toBe(button("Reload current state"));
  expect(save.disabled).toBe(true); expect(button("Reload current state").disabled).toBe(false); expect(container.querySelector('[role="alert"]')).not.toBeNull();
});

it("retains the flagged decision and useful action after a revision conflict", async () => {
  const record = fixtureRebuild(); let reject!: (cause: Error) => void;
  const mutate = vi.fn(() => new Promise<typeof record>((_, fail) => { reject = fail; }));
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate };
  await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
  const confirm = button("Confirm"); confirm.focus(); await act(async () => confirm.click());
  confirm.blur(); // A browser may blur the temporarily disabled pending button.
  await act(async () => reject(new Error("Revision changed. Reopen the saved review.")));
  expect(document.activeElement).toBe(confirm); expect(confirm.disabled).toBe(false);
  expect(container.textContent).toContain("2 decisions need you"); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Revision changed");
});

it("does not steal focus when a contact removal finishes after the customer moves away", async () => {
  const record = fixtureRebuild(); record.candidate!.facts = { email: { text: "orders@example.test", kind: "contact", highRisk: false, origin: "owner_stated", sources: [], verification: { supported: true, confidence: 1 } } };
  const next = structuredClone(record); delete next.candidate!.facts.email; next.revision += 1; next.approved = false;
  let resolve!: (value: typeof record) => void;
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate: () => new Promise(done => { resolve = done; }) };
  await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
  container.querySelector("details")!.open = true;
  const remove = button("Remove contact"); remove.focus(); await act(async () => remove.click());
  const outside = outsideButton(); outside.focus(); await act(async () => resolve(next));
  expect(remove.isConnected).toBe(false); expect(document.activeElement).toBe(outside);
});

it("does not steal focus when contact removal is rejected after the customer moves away", async () => {
  const record = fixtureRebuild(); record.candidate!.facts = { email: { text: "orders@example.test", kind: "contact", highRisk: false, origin: "owner_stated", sources: [], verification: { supported: true, confidence: 1 } } };
  let reject!: (cause: Error) => void;
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate: () => new Promise((_, fail) => { reject = fail; }) };
  await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
  container.querySelector("details")!.open = true;
  const remove = button("Remove contact"); remove.focus(); await act(async () => remove.click());
  const outside = outsideButton(); outside.focus(); await act(async () => reject(new Error("Access changed.")));
  expect(container.textContent).toContain("orders@example.test"); expect(document.activeElement).toBe(outside);
});

it.each(["success", "failure"])("does not steal focus after a deferred ordinary correction %s", async outcome => {
  const record = fixtureRebuild(); record.candidate!.facts = { email: { text: "orders@example.test", kind: "contact", highRisk: false, origin: "owner_stated", sources: [], verification: { supported: true, confidence: 1 } } };
  const next = structuredClone(record); next.candidate!.facts.email!.text = "help@example.test"; next.revision += 1; next.approved = false;
  let resolve!: (value: typeof record) => void, reject!: (cause: Error) => void;
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate: () => new Promise((done, fail) => { resolve = done; reject = fail; }) };
  await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
  container.querySelector("details")!.open = true;
  button("Edit fact").focus(); await act(async () => button("Edit fact").click());
  const field = container.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "help@example.test"); field.dispatchEvent(new Event("input", { bubbles: true })); });
  button("Save correction").focus(); await act(async () => container.querySelector("details form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  const outside = outsideButton(); outside.focus();
  await act(async () => { if (outcome === "success") resolve(next); else reject(new Error("Revision changed.")); });
  expect(document.activeElement).toBe(outside);
  if (outcome === "failure") { expect(field.value).toBe("help@example.test"); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Revision changed"); }
  else { expect(container.textContent).toContain("help@example.test"); expect(container.querySelector("textarea")).toBeNull(); }
});

it("keeps a contact correction draft and outside focus after rejected removal", async () => {
  const record = fixtureRebuild(); record.candidate!.facts = { email: { text: "orders@example.test", kind: "contact", highRisk: false, origin: "owner_stated", sources: [], verification: { supported: true, confidence: 1 } } };
  let reject!: (cause: Error) => void;
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate: () => new Promise((_, fail) => { reject = fail; }) };
  await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
  container.querySelector("details")!.open = true;
  button("Edit fact").focus(); await act(async () => button("Edit fact").click());
  const field = container.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "help@example.test"); field.dispatchEvent(new Event("input", { bubbles: true })); });
  const remove = button("Remove contact"); remove.focus(); await act(async () => remove.click());
  const outside = outsideButton(); outside.focus(); await act(async () => reject(new Error("Access changed.")));
  expect(document.activeElement).toBe(outside); expect(field.value).toBe("help@example.test");
  expect(field.disabled).toBe(false); expect(container.querySelector('article[aria-label="orders@example.test"]')).not.toBeNull();
});

it("opens a flagged fact at its correction field and returns Cancel to its mounted Edit action", async () => {
  const record = fixtureRebuild(); const mutate = vi.fn(async () => record);
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate };
  await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
  const edit = button("Edit"); edit.focus(); await act(async () => edit.click());
  expect(document.activeElement).toBe(container.querySelector("textarea"));
  button("Cancel").focus(); await act(async () => button("Cancel").click());
  expect(document.activeElement).toBe(button("Edit")); expect(mutate).not.toHaveBeenCalled();
});

it.each(["success", "failure"])("recovers a flagged correction %s without losing the draft or exact current authority", async outcome => {
  const record = fixtureRebuild(), next = structuredClone(record); next.candidate!.facts.sensitive!.origin = "owner_confirmed"; next.candidate!.facts.sensitive!.text = "Revised fictional claim"; next.revision += 1; next.approved = false;
  let resolve!: (value: typeof record) => void, reject!: (cause: Error) => void;
  const mutate = vi.fn(() => new Promise<typeof record>((done, fail) => { resolve = done; reject = fail; }));
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate };
  await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
  button("Edit").focus(); await act(async () => button("Edit").click());
  const field = container.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Revised fictional claim"); field.dispatchEvent(new Event("input", { bubbles: true })); });
  const save = button("Save correction"); save.focus(); await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(field.disabled).toBe(true); expect(button("Cancel").disabled).toBe(true);
  expect(mutate).toHaveBeenCalledExactlyOnceWith(record, "edit", { factId: "sensitive", text: "Revised fictional claim" });
  await act(async () => { if (outcome === "success") resolve(next); else reject(new Error("Revision changed. Reopen this review.")); });
  if (outcome === "success") { expect(save.isConnected).toBe(false); expect(document.activeElement).toBe(container.querySelector("#rebuild-decisions-heading")); expect(container.textContent).toContain("1 decision needs you"); }
  else { expect(field.value).toBe("Revised fictional claim"); expect(document.activeElement).toBe(field); expect(field.disabled).toBe(false); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Revision changed"); }
});

it.each(["success", "failure"])("preserves outside focus when a flagged correction settles with %s", async outcome => {
  const record = fixtureRebuild(), next = structuredClone(record); next.candidate!.facts.sensitive!.origin = "owner_confirmed"; next.revision += 1;
  let resolve!: (value: typeof record) => void, reject!: (cause: Error) => void;
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate: () => new Promise((done, fail) => { resolve = done; reject = fail; }) };
  await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
  button("Edit").focus(); await act(async () => button("Edit").click());
  button("Save correction").focus(); await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  const outside = outsideButton(); outside.focus();
  await act(async () => { if (outcome === "success") resolve(next); else reject(new Error("Access changed.")); });
  expect(document.activeElement).toBe(outside);
  if (outcome === "failure") expect(container.querySelector("textarea")).not.toBeNull();
});

it("returns a focused flagged Cancel control to the remounted Edit button", async () => {
  const record = fixtureRebuild();
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate: async () => record };
  await mount(createElement(RebuildExperience, { workspaceId: record.workspaceId, initialRecord: record, transport }));
  await act(async () => button("Edit").click()); button("Cancel").focus();
  await act(async () => button("Cancel").click()); expect(document.activeElement).toBe(button("Edit"));
});

it("blocks saving after access becomes read-only but lets Cancel recover to the review heading", async () => {
  const record = fixtureRebuild(); const mutate = vi.fn(async () => record);
  const transport: RebuildTransport = { read: async () => record, start: async () => record, mutate };
  const props = { workspaceId: record.workspaceId, initialRecord: record, transport };
  await mount(createElement(RebuildExperience, props));
  button("Edit").focus(); await act(async () => button("Edit").click());
  await act(async () => root.render(createElement(RebuildExperience, { ...props, readOnly: true })));
  expect(container.querySelector("textarea")!.disabled).toBe(true); expect(button("Save correction").disabled).toBe(true);
  const cancel = button("Cancel"); expect(cancel.disabled).toBe(false); cancel.focus(); await act(async () => cancel.click());
  expect(document.activeElement).toBe(container.querySelector("#rebuild-decisions-heading")); expect(button("Edit").disabled).toBe(true); expect(mutate).not.toHaveBeenCalled();
});

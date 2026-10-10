// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentExperience, type DocumentTransport, type DocumentSaved } from "@/experience/workspace/DocumentExperience";
import { changeDocument, createDocument, type DocumentHistoryPage, type DocumentReceipt } from "@/products/documents/contracts";

vi.mock("@/experience/workspace/WorkPlanExperience", () => ({ WorkPlanExperience: () => null }));
const workId = "33333333-3333-4333-8333-333333333333";
const workspaceId = "22222222-2222-4222-8222-222222222222";
let doc = createDocument({ title: "Shared procedure", text: "v0" }, "owner");
const receipts: DocumentReceipt[] = [];
for (let i = 1; i <= 45; i += 1) {
  doc = changeDocument(doc, { kind: "edit", expectedRevision: i - 1, title: doc.title, text: `v${i}` }, i % 2 ? "owner" : "agency");
  receipts.push(doc.history.at(-1)!);
}
const saved: DocumentSaved = { workId, workspaceId, document: doc, historyEnabled: true };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === name)!;
const api = (overrides: Partial<DocumentTransport> = {}): DocumentTransport => ({
  mode: "server", read: vi.fn(async () => saved), write: vi.fn(),
  history: vi.fn(async (_id, before) => {
    const page = receipts.filter(receipt => receipt.revision < before).reverse().slice(0, 20);
    return { workId, workspaceId, receipts: page, nextBeforeRevision: page.at(-1)!.revision > 1 ? page.at(-1)!.revision : null };
  }), ...overrides,
});
const mount = async (transport: DocumentTransport, readOnly = true) => act(async () => root.render(createElement(DocumentExperience, { workspaceId, workId, transport, readOnly })));

describe("shared document history", () => {
  it("opens earlier pages in read-only mode without losing recent edits", async () => {
    const transport = api(); await mount(transport);
    expect(container.textContent).toContain("You have read-only access.");
    expect(container.textContent).toContain("Revision 45:"); expect(container.textContent).not.toContain("Revision 25:");
    await act(async () => button("Load earlier changes").click());
    expect(container.textContent).toContain("Revision 25:"); expect(container.textContent).toContain("Revision 6:");
    expect(transport.history).toHaveBeenCalledWith(workId, 26, expect.any(AbortSignal));
    await act(async () => button("Load earlier changes").click());
    expect(container.textContent).toContain("Revision 1:"); expect(button("Load earlier changes")).toBeUndefined();
    expect(container.querySelectorAll("ol > li")).toHaveLength(45); expect(transport.write).not.toHaveBeenCalled();
  });
  it("keeps earlier-change controls absent and does no history reads with the flag off", async () => {
    const transport = api({ read: vi.fn(async () => ({ ...saved, historyEnabled: undefined })) });
    await mount(transport);
    expect(button("Load earlier changes")).toBeUndefined(); expect(transport.history).not.toHaveBeenCalled();
    expect(container.querySelectorAll("ol > li")).toHaveLength(20);
  });
  it("preserves the page and offers retry after history fails", async () => {
    const history = vi.fn().mockRejectedValueOnce(new Error("History unavailable"));
    history.mockResolvedValueOnce({ workId, workspaceId, receipts: receipts.slice(5, 25).reverse(), nextBeforeRevision: 6 });
    await mount(api({ history }));
    await act(async () => button("Load earlier changes").click());
    expect(container.querySelector("[role=alert]")?.textContent).toContain("History unavailable");
    expect(container.querySelectorAll("ol > li")).toHaveLength(20);
    await act(async () => button("Retry earlier changes").click());
    expect(container.querySelectorAll("ol > li")).toHaveLength(40); expect(container.querySelector("[role=alert]")).toBeNull();
  });
  it("rejects another document's history response", async () => {
    await mount(api({ history: vi.fn(async () => ({ workId: workspaceId, workspaceId, receipts: [receipts[0]!], nextBeforeRevision: null })) }));
    await act(async () => button("Load earlier changes").click());
    expect(container.textContent).toContain("Document history could not be confirmed");
    expect(container.querySelectorAll("ol > li")).toHaveLength(20);
  });
  it("shows loading and cancels late responses when the document closes", async () => {
    let finish!: (value: DocumentHistoryPage) => void;
    let signal!: AbortSignal;
    const history = vi.fn((_id: string, _before: number, currentSignal: AbortSignal) => { signal = currentSignal; return new Promise<DocumentHistoryPage>(resolve => { finish = resolve; }); });
    await mount(api({ history }));
    await act(async () => button("Load earlier changes").click());
    expect(container.textContent).toContain("Loading document history…");
    expect(button("Loading earlier changes…").disabled).toBe(true);
    await act(async () => root.render(createElement("p", null, "Another document")));
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ workId, workspaceId, receipts: [receipts[0]!], nextBeforeRevision: null }));
    expect(container.textContent).toBe("Another document");
  });
  it("shows denied reads without offering history or saving", async () => {
    const transport = api({ read: vi.fn(async () => { throw new Error("This document is unavailable to your account."); }) });
    await mount(transport);
    expect(container.querySelector("[role=alert]")?.textContent).toContain("unavailable to your account");
    expect(button("Load earlier changes")).toBeUndefined(); expect(transport.history).not.toHaveBeenCalled();
  });
});

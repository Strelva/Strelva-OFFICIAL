// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgencyQualification } from "@/experience/workspace/agency/AgencyQualification";
import type { QualificationState } from "@/experience/workspace/agency/qualification-model";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const initial: QualificationState = { workspaceId, canSubmit: true, effects: [{ effect: "publish", available: false }], submissions: [] };
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const response = (qualification: QualificationState) => ({ ok: true, json: async () => ({ qualification }) });
async function mount(fetcher: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetcher);
  const node = document.createElement("div"); document.body.appendChild(node); const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(AgencyQualification, { workspaceId })));
  return node;
}
async function fill(node: Element) {
  await act(async () => {
    const input = node.querySelector("input")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"https://example.test/proof"); input.dispatchEvent(new Event("input", { bubbles: true }));
    const notes = node.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(notes,"A release and rollback rehearsal was completed."); notes.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("keeps evidence on a lost response, blocks another write, and rereads pending status", async () => {
  let body: Record<string, string> = {};
  const fetcher = vi.fn().mockResolvedValueOnce(response(initial)).mockImplementationOnce(async (_url, options) => { body = JSON.parse(options.body); throw new Error("response lost"); });
  const node = await mount(fetcher); await fill(node);
  await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(node.textContent).toContain("Outcome not confirmed");
  expect(node.querySelector("textarea")?.value).toBe(body.evidence);
  expect(node.querySelector("button[type=submit]")?.hasAttribute("disabled")).toBe(true);
  const { requestId, evidenceUrl, evidence } = body;
  if (!requestId || !evidenceUrl || !evidence) throw new Error("Submission did not include its exact request and evidence.");
  fetcher.mockResolvedValueOnce(response({ ...initial, submissions: [{ id: requestId, workspaceId, agencyName: "Agency", effect: "publish", evidenceUrl, evidence, submittedAt: "2026-10-12T12:00:00Z", submittedBy: "11111111-1111-4111-8111-111111111111", decision: null, reason: null, decidedBy: null, decidedAt: null }] }));
  await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === "Refresh status")!.click());
  expect(node.textContent).toContain("In review"); expect(node.querySelector("form")).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(3);
});
it("offers refresh while a review is pending and reflects an operator change request", async () => {
  const pending = { ...initial, submissions: [{ id: "33333333-3333-4333-8333-333333333333", workspaceId, agencyName: "Agency", effect: "publish" as const, evidenceUrl: "https://example.test/proof", evidence: "Preview and recovery rehearsal", submittedAt: "2026-10-12T12:00:00Z", submittedBy: "11111111-1111-4111-8111-111111111111", decision: null, reason: null, decidedBy: null, decidedAt: null }] };
  const fetcher = vi.fn().mockResolvedValueOnce(response(pending)).mockResolvedValueOnce(response({ ...pending, submissions: [{ ...pending.submissions[0]!, decision: "changes_requested", reason: "Please supply current domain authority", decidedBy: pending.submissions[0]!.submittedBy, decidedAt: "2026-10-12T12:30:00Z" }] }));
  const node = await mount(fetcher); expect(node.querySelector("form")).toBeNull();
  await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === "Refresh status")!.click());
  expect(node.textContent).toContain("Changes requested"); expect(node.textContent).toContain("Please supply current domain authority"); expect(node.querySelector("form")).not.toBeNull();
});
it("does not report success for a submission missing its durable request receipt", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(initial)).mockResolvedValueOnce(response(initial));
  const node = await mount(fetcher); await fill(node);
  await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(node.textContent).toContain("Outcome not confirmed"); expect(node.textContent).not.toContain("Evidence submitted.");
});

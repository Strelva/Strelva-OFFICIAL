// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgencyQualificationDesk } from "@/app/admin/qualification/AgencyQualificationDesk";
import type { QualificationRecord } from "@/experience/workspace/agency/qualification-model";
const item: QualificationRecord = { id: "33333333-3333-4333-8333-333333333333", workspaceId: "22222222-2222-4222-8222-222222222222", agencyName: "Agency", effect: "publish", evidenceUrl: "https://example.test/proof", evidence: "Preview and recovery evidence", submittedAt: "2026-10-12T12:00:00Z", submittedBy: "11111111-1111-4111-8111-111111111111", decision: null, reason: null, decidedAt: null, decidedBy: null, canReview: true };
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const reply = (submissions: QualificationRecord[]) => ({ ok: true, json: async () => ({ submissions }) });
it("requires an exact recorded decision and keeps uncertainty and reason through unrelated rereads", async () => {
  const reason = "Please supply domain authority evidence";
  const fetcher = vi.fn().mockResolvedValueOnce(reply([item])).mockResolvedValueOnce(reply([])).mockResolvedValueOnce(reply([item])).mockResolvedValueOnce(reply([{ ...item, decision: "changes_requested", reason, decidedAt: "2026-10-12T12:30:00Z", decidedBy: "44444444-4444-4444-8444-444444444444" }]));
  vi.stubGlobal("fetch", fetcher);
  const node = document.createElement("div"); document.body.appendChild(node); const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(AgencyQualificationDesk)));
  await act(async () => { const field = node.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(field, reason); field.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(node.textContent).toContain("Outcome not confirmed"); expect(node.querySelector("textarea")?.value).toBe(reason);
  expect(node.querySelector("button[type=submit]")?.hasAttribute("disabled")).toBe(true);
  const reload = () => [...node.querySelectorAll("button")].find(button => button.textContent === "Reload decisions")!.click();
  await act(async () => reload());
  expect(node.textContent).toContain("Outcome not confirmed"); expect(node.querySelector("button[type=submit]")?.hasAttribute("disabled")).toBe(true); expect(node.querySelector("textarea")?.value).toBe(reason);
  await act(async () => reload());
  expect(node.textContent).toContain("Operator decision confirmed"); expect(node.querySelector("button[type=submit]")?.hasAttribute("disabled")).toBe(false);
});
it.each([403, 409])("rereads after a confirmed atomic %s refusal and allows another review", async status => {
  const reason = "Please supply domain authority evidence";
  const fetcher = vi.fn().mockResolvedValueOnce(reply([item])).mockResolvedValueOnce({ ok: false, status, json: async () => ({ error: status === 403 ? "This work is unavailable to your account." : "This submission changed. Reload its current status." }) }).mockResolvedValueOnce(reply([item]));
  vi.stubGlobal("fetch", fetcher);
  const node = document.createElement("div"); document.body.appendChild(node); const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(AgencyQualificationDesk)));
  await act(async () => { const field = node.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(field, reason); field.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(node.textContent).toContain("decision was refused"); expect(node.querySelector("button[type=submit]")?.hasAttribute("disabled")).toBe(true);
  await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === "Reload decisions")!.click());
  expect(node.textContent).toContain("Current records are loaded"); expect(node.querySelector("textarea")?.value).toBe(reason); expect(node.querySelector("button[type=submit]")?.hasAttribute("disabled")).toBe(false);
});
it("retains own-agency evidence in the queue while withholding every decision control", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply([{ ...item, canReview: false }]));
  vi.stubGlobal("fetch", fetcher);
  const node = document.createElement("div"); document.body.appendChild(node); const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(AgencyQualificationDesk)));
  expect(node.textContent).toContain("You belong to this agency");
  expect(node.textContent).toContain("Preview and recovery evidence");
  expect(node.querySelector("select")?.hasAttribute("disabled")).toBe(true);
  await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(node.querySelector("textarea")?.hasAttribute("disabled")).toBe(true);
  expect(node.querySelector("button[type=submit]")?.hasAttribute("disabled")).toBe(true);
});

it("holds decision controls when reviewer permission is missing", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(reply([{ ...item, canReview: undefined }]));
  vi.stubGlobal("fetch", fetcher);
  const node = document.createElement("div"); document.body.appendChild(node); const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(AgencyQualificationDesk)));
  expect(node.textContent).toContain("Review permission could not be confirmed");
  expect(node.querySelector("button[type=submit]")?.hasAttribute("disabled")).toBe(true);
});

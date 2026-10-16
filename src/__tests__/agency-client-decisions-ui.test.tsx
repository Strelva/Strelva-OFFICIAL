// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyClientDecisions } from "@/experience/workspace/agency/AgencyClientDecisions";
import type { OwnerDecision } from "@/platform/needs-you/contracts";

vi.mock("@/components/ui/strelva/Kit", async () => {
  const actual = await vi.importActual<typeof import("@/components/ui/strelva/Kit")>("@/components/ui/strelva/Kit");
  // Exercises acceptance transport, not the separately qualified hold primitive.
  return { ...actual, StHold: ({ label, disabled, onAccept }: { label: string; disabled: boolean; onAccept: () => void }) => createElement("button", { disabled, onClick: onAccept }, label) };
});

const AGENCY = "a0000000-0000-4000-8000-0000000000a1";
const WS = "a0000000-0000-4000-8000-000000000001";
const decision: OwnerDecision = {
  id: "d0000000-0000-4000-8000-000000000001", workspaceId: WS, systemId: null, kind: "copy.marketing", route: "owner_decides",
  title: "Publish the new opening hours", detail: "Monday: 9–5", approveEffect: "These hours go live.", notYetEffect: "Nothing goes live.",
  sourceLifecycle: "tenant_event", sourceId: "t:e", revisionHash: "a".repeat(64), urgent: false, signInRequired: false, adminMayDecide: false, openHref: null,
  state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "suppressed", operatorNote: null,
  actor: { kind: "agency", displayName: "Outside Agency" }, review: ["Monday: closed → 9–5"],
  openedAt: "2026-10-06T11:00:00Z", expiresAt: "2026-10-20T11:00:00Z", reminded1At: null, reminded2At: null, deliveries: [],
};
const page = (items: OwnerDecision[] = [decision], complete = true) => ({ authority: "agency", agencyWorkspaceId: AGENCY, canDecide: true, items, complete });
let root: Root;
let node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
const click = (text: string) => act(async () => { [...node.querySelectorAll("button")].find(button => button.textContent === text)!.click(); });
const mount = (request: typeof fetch, workspaceId = WS) => act(async () => root.render(createElement(AgencyClientDecisions, { key: workspaceId, workspaceId, agencyWorkspaceId: AGENCY, clientName: "Bakery", request })));

describe("agency Full-control review", () => {
  it("carries exact changes and actor, then decides as agency with the reviewed revision", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page())).mockResolvedValueOnce(Response.json({ status: "done" })).mockResolvedValueOnce(Response.json(page([])));
    await mount(request);
    expect(request.mock.calls[0]![0]).toContain(`workspaceId=${WS}&asAgency=1`);
    expect(node.textContent).toContain("Monday: closed → 9–5");
    expect(node.textContent).toContain("Outside Agency");
    expect(node.textContent).toContain("Runs on Strelva");
    await click("Make it live");
    expect(JSON.parse(String(request.mock.calls[1]![1]!.body))).toEqual({ workspaceId: WS, agencyWorkspaceId: AGENCY, itemId: decision.id, revision: decision.revisionHash, decision: "approve", asAgency: true });
    expect(node.textContent).toContain("Done.");
    expect(node.textContent).toContain("No open decisions");
    expect(node.querySelectorAll("button")).toHaveLength(1);
  });

  it("uses booking confirmation copy, and Not yet changes nothing", async () => {
    const booking = { ...decision, kind: "customer.commitment" as const, sourceLifecycle: "booking_request" };
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page([booking]))).mockResolvedValueOnce(Response.json({ status: "done" })).mockResolvedValueOnce(Response.json(page([])));
    await mount(request);
    expect(node.textContent).toContain("Confirm");
    await click("Not yet");
    expect(JSON.parse(String(request.mock.calls[1]![1]!.body)).decision).toBe("not_yet");
    expect(node.textContent).toContain("Not yet. Nothing changed.");
  });

  it("disables incomplete exact reviews without approving unseen changes", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(page([{ ...decision, review: null }], false)));
    await mount(request);
    expect(node.textContent).toContain("exact reviews could not be loaded");
    const controls = [...node.querySelectorAll("button")].filter(button => button.textContent !== "Refresh decisions");
    expect(controls).toHaveLength(1);
    expect(controls.every(button => button.disabled)).toBe(true);
    await click("Make it live");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("re-reads a lost response before returning retry controls", async () => {
    let finishRead!: (response: Response) => void;
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page())).mockRejectedValueOnce(new Error("lost response"))
      .mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; })).mockResolvedValueOnce(Response.json(page()));
    await mount(request);
    await click("Make it live");
    expect(node.textContent).toContain("Outcome not confirmed");
    expect(node.textContent).not.toContain("Nothing changed");
    expect([...node.querySelectorAll("button")].every(button => button.disabled)).toBe(true);
    await act(async () => finishRead(Response.json({ authority: "agency", agencyWorkspaceId: AGENCY, item: decision })));
    expect(request.mock.calls[2]![0]).toContain(`itemId=${decision.id}&revision=${decision.revisionHash}`);
    expect([...node.querySelectorAll("button")].find(button => button.textContent === "Make it live")!.disabled).toBe(false);
  });

  it("keeps controls unavailable when the recovery read also fails, and recovers only by checking", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page())).mockResolvedValueOnce(Response.json({ unexpected: true }))
      .mockRejectedValueOnce(new Error("read failed")).mockResolvedValueOnce(Response.json({ authority: "agency", agencyWorkspaceId: AGENCY, item: { ...decision, state: "approved", outcome: "done_unverified", decidedActor: { kind: "agency", agencyId: AGENCY, displayName: "Outside Agency" } } })).mockResolvedValueOnce(Response.json(page([])));
    await mount(request);
    await click("Make it live");
    expect(node.textContent).toContain("Outcome not confirmed");
    expect(node.textContent).toContain("Approval controls stay unavailable");
    expect(node.textContent).not.toContain("Make it live");
    await click("Check again");
    expect(node.textContent).toContain("No open decisions");
    expect(node.textContent).toContain("The action was accepted. Confirmation is still pending.");
    expect(node.textContent).toContain("Outside Agency");
    expect(request.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
  });

  it.each([
    [null, "Its outcome is still pending; do not submit it again."],
    ["failed", "The decision is recorded, but the work could not finish."],
    ["done", "Done."],
  ] as const)("shows the exact recorded %s outcome without resubmitting", async (outcome, copy) => {
    const item = { ...decision, state: "approved", outcome };
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page())).mockRejectedValueOnce(new Error("lost"))
      .mockResolvedValueOnce(Response.json({ authority: "agency", agencyWorkspaceId: AGENCY, item })).mockResolvedValueOnce(Response.json(page([])));
    await mount(request);
    await click("Make it live");
    expect(node.textContent).toContain(copy);
    expect(node.textContent).not.toContain("Outcome not confirmed");
    expect(node.textContent).not.toContain("Make it live");
    expect(request.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
  });

  it("refuses a receipt from another business before restoring any controls", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(page())).mockRejectedValueOnce(new Error("lost"))
      .mockResolvedValueOnce(Response.json({ authority: "agency", agencyWorkspaceId: AGENCY, item: { ...decision, workspaceId: AGENCY } }));
    await mount(request);
    await click("Make it live");
    expect(node.textContent).toContain("Approval controls stay unavailable");
    expect(node.textContent).not.toContain("Make it live");
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("handles permission loss and malformed cross-business reads without controls", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, { status: 403 }))
      .mockResolvedValueOnce(Response.json(page([{ ...decision, workspaceId: "a0000000-0000-4000-8000-000000000002" }])));
    await mount(request);
    expect(node.textContent).toContain("Check the client assignment");
    expect(node.textContent).not.toContain("Make it live");
    await click("Refresh decisions");
    expect(node.textContent).toContain("Approval controls stay unavailable");
    expect(node.textContent).not.toContain("Publish the new opening hours");
  });

  it("does not reuse a previous client's late read", async () => {
    let finishRead!: (response: Response) => void;
    const request = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }))
      .mockResolvedValueOnce(Response.json(page([])));
    await mount(request);
    expect(node.textContent).toContain("Checking your current decision access");
    await mount(request, "a0000000-0000-4000-8000-000000000002");
    await act(async () => finishRead(Response.json(page())));
    expect(node.textContent).not.toContain(decision.title);
    expect(node.textContent).toContain("No open decisions");
  });

  it("shows honest release-off copy", async () => {
    await mount(vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 503 })));
    expect(node.textContent).toContain("Client decisions are currently unavailable");
    expect(node.textContent).not.toContain("Make it live");
  });
});

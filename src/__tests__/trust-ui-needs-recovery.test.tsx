// @vitest-environment jsdom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useNeedsYou } from "@/experience/workspace/useNeedsYou";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { OwnerDecision, HandledReceipt } from "@/platform/needs-you/contracts";

const WS = "a0000000-0000-4000-8000-000000000001";
const item: OwnerDecision = { id: "d0000000-0000-4000-8000-000000000001", workspaceId: WS, systemId: null, kind: "system.go_live", route: "owner_decides", title: "Publish the page", detail: null,
  approveEffect: "The page goes live.", notYetEffect: "The page stays a draft.", sourceLifecycle: "website_document", sourceId: "page", revisionHash: "a".repeat(64), urgent: false, signInRequired: false, adminMayDecide: true, openHref: null,
  state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "suppressed", operatorNote: null,
  openedAt: "2026-10-12T11:00:00Z", expiresAt: "2026-10-20T11:00:00Z", reminded1At: null, reminded2At: null, deliveries: [] };
const receipt: HandledReceipt = { id: "record:14", store: "business_record_revisions", systemId: null, sentence: "Updated hours", at: "2026-10-12T11:00:00Z", changed: "hours", evidence: null, undo: { state: "undo" } };
const ready = (over: object = {}) => ({ role: "owner", items: [item], complete: true, handled: [receipt], handledAvailable: true, ...over });
let root: Root, node: HTMLDivElement, hook: ReturnType<typeof useNeedsYou>;
function Harness() { const value = useNeedsYou(WS); useLayoutEffect(() => { hook = value; }); return <div>{JSON.stringify(value.state)}{JSON.stringify(value.notices)}{JSON.stringify(value.receiptNotices)}</div>; }
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.append(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
async function mount(request: typeof fetch) { await act(async () => root.render(<WorkspaceRequestContext.Provider value={request}><Harness /></WorkspaceRequestContext.Provider>)); }
function deferred() { let resolve!: (r: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); return { promise, resolve }; }

it("a lost decision response locks retries until a complete read confirms current decisions and receipts", async () => {
  const next = deferred(); let reads = 0, writes = 0;
  const request = vi.fn(async (_input: unknown, init?: RequestInit) => {
    if (init?.method === "POST") { writes++; throw new Error("response lost after server commit"); }
    reads++; return reads === 1 ? Response.json(ready()) : next.promise;
  });
  await mount(request as typeof fetch);
  await act(async () => hook.decide(item, "approve"));
  expect(hook.notices[item.id]!.text).toContain("Outcome not confirmed");
  expect(hook.notices[item.id]!.text).not.toContain("Nothing changed");
  expect(hook.pending).toBe(item.id);
  await act(async () => hook.decide(item, "approve")); expect(writes).toBe(1);
  await act(async () => next.resolve(Response.json(ready({ items: [] }))));
  expect(hook.pending).toBeNull();
  expect(hook.notices[item.id]!.text).toContain("no longer waiting on you");
  expect(reads).toBe(2);
});

it("failed and partial recovery reads keep the write blocked until Check again succeeds", async () => {
  let reads = 0, writes = 0;
  const request = vi.fn(async (_input: unknown, init?: RequestInit) => {
    if (init?.method === "POST") { writes++; return new Response("unreadable", { status: 200 }); }
    reads++;
    if (reads === 2) throw new Error("offline");
    return Response.json(ready(reads === 3 ? { handledAvailable: false } : {}));
  });
  await mount(request as typeof fetch);
  await act(async () => hook.decide(item, "approve"));
  expect(hook.state.status).toBe("error"); expect(hook.pending).toBe(item.id);
  await act(async () => hook.refresh()); expect(hook.pending).toBe(item.id);
  await act(async () => hook.decide(item, "approve")); expect(writes).toBe(1);
  await act(async () => hook.refresh()); expect(hook.pending).toBeNull();
  expect(hook.notices[item.id]!.text).toContain("Review the current decision");
});

it("a lost Undo response reads its receipt and shows Undone only after confirmation", async () => {
  const next = deferred(); let reads = 0, writes = 0;
  const request = vi.fn(async (_input: unknown, init?: RequestInit) => {
    if (init?.method === "POST") { writes++; throw new Error("response lost"); }
    return ++reads === 1 ? Response.json(ready()) : next.promise;
  });
  await mount(request as typeof fetch);
  await act(async () => hook.undo(receipt));
  expect(hook.receiptNotices[receipt.id]!.text).toContain("Outcome not confirmed");
  await act(async () => hook.undo(receipt)); expect(writes).toBe(1);
  await act(async () => next.resolve(Response.json(ready({ handled: [{ ...receipt, undo: { state: "undone" } }] }))));
  expect(hook.pending).toBeNull();
  expect(hook.receiptNotices[receipt.id]!.text).toBe("Undone. Confirmed in the latest changes.");
});

it("a 5xx decision response is uncertain even if it contains a familiar status", async () => {
  let reads = 0;
  const pending = deferred();
  const request = vi.fn(async (_input: unknown, init?: RequestInit) => init?.method === "POST" ? Response.json({ status: "failed" }, { status: 500 }) : ++reads === 1 ? Response.json(ready()) : pending.promise);
  await mount(request as typeof fetch);
  await act(async () => hook.decide(item, "approve"));
  expect(hook.notices[item.id]!.text).toContain("Outcome not confirmed"); expect(hook.pending).toBe(item.id);
});

it("retains exact agency capability and submits the agency decision identity", async () => {
  const agencyWorkspaceId = "b0000000-0000-4000-8000-000000000001";
  let command: Record<string, unknown> | undefined;
  const request = vi.fn(async (_input: unknown, init?: RequestInit) => {
    if (init?.method === "POST") { command = JSON.parse(String(init.body)); return Response.json({ status: "done" }); }
    return Response.json(ready({ role: "member", authority: "agency", canDecide: true, agencyWorkspaceId, handled: [], handledAvailable: false }));
  });
  await mount(request as typeof fetch);
  expect(hook.state).toMatchObject({ status: "ready", role: "member", authority: "agency", canDecide: true, agencyWorkspaceId });
  await act(async () => hook.decide(item, "approve"));
  expect(command).toEqual({ workspaceId: WS, itemId: item.id, revision: item.revisionHash, decision: "approve", asAgency: true, agencyWorkspaceId });
});

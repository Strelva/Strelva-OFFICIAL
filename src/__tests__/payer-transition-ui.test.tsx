// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspacePayerTransition } from "@/experience/workspace/WorkspacePayerTransition";
import { AccountPayerInbox } from "@/experience/workspace/AccountPayerInbox";
import type { PayerTransition, PayerTransitionSnapshot } from "@/platform/work-economics/payer-transitions";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspace = "22222222-2222-4222-8222-222222222222";
const transitionId = "33333333-3333-4333-8333-333333333333";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const roots: ReturnType<typeof createRoot>[] = [];
const scopedUrl = `/api/work-economics/payer-transition?workspaceId=${workspaceId}`;
const inboxUrl = "/api/work-economics/payer-transition";

function row(over: Partial<PayerTransition> = {}): PayerTransition {
  return { id: transitionId, workspaceId, successorKind: "business", successorEmail: "", successorUserId: "", successorWorkspaceId: null,
    successorWorkspaceName: null, proposerEmail: "owner@example.test", status: "pending", proposedAt: "2026-10-08T12:00:00Z", resolvedAt: null,
    acceptedAt: null, workspaceName: "Boundary Workshop", isCurrent: over.status === "accepted", canRespond: true, canRevoke: true, ...over };
}
function snapshot(rows: PayerTransition[] = [row()], scope: string | null = workspaceId): PayerTransitionSnapshot {
  return { workspaceId: scope, transitions: rows, current: rows.find(item => item.status === "accepted") ?? null,
    pending: rows.find(item => item.status === "pending") ?? null, currentActorId: userId, ...(scope === null ? { jobs: [] } : {}) };
}
function receipt(action = "accept", status = "accepted", successorKind = "business", id = transitionId) {
  return { receipt: { kind: "payer_transition", action, id, workspaceId, status, successorKind } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const button = (node: HTMLElement, name: string) => [...node.querySelectorAll("button")].find(item => item.textContent?.trim() === name);
const writes = (request: ReturnType<typeof vi.fn>) => request.mock.calls.filter(call => call[1]?.method === "POST").map(call => JSON.parse(String(call[1]?.body)));
async function click(node: HTMLElement, name: string) { const target = button(node, name); expect(target).toBeTruthy(); await act(async () => target!.click()); }
async function select(node: HTMLElement, kind: string) {
  await act(async () => { const field = node.querySelector("select")!; field.value = kind; field.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function submit(node: HTMLElement) { await act(async () => { node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
async function render(transport: typeof fetch, inbox = false, canPropose = true) {
  const request = vi.fn(transport); vi.stubGlobal("fetch", request);
  const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root);
  await act(async () => root.render(inbox ? createElement(AccountPayerInbox) : createElement(WorkspacePayerTransition, { workspaceId, canPropose })));
  return { node, root, request };
}
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("payer party UI", () => {
  it.each(["business", "agency", "user"] as const)("uses server eligibility for %s acceptance instead of stored signer identity", async successorKind => {
    const item = row({ successorKind, successorUserId: "different-user", successorEmail: "payer@example.test", successorWorkspaceName: "Northside Web" });
    const { node } = await render(async () => Response.json(snapshot([item])), false, false);
    expect(button(node, "Accept future payer role")).toBeTruthy();
    expect(button(node, "Revoke proposal")).toBeUndefined();
    expect(node.textContent).toContain(successorKind === "agency" ? "Northside Web (agency)" : successorKind === "business" ? "Boundary Workshop" : "payer@example.test");
  });

  it("never infers response/revoke permission from identity or owner props", async () => {
    const { node } = await render(async () => Response.json(snapshot([row({ successorKind: "user", successorUserId: userId, canRespond: false, canRevoke: false })])));
    expect(button(node, "Accept future payer role")).toBeUndefined();
    expect(button(node, "Decline")).toBeUndefined();
    expect(button(node, "Revoke proposal")).toBeUndefined();
  });

  it.each(["user", "agency", "business"] as const)("submits only the %s proposal shape", async kind => {
    const { node, request } = await render(async (_url, init) => Response.json(init?.method === "POST" ? receipt("propose", "pending", kind) : snapshot([])));
    await select(node, kind);
    const field = node.querySelector<HTMLInputElement>("input");
    if (field) field.value = kind === "agency" ? otherWorkspace : "payer@example.test";
    await submit(node);
    expect(writes(request)).toEqual([{ action: "propose", workspaceId, ...(kind === "agency" ? { successorAgencyWorkspaceId: otherWorkspace } : kind === "business" ? { successorKind: "business" } : { successorEmail: "payer@example.test" }) }]);
    expect(node.textContent).toContain("Payer change proposed");
    expect(request.mock.calls.at(-1)?.[0]).toBe(scopedUrl);
  });

  it("returns to the exact workspace after acceptance without reading the global inbox", async () => {
    let accepted = false;
    const { node, request } = await render(async (url, init) => {
      if (init?.method === "POST") { accepted = true; return Response.json(receipt()); }
      expect(url).toBe(scopedUrl);
      return Response.json(snapshot([row(accepted ? { status: "accepted", canRespond: false, canRevoke: false, acceptedAt: "2026-10-08T13:00:00Z" } : {})]));
    });
    await click(node, "Accept future payer role");
    expect(node.textContent).toContain("on behalf of the business");
    expect(node.textContent).toContain("Current accepted successor:");
    expect(writes(request)).toHaveLength(1);
    expect(button(node, "Accept future payer role")).toBeUndefined();
  });

  it("rejects a global inbox or another workspace snapshot in the business view", async () => {
    const { node } = await render(async () => Response.json(snapshot([row({ workspaceId: otherWorkspace })], null)));
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("could not be verified");
    expect(button(node, "Accept future payer role")).toBeUndefined();
    expect(node.textContent).not.toContain("Current accepted successor");
  });

  it("reports committed acceptance despite read failure and recovers with GET only", async () => {
    let reads = 0;
    const { node, request } = await render(async (_url, init) => {
      if (init?.method === "POST") return Response.json(receipt());
      reads++;
      if (reads === 2) return Response.json({ error: "database unavailable" }, { status: 503 });
      return Response.json(snapshot([row(reads > 2 ? { status: "accepted", canRespond: false, canRevoke: false } : {})]));
    });
    await click(node, "Accept future payer role");
    expect(node.textContent).toContain("Payer acceptance is recorded on behalf of the business");
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("The change was saved");
    expect(button(node, "Accept future payer role")).toBeUndefined();
    await click(node, "Refresh payer history");
    expect(writes(request)).toHaveLength(1);
    expect(node.querySelector('[role="alert"]')).toBeNull();
    expect(node.textContent).toContain("Current accepted successor");
  });

  it.each([403, 409, 503])("locks actions after a %s response until an authority refresh", async status => {
    const { node, request } = await render(async (_url, init) => Response.json(init?.method === "POST" ? { error: "Current authority or proposal changed." } : snapshot(), { status: init?.method === "POST" ? status : 200 }));
    await click(node, "Accept future payer role");
    expect(button(node, "Accept future payer role")?.disabled).toBe(true);
    await click(node, "Accept future payer role");
    expect(writes(request)).toHaveLength(1);
    await click(node, "Refresh payer history");
    expect(button(node, "Accept future payer role")?.disabled).toBe(false);
  });

  it("suppresses duplicate and cross-row clicks while a write is pending", async () => {
    const pending = deferred<Response>();
    const { node, request } = await render(async (_url, init) => init?.method === "POST" ? pending.promise : Response.json(snapshot([row(), row({ id: otherWorkspace, workspaceId: otherWorkspace })], null)), true);
    await act(async () => { const buttons = [...node.querySelectorAll("button")]; buttons[0]!.click(); buttons[0]!.click(); buttons[2]!.click(); });
    expect(writes(request)).toHaveLength(1);
    expect([...node.querySelectorAll("button")].every(item => item.disabled)).toBe(true);
    await act(async () => pending.resolve(Response.json(receipt())));
  });

  it("reports stale proposer resolution without an acceptance success", async () => {
    let saved = false;
    const { node } = await render(async (_url, init) => {
      if (init?.method === "POST") { saved = true; return Response.json(receipt("accept", "stale")); }
      return Response.json(snapshot([row(saved ? { status: "stale", canRespond: false, canRevoke: false } : {})]));
    });
    await click(node, "Accept future payer role");
    expect(node.textContent).toContain("The payer was not changed");
    expect(node.textContent).not.toContain("Payer acceptance is recorded");
  });

  it("discards delayed reads from the previous workspace", async () => {
    const old = deferred<Response>();
    const { node, root } = await render(async url => url === scopedUrl ? old.promise : Response.json(snapshot([], otherWorkspace)));
    expect(node.textContent).toContain("Loading payer history");
    await act(async () => root.render(createElement(WorkspacePayerTransition, { workspaceId: otherWorkspace, canPropose: false })));
    await act(async () => old.resolve(Response.json(snapshot())));
    expect(node.textContent).not.toContain("Boundary Workshop");
    expect(button(node, "Accept future payer role")).toBeUndefined();
    expect(node.textContent).toContain("No current accepted payer change");
  });

  it("discards delayed command receipts after workspace navigation without reading the old scope", async () => {
    const pending = deferred<Response>();
    const { node, root, request } = await render(async (url, init) => init?.method === "POST" ? pending.promise : Response.json(snapshot(url === scopedUrl ? [row()] : [], url === scopedUrl ? workspaceId : otherWorkspace)));
    await click(node, "Accept future payer role");
    await act(async () => root.render(createElement(WorkspacePayerTransition, { workspaceId: otherWorkspace, canPropose: false })));
    await act(async () => pending.resolve(Response.json(receipt())));
    expect(node.textContent).not.toContain("Payer acceptance is recorded");
    expect(node.textContent).not.toContain("Boundary Workshop");
    expect(request.mock.calls.filter(call => call[0] === scopedUrl)).toHaveLength(1);
  });

  it("uses named agency and business copy in the account inbox and current eligibility only", async () => {
    const { node } = await render(async () => Response.json(snapshot([
      row({ successorKind: "agency", successorWorkspaceName: "Northside Web", canRespond: true }),
      row({ id: otherWorkspace, successorKind: "business", workspaceName: "Second Business", canRespond: false }),
      row({ id: userId, successorKind: "agency", successorWorkspaceName: "Accepted Agency", status: "accepted", canRespond: false }),
    ], null)), true);
    expect(node.textContent).toContain("Northside Web (agency)");
    expect(node.textContent).toContain("on behalf of this agency");
    expect(node.textContent).toContain("on behalf of the business");
    expect(node.textContent).toContain("Accepted payer: Accepted Agency (agency)");
    expect(node.textContent).not.toContain("this exact account");
    expect(node.textContent).not.toContain("Accepted by this verified account");
    expect([...node.querySelectorAll("button")].filter(item => item.textContent === "Accept future payer role")).toHaveLength(1);
  });

  it("refreshes the global inbox after a party response and shows read failures without an empty claim", async () => {
    let reads = 0;
    const { node, request } = await render(async (url, init) => {
      expect(url).toBe(inboxUrl);
      if (init?.method === "POST") return Response.json(receipt("accept", "accepted", "agency"));
      if (++reads > 1) return Response.json({ error: "unavailable" }, { status: 503 });
      return Response.json(snapshot([row({ successorKind: "agency", successorWorkspaceName: "Agency" })], null));
    }, true);
    await click(node, "Accept future payer role");
    expect(node.textContent).toContain("on behalf of the agency");
    expect(node.textContent).toContain("The change was saved");
    expect(node.textContent).not.toContain("No payer requests");
    expect(writes(request)).toHaveLength(1);
  });

  it("shows empty and permission-denied states without actionable stale records", async () => {
    const empty = await render(async () => Response.json(snapshot([], null)), true);
    expect(empty.node.textContent).toContain("No payer requests");
    const denied = await render(async () => Response.json({ error: "This business is unavailable to your account." }, { status: 403 }));
    expect(denied.node.querySelector('[role="alert"]')?.textContent).toContain("unavailable to your account");
    expect(denied.node.querySelector("form")).toBeNull();
  });
});

it.each(["pending", "rejected", "revoked"])("requires refresh for an inconsistent 200 accept receipt (%s)", async status => {
  const { node, request } = await render(async (_url, init) => Response.json(init?.method === "POST" ? receipt("accept", status) : snapshot()));
  await click(node, "Accept future payer role");
  expect(node.textContent).toContain("saved result could not be verified");
  expect(node.textContent).not.toContain("Payer acceptance is recorded");
  expect(button(node, "Accept future payer role")?.disabled).toBe(true);
  expect(writes(request)).toHaveLength(1);
});

it("labels past accepted parties as history rather than current commitments", async () => {
  const { node } = await render(async () => Response.json(snapshot([row({ status: "accepted", isCurrent: false })], null)), true);
  expect(node.textContent).toContain("Previously accepted payer for Boundary Workshop");
  expect(node.textContent).toContain("Jobs created while this payer was current retain their original payer and limits");
  expect(node.textContent).not.toContain("Current accepted payer");
});

it("keeps an idempotent old acceptance receipt separate from the newer current payer", async () => {
  let accepted = false;
  const { node } = await render(async (_url, init) => {
    if (init?.method === "POST") { accepted = true; return Response.json(receipt()); }
    return Response.json(snapshot(accepted ? [
      row({ id: otherWorkspace, status: "accepted", successorKind: "agency", successorWorkspaceName: "New Paying Agency", isCurrent: true, canRespond: false, canRevoke: false }),
      row({ status: "accepted", isCurrent: false, canRespond: false, canRevoke: false }),
    ] : [row()]));
  });
  await click(node, "Accept future payer role");
  expect(node.textContent).toContain("Payer acceptance is recorded");
  expect(node.textContent).toContain("Current accepted successor: New Paying Agency (agency)");
  expect(button(node, "Accept future payer role")).toBeUndefined();
});

// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccessPanel, type AccessActionPoster } from "@/experience/workspace/WorkspaceAccess";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";
import ProviderChangeNotices from "@/app/workspace/provider-change/ProviderChangeNotices";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const agencyId = "22222222-2222-4222-8222-222222222222";
const delegationId = "33333333-3333-4333-8333-333333333333";
const workId = "44444444-4444-4444-8444-444444444444";
const snapshot: WorkspaceSnapshot = {
  actor: { email: "lin@example.test", localPreview: false }, workspaceId,
  workspaces: [{ id: workspaceId, kind: "customer", name: "Harbor Dental", role: "owner" }],
  work: [], handoffs: [], products: [],
  delegations: [{ id: delegationId, workId, customerWorkspaceId: workspaceId, agencyWorkspaceId: agencyId, status: "active", canRevoke: true }],
};
const review = {
  workspaceId, actorUserId: workId, organization: false, inaccessibleUnits: 0,
  units: [{ workspaceId, name: "Harbor Dental", role: "owner", entries: [{ id: delegationId, kind: "delegation", label: "North Studio", status: "active", lastUsedAt: null, canRevoke: true }] }],
};
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(request: typeof fetch, postAction: AccessActionPoster) {
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(AccessPanel, {
    snapshot, currentKind: "customer", currentAccess: "member", currentRole: "owner", selectedWork: null,
    postAction, onChanged: vi.fn(), onAgencyCreated: vi.fn(), setNotice: vi.fn(),
  }))));
  return node;
}
it("resolves an agency independently of owner memberships and targets the exact delegation", async () => {
  const posted = vi.fn();
  const postAction: AccessActionPoster = async (action, fallback) => { posted(action, fallback); throw new Error("Fictional write refused"); };
  const node = await render(async () => Response.json(review), postAction);
  expect(node.textContent).toContain("North Studio");
  expect(node.textContent).toContain("Sees one piece of work. Read only.");
  await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === "Stop sharing with North Studio")!.click());
  expect(posted).toHaveBeenCalledWith({ action: "revoke_delegation", delegationId }, expect.any(String));
  // The refusal is said in place, by Strelva, and nothing claims success.
  expect(node.querySelector('[role="alert"]')?.textContent).toContain("Fictional write refused");
});
it("rejects identity from a foreign scope and keeps the targeted revocation identifiable", async () => {
  const node = await render(async () => Response.json({ ...review, units: [{ ...review.units[0], workspaceId: agencyId }] }), async () => { throw new Error("unused"); });
  expect(node.textContent).toContain("An agency");
  expect(node.textContent).not.toContain("North Studio");
  // No ids are shown to an owner; the row stays identifiable by what was shared.
  expect(node.textContent).not.toContain(agencyId);
  expect(node.textContent).toContain("Strelva couldn't confirm this agency's name.");
  expect([...node.querySelectorAll("button")].find(button => button.textContent?.startsWith("Stop sharing"))?.disabled).toBe(false);
});
it("refuses an acknowledgment receipt for another handoff", async () => {
  const node = document.createElement("div"); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  const request: typeof fetch = async () => Response.json({ id: workId, status: "notified", respond_by: "2026-11-01T00:00:00Z" });
  await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(ProviderChangeNotices, {
    workspaceId: agencyId, requests: [{ id: delegationId, business_workspace_id: workspaceId, status: "awaiting_notice", respond_by: null }],
  }))));
  await act(async () => [...node.querySelectorAll("button")].find(button => button.textContent === "Acknowledge notice")!.click());
  expect(node.textContent).toContain("receipt belongs to another handoff");
  expect(node.textContent).not.toContain("Notice acknowledged.");
});

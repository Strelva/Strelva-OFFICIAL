// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemVersionImprovements } from "@/experience/systems/SystemVersionImprovements";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { OwnerDecision } from "@/platform/needs-you/contracts";
const workspaceId = crypto.randomUUID(), systemId = crypto.randomUUID(), versionId = crypto.randomUUID(), decisionId = crypto.randomUUID();
const revision = "a".repeat(64);
const roots: ReturnType<typeof createRoot>[] = [];
const pendingRelease = { id: `version-release:${versionId}:4`, system: { businessId: workspaceId, systemId }, title: "Updated Mooney intake", status: "ready", rowRevision: 4,
  decisionRevision: revision, current: { title: "Old" }, preview: { title: "New" }, changedPaths: ["title"], makeReal: { kind: "version_release", versionId } };
const view = { workspaceId, systemId, versionId, rowRevision: 4, canManage: true, canMakeReal: true, possibilities: [], pendingRelease };
const item = (extra: Partial<OwnerDecision> = {}): OwnerDecision => ({ id: decisionId, workspaceId, systemId, kind: "system.change_live", route: "owner_decides",
  title: "Put Mooney intake live", detail: "Release 2", approveEffect: "Release 2 goes live", notYetEffect: "Nothing goes live",
  sourceLifecycle: "version_release", sourceId: versionId, revisionHash: revision, urgent: false, signInRequired: false, adminMayDecide: false, openHref: null,
  state: "open", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: null, decidedAt: null, deliveryState: "suppressed", operatorNote: null,
  openedAt: "2026-10-07T12:00:00Z", expiresAt: "2026-10-21T12:00:00Z", reminded1At: null, reminded2At: null, deliveries: [], ...extra });
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(request: typeof fetch, readOnly = false) {
  const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(WorkspaceRequestContext.Provider, { value: request }, createElement(SystemVersionImprovements, { workspaceId, systemId, versionId, readOnly }))));
  return node;
}
function button(node: HTMLElement, label = "Make real") { return [...node.querySelectorAll("button")].find(button => button.textContent === label)!; }
function done(extra: Partial<OwnerDecision> = {}) { return { status: "done", item: item({ state: "approved", outcome: "done", receiptRef: `version_release:${versionId}:2`, ...extra }) }; }
function requestFor(over: { getItem?: OwnerDecision; post?: () => Promise<Response>; view?: unknown; role?: string } = {}) {
  return vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).startsWith("/api/workspace/versions?")) return Response.json(over.view ?? view);
    if (init?.method === "POST") return over.post ? over.post() : Response.json(done());
    return Response.json({ role: over.role ?? "owner", items: [over.getItem ?? item()] });
  });
}
describe("Version Make real uses the one owner decision", () => {
  it("compares the current/alternative and approves the existing Version item, without another release path", async () => {
    const request = requestFor(); const node = await render(request);
    expect(node.textContent).toContain("Compare the release and alternative");
    expect(node.textContent).toContain('"Old"'); expect(node.textContent).toContain('"New"');
    await act(async () => button(node).click());
    const writes = request.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes).toHaveLength(1); expect(writes[0]?.[0]).toBe("/api/workspace/needs-you");
    expect(JSON.parse(String(writes[0]?.[1]?.body))).toEqual({ workspaceId, itemId: decisionId, revision, decision: "approve" });
    expect(node.textContent).toContain("Version release went live");
  });
  it("refuses foreign, stale, closed or unrelated decisions before any approval", async () => {
    for (const other of [item({ workspaceId: crypto.randomUUID() }), item({ sourceId: crypto.randomUUID() }), item({ systemId: crypto.randomUUID() }), item({ sourceLifecycle: "make_real" }), item({ revisionHash: "b".repeat(64) }), item({ state: "declined" })]) {
      const request = requestFor({ getItem: other }); const node = await render(request);
      await act(async () => button(node).click());
      expect(node.querySelector('[role="alert"]')).not.toBeNull();
      expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
      expect(node.textContent).not.toContain("Version release went live");
    }
  });
  it("retains the same approval command after uncertain provider/store response and recognizes an accepted receipt on retry", async () => {
    const post = vi.fn().mockRejectedValueOnce(new Error("Reply lost")).mockResolvedValueOnce(Response.json({ ...done(), status: "already_handled" }, { status: 409 }));
    const request = requestFor({ post }); const node = await render(request);
    await act(async () => button(node).click());
    expect(node.querySelector('[role="alert"]')?.textContent).toBe("Reply lost");
    await act(async () => button(node, "Retry Make real").click());
    const writes = request.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes).toHaveLength(2); expect(writes[0]?.[1]?.body).toEqual(writes[1]?.[1]?.body);
    expect(request.mock.calls.filter(([input, init]) => String(input).startsWith("/api/workspace/needs-you?") && init?.method !== "POST")).toHaveLength(1);
    expect(node.textContent).toContain("Version release went live");
  });
  it("never reports live from failed, malformed or foreign acknowledgments", async () => {
    for (const body of [{ status: "done" }, { ...done(), status: "failed" }, done({ sourceId: crypto.randomUUID() }), done({ receiptRef: "make_real:other" }), done({ revisionHash: "b".repeat(64) }), done({ outcome: "failed" })]) {
      const request = requestFor({ post: async () => Response.json(body) }); const node = await render(request);
      await act(async () => button(node).click());
      expect(node.querySelector('[role="alert"]')).not.toBeNull(); expect(node.textContent).not.toContain("Version release went live");
    }
  });
  it("keeps loading, read failure, read-only/admin and foreign candidate states explicit", async () => {
    const loading = await render(vi.fn(() => new Promise<Response>(() => undefined)));
    expect(loading.textContent).toContain("Reading Version possibilities");
    const unavailable = await render(vi.fn(async () => Response.json({ error: "Store unavailable" }, { status: 503 })));
    expect(unavailable.querySelector('[role="alert"]')?.textContent).toBe("Store unavailable");
    const readOnly = await render(requestFor(), true); expect(button(readOnly).disabled).toBe(true);
    const request = requestFor({ view: { ...view, canMakeReal: false } }); const admin = await render(request);
    expect(button(admin).disabled).toBe(true); expect(admin.textContent).toContain("An admin can prepare it");
    const foreign = await render(requestFor({ view: { ...view, pendingRelease: { ...pendingRelease, system: { businessId: crypto.randomUUID(), systemId } } } }));
    expect(foreign.querySelector('[role="alert"]')?.textContent).toContain("another System"); expect(button(foreign)).toBeUndefined();
  });
});

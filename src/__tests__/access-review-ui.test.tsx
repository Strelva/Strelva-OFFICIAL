// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccessReviewView, AccessReviewPage } from "@/experience/workspace/AccessReview";
import { accessReviewFixture, REVIEW_WORKSPACE } from "@/experience/workspace/preview/access-review-fixture";
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
async function render(element: ReturnType<typeof createElement>) { const node = document.createElement("div"); document.body.append(node); const root = createRoot(node); roots.push(root); await act(async () => root.render(element)); return { node, root }; }
it("lists coverage, unknown last use, protected owners and one-click target", async () => {
 const change = vi.fn(); const { node } = await render(createElement(AccessReviewView, { review: accessReviewFixture("organization"), onRevoke: change }));
 expect(node.textContent).toContain("1 mapped business is unavailable"); expect(node.textContent).toContain("Not recorded"); expect(node.textContent).toContain("Owners are protected");
 await act(async () => (node.querySelector('[aria-label^="Revoke member"]') as HTMLButtonElement).click());
 expect(change).toHaveBeenCalledWith(expect.objectContaining({ businessId: REVIEW_WORKSPACE, organization: true, kind: "member" }));
});
it("keeps members read only and shows the empty state", async () => {
 const member = await render(createElement(AccessReviewView, { review: accessReviewFixture("member"), onRevoke: vi.fn() })); expect(member.node.querySelectorAll("button")).toHaveLength(0);
 const empty = await render(createElement(AccessReviewView, { review: accessReviewFixture("empty"), onRevoke: vi.fn() })); expect(empty.node.textContent).toContain("No access records");
});
it("renders loading, denied storage, and retry", async () => {
 const request = vi.fn(async () => Response.json({ error: "This work is unavailable to your account." }, { status: 403 })); vi.stubGlobal("fetch", request);
 const { node } = await render(createElement(AccessReviewPage, { workspaceId: REVIEW_WORKSPACE }));
 expect(node.querySelector('[role="alert"]')?.textContent).toContain("unavailable");
 await act(async () => ([...node.querySelectorAll("button")].find(button => button.textContent === "Retry")!).click()); expect(request).toHaveBeenCalledTimes(2);
});
it("does not update another scope after a pending revoke resolves", async () => {
 let complete!: (value: Response) => void;
 const request = vi.fn(async (_url: unknown, options?: RequestInit) => options?.method === "POST" ? new Promise<Response>(resolve => { complete = resolve; }) : Response.json(accessReviewFixture())); vi.stubGlobal("fetch", request);
 const { node, root } = await render(createElement(AccessReviewPage, { workspaceId: REVIEW_WORKSPACE }));
 await act(async () => (node.querySelector('[aria-label^="Revoke member"]') as HTMLButtonElement).click());
 await act(async () => root.render(createElement(AccessReviewPage, { workspaceId: "27500000-0000-4000-8000-000000000042" })));
 await act(async () => complete(Response.json({ ok: true, changed: true })));
 expect(node.textContent).not.toContain("Access revoked and recorded in audit");
});

it("preserves a committed revoke receipt when the refreshed review fails", async () => {
 let reads = 0;
 const request = vi.fn(async (_url: unknown, options?: RequestInit) => options?.method === "POST" ? Response.json({ ok: true, changed: true }) : ++reads === 1 ? Response.json(accessReviewFixture()) : Response.json({ error: "Storage unavailable." }, { status: 503 }));
 vi.stubGlobal("fetch", request);
 const { node } = await render(createElement(AccessReviewPage, { workspaceId: REVIEW_WORKSPACE }));
 await act(async () => (node.querySelector('[aria-label^="Revoke member"]') as HTMLButtonElement).click());
 expect(node.querySelector('[role=status]')?.textContent).toBe("Access revoked and recorded in audit.");
 expect(node.querySelector('[role=alert]')?.textContent).toBe("Storage unavailable.");
 expect(request.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
});

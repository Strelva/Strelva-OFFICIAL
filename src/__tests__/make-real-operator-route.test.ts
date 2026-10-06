import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceConflictError } from "@/platform/workspaces/types";

const deps = vi.hoisted(() => ({
  admin: true,
  starter: vi.fn(),
  read: vi.fn(),
  resume: vi.fn(),
  rollback: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ isSuperAdmin: async () => deps.admin, getCurrentUserEmail: async () => "ops@strelva.test" }));
vi.mock("@/platform/make-real/live-server", () => ({
  activationStarter: deps.starter,
  liveMakeReal: { read: deps.read, resume: deps.resume, rollback: deps.rollback, reconcile: deps.reconcile },
}));

import { GET, POST } from "@/app/api/admin/make-real/route";

const WS = "f1000000-0000-4000-8000-000000000001";
const OWNER = { userId: "f1000000-0000-4000-8000-0000000000a1", verifiedEmail: "owner@mooney.test" };
const ACTIVATION = {
  version: 1, id: "act-1", businessId: WS, possibilityId: "p", candidateRevision: 1, actorId: OWNER.userId, status: "needs_attention", revision: 3,
  pinned: [], introduced: [], connections: [], approvals: [], checks: [],
  steps: [{ id: "effect:x", kind: "effect", target: "x", label: "Publish", dependsOn: [], reversibility: "compensable", idempotencyKey: "k", status: "unknown", effect: "unknown", attempts: 1 }],
  createdAt: "2026-10-06T12:00:00.000Z", updatedAt: "2026-10-06T12:00:00.000Z", history: [],
};
const post = (body: unknown) => POST(new Request("http://localhost:3000/api/admin/make-real", { method: "POST", body: JSON.stringify(body) }));

describe("operator Make real tools", () => {
  beforeEach(() => {
    deps.admin = true;
    deps.starter.mockReset().mockResolvedValue(OWNER);
    for (const fn of [deps.read, deps.resume, deps.rollback, deps.reconcile]) fn.mockReset().mockResolvedValue(ACTIVATION);
  });

  it("is refused to anyone but a super admin", async () => {
    deps.admin = false;
    expect((await GET(new Request(`http://localhost:3000/api/admin/make-real?workspaceId=${WS}&activationId=act-1`))).status).toBe(403);
    expect((await post({ action: "resume", workspaceId: WS, activationId: "act-1" })).status).toBe(403);
    expect(deps.resume).not.toHaveBeenCalled();
  });

  it("reads the step log, the operator view and the customer's words", async () => {
    const body = await (await GET(new Request(`http://localhost:3000/api/admin/make-real?workspaceId=${WS}&activationId=act-1`))).json();
    expect(body.customer).toMatchObject({ headline: "Nothing changed yet. Strelva is on it.", checking: true });
    expect(body.view).toMatchObject({ needsReconciliation: true });
  });

  it("runs each action as the starting owner and names the operator", async () => {
    await post({ action: "resume", workspaceId: WS, activationId: "act-1" });
    expect(deps.resume).toHaveBeenCalledWith(OWNER, WS, "act-1", "operator ops@strelva.test");
    await post({ action: "reconcile", workspaceId: WS, activationId: "act-1", stepId: "effect:x", resolution: "completed", evidence: "Vercel shows the deploy at 12:03" });
    expect(deps.reconcile).toHaveBeenCalledWith(OWNER, WS, "act-1", { stepId: "effect:x", resolution: "completed", evidence: "Vercel shows the deploy at 12:03", note: "operator ops@strelva.test" });
    await post({ action: "rollback", workspaceId: WS, activationId: "act-1", confirm: true });
    expect(deps.rollback).toHaveBeenCalledWith(OWNER, WS, "act-1", "operator ops@strelva.test");
  });

  it("needs evidence to reconcile and an explicit confirm to roll back", async () => {
    expect((await post({ action: "reconcile", workspaceId: WS, activationId: "act-1", stepId: "effect:x", resolution: "completed", evidence: "ok" })).status).toBe(400);
    expect((await post({ action: "rollback", workspaceId: WS, activationId: "act-1" })).status).toBe(400);
    expect(deps.rollback).not.toHaveBeenCalled();
  });

  it("says why when the runner refuses, and 404s an activation with no starter", async () => {
    deps.resume.mockRejectedValue(new WorkspaceConflictError("A worker may still be running this step. Wait before resuming."));
    const response = await post({ action: "resume", workspaceId: WS, activationId: "act-1" });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/still be running/);
    deps.starter.mockResolvedValue(null);
    expect((await post({ action: "resume", workspaceId: WS, activationId: "act-1" })).status).toBe(404);
  });
});

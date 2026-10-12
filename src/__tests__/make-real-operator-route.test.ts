const admission = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: admission, authorizeTenantOperatorRead: vi.fn(async () => undefined) }));
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  admin: true,
  starter: vi.fn(),
  runner: vi.fn(),
  record: vi.fn(),
  read: vi.fn(),
  resume: vi.fn(),
  rollback: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: async () => deps.admin, getCurrentUserEmail: async () => "ops@strelva.test" }));
vi.mock("@/experience/systems/live-server", () => ({
  activationStarter: deps.starter,
  activationRunner: deps.runner,
  liveMakeReal: { read: deps.read, resume: deps.resume, rollback: deps.rollback, reconcile: deps.reconcile },
}));
vi.mock("@/platform/needs-you/service-actor", () => ({ recordServiceAction: deps.record }));

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
    deps.runner.mockReset().mockImplementation(async () => { const actor = await deps.starter(); return actor ? { actor, service: null } : null; });
    deps.record.mockReset().mockResolvedValue(undefined);
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
    expect(body.customer).toMatchObject({ headline: "Nothing changed yet. The outcome needs review.", checking: true });
    expect(body.view).toMatchObject({ needsReconciliation: true });
  });

  it.each(["resume", "rollback", "reconcile"])("refuses client %s without acquiring an owner or service runner", async action => {
    const res = await post({ action, workspaceId: WS, activationId: "act-1", confirm: true, stepId: "effect:x", resolution: "completed", evidence: "Provider accepted the write." });
    expect(res.status).toBe(410);
    for (const fn of [deps.runner, deps.record, deps.resume, deps.rollback, deps.reconcile]) expect(fn).not.toHaveBeenCalled();
  });

  it("admits the human operator while preserving the starting owner and typed system engine actors", async () => {
    await GET(new Request(`http://localhost:3000/api/admin/make-real?workspaceId=${WS}&activationId=act-1`));
    expect(admission).toHaveBeenCalledWith("admin.make-real.read"); expect(deps.read).toHaveBeenCalledWith(OWNER, WS, "act-1");
    const system = { userId: "f1000000-0000-4000-8000-0000000000b1", verifiedEmail: "service@strelva.test" };
    deps.starter.mockResolvedValue(null); deps.runner.mockResolvedValue({ actor: system, service: { kind: "strelva_system" } });
    await GET(new Request(`http://localhost:3000/api/admin/make-real?workspaceId=${WS}&activationId=act-1`)); expect(deps.read).toHaveBeenLastCalledWith(system, WS, "act-1");
    deps.starter.mockClear(); deps.runner.mockClear(); deps.read.mockClear(); admission.mockRejectedValueOnce(new Error("audit failed"));
    expect((await GET(new Request(`http://localhost:3000/api/admin/make-real?workspaceId=${WS}&activationId=act-1`))).status).toBe(503); expect(deps.starter).not.toHaveBeenCalled(); expect(deps.runner).not.toHaveBeenCalled(); expect(deps.read).not.toHaveBeenCalled();
  });

});

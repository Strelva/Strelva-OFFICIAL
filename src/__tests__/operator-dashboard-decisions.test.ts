import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #530: an operator who opens a client's dashboard (`?tenant=`) and approves
 * through PATCH /api/queue/:id or /api/events/:id decides as the operator,
 * never as the owner, with audit rows before and after, and never decides an
 * item routed to the owner. The real decider (src/lib/operator-decisions.ts)
 * runs; only the session, super_admins and memberships reads, the event store,
 * the governed resolver and the audit write are stubbed.
 */

const mocks = vi.hoisted(() => ({
  superAdmin: vi.fn(),
  session: vi.fn(),
  role: vi.fn(),
  event: vi.fn(),
  resolve: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/platform/infra/auth", () => ({
  verifyAuth: vi.fn(async () => true),
  requireTenantPermission: vi.fn(async () => null),
  isSuperAdmin: () => mocks.superAdmin(),
  getAuthUserId: async () => ((await mocks.session()) as { id: string } | null)?.id ?? null,
}));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: () => mocks.session() }));
vi.mock("@/platform/infra/db/repositories", () => ({ getMembershipRole: (...a: unknown[]) => mocks.role(...a) }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: vi.fn(async () => "client-site") }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));
vi.mock("@/lib/events", () => ({ getEventRaw: (...a: unknown[]) => mocks.event(...a) }));
vi.mock("@/lib/event-actions", () => ({
  resolveEventAction: (...a: unknown[]) => mocks.resolve(...a),
  operatorActorId: (id: string) => `operator:${id}`,
}));
vi.mock("@/lib/storage", () => ({ logAuditEvent: (...a: unknown[]) => mocks.audit(...a) }));

import { PATCH as queuePatch } from "@/app/api/queue/[id]/route";
import { PATCH as eventPatch } from "@/app/api/events/[id]/route";

const OWNER_ID = "30000000-0000-4000-8000-000000000001";
const OPERATOR_ID = "30000000-0000-4000-8000-0000000000aa";

function patch(url: string, body: unknown) {
  return new Request(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
const queue = (id: string, action: string) => queuePatch(patch(`http://localhost/api/queue/${id}`, { action }), { params: Promise.resolve({ id }) });
const events = (id: string, status: string) => eventPatch(patch(`http://localhost/api/events/${id}`, { status }), { params: Promise.resolve({ id }) });

function signInAsOwner() {
  mocks.superAdmin.mockResolvedValue(false);
  mocks.session.mockResolvedValue({ id: OWNER_ID, email: "owner@example.test", email_confirmed_at: "2026-10-01T00:00:00Z" });
  mocks.role.mockResolvedValue("owner");
}
function signInAsOperator() {
  mocks.superAdmin.mockResolvedValue(true);
  mocks.session.mockResolvedValue({ id: OPERATOR_ID, email: "operator@strelva.example.test", email_confirmed_at: "2026-10-01T00:00:00Z" });
  mocks.role.mockResolvedValue(null);
}
function pendingEvent(id: string, metadata: Record<string, unknown> = {}, type = "newsletter_draft") {
  return { id, tenantId: "client-site", type, status: "pending", title: "Draft", body: "", source: "ai", createdAt: "2026-10-07T00:00:00Z", metadata };
}

beforeEach(() => {
  vi.clearAllMocks();
  signInAsOwner();
  mocks.event.mockImplementation(async (id: string) => pendingEvent(id));
  mocks.resolve.mockResolvedValue({ changed: true });
  mocks.audit.mockResolvedValue(undefined);
});

describe("PATCH /api/queue/:id", () => {
  it("the owner approves as themselves, with no operator audit row", async () => {
    const res = await queue("evt-1", "approved");
    expect(res.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith("client-site", "evt-1", "approved", OWNER_ID);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("an operator approves as operator:<id>, never as the owner, with audit rows around the effect", async () => {
    signInAsOperator();
    const res = await queue("evt-1", "approved");
    expect(res.status).toBe(200);
    expect(mocks.role).toHaveBeenCalledWith(OPERATOR_ID, "client-site");
    expect(mocks.resolve).toHaveBeenCalledWith("client-site", "evt-1", "approved", `operator:${OPERATOR_ID}`);
    expect(mocks.audit).toHaveBeenCalledTimes(2);
    expect(mocks.audit).toHaveBeenNthCalledWith(1, {
      tenant: "client-site",
      actor: { userId: OPERATOR_ID, email: "operator@strelva.example.test", type: "super_admin", isSuperAdmin: true },
      action: "dashboard.queue.approved",
      targetType: "event",
      targetId: "evt-1",
      metadata: { phase: "attempt", actor: `operator:${OPERATOR_ID}`, decision: "approved", eventType: "newsletter_draft", eventKind: null },
    });
    expect(mocks.audit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      metadata: expect.objectContaining({ phase: "result", changed: true, reason: null }),
    }));
    expect(mocks.audit.mock.invocationCallOrder[0]!).toBeLessThan(mocks.resolve.mock.invocationCallOrder[0]!);
    expect(mocks.resolve.mock.invocationCallOrder[0]!).toBeLessThan(mocks.audit.mock.invocationCallOrder[1]!);
  });

  it("an operator can't approve or dismiss an item routed to the owner", async () => {
    signInAsOperator();
    mocks.event.mockResolvedValue(pendingEvent("evt-owner", { reviewAudience: "owner", escalatedByOperator: true }));
    for (const action of ["approved", "dismissed"]) {
      const res = await queue("evt-owner", action);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "The owner decides this one. Nothing changed." });
    }
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("the owner still decides their own owner-routed item", async () => {
    mocks.event.mockResolvedValue(pendingEvent("evt-owner", { reviewAudience: "owner" }));
    expect((await queue("evt-owner", "approved")).status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith("client-site", "evt-owner", "approved", OWNER_ID);
  });

  it("an operator does nothing when the audit row can't be written", async () => {
    signInAsOperator();
    mocks.audit.mockRejectedValue(new Error("audit down"));
    const res = await queue("evt-1", "approved");
    expect(res.status).toBe(503);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("stops when the operator's access is revoked before the effect", async () => {
    signInAsOperator();
    mocks.superAdmin.mockResolvedValueOnce(true).mockResolvedValue(false);
    const res = await queue("evt-1", "approved");
    expect(res.status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("a super admin who owns the tenant approves as its owner", async () => {
    signInAsOperator();
    mocks.role.mockResolvedValue("owner");
    expect((await queue("evt-1", "approved")).status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith("client-site", "evt-1", "approved", OPERATOR_ID);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("fulfillment steps are the operator's, always recorded and audited as the operator", async () => {
    mocks.event.mockResolvedValue(pendingEvent("evt-req", { kind: "custom_change_request" }, "change_request"));
    expect((await queue("evt-req", "triaged")).status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();

    signInAsOperator();
    mocks.role.mockResolvedValue("owner");
    expect((await queue("evt-req", "triaged")).status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith("client-site", "evt-req", "triaged", `operator:${OPERATOR_ID}`);
    expect(mocks.audit).toHaveBeenNthCalledWith(1, expect.objectContaining({ action: "dashboard.queue.triaged", metadata: expect.objectContaining({ phase: "attempt" }) }));
  });

  it("a wrong-tenant event stays a 404 for an operator", async () => {
    signInAsOperator();
    mocks.event.mockResolvedValue({ ...pendingEvent("evt-x"), tenantId: "other-site" });
    expect((await queue("evt-x", "approved")).status).toBe(404);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/events/:id", () => {
  it("the owner decides as themselves", async () => {
    expect((await events("evt-1", "dismissed")).status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith("client-site", "evt-1", "dismissed", OWNER_ID);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("an operator decides as the operator, audited", async () => {
    signInAsOperator();
    expect((await events("evt-1", "approved")).status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith("client-site", "evt-1", "approved", `operator:${OPERATOR_ID}`);
    expect(mocks.audit).toHaveBeenNthCalledWith(1, expect.objectContaining({ action: "dashboard.event.approved", metadata: expect.objectContaining({ phase: "attempt" }) }));
    expect(mocks.audit).toHaveBeenNthCalledWith(2, expect.objectContaining({ metadata: expect.objectContaining({ phase: "result", changed: true }) }));
  });

  it("an operator can't decide an owner-routed item", async () => {
    signInAsOperator();
    mocks.event.mockResolvedValue(pendingEvent("evt-owner", { reviewAudience: "owner" }));
    expect((await events("evt-owner", "approved")).status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("records a result row when the effect throws", async () => {
    signInAsOperator();
    mocks.resolve.mockRejectedValue(new Error("boom"));
    expect((await events("evt-1", "approved")).status).toBe(500);
    expect(mocks.audit).toHaveBeenLastCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ phase: "result", changed: false, reason: "boom" }),
    }));
  });
});

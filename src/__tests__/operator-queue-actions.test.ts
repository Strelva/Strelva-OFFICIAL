import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "@/platform/operator-queue/contracts";
import { closeQueueItemAction, resolveQueueDraftsAction } from "@/app/admin/queue/actions";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), actor: vi.fn(), read: vi.fn(), mark: vi.fn(), effort: vi.fn(), event: vi.fn(), resolve: vi.fn(), escalate: vi.fn(), audit: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: mocks.admin }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: mocks.actor }));
// verifiedOperator (src/lib/operator-decisions.ts) reads the same session.
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: async () => {
  const signedIn = await mocks.actor() as { userId: string; verifiedEmail: string } | null;
  return signedIn ? { id: signedIn.userId, email: signedIn.verifiedEmail, email_confirmed_at: "2026-10-01T00:00:00Z" } : null;
} }));
vi.mock("@/platform/infra/db/repositories", () => ({ getMembershipRole: vi.fn() }));
vi.mock("@/server/operator-queue/service", () => ({ readOperatorQueue: mocks.read, markQueueItem: mocks.mark }));
vi.mock("@/platform/business-effort", () => ({ PostgresBusinessEffortStore: {}, recordBusinessEffort: mocks.effort }));
vi.mock("@/lib/events", () => ({ getEventRaw: mocks.event }));
vi.mock("@/lib/event-actions", () => ({ resolveEventAction: mocks.resolve, escalateEventToOwner: mocks.escalate, operatorActorId: (id: string) => { if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("operator_actor_invalid"); return `operator:${id}`; } }));
vi.mock("@/lib/storage", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/app/admin/actions/portfolio-actions", () => ({ isPortfolioApprovable: () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const actor = { userId: "10000000-0000-4000-8000-000000000001", verifiedEmail: "operator@example.test" };
const businessId = "10000000-0000-4000-8000-000000000002";
const systemId = "10000000-0000-4000-8000-000000000003";
const entryId = "10000000-0000-4000-8000-000000000004";
function item(over: Partial<QueueItem> = {}): QueueItem {
  return { key: "draft_review:event:first", kind: "draft_review", sourceRef: "event:first", business: { kind: "workspace", workspaceId: businessId, tenantId: "alpha", name: "Alpha" },
    system: { id: systemId, label: "Website" }, title: "First draft", move: "strelva", priority: "P3", priorityReason: null, openedAt: "2026-10-06T12:00:00Z", dueAt: null,
    ageMs: 1000, late: false, state: "open", assignee: null, pinned: false, snoozed: null, notes: [], ownerReach: null, href: "/admin", receiptIds: [], closed: null, closedElsewhere: null,
    ...over };
}
const close = { commandId: entryId, key: "draft_review:event:first", state: "done" as const, reason: "Approved and confirmed", minutes: { entryId, minutes: 6 } };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "1"); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  mocks.admin.mockResolvedValue(true); mocks.actor.mockResolvedValue(actor); mocks.read.mockResolvedValue({ items: [item()], parked: [] });
  mocks.mark.mockResolvedValue({}); mocks.effort.mockResolvedValue({});
  mocks.event.mockImplementation(async (id: string) => ({ id, tenantId: "alpha", status: "pending" })); mocks.resolve.mockResolvedValue({ changed: true });
  mocks.audit.mockResolvedValue({}); mocks.escalate.mockResolvedValue({ changed: true });
});
afterEach(() => vi.unstubAllEnvs());
describe("queue decisions and human minutes", () => {
  it("runs no draft action with the rollout flag off", async () => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0");
    expect(await resolveQueueDraftsAction({ keys: [close.key], action: "escalate" })).toMatchObject({ ok: false, results: [] });
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("rechecks operator authority without trusting the admin layout", async () => {
    mocks.admin.mockResolvedValue(false);
    expect((await resolveQueueDraftsAction({ keys: [close.key], action: "escalate" })).ok).toBe(false);
    expect((await closeQueueItemAction(close)).ok).toBe(false);
    expect(mocks.actor).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.mark).not.toHaveBeenCalled();
  });
  it("deduplicates and derives tenant/source identity, and reports partial bulk failure", async () => {
    const second = item({ key: "draft_review:event:second", sourceRef: "event:second" });
    mocks.read.mockResolvedValue({ items: [item(), second], parked: [] });
    mocks.escalate.mockResolvedValueOnce({ changed: true }).mockResolvedValueOnce({ changed: false, reason: "owner review unavailable" });
    expect(await resolveQueueDraftsAction({ keys: [close.key, close.key, second.key], action: "escalate" })).toMatchObject({ ok: false,
      results: [{ key: close.key, changed: true }, { key: second.key, changed: false, reason: "owner review unavailable" }] });
    expect(mocks.escalate).toHaveBeenNthCalledWith(1, "alpha", "first"); expect(mocks.escalate).toHaveBeenCalledTimes(2);
  });
  it("refuses owner's calls, cross-tenant sources and changed owner-review drafts", async () => {
    const run = () => resolveQueueDraftsAction({ keys: [close.key], action: "escalate" });
    mocks.read.mockResolvedValue({ items: [item({ move: "owner" })], parked: [] }); expect((await run()).ok).toBe(false);
    mocks.read.mockResolvedValue({ items: [item()], parked: [] }); mocks.event.mockResolvedValue({ tenantId: "other" }); expect((await run()).ok).toBe(false);
    mocks.event.mockResolvedValue({ tenantId: "alpha", metadata: { reviewAudience: "owner" } }); expect((await run()).ok).toBe(false);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("routes to owner review and writes an audit row before and after routing", async () => {
    mocks.event.mockResolvedValue({ id: "first", tenantId: "alpha", status: "pending", type: "review", metadata: { kind: "review_reply_draft" } });
    expect((await resolveQueueDraftsAction({ keys: [close.key], action: "escalate" })).ok).toBe(true);
    expect(mocks.escalate).toHaveBeenCalledWith("alpha", "first");
    expect(mocks.resolve).not.toHaveBeenCalled();
    const operatorActor = { userId: actor.userId, email: actor.verifiedEmail, type: "super_admin", isSuperAdmin: true };
    expect(mocks.audit).toHaveBeenNthCalledWith(1, { tenant: "alpha", actor: operatorActor, action: "queue.draft.escalate", targetType: "event", targetId: "first",
      metadata: { phase: "attempt", actor: `operator:${actor.userId}`, queueKey: close.key, eventType: "review", eventKind: "review_reply_draft" } });
    expect(mocks.audit).toHaveBeenNthCalledWith(2, expect.objectContaining({ tenant: "alpha", actor: operatorActor, action: "queue.draft.escalate", targetId: "first",
      metadata: expect.objectContaining({ phase: "result", actor: `operator:${actor.userId}`, changed: true, reason: null }) }));
    expect(mocks.audit.mock.invocationCallOrder[0]!).toBeLessThan(mocks.escalate.mock.invocationCallOrder[0]!);
    expect(mocks.escalate.mock.invocationCallOrder[0]!).toBeLessThan(mocks.audit.mock.invocationCallOrder[1]!);
  });
  it.each(["approve", "skip"] as const)("refuses operator %s without reading or mutating a draft", async action => {
    expect((await resolveQueueDraftsAction({ keys: [close.key], action })).ok).toBe(false);
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.escalate).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("does nothing when the audit row cannot be written", async () => {
    mocks.audit.mockRejectedValue(new Error("audit down"));
    expect(await resolveQueueDraftsAction({ keys: [close.key], action: "escalate" })).toMatchObject({ ok: false,
      results: [{ key: close.key, changed: false, reason: "The audit log is unavailable. Nothing was done." }] });
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("records an audit result when the effect throws", async () => {
    mocks.escalate.mockRejectedValue(new Error("boom"));
    expect((await resolveQueueDraftsAction({ keys: [close.key], action: "escalate" })).ok).toBe(false);
    expect(mocks.audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: "queue.draft.escalate", metadata: expect.objectContaining({ phase: "result", changed: false, reason: "error" }) }));
  });
  it("stops the batch when operator access is revoked mid-way", async () => {
    const second = item({ key: "draft_review:event:second", sourceRef: "event:second" });
    mocks.read.mockResolvedValue({ items: [item(), second], parked: [] });
    // Start of batch, before item one, then revoked before item two.
    mocks.admin.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await resolveQueueDraftsAction({ keys: [close.key, second.key], action: "escalate" })).toMatchObject({ ok: false,
      results: [{ key: close.key, changed: true }, { key: second.key, changed: false, reason: "Your operator access changed. Nothing more was done." }] });
    expect(mocks.escalate).toHaveBeenCalledTimes(1);
  });
  it("refuses a session whose user id cannot be an operator actor", async () => {
    mocks.actor.mockResolvedValue({ userId: "not-a-uuid", verifiedEmail: "operator@example.test" });
    expect((await resolveQueueDraftsAction({ keys: [close.key], action: "escalate" })).ok).toBe(false);
    expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("closes with server-derived business/System attribution and logs minutes once", async () => {
    expect(await closeQueueItemAction(close)).toMatchObject({ ok: true, message: "Closed. Logged 6 minutes." });
    expect(mocks.effort).toHaveBeenCalledWith({}, actor, expect.objectContaining({ businessId, minutes: 6, queue: { kind: "draft_review", sourceRef: "event:first", systemId, systemLabel: "Website" } }));
  });
  it("refuses invalid minutes and owner decisions before closing", async () => {
    expect((await closeQueueItemAction({ ...close, minutes: { entryId, minutes: 1441 } })).ok).toBe(false);
    expect((await closeQueueItemAction({ ...close, reason: "" })).ok).toBe(false);
    mocks.read.mockResolvedValue({ items: [item({ move: "owner" })], parked: [] });
    expect((await closeQueueItemAction(close)).ok).toBe(false); expect(mocks.mark).not.toHaveBeenCalled(); expect(mocks.effort).not.toHaveBeenCalled();
  });
  it("reports an honest partial result when minutes fail after closing", async () => {
    mocks.effort.mockRejectedValue(new Error("minute storage unavailable"));
    expect(await closeQueueItemAction(close)).toEqual({ ok: true, message: "Closed. Minutes were not logged: minute storage unavailable" });
    expect(mocks.mark).toHaveBeenCalledOnce();
  });
  it("retains legacy close behavior while off without queue attribution", async () => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0");
    expect((await closeQueueItemAction({ ...close, reason: "" })).ok).toBe(true);
    expect(mocks.effort.mock.calls[0]?.[2]).not.toHaveProperty("queue");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "@/platform/operator-queue/contracts";
import { closeQueueItemAction, resolveQueueDraftsAction } from "@/app/admin/queue/actions";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), actor: vi.fn(), read: vi.fn(), mark: vi.fn(), effort: vi.fn(), event: vi.fn(), resolve: vi.fn(), escalate: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: mocks.admin }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: mocks.actor }));
vi.mock("@/platform/operator-queue/service", () => ({ readOperatorQueue: mocks.read, markQueueItem: mocks.mark }));
vi.mock("@/platform/business-effort", () => ({ PostgresBusinessEffortStore: {}, recordBusinessEffort: mocks.effort }));
vi.mock("@/lib/events", () => ({ getEventRaw: mocks.event }));
vi.mock("@/lib/event-actions", () => ({ resolveEventAction: mocks.resolve, escalateEventToOwner: mocks.escalate }));
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
  vi.clearAllMocks(); vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "1"); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  mocks.admin.mockResolvedValue(true); mocks.actor.mockResolvedValue(actor); mocks.read.mockResolvedValue({ items: [item()], parked: [] });
  mocks.mark.mockResolvedValue({}); mocks.effort.mockResolvedValue({});
  mocks.event.mockImplementation(async (id: string) => ({ id, tenantId: "alpha", status: "pending" })); mocks.resolve.mockResolvedValue({ changed: true });
});
afterEach(() => vi.unstubAllEnvs());
describe("queue decisions and human minutes", () => {
  it("runs no draft action with the rollout flag off", async () => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0");
    expect(await resolveQueueDraftsAction({ keys: [close.key], action: "approve" })).toMatchObject({ ok: false, results: [] });
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("rechecks operator authority without trusting the admin layout", async () => {
    mocks.admin.mockResolvedValue(false);
    expect((await resolveQueueDraftsAction({ keys: [close.key], action: "approve" })).ok).toBe(false);
    expect((await closeQueueItemAction(close)).ok).toBe(false);
    expect(mocks.actor).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.mark).not.toHaveBeenCalled();
  });
  it("deduplicates and derives tenant/source identity, and reports partial bulk failure", async () => {
    const second = item({ key: "draft_review:event:second", sourceRef: "event:second" });
    mocks.read.mockResolvedValue({ items: [item(), second], parked: [] });
    mocks.resolve.mockResolvedValueOnce({ changed: true }).mockResolvedValueOnce({ changed: false, reason: "provider rejected" });
    expect(await resolveQueueDraftsAction({ keys: [close.key, close.key, second.key], action: "approve" })).toMatchObject({ ok: false,
      results: [{ key: close.key, changed: true }, { key: second.key, changed: false, reason: "provider rejected" }] });
    expect(mocks.resolve).toHaveBeenNthCalledWith(1, "alpha", "first", "approved"); expect(mocks.resolve).toHaveBeenCalledTimes(2);
  });
  it("refuses owner's calls, cross-tenant sources and changed owner-review drafts", async () => {
    const run = () => resolveQueueDraftsAction({ keys: [close.key], action: "approve" });
    mocks.read.mockResolvedValue({ items: [item({ move: "owner" })], parked: [] }); expect((await run()).ok).toBe(false);
    mocks.read.mockResolvedValue({ items: [item()], parked: [] }); mocks.event.mockResolvedValue({ tenantId: "other" }); expect((await run()).ok).toBe(false);
    mocks.event.mockResolvedValue({ tenantId: "alpha", metadata: { reviewAudience: "owner" } }); expect((await run()).ok).toBe(false);
    expect(mocks.resolve).not.toHaveBeenCalled();
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

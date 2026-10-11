import { describe, expect, it, vi } from "vitest";
import { approvalRecord, withCanonicalApprovalStore } from "@/platform/approval-store";
import type { OwnerDecision } from "@/platform/needs-you/contracts";
import type { SourceAdapter } from "@/platform/needs-you/adapters";

const businessId = "10000000-0000-4000-8000-000000000001";
const subject = { businessId, lifecycle: "tenant_event", sourceId: "event-one", revision: "a".repeat(64) };
const actor = { userId: "10000000-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" };
function row(over: Partial<OwnerDecision> = {}): OwnerDecision {
  return {
    id: "20000000-0000-4000-8000-000000000001", workspaceId: businessId, sourceLifecycle: subject.lifecycle, sourceId: subject.sourceId,
    revisionHash: subject.revision, systemId: null, kind: "google.post", route: "owner_decides", title: "Publish draft", detail: null,
    approveEffect: "Publishes", notYetEffect: "Keeps draft", urgent: false, signInRequired: false, adminMayDecide: false, openHref: null,
    state: "approved", outcome: null, outcomeReason: null, receiptRef: null, decidedByKind: "owner_session", decidedAt: "2026-10-06T10:00:00Z",
    deliveryState: "not_sent", operatorNote: null, openedAt: "2026-10-05T10:00:00Z", expiresAt: "2026-10-19T10:00:00Z",
    reminded1At: null, reminded2At: null, deliveries: [], ...over,
  };
}
function adapter() {
  return {
    lifecycle: "tenant_event", needsMemberActor: false, propose: vi.fn().mockResolvedValue({ items: [], complete: true }),
    currentRevision: vi.fn().mockResolvedValue(subject.revision), resolve: vi.fn().mockResolvedValue({ outcome: "done", receiptRef: "native-receipt" }),
  } satisfies SourceAdapter;
}

describe("one approval authority behind native adapters", () => {
  it("requires an exact business, lifecycle, source and revision with a recorded human decision", () => {
    expect(approvalRecord(row(), subject)?.status).toBe("approved");
    for (const over of [{ workspaceId: actor.userId }, { sourceLifecycle: "other" }, { sourceId: "other" }, { revisionHash: "b".repeat(64) }]) {
      expect(approvalRecord(row(over), subject)).toBeNull();
    }
    expect(approvalRecord(row({ decidedByKind: "system" }), subject)?.status).toBe("pending");
    expect(approvalRecord(row({ decidedAt: null }), subject)?.status).not.toBe("approved");
    expect(approvalRecord(row({ outcome: "failed" }), subject)?.status).toBe("dismissed");
    expect(approvalRecord(row({ state: "withdrawn" }), subject)?.status).toBe("dismissed");
  });
  it("leaves the exact original path unchanged while off and does not read the new store", async () => {
    const native = adapter(), read = vi.fn().mockRejectedValue(new Error("not migrated"));
    const wrapped = withCanonicalApprovalStore(native, { store: { read }, enabled: async () => false });
    const item = row();
    await expect(wrapped.resolve({ workspaceId: businessId }, item, "approve", { kind: "session", actor })).resolves.toEqual({ outcome: "done", receiptRef: "native-receipt" });
    expect(native.resolve).toHaveBeenCalledWith({ workspaceId: businessId }, item, "approve", { kind: "session", actor });
    expect(read).not.toHaveBeenCalled(); expect(native.currentRevision).not.toHaveBeenCalled();
  });
  it("reads the canonical claim and source revision before running the native resolver", async () => {
    const native = adapter(), read = vi.fn().mockResolvedValue(row());
    const wrapped = withCanonicalApprovalStore(native, { store: { read }, enabled: async () => true });
    await expect(wrapped.resolve({ workspaceId: businessId, actor }, row(), "approve", { kind: "session", actor })).resolves.toMatchObject({ outcome: "done" });
    expect(read.mock.invocationCallOrder[0]!).toBeLessThan(native.currentRevision.mock.invocationCallOrder[0]!);
    expect(native.currentRevision.mock.invocationCallOrder[0]!).toBeLessThan(native.resolve.mock.invocationCallOrder[0]!);
  });
  it.each(["done", "done_unverified", "failed"] as const)("does not replay an approval with a recorded %s outcome", async (outcome) => {
    const native = adapter();
    // The source may still look pending after a provider accepted the write
    // but receipt reconciliation failed. The canonical terminal closes it.
    const finished = row({ outcome, receiptRef: "accepted-provider-write" });
    const wrapped = withCanonicalApprovalStore(native, { store: { read: async () => finished }, enabled: async () => true });
    expect(await wrapped.resolve({ workspaceId: businessId, actor }, row(), "approve", { kind: "session", actor }))
      .toEqual({ outcome: "failed", reason: "approval_already_finished: nothing ran" });
    expect(native.currentRevision).not.toHaveBeenCalled();
    expect(native.resolve).not.toHaveBeenCalled();
  });
  it("does not repeat terminal declined or expired cleanup", async () => {
    const native = adapter();
    let finished = row({ state: "declined", outcome: "done" });
    const wrapped = withCanonicalApprovalStore(native, { store: { read: async () => finished }, enabled: async () => true });
    expect(await wrapped.resolve({ workspaceId: businessId }, row(), "not_yet", { kind: "session", actor }))
      .toMatchObject({ reason: "approval_already_finished: nothing ran" });
    finished = row({ state: "expired", decidedByKind: "expiry", outcome: "done" });
    expect(await wrapped.resolve({ workspaceId: businessId }, finished, "not_yet", { kind: "expiry" }))
      .toMatchObject({ reason: "approval_already_finished: nothing ran" });
    expect(native.resolve).not.toHaveBeenCalled();
  });
  it.each([
    ["missing", null], ["withdrawn", row({ state: "withdrawn" })], ["wrong business", row({ workspaceId: actor.userId })],
    ["changed revision", row({ revisionHash: "b".repeat(64) })], ["system approval", row({ decidedByKind: "system" })], ["failed", row({ outcome: "failed" })],
  ])("runs nothing for %s", async (_case, current) => {
    const native = adapter();
    const wrapped = withCanonicalApprovalStore(native, { store: { read: async () => current }, enabled: async () => true });
    expect((await wrapped.resolve({ workspaceId: businessId }, row(), "approve", { kind: "session", actor })).outcome).toBe("failed");
    expect(native.resolve).not.toHaveBeenCalled();
  });
  it("runs nothing after the source changes or the store becomes unavailable", async () => {
    const native = adapter(); native.currentRevision.mockResolvedValue("b".repeat(64));
    let fail = false;
    const wrapped = withCanonicalApprovalStore(native, { store: { read: async () => { if (fail) throw new Error("database down"); return row(); } }, enabled: async () => true });
    const run = () => wrapped.resolve({ workspaceId: businessId }, row(), "approve", { kind: "session", actor });
    expect(await run()).toMatchObject({ outcome: "failed", reason: "approval_source_changed: nothing ran" });
    fail = true;
    expect(await run()).toMatchObject({ outcome: "failed", reason: "approval_store_unavailable: nothing ran" });
    expect(native.resolve).not.toHaveBeenCalled();
  });
  it("lets declined and expired claims pass only to their native cleanup path", async () => {
    const native = adapter(); let current = row({ state: "declined" });
    const wrapped = withCanonicalApprovalStore(native, { store: { read: async () => current }, enabled: async () => true });
    expect((await wrapped.resolve({ workspaceId: businessId }, current, "not_yet", { kind: "session", actor })).outcome).toBe("done");
    current = row({ state: "expired", decidedByKind: "expiry" });
    expect((await wrapped.resolve({ workspaceId: businessId }, current, "not_yet", { kind: "expiry" })).outcome).toBe("done");
  });
  it("never lets expiry approve an expired claim or a failed flag lookup run an effect", async () => {
    const native = adapter();
    const expired = row({ state: "expired", decidedByKind: "expiry" });
    const wrapped = withCanonicalApprovalStore(native, { store: { read: async () => expired }, enabled: async () => true });
    expect(await wrapped.resolve({ workspaceId: businessId }, expired, "approve", { kind: "expiry" })).toMatchObject({ outcome: "failed" });
    const unavailable = withCanonicalApprovalStore(native, { store: { read: vi.fn() }, enabled: async () => { throw new Error("flag storage unavailable"); } });
    expect(await unavailable.resolve({ workspaceId: businessId }, row(), "approve", { kind: "session", actor })).toMatchObject({ outcome: "failed", reason: "approval_store_unavailable: nothing ran" });
    expect(native.resolve).not.toHaveBeenCalled();
  });
});

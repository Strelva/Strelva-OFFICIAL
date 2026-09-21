import { describe, expect, it } from "vitest";
import { createLearningService, type LearningStore } from "@/products/product-learning/service";
import { WorkspaceAccessError, WorkspaceConflictError, type SavedWork } from "@/platform/workspaces/types";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";
const learningId = "33333333-3333-4333-8333-333333333333";
const actor = { userId: "researcher", verifiedEmail: "researcher@example.com" };
const now = "2026-09-12T12:00:00.000Z";
function fixture(source?: Partial<SavedWork>) {
  let internal = true;
  const rows = new Map<string, SavedWork>([[sourceId, { id: sourceId, workspaceId, productId: "documents", resourceKind: "document", payload: { title: "Interview notes", text: "An owner described missed replies" }, createdBy: actor.userId, createdAt: now, updatedAt: now, ...source }]]);
  const store: LearningStore = {
    async authorizeInternalMember(a, w) { if (!internal || a.userId !== actor.userId || w !== workspaceId) throw new WorkspaceAccessError(); },
    async get(a, id) { if (a.userId !== actor.userId) throw new WorkspaceAccessError(); return structuredClone(rows.get(id) ?? null); },
    async create(a, w, learning) { await this.authorizeInternalMember(a, w); const row = { id: learningId, workspaceId: w, productId: "product-learning", resourceKind: "learning", payload: learning, createdBy: a.userId, createdAt: now, updatedAt: now }; rows.set(row.id, structuredClone(row)); return structuredClone(row); },
    async replace(a, work, revision, learning) { await this.authorizeInternalMember(a, work.workspaceId); if ((rows.get(work.id)?.payload as { revision: number }).revision !== revision) throw new WorkspaceConflictError(); const row = { ...work, payload: learning }; rows.set(work.id, structuredClone(row)); return structuredClone(row); },
  };
  return { service: createLearningService(store, () => now), revoke: () => { internal = false; } };
}
const input = { title: "Reply responsibility", objective: "Test whether follow-up helps", sources: [{ id: "support", workId: sourceId, segment: "Website owners", freshForHours: 24 }], intervalHours: 24, budgetCents: 0 };

describe("durable internal learning service", () => {
  it("retains simulated provenance when collecting existing tracker experiments", async () => {
    const option = { id: "manual", label: "Manual process", version: "1", setupMinutes: 5, reviewMinutes: 10, correctionMinutes: 3, supportMinutes: 1, maintenanceMinutes: 1, providerCostUsd: null, result: "inconclusive" };
    const { service } = fixture({ productId: "research", resourceKind: "experiment", payload: { version: 2, hypothesis: "Follow-up improves bookings", workload: "Ten fictional inquiries", inputScope: "Synthetic rows", baseline: option, candidates: [{ ...option, id: "candidate", label: "Follow-up" }], evidenceKind: "simulated", evidence: "Fictional local exercise", testFailures: [], decision: "Needs real exposure" } });
    const created = await service.create(actor, workspaceId, input);
    const collected = await service.collect(actor, created.workId, 0);
    expect(collected.learning.evidence[0]!.evidenceKind).toBe("simulated");
    expect(collected.learning.evidence[0]!.excerpt).toContain("Manual process: 20 human minutes");
    expect(collected.summary.actualParticipants).toBe(0);
  });
  it("reopens captured work without promoting notes into measured demand and rejects forged collection", async () => {
    const { service } = fixture({ updatedAt: "2026-09-12T08:00:00-04:00" });
    const created = await service.create(actor, workspaceId, input);
    await service.collect(actor, created.workId, 0);
    const reopened = await service.read(actor, created.workId);
    expect(reopened.learning.evidence[0]!.excerpt).toContain("An owner described missed replies");
    expect(reopened.learning.evidence[0]!.excerpt).toBe("Interview notes\nAn owner described missed replies");
    expect(reopened.learning.evidence[0]!.evidenceKind).toBe("operator_report");
    expect(reopened.summary.actualParticipants).toBe(0);
    await expect(service.change(actor, created.workId, { kind: "collect", expectedRevision: 1, observations: [], costCents: 0 })).rejects.toThrow(/authorized collector/);
    await expect(service.collect(actor, created.workId, 0)).rejects.toThrow(/newer revision/);
  });
  it("does not collect arbitrary private product payloads as research", async () => {
    const { service } = fixture({ productId: "provider-connections", resourceKind: "credentials" });
    await expect(service.create(actor, workspaceId, input)).rejects.toThrow(/supported research source/);
  });
  it("rechecks internal authorization before reading or collecting after revocation", async () => {
    const { service, revoke } = fixture();
    const created = await service.create(actor, workspaceId, input);
    revoke();
    await expect(service.read(actor, created.workId)).rejects.toThrow(WorkspaceAccessError);
    await expect(service.collect(actor, created.workId, 0)).rejects.toThrow(WorkspaceAccessError);
  });
});

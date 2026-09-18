import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { BoundedStore } from "@/platform/bounded-work/repository";
import { WorkspaceAccessError, WorkspaceConflictError, type SavedWork, type WorkspaceActor } from "@/platform/workspaces/types";
import { createApplicationService } from "@/products/applications/server";

const owner: WorkspaceActor = { userId: "owner", verifiedEmail: "owner@example.com" };
const member: WorkspaceActor = { userId: "member", verifiedEmail: "member@example.com" };

function applicationStore(): BoundedStore & { manager: (actor: WorkspaceActor, workspaceId: string) => Promise<void> } {
  const rows = new Map<string, SavedWork>();
  const isMember = (actor: WorkspaceActor, workspaceId: string) => {
    if (workspaceId !== "workspace-a" || ![owner.userId, member.userId].includes(actor.userId)) throw new WorkspaceAccessError();
  };
  return {
    async member(actor, workspaceId) { isMember(actor, workspaceId); },
    async manager(actor, workspaceId) {
      isMember(actor, workspaceId);
      if (actor.userId !== owner.userId) throw new WorkspaceAccessError("Application design access is required.");
    },
    async read(actor, id) {
      const row = rows.get(id);
      if (!row) return null;
      isMember(actor, row.workspaceId);
      return structuredClone(row);
    },
    async create(actor, workspaceId, input) {
      isMember(actor, workspaceId);
      const now = new Date().toISOString();
      const row: SavedWork = {
        ...input,
        id: randomUUID(),
        workspaceId,
        createdBy: actor.userId,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, structuredClone(row));
      return structuredClone(row);
    },
    async update(actor, work, expectedRevision, payload) {
      isMember(actor, work.workspaceId);
      const row = rows.get(work.id);
      if (!row || (row.payload as { revision: number }).revision !== expectedRevision) throw new WorkspaceConflictError();
      const next = { ...row, payload: structuredClone(payload), updatedAt: new Date().toISOString() };
      rows.set(work.id, next);
      return structuredClone(next);
    },
  };
}

const specV1 = {
  title: "Requests",
  maintenanceOwner: owner.userId,
  fields: [{ id: "problem", label: "Problem", type: "text" as const, required: true }],
  components: [{ kind: "form" as const, fields: ["problem"] }, { kind: "list" as const, fields: ["problem"] }],
};
const specV2 = {
  ...specV1,
  title: "Requests v2",
  fields: [...specV1.fields, { id: "priority", label: "Priority", type: "number" as const, required: false }],
  components: [{ kind: "form" as const, fields: ["problem", "priority"] }, { kind: "list" as const, fields: ["problem", "priority"] }],
};
const incompatibleSpec = {
  ...specV1,
  title: "Requests incompatible",
  fields: [{ id: "problem", label: "Problem", type: "number" as const, required: true }],
};

async function createReleasedApplication() {
  const service = createApplicationService(applicationStore());
  const created = await service.create(owner, "workspace-a", specV1);
  await service.rehearse(owner, created.id, { expectedDesignRevision: 0 });
  const released = await service.publish(owner, created.id, { expectedCandidateRevision: 0, expectedReleaseVersion: null });
  return { service, id: released.id };
}

describe("native application release and record clocks", () => {
  it("keeps v1 live while v2 is edited, rehearsed, and published", async () => {
    const { service, id } = await createReleasedApplication();
    const beforeEdit = await service.readRuntime(member, id);
    expect(beforeEdit.release.version).toBe(1);

    await service.revise(owner, id, { expectedDesignRevision: 0, spec: specV2 });
    expect((await service.readRuntime(member, id)).release.version).toBe(1);
    await service.rehearse(owner, id, { expectedDesignRevision: 1 });

    const first = await service.submit(member, id, {
      expectedReleaseVersion: 1,
      expectedRecordsRevision: 0,
      record: { id: "r1", values: { problem: "Loose hinge" } },
    });
    expect(first.recordsRevision).toBe(1);

    const concurrent = await Promise.allSettled([
      service.submit(member, id, {
        expectedReleaseVersion: 1,
        expectedRecordsRevision: 0,
        record: { id: "r2", values: { problem: "Broken latch" } },
      }),
      service.submit(member, id, {
        expectedReleaseVersion: 1,
        expectedRecordsRevision: 1,
        record: { id: "r3", values: { problem: "Missing screw" } },
      }),
    ]);
    expect(concurrent.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(concurrent.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await service.readRuntime(member, id)).records).toHaveLength(2);

    const published = await service.publish(owner, id, { expectedCandidateRevision: 1, expectedReleaseVersion: 1 });
    expect(published.payload.release?.version).toBe(2);
    expect((await service.readRuntime(member, id)).records).toHaveLength(2);
  });

  it("rejects incompatible publication and rolls back only the definition", async () => {
    const { service, id } = await createReleasedApplication();
    await service.submit(member, id, {
      expectedReleaseVersion: 1,
      expectedRecordsRevision: 0,
      record: { id: "r1", values: { problem: "Broken faucet" } },
    });
    await service.revise(owner, id, { expectedDesignRevision: 0, spec: specV2 });
    await service.rehearse(owner, id, { expectedDesignRevision: 1 });
    await service.publish(owner, id, { expectedCandidateRevision: 1, expectedReleaseVersion: 1 });

    await service.revise(owner, id, { expectedDesignRevision: 1, spec: incompatibleSpec });
    const rehearsal = await service.rehearse(owner, id, { expectedDesignRevision: 2 });
    expect(rehearsal.payload.candidate?.rehearsal?.checks.some(check => !check.passed)).toBe(true);
    await expect(service.publish(owner, id, { expectedCandidateRevision: 2, expectedReleaseVersion: 2 })).rejects.toThrow(/rehearsal/i);
    expect((await service.readRuntime(member, id)).release.version).toBe(2);
    expect((await service.readRuntime(member, id)).records).toHaveLength(1);

    const rolledBack = await service.rollback(owner, id, {
      expectedDesignRevision: 2,
      expectedReleaseVersion: 2,
      version: 1,
    });
    expect(rolledBack.payload.release?.version).toBe(1);
    expect((await service.readRuntime(member, id)).release.spec.title).toBe(specV1.title);
    expect((await service.readRuntime(member, id)).records).toEqual([{ id: "r1", values: { problem: "Broken faucet" } }]);
  });

  it("does not give a member design authority even when the member can use records", async () => {
    const { service, id } = await createReleasedApplication();
    await expect(service.revise(member, id, { expectedDesignRevision: 0, spec: specV2 })).rejects.toThrow(/design access/i);
    await expect(service.rehearse(member, id, { expectedDesignRevision: 0 })).rejects.toThrow(/design access/i);
    await expect(service.publish(member, id, { expectedCandidateRevision: 0, expectedReleaseVersion: 1 })).rejects.toThrow(/design access/i);
    const saved = await service.submit(member, id, {
      expectedReleaseVersion: 1,
      expectedRecordsRevision: 0,
      record: { id: "member-record", values: { problem: "Member report" } },
    });
    expect(saved.records).toHaveLength(1);
  });
});

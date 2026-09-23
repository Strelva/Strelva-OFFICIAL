import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
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

const selectSpecV1 = {
  title: "Repair requests",
  maintenanceOwner: owner.userId,
  fields: [{ id: "priority", label: "Priority", type: "select" as const, required: true, options: ["standard", "urgent"] },
    { id: "problem", label: "Problem", type: "text" as const, required: true }],
  components: [{ kind: "form" as const, fields: ["priority", "problem"] }, { kind: "list" as const, fields: ["priority", "problem"] }],
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

  it("publishes bounded select options, preserves selected records through additive changes and rollback, and rejects used option renames", async () => {
    const service = createApplicationService(applicationStore());
    const created = await service.create(owner, "workspace-a", selectSpecV1);
    await service.rehearse(owner, created.id, { expectedDesignRevision: 0 });
    await service.publish(owner, created.id, { expectedCandidateRevision: 0, expectedReleaseVersion: null });

    await service.submit(member, created.id, {
      expectedReleaseVersion: 1,
      expectedRecordsRevision: 0,
      record: { id: "r1", values: { priority: "standard", problem: "Loose hinge" } },
    });

    const additive = {
      ...selectSpecV1,
      fields: selectSpecV1.fields.map(field => field.id === "priority" ? { ...field, options: ["standard", "urgent", "vip"] } : field),
    };
    await service.revise(owner, created.id, { expectedDesignRevision: 0, spec: additive });
    await service.rehearse(owner, created.id, { expectedDesignRevision: 1 });
    await service.publish(owner, created.id, { expectedCandidateRevision: 1, expectedReleaseVersion: 1 });
    expect((await service.readRuntime(member, created.id)).release.spec.fields[0]).toMatchObject({ type: "select", options: ["standard", "urgent", "vip"] });
    expect((await service.readRuntime(member, created.id)).records).toEqual([{ id: "r1", values: { priority: "standard", problem: "Loose hinge" } }]);

    await service.rollback(owner, created.id, { expectedDesignRevision: 1, expectedReleaseVersion: 2, version: 1 });
    expect((await service.readRuntime(member, created.id)).records).toEqual([{ id: "r1", values: { priority: "standard", problem: "Loose hinge" } }]);
    await expect(service.submit(member, created.id, {
      expectedReleaseVersion: 1,
      expectedRecordsRevision: 1,
      record: { id: "invalid", values: { priority: "vip", problem: "Unsupported priority" } },
    })).rejects.toThrow(/available options/i);

    const renamed = {
      ...selectSpecV1,
      fields: selectSpecV1.fields.map(field => field.id === "priority" ? { ...field, options: ["normal", "urgent"] } : field),
    };
    await service.revise(owner, created.id, { expectedDesignRevision: 2, spec: renamed });
    const rehearsal = await service.rehearse(owner, created.id, { expectedDesignRevision: 3 });
    expect(rehearsal.payload.rehearsal?.checks.find(check => check.name.includes("Existing records"))?.passed).toBe(false);
    await expect(service.publish(owner, created.id, { expectedCandidateRevision: 3, expectedReleaseVersion: 1 })).rejects.toThrow(/rehearsal/i);
    expect((await service.readRuntime(member, created.id)).release.version).toBe(1);
    expect((await service.readRuntime(member, created.id)).records).toEqual([{ id: "r1", values: { priority: "standard", problem: "Loose hinge" } }]);
  });
});


describe("application repository serialization", () => {
  async function live(store: BoundedStore) {
    const service = createApplicationService(store);
    const created = await service.create(owner, "workspace-a", specV1);
    await service.rehearse(owner, created.id, { expectedDesignRevision: created.payload.designRevision });
    const published = await service.publish(owner, created.id, {
      expectedCandidateRevision: created.payload.designRevision,
      expectedReleaseVersion: null,
    });
    return { service, published };
  }

  it("serializes submissions across service instances sharing a store", async () => {
    const store = applicationStore();
    const { service, published } = await live(store);
    const other = createApplicationService(store);
    const results = await Promise.allSettled([service, other].map((writer, i) => writer.submit(member, published.id, {
      expectedReleaseVersion: 1,
      expectedRecordsRevision: 0,
      record: { id: `request-${i}`, values: { problem: "Help" } },
    })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected");
    expect(failed?.status === "rejected" && failed.reason).toBeInstanceOf(WorkspaceConflictError);
    const runtime = await other.readRuntime(member, published.id);
    expect(runtime.records).toHaveLength(1);
    expect(runtime.recordsRevision).toBe(1);
  });

  it("does not advance in-memory state after a persistence failure and releases the lane", async () => {
    const store = applicationStore();
    const { service, published } = await live(store);
    const before = await service.read(owner, published.id);
    const update = vi.spyOn(store, "update").mockRejectedValueOnce(new Error("Storage unavailable"));
    try {
      const input = {
        expectedReleaseVersion: 1, expectedRecordsRevision: 0,
        record: { id: "request-1", values: { problem: "Help" } },
      };
      await expect(service.submit(member, published.id, input)).rejects.toThrow("Storage unavailable");
      expect(await service.read(owner, published.id)).toEqual(before);
      const saved = await service.submit(member, published.id, input);
      expect(saved.recordsRevision).toBe(1);
      expect(saved.records).toHaveLength(1);
    } finally {
      update.mockRestore();
    }
  });

  it("rejects publication when a queued submission no longer fits the rehearsed candidate", async () => {
    const store = applicationStore();
    const { service, published } = await live(store);
    const revised = await service.revise(owner, published.id, {
      expectedDesignRevision: published.payload.designRevision, spec: incompatibleSpec,
    });
    await service.rehearse(owner, published.id, { expectedDesignRevision: revised.payload.designRevision });
    const started = Promise.withResolvers<void>();
    const proceed = Promise.withResolvers<void>();
    const submission = service.submit(member, published.id, {
      expectedReleaseVersion: 1, expectedRecordsRevision: 0,
      record: { id: "request-1", values: { problem: "Accepted by v1" } },
    }, async () => {
      started.resolve();
      await proceed.promise;
    });
    await started.promise;
    const publication = createApplicationService(store).publish(owner, published.id, {
      expectedCandidateRevision: revised.payload.designRevision, expectedReleaseVersion: 1,
    });
    const rejected = expect(publication).rejects.toThrow("wrong type");
    proceed.resolve();
    await submission;
    await rejected;
    const runtime = await service.readRuntime(member, published.id);
    expect(runtime.release.version).toBe(1);
    expect(runtime.records).toEqual([{ id: "request-1", values: { problem: "Accepted by v1" } }]);
  });

  it("denies scoped authorization without changing records or blocking the next command", async () => {
    const { service, published } = await live(applicationStore());
    const input = {
      expectedReleaseVersion: 1, expectedRecordsRevision: 0,
      record: { id: "request-1", values: { problem: "Help" } },
    };
    await expect(service.submit(member, published.id, input, () => {
      throw new WorkspaceAccessError();
    })).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect((await service.readRuntime(member, published.id)).recordsRevision).toBe(0);
    expect((await service.submit(member, published.id, input)).recordsRevision).toBe(1);
  });
});

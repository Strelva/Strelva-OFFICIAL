import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoundedStore } from "@/platform/bounded-work/repository";
import { WorkspaceAccessError, WorkspaceConflictError, type SavedWork, type WorkspaceActor } from "@/platform/workspaces/types";

const boundary = vi.hoisted(() => ({ application: null as null | SavedWork }));

vi.mock("@/platform/workspaces/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/workspaces/repository")>()),
  assertWorkspaceMember: async () => undefined,
  getWork: async () => boundary.application,
}));
vi.mock("@/products/applications/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/products/applications/server")>()),
  readWorkspaceApplication: async () => structuredClone(boundary.application),
}));

const { createApplicationService } = await import("@/products/applications/server");
const { createNativeExecutionAdapter } = await import("@/products/operations/native-execution");

const owner: WorkspaceActor = { userId: "owner", verifiedEmail: "owner@example.com" };
const workspaceId = "workspace-a";

function memoryStore(): BoundedStore & { manager: (actor: WorkspaceActor, workspaceId: string) => Promise<void> } {
  const rows = new Map<string, SavedWork>();
  const check = (actor: WorkspaceActor, id: string) => {
    if (id !== workspaceId || actor.userId !== owner.userId) throw new WorkspaceAccessError();
  };
  return {
    async member(actor, id) { check(actor, id); },
    async manager(actor, id) { check(actor, id); },
    async read(actor, id) {
      const row = rows.get(id);
      if (!row) return null;
      check(actor, row.workspaceId);
      return structuredClone(row);
    },
    async create(actor, id, input) {
      check(actor, id);
      const now = new Date().toISOString();
      const row: SavedWork = { ...input, id: randomUUID(), workspaceId: id, createdBy: actor.userId, createdAt: now, updatedAt: now };
      rows.set(row.id, structuredClone(row));
      return structuredClone(row);
    },
    async update(actor, work, expectedRevision, payload) {
      check(actor, work.workspaceId);
      const row = rows.get(work.id);
      if (!row || (row.payload as { revision: number }).revision !== expectedRevision) throw new WorkspaceConflictError();
      const next = { ...row, payload: structuredClone(payload), updatedAt: new Date().toISOString() };
      rows.set(work.id, next);
      return structuredClone(next);
    },
  };
}

const spec = {
  title: "Requests",
  maintenanceOwner: owner.userId,
  fields: [{ id: "problem", label: "Problem", type: "text" as const, required: true }],
  components: [{ kind: "form" as const, fields: ["problem"] }, { kind: "list" as const, fields: ["problem"] }],
};

let service: ReturnType<typeof createApplicationService>;

beforeEach(async () => {
  service = createApplicationService(memoryStore());
  const created = await service.create(owner, workspaceId, spec);
  await service.rehearse(owner, created.id, { expectedDesignRevision: 0 });
  const read = await service.read(owner, created.id);
  boundary.application = { ...read, productId: "applications", resourceKind: "application" };
});

function step(input: Record<string, unknown>) {
  return {
    id: "step-1",
    operation: "application.command",
    workId: boundary.application!.id,
    input,
    dependsOn: [],
    maximumCents: 0,
    capabilityVersion: 1,
  };
}

describe("application command recheck matches perform", () => {
  it("rejects an aggregate revision that only matches the candidate design revision", async () => {
    const payload = boundary.application!.payload as { revision: number; candidate: { designRevision: number } };
    expect(payload.revision).not.toBe(payload.candidate.designRevision);
    const input = { kind: "retire", expectedRevision: payload.candidate.designRevision };

    // perform's own check refuses this command...
    await expect(service.command(owner, boundary.application!.id, input)).rejects.toBeInstanceOf(WorkspaceConflictError);
    // ...so recheck must refuse it too, before any effect is attempted.
    await expect(createNativeExecutionAdapter().recheck(owner, workspaceId, step(input) as never)).rejects.toBeInstanceOf(WorkspaceConflictError);
  });

  it("accepts the exact aggregate revision and an exact design revision", async () => {
    const payload = boundary.application!.payload as { revision: number; candidate: { designRevision: number } };
    await expect(createNativeExecutionAdapter().recheck(owner, workspaceId, step({ kind: "retire", expectedRevision: payload.revision }) as never)).resolves.toBeUndefined();
    await expect(createNativeExecutionAdapter().recheck(owner, workspaceId, step({ kind: "retire", expectedDesignRevision: payload.candidate.designRevision }) as never)).resolves.toBeUndefined();
  });

  it("rejects a publish the domain would refuse", async () => {
    await expect(createNativeExecutionAdapter().recheck(owner, workspaceId, step({ kind: "publish", expectedCandidateRevision: 7, expectedReleaseVersion: null }) as never)).rejects.toBeInstanceOf(WorkspaceConflictError);
    await expect(createNativeExecutionAdapter().recheck(owner, workspaceId, step({ kind: "publish", expectedCandidateRevision: 0, expectedReleaseVersion: null }) as never)).resolves.toBeUndefined();
  });
});

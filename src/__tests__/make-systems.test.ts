import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { BoundedStore } from "@/platform/bounded-work/repository";
import type { MakeSystemsAuthority } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceMakeSystemsError, type SavedWork, type WorkspaceActor } from "@/platform/workspaces/types";
import { createApplicationService } from "@/products/applications/server";
import { createCustomApplicationService } from "@/products/custom-applications/server";

const actorFor = (userId: string): WorkspaceActor => ({ userId, verifiedEmail: `${userId}@example.com` });
const operator = actorFor("operator");
const agency = actorFor("agency");
const owner = actorFor("owner");
const admin = actorFor("admin");
const member = actorFor("member");
const outsider = actorFor("outsider");
const workspaceId = "workspace-a";

/** make_systems as public.workspace_make_systems_authority resolves it. */
const AUTHORITY: Record<string, MakeSystemsAuthority> = {
  operator: "provider",
  agency: "agency",
  owner: "member",
  admin: "member",
  member: "member",
};

function makerStore() {
  const rows = new Map<string, SavedWork>();
  const created: Array<{ via: "create" | "createSystem"; by: string }> = [];
  const direct = (actor: WorkspaceActor, id: string) => {
    if (id !== workspaceId || !["operator", "owner", "admin", "member"].includes(actor.userId)) throw new WorkspaceAccessError();
  };
  const save = (actor: WorkspaceActor, workspace: string, input: Parameters<BoundedStore["create"]>[2]) => {
    const now = new Date().toISOString();
    const row: SavedWork = { ...input, id: randomUUID(), workspaceId: workspace, createdBy: actor.userId, createdAt: now, updatedAt: now };
    rows.set(row.id, structuredClone(row));
    return structuredClone(row);
  };
  const store: BoundedStore & { manager: (actor: WorkspaceActor, workspace: string) => Promise<void> } = {
    async member(actor, workspace) { direct(actor, workspace); },
    async manager(actor, workspace) {
      direct(actor, workspace);
      if (!["operator", "owner", "admin"].includes(actor.userId)) throw new WorkspaceAccessError("Application design access is required.");
    },
    async makeSystems(actor, workspace) { return workspace === workspaceId ? AUTHORITY[actor.userId] ?? null : null; },
    async read(_actor, id) { return rows.has(id) ? structuredClone(rows.get(id)!) : null; },
    async create(actor, workspace, input) { direct(actor, workspace); created.push({ via: "create", by: actor.userId }); return save(actor, workspace, input); },
    async createSystem(actor, workspace, input) { created.push({ via: "createSystem", by: actor.userId }); return save(actor, workspace, input); },
    async update(_actor, work, expectedRevision, payload) {
      const row = rows.get(work.id);
      if (!row || (row.payload as { revision: number }).revision !== expectedRevision) throw new WorkspaceConflictError();
      const next = { ...row, payload: structuredClone(payload), updatedAt: new Date().toISOString() };
      rows.set(work.id, next);
      return structuredClone(next);
    },
  };
  return { store, created };
}

const spec = (maintenanceOwner: string) => ({
  title: "Client intake",
  maintenanceOwner,
  fields: [{ id: "name", label: "Name", type: "text" as const, required: true }],
  components: [{ kind: "form" as const, fields: ["name"] }, { kind: "list" as const, fields: ["name"] }],
});

describe("make_systems for internal tools", () => {
  it("lets a Strelva operator and a delegated agency make a tool through the maker path", async () => {
    const { store, created } = makerStore();
    const service = createApplicationService(store);
    const byOperator = await service.create(operator, workspaceId, spec(operator.userId));
    const byAgency = await service.create(agency, workspaceId, spec(agency.userId));
    expect(byOperator.createdBy).toBe("operator");
    expect(byAgency.createdBy).toBe("agency");
    expect(created).toEqual([{ via: "createSystem", by: "operator" }, { via: "createSystem", by: "agency" }]);
  });

  it.each([owner, admin, member])("tells %s.userId to ask Strelva and creates nothing", async (actor) => {
    const { store, created } = makerStore();
    const service = createApplicationService(store);
    const attempt = service.create(actor, workspaceId, spec(actor.userId));
    await expect(attempt).rejects.toBeInstanceOf(WorkspaceMakeSystemsError);
    await expect(service.create(actor, workspaceId, spec(actor.userId))).rejects.toThrow("Ask your agency, or find one.");
    expect(created).toEqual([]);
  });

  it("denies an outsider with a plain access error, not a Request prompt", async () => {
    const { store } = makerStore();
    const attempt = createApplicationService(store).create(outsider, workspaceId, spec(outsider.userId));
    await expect(attempt).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(createApplicationService(store).create(outsider, workspaceId, spec(outsider.userId))).rejects.not.toBeInstanceOf(WorkspaceMakeSystemsError);
  });

  it("refuses owners and admins changing a tool but keeps member use of a live tool", async () => {
    const { store } = makerStore();
    const service = createApplicationService(store);
    const app = await service.create(operator, workspaceId, spec(operator.userId));
    await expect(service.revise(owner, app.id, { expectedDesignRevision: 0, spec: { ...spec(operator.userId), title: "Owner edit" } }))
      .rejects.toBeInstanceOf(WorkspaceMakeSystemsError);
    await expect(service.rehearse(admin, app.id, { expectedDesignRevision: 0 })).rejects.toBeInstanceOf(WorkspaceMakeSystemsError);
    await expect(service.command(owner, app.id, { kind: "retire", expectedRevision: 0 })).rejects.toBeInstanceOf(WorkspaceMakeSystemsError);

    await service.rehearse(operator, app.id, { expectedDesignRevision: 0 });
    await service.publish(operator, app.id, { expectedCandidateRevision: 0, expectedReleaseVersion: null });
    await expect(service.publish(owner, app.id, { expectedCandidateRevision: 0, expectedReleaseVersion: 1 })).rejects.toBeInstanceOf(WorkspaceMakeSystemsError);

    const runtime = await service.submit(member, app.id, { expectedReleaseVersion: 1, expectedRecordsRevision: 0, record: { id: "r1", values: { name: "Acme Co" } } });
    expect(runtime.records).toEqual([{ id: "r1", values: { name: "Acme Co" } }]);
  });

  it("gates custom application creation the same way", async () => {
    const { store, created } = makerStore();
    const service = createCustomApplicationService(store, {
      economics: {
        async ensureBudget(_actor: WorkspaceActor, _target: unknown, budget: { maxAuthorizedCents: number; estimateCents: number | null }) { return { jobId: "job", maxAuthorizedCents: budget.maxAuthorizedCents, estimateCents: budget.estimateCents, status: "accepted" }; },
        async reserve() { throw new Error("not used"); },
        async settle() { throw new Error("not used"); },
      } as never,
    });
    const input = { title: "Built app", files: { "build.mjs": "console.log('x')" }, budget: { maxAuthorizedCents: 500, estimateCents: 100 } };
    await expect(service.create(owner, workspaceId, input)).rejects.toBeInstanceOf(WorkspaceMakeSystemsError);
    expect(created).toEqual([]);
  });
});

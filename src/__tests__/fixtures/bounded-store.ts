import { randomUUID } from "node:crypto";
import type { BoundedStore } from "@/platform/bounded-work/repository";
import { WorkspaceAccessError, WorkspaceConflictError, type SavedWork, type WorkspaceActor } from "@/platform/workspaces/types";
export const owner: WorkspaceActor = { userId: "owner", verifiedEmail: "owner@example.com" };
export function memoryBoundedStore(): BoundedStore {
  const rows = new Map<string, SavedWork>();
  const member = async (actor: WorkspaceActor, workspaceId: string) => {
    if (actor.userId !== owner.userId || workspaceId !== "workspace-a") throw new WorkspaceAccessError();
  };
  return {
    member,
    async read(actor, id) { const row = rows.get(id); if (!row) return null; await member(actor, row.workspaceId); return structuredClone(row); },
    async create(actor, workspaceId, input) { await member(actor, workspaceId); const row = { ...input, id: randomUUID(), workspaceId, createdBy: actor.userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; rows.set(row.id, structuredClone(row)); return structuredClone(row); },
    async update(actor, work, revision, payload) {
      await member(actor, work.workspaceId);
      const row = rows.get(work.id);
      if (!row || (row.payload as { revision: number }).revision !== revision) throw new WorkspaceConflictError();
      const next = { ...row, payload: structuredClone(payload) }; rows.set(work.id, next); return structuredClone(next);
    },
  };
}

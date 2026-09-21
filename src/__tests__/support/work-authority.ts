import type { WorkAuthority, WorkSource } from "@/platform/work-context/authority";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";

/** In-memory implementation of the database boundary; command logic remains real. */
export function createMemoryWorkAuthority(owner: WorkspaceActor, work: WorkSource) {
  const values = new Map<string, unknown>();
  const sources = new Map<string, WorkSource>([[work.id, work]]);
  const members = new Map([[owner.userId, "owner" as "owner" | "admin" | "member"]]);
  const authority: WorkAuthority & { work: WorkSource; sources: Map<string, WorkSource>; members: typeof members } = {
    work, sources, members,
    async read(actor, workId, domain) {
      if (workId !== work.id || !actor.verifiedEmail) throw new WorkspaceAccessError();
      if (domain === "context" && !members.has(actor.userId)) throw new WorkspaceAccessError();
      return { work: structuredClone(work), role: members.get(actor.userId) ?? null, payload: structuredClone(values.get(domain) ?? null) };
    },
    async commit(actor, workId, domain, expectedRevision, payload, intent, expectedWorkRevision) {
      const current = values.get(domain) as { revision: number } | undefined;
      if ((current?.revision ?? 0) !== expectedRevision || expectedWorkRevision !== work.revision) throw new WorkspaceConflictError();
      if (intent === "manage" && !["owner", "admin"].includes(members.get(actor.userId) ?? "")) throw new WorkspaceAccessError();
      values.set(domain, structuredClone(payload));
    },
    async grantedSource(actor, workId, id, operation) {
      const context = values.get("context") as { grants: Array<{ sourceWorkId: string; status: string; sourceRevision: string; scope: string[] }> } | undefined;
      const grant = context?.grants.find(g => g.sourceWorkId === id && g.status === "active" && g.scope.includes(operation));
      if (!members.has(actor.userId) || !grant || !sources.has(id)) throw new WorkspaceAccessError();
      if (sources.get(id)!.revision !== grant.sourceRevision) throw new WorkspaceConflictError("The source changed.");
      return structuredClone(sources.get(id)!);
    },
    async source(actor, id) {
      if (!members.has(actor.userId) || !sources.has(id)) throw new WorkspaceAccessError();
      return structuredClone(sources.get(id)!);
    },
  };
  return authority;
}

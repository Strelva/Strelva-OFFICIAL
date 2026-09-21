import { randomUUID } from "node:crypto";
import { z } from "zod";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { WorkAuthority, WorkAuthoritySnapshot, WorkSource } from "./authority";
import {
  ContextSourceIsolationError,
  prepareContextFact,
  prepareContextPayload,
  prepareContextProvenance,
  prepareContextText,
} from "./preparation";

const revision = z.number().int().min(0);
const key = z.string().trim().min(1).max(120);
const text = z.string().trim().min(1).max(3000);
const scope = z.enum(["read", "use_in_work"]);
const grantSchema = z.object({ id: z.string(), sourceWorkId: z.string(), sourceRevision: z.string(), title: z.string(), scope: z.array(scope), purpose: text, expiresAt: z.string().datetime(), status: z.enum(["active", "revoked"]), grantedBy: z.string(), grantedAt: z.string(), revokedAt: z.string().optional() });
const factSchema = z.object({ id: z.string(), key, value: text, evidenceKind: z.enum(["observed", "reported", "inferred", "unknown"]), sourceWorkId: z.string(), sourceRevision: z.string(), excerpt: text, capturedAt: z.string(), freshUntil: z.string().datetime(), recordedBy: z.string(), retiredAt: z.string().optional(), correctionOf: z.string().optional() });
const preferenceSchema = z.object({ key, value: text, recordedBy: z.string(), recordedAt: z.string() });
export const workContextSchema = z.object({ version: z.literal(1), revision, grants: z.array(grantSchema).max(100), facts: z.array(factSchema).max(500), preferences: z.array(preferenceSchema).max(100), history: z.array(z.object({ id: z.string(), kind: z.string(), actorId: z.string(), at: z.string(), subjectId: z.string() })).max(1000) });
export type WorkContext = z.infer<typeof workContextSchema>;
export type WorkContextView = Omit<WorkContext, "facts"> & { facts: Array<WorkContext["facts"][number] & { status: "current" | "stale" | "conflicting" | "retired" | "unavailable" }> };
export const contextCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("grant_source"), expectedRevision: revision, sourceWorkId: z.string().min(1), scope: z.array(scope).min(1).max(2), purpose: text, expiresAt: z.string().datetime() }),
  z.object({ kind: z.literal("revoke_source"), expectedRevision: revision, grantId: z.string() }),
  z.object({ kind: z.literal("record_fact"), expectedRevision: revision, key, value: text, evidenceKind: z.enum(["observed", "reported", "inferred", "unknown"]), sourceWorkId: z.string(), sourceRevision: z.string(), excerpt: text, freshUntil: z.string().datetime(), correctionOf: z.string().optional() }),
  z.object({ kind: z.literal("retire_fact"), expectedRevision: revision, factId: z.string() }),
  z.object({ kind: z.literal("set_preference"), expectedRevision: revision, key, value: text }),
]);
function state(raw: unknown): WorkContext {
  return raw == null ? { version: 1, revision: 0, grants: [], facts: [], preferences: [], history: [] } : workContextSchema.parse(raw);
}
function requireMember(snapshot: WorkAuthoritySnapshot) {
  if (!snapshot.role) throw new WorkspaceAccessError();
}
function requireManager(snapshot: WorkAuthoritySnapshot) {
  if (snapshot.role !== "owner" && snapshot.role !== "admin") throw new WorkspaceAccessError("A workspace owner or administrator must change shared context.");
}

function localProvenance(source: WorkSource, workspaceId: string) {
  try {
    return prepareContextProvenance({ workId: source.id, workspaceId: source.workspaceId, title: source.title, revision: source.revision }, workspaceId);
  } catch (error) {
    if (error instanceof ContextSourceIsolationError) throw new WorkspaceAccessError("The source belongs to another workspace.");
    throw error;
  }
}

export function createContextService(authority: WorkAuthority, clock = () => new Date()) {
  async function sourceFromGrant(actor: WorkspaceActor, snapshot: WorkAuthoritySnapshot, data: WorkContext, sourceWorkId: string, operation: z.infer<typeof scope>) {
    requireMember(snapshot);
    const now = clock();
    const grant = data.grants.find(g => g.sourceWorkId === sourceWorkId && g.status === "active" && Date.parse(g.expiresAt) > now.getTime() && g.scope.includes(operation));
    if (!grant) throw new WorkspaceAccessError("This work has no current grant for that source operation.");
    const source = await authority.source(actor, sourceWorkId);
    localProvenance(source, snapshot.work.workspaceId);
    if (source.revision !== grant.sourceRevision) throw new WorkspaceConflictError("The source changed. Review it and renew its grant before continuing.");
    const granted = await authority.grantedSource(actor, snapshot.work.id, sourceWorkId, operation);
    localProvenance(granted, snapshot.work.workspaceId);
    if (granted.revision !== grant.sourceRevision) throw new WorkspaceConflictError("The source changed. Review it and renew its grant before continuing.");
    return granted;
  }
  async function project(actor: WorkspaceActor, snapshot: WorkAuthoritySnapshot, data: WorkContext): Promise<WorkContextView> {
    requireMember(snapshot);
    const now = clock();
    const sources = new Map<string, string | null>();
    await Promise.all([...new Set(data.facts.map(f => f.sourceWorkId))].map(async id => {
      try { const source = await sourceFromGrant(actor, snapshot, data, id, "read"); sources.set(id, source.revision); }
      catch (error) { if (error instanceof WorkspaceConflictError) sources.set(id, "changed"); else if (error instanceof WorkspaceAccessError) sources.set(id, null); else throw error; }
    }));
    const facts: WorkContextView["facts"] = data.facts.map(f => {
      let status: WorkContextView["facts"][number]["status"] = "current";
      if (f.retiredAt) status = "retired";
      else if (sources.get(f.sourceWorkId) === null) status = "unavailable";
      else if (Date.parse(f.freshUntil) <= now.getTime() || sources.get(f.sourceWorkId) !== f.sourceRevision) status = "stale";
      const prepared = prepareContextFact(f);
      return { ...f, value: prepared.value, excerpt: prepared.excerpt, status };
    });
    for (const fact of facts) {
      if (fact.status === "current" && facts.some(other => other.id !== fact.id && other.key === fact.key && other.value !== fact.value && !other.retiredAt && ["current", "conflicting"].includes(other.status))) fact.status = "conflicting";
    }
    return {
      ...data,
      grants: data.grants.map(grant => ({
        ...grant,
        title: prepareContextText({ value: grant.title, maxCharacters: 160 }).value || "Untitled work",
        purpose: prepareContextText({ value: grant.purpose, maxCharacters: 3_000 }).value || "Authorized source use",
      })),
      facts,
      preferences: data.preferences.map(preference => ({
        ...preference,
        value: prepareContextText({ value: preference.value, fieldName: preference.key, maxCharacters: 3_000 }).value || "[empty]",
      })),
    };
  }
  return {
    async read(actor: WorkspaceActor, workId: string) {
      const snapshot = await authority.read(actor, workId, "context");
      return project(actor, snapshot, state(snapshot.payload));
    },
    async requireSource(actor: WorkspaceActor, workId: string, sourceWorkId: string, operation: "read" | "use_in_work") {
      const snapshot = await authority.read(actor, workId, "context");
      const source = await sourceFromGrant(actor, snapshot, state(snapshot.payload), sourceWorkId, operation);
      const provenance = localProvenance(source, snapshot.work.workspaceId);
      return { ...source, title: provenance.title, payload: prepareContextPayload(source.payload) };
    },
    async change(actor: WorkspaceActor, workId: string, raw: unknown) {
      const command = contextCommandSchema.parse(raw);
      const snapshot = await authority.read(actor, workId, "context");
      requireManager(snapshot);
      const next = structuredClone(state(snapshot.payload));
      if (next.revision !== command.expectedRevision) throw new WorkspaceConflictError("Context changed. Reload before continuing.");
      const now = clock();
      let subjectId: string;
      if (command.kind === "grant_source") {
        const source = await authority.source(actor, command.sourceWorkId);
        const provenance = localProvenance(source, snapshot.work.workspaceId);
        if (source.id === workId) throw new WorkspaceAccessError("Select a different source in this workspace.");
        if (Date.parse(command.expiresAt) <= now.getTime() || Date.parse(command.expiresAt) > now.getTime() + 90 * 86400000) throw new WorkspaceConflictError("Choose a source grant expiry within 90 days.");
        // Renewal retires the old authority, retaining its audit trail.
        for (const grant of next.grants) if (grant.sourceWorkId === source.id && grant.status === "active") { grant.status = "revoked"; grant.revokedAt = now.toISOString(); }
        subjectId = randomUUID();
        next.grants.push({
          id: subjectId,
          sourceWorkId: source.id,
          sourceRevision: source.revision,
          title: provenance.title,
          scope: [...new Set(command.scope)],
          purpose: prepareContextText({ value: command.purpose, maxCharacters: 3_000 }).value || "Authorized source use",
          expiresAt: command.expiresAt,
          status: "active",
          grantedBy: actor.userId,
          grantedAt: now.toISOString(),
        });
      } else if (command.kind === "revoke_source") {
        const grant = next.grants.find(g => g.id === command.grantId);
        if (!grant) throw new WorkspaceAccessError();
        subjectId = grant.id; grant.status = "revoked"; grant.revokedAt = now.toISOString();
      } else if (command.kind === "record_fact") {
        const source = await sourceFromGrant(actor, snapshot, next, command.sourceWorkId, "read");
        if (command.evidenceKind === "observed" && !JSON.stringify(source.payload).includes(command.excerpt)) throw new WorkspaceConflictError("Observed evidence must quote the selected source.");
        if (source.revision !== command.sourceRevision) throw new WorkspaceConflictError("The source changed before this fact was recorded.");
        if (Date.parse(command.freshUntil) <= now.getTime()) throw new WorkspaceConflictError("The fact must have a future freshness limit.");
        if (command.correctionOf) {
          const prior = next.facts.find(f => f.id === command.correctionOf);
          if (!prior || prior.key !== command.key || prior.retiredAt) throw new WorkspaceConflictError("That fact cannot be corrected from this version.");
          prior.retiredAt = now.toISOString();
        }
        subjectId = randomUUID();
        const prepared = prepareContextFact(command);
        next.facts.push({ id: subjectId, key: prepared.key, value: prepared.value, evidenceKind: command.evidenceKind, sourceWorkId: source.id, sourceRevision: source.revision, excerpt: prepared.excerpt, capturedAt: now.toISOString(), freshUntil: command.freshUntil, recordedBy: actor.userId, correctionOf: command.correctionOf });
      } else if (command.kind === "retire_fact") {
        const fact = next.facts.find(f => f.id === command.factId);
        if (!fact || fact.retiredAt) throw new WorkspaceConflictError("The fact is unavailable or already retired.");
        subjectId = fact.id; fact.retiredAt = now.toISOString();
      } else {
        subjectId = command.key;
        const preference = { key: command.key, value: prepareContextText({ value: command.value, fieldName: command.key, maxCharacters: 3_000 }).value || "[empty]", recordedBy: actor.userId, recordedAt: now.toISOString() };
        const index = next.preferences.findIndex(p => p.key === command.key);
        if (index < 0) next.preferences.push(preference); else next.preferences[index] = preference;
      }
      next.revision++;
      next.history.push({ id: randomUUID(), kind: command.kind, actorId: actor.userId, at: now.toISOString(), subjectId });
      workContextSchema.parse(next);
      await authority.commit(actor, workId, "context", command.expectedRevision, next, "manage", snapshot.work.revision);
      return project(actor, snapshot, next);
    },
  };
}

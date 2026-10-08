import { cloneJson } from "./compare";
import { systemKey, type SystemRef } from "./refs";
import type { SourceRevision, SourceSystemRecord, VersionActor, VersionLineage } from "./types";
import { VersionStaleError } from "./types";

/**
 * Storage port for lineage. Every call names the actor so a Postgres adapter
 * can recheck access in the database (`createSupabaseVersionStore`); the
 * in-memory reference ignores it and leaves access to the service. Both keep
 * the same compare-and-set rule on `rowRevision` and the same immutability of
 * published revisions, proven by one contract suite
 * (src/__tests__/system-versions-store-contract.test.ts).
 */
export interface VersionStore {
  getSource(actor: VersionActor, source: SystemRef): Promise<SourceSystemRecord | null>;
  putSource(actor: VersionActor, record: SourceSystemRecord): Promise<void>;
  getRevision(actor: VersionActor, source: SystemRef, revision: number): Promise<SourceRevision | null>;
  /** The descendant retains its immutable pin after upstream stops sharing.
   * This does not expose other revisions or source business data. */
  getPinnedRevision(actor: VersionActor, versionId: string): Promise<SourceRevision | null>;
  listRevisions(actor: VersionActor, source: SystemRef): Promise<SourceRevision[]>;
  /** Published revisions are append-only. Returns the stored revision when the adapter normalizes it. */
  insertRevision(actor: VersionActor, revision: SourceRevision): Promise<SourceRevision | void>;
  getLineage(actor: VersionActor, id: string): Promise<VersionLineage | null>;
  findLineageByVersion(actor: VersionActor, version: SystemRef): Promise<VersionLineage | null>;
  /**
   * Which Version binds a live connection: its id, an opaque non-null marker
   * when a Version the actor cannot read holds it, or null when none does.
   */
  connectionHolder(actor: VersionActor, connectionId: string): Promise<string | null>;
  insertLineage(actor: VersionActor, lineage: VersionLineage): Promise<VersionLineage | void>;
  /** Compare-and-set on `rowRevision`. Returns the stored row when the adapter has it. */
  updateLineage(actor: VersionActor, lineage: VersionLineage, expectedRowRevision: number): Promise<VersionLineage | void>;
}

/** Who owns a live connection. Lane-owned elsewhere; this is the port. */
export interface ConnectionOwnership {
  ownerOf(actor: VersionActor, connectionId: string): Promise<string | null>;
}

export function createInMemoryVersionStore(): VersionStore {
  const sources = new Map<string, SourceSystemRecord>();
  const revisions = new Map<string, SourceRevision[]>();
  const lineages = new Map<string, VersionLineage>();
  return {
    getSource: async (_actor, source) => cloneJson(sources.get(systemKey(source)) ?? null),
    putSource: async (_actor, record) => void sources.set(systemKey(record.source), cloneJson(record)),
    getRevision: async (_actor, source, revision) =>
      cloneJson((revisions.get(systemKey(source)) ?? []).find((item) => item.source.number === revision) ?? null),
    async getPinnedRevision(_actor, versionId) {
      const lineage = lineages.get(versionId);
      return cloneJson(lineage ? (revisions.get(systemKey(lineage.source)) ?? []).find(item => item.source.number === lineage.baseline.revision) ?? null : null);
    },
    listRevisions: async (_actor, source) => cloneJson(revisions.get(systemKey(source)) ?? []),
    async insertRevision(_actor, revision) {
      const list = revisions.get(systemKey(revision.source)) ?? [];
      if (list.some((item) => item.source.number === revision.source.number)) {
        throw new VersionStaleError("That source revision was already published.");
      }
      list.push(cloneJson(revision));
      revisions.set(systemKey(revision.source), list);
    },
    getLineage: async (_actor, id) => cloneJson(lineages.get(id) ?? null),
    async findLineageByVersion(_actor, version) {
      for (const lineage of lineages.values()) {
        if (systemKey(lineage.version) === systemKey(version)) return cloneJson(lineage);
      }
      return null;
    },
    async connectionHolder(_actor, connectionId) {
      for (const lineage of lineages.values()) {
        if (lineage.bindings.some((binding) => binding.connectionId === connectionId)) return lineage.id;
      }
      return null;
    },
    async insertLineage(_actor, lineage) {
      if (lineages.has(lineage.id)) throw new VersionStaleError("That Version already exists.");
      lineages.set(lineage.id, cloneJson(lineage));
    },
    async updateLineage(_actor, lineage, expectedRowRevision) {
      const current = lineages.get(lineage.id);
      if (!current || current.rowRevision !== expectedRowRevision) throw new VersionStaleError();
      lineages.set(lineage.id, cloneJson({ ...lineage, rowRevision: expectedRowRevision + 1 }));
    },
  };
}

export function createInMemoryConnectionOwnership(entries: Record<string, string> = {}): ConnectionOwnership & {
  register(connectionId: string, businessId: string): void;
} {
  const owners = new Map(Object.entries(entries));
  return {
    ownerOf: async (_actor, connectionId) => owners.get(connectionId) ?? null,
    register: (connectionId, businessId) => void owners.set(connectionId, businessId),
  };
}

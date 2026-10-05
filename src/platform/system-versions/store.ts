import { cloneJson } from "./compare";
import { systemKey, type SystemRef } from "./refs";
import type { SourceRevision, SourceSystemRecord, VersionLineage } from "./types";
import { VersionStaleError } from "./types";

/**
 * Storage port for lineage. The in-memory adapter below is the reference
 * behavior; a Postgres adapter must keep the same compare-and-set rule on
 * `rowRevision` and the same immutability of published revisions.
 */
export interface VersionStore {
  getSource(source: SystemRef): SourceSystemRecord | null;
  putSource(record: SourceSystemRecord): void;
  getRevision(source: SystemRef, revision: number): SourceRevision | null;
  listRevisions(source: SystemRef): SourceRevision[];
  /** Published revisions are append-only. */
  insertRevision(revision: SourceRevision): void;
  getLineage(id: string): VersionLineage | null;
  findLineageByVersion(version: SystemRef): VersionLineage | null;
  /** The Version that currently binds a live connection, if any. */
  findLineageByConnection(connectionId: string): VersionLineage | null;
  insertLineage(lineage: VersionLineage): void;
  /** Compare-and-set on `rowRevision`. */
  updateLineage(lineage: VersionLineage, expectedRowRevision: number): void;
}

/** Who owns a live connection. Lane-owned elsewhere; this is the port. */
export interface ConnectionOwnership {
  ownerOf(connectionId: string): string | null;
}

export function createInMemoryVersionStore(): VersionStore {
  const sources = new Map<string, SourceSystemRecord>();
  const revisions = new Map<string, SourceRevision[]>();
  const lineages = new Map<string, VersionLineage>();
  return {
    getSource: (source) => cloneJson(sources.get(systemKey(source)) ?? null),
    putSource: (record) => void sources.set(systemKey(record.source), cloneJson(record)),
    getRevision: (source, revision) =>
      cloneJson((revisions.get(systemKey(source)) ?? []).find((item) => item.source.revision === revision) ?? null),
    listRevisions: (source) => cloneJson(revisions.get(systemKey(source)) ?? []),
    insertRevision(revision) {
      const list = revisions.get(systemKey(revision.source)) ?? [];
      if (list.some((item) => item.source.revision === revision.source.revision)) {
        throw new VersionStaleError("That source revision was already published.");
      }
      list.push(cloneJson(revision));
      revisions.set(systemKey(revision.source), list);
    },
    getLineage: (id) => cloneJson(lineages.get(id) ?? null),
    findLineageByVersion(version) {
      for (const lineage of lineages.values()) {
        if (systemKey(lineage.version) === systemKey(version)) return cloneJson(lineage);
      }
      return null;
    },
    findLineageByConnection(connectionId) {
      for (const lineage of lineages.values()) {
        if (lineage.bindings.some((binding) => binding.connectionId === connectionId)) return cloneJson(lineage);
      }
      return null;
    },
    insertLineage(lineage) {
      if (lineages.has(lineage.id)) throw new VersionStaleError("That Version already exists.");
      lineages.set(lineage.id, cloneJson(lineage));
    },
    updateLineage(lineage, expectedRowRevision) {
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
    ownerOf: (connectionId) => owners.get(connectionId) ?? null,
    register: (connectionId, businessId) => void owners.set(connectionId, businessId),
  };
}

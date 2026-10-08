import { cloneJson, jsonEqual } from "./compare";
import type { VersionStore } from "./store";
import { VersionAccessError, VersionStaleError, type SourceRevision, type VersionActor } from "./types";
import { assessRevisionQualification, assertQualificationMatchesRevision, parseRevisionQualification, sameQualificationRevision,
  type QualificationRevisionRef, type RevisionQualification, type RevisionRehearsal } from "./qualification";

/** Evidence history is append-only; a new revision starts without evidence.
 * No operation here records a human verdict or authorizes release. */
export interface RevisionQualificationStore {
  append(actor: VersionActor, revision: SourceRevision, record: RevisionQualification): Promise<RevisionQualification>;
  list(actor: VersionActor, source: QualificationRevisionRef): Promise<RevisionQualification[]>;
}

function requireSourceManager(actor: VersionActor, businessId: string) {
  if (!actor.memberships.some(member => member.businessId === businessId && member.via !== "provider_seat"
    && (member.role === "owner" || member.role === "admin"))) throw new VersionAccessError();
}

export function createRevisionQualifications(deps: {
  versions: VersionStore; qualifications: RevisionQualificationStore; rehearse: RevisionRehearsal;
  now?: () => string; id?: () => string;
}) {
  return {
    async assess(actor: VersionActor, source: QualificationRevisionRef): Promise<RevisionQualification> {
      requireSourceManager(actor, source.businessId);
      const revision = await deps.versions.getRevision(actor, source, source.number);
      if (!revision || !sameQualificationRevision(revision.source, source)) throw new VersionStaleError();
      const previous = source.number === 1 ? null : await deps.versions.getRevision(actor, source, source.number - 1);
      const record = await assessRevisionQualification({ revision, previous, rehearse: deps.rehearse,
        evaluatedBy: actor.userId, evaluatedAt: (deps.now ?? (() => new Date().toISOString()))(),
        id: (deps.id ?? (() => globalThis.crypto.randomUUID()))(), environment: "local" });
      return deps.qualifications.append(actor, revision, record);
    },
    async list(actor: VersionActor, source: QualificationRevisionRef) {
      return deps.qualifications.list(actor, source);
    },
  };
}

export function createInMemoryRevisionQualificationStore(versions: VersionStore): RevisionQualificationStore {
  const records = new Map<string, RevisionQualification>();
  async function readable(actor: VersionActor, source: QualificationRevisionRef) {
    const parent = await versions.getSource(actor, source);
    const allowed = actor.memberships.some(member => member.businessId === source.businessId || parent?.sharedWith.includes(member.businessId));
    if (!parent || !allowed) throw new VersionAccessError();
    const revision = await versions.getRevision(actor, source, source.number);
    if (!revision || !sameQualificationRevision(revision.source, source)) throw new VersionStaleError();
    return revision;
  }
  return {
    async append(actor, snapshot, record) {
      requireSourceManager(actor, snapshot.source.businessId);
      const actual = await readable(actor, snapshot.source);
      const parsed = parseRevisionQualification(record, actual.source);
      if (parsed.evaluatedBy !== actor.userId || !jsonEqual(actual.definition, snapshot.definition)
        || !jsonEqual(actual.requires, snapshot.requires)) throw new VersionStaleError();
      const prior = actual.source.number === 1 ? null : await versions.getRevision(actor, actual.source, actual.source.number - 1);
      assertQualificationMatchesRevision(parsed, actual, prior);
      const existing = records.get(parsed.id);
      if (existing && !jsonEqual(existing, parsed)) throw new VersionStaleError();
      if (!existing) records.set(parsed.id, cloneJson(parsed));
      return cloneJson(existing ?? parsed);
    },
    async list(actor, source) {
      await readable(actor, source);
      return [...records.values()].filter(record => sameQualificationRevision(record.source, source)).map(cloneJson);
    },
  };
}

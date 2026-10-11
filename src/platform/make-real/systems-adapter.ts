import { canonicalJson, sha256, uuidFromSeed } from "@/platform/business-record/tenant-import";
import type { SystemImplementation, SystemRef } from "@/platform/systems/contracts";
import { SystemRuleError } from "@/platform/systems/invariants";
import type { SystemStore } from "@/platform/systems/store";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { BaselineMovedError, type LiveSystemsPort } from "./ports";
import { z } from "zod";

type Content = Record<string, unknown>;

/**
 * Where revision content lives. The System layer never copies what a revision
 * is built from: a SystemRevision only names it (`implementation`). Make real
 * candidates are plain JSON, so this port stores them by content hash and
 * hands back the implementation reference.
 */
export interface RevisionContentPort {
  put(businessId: string, content: Content): Promise<SystemImplementation>;
  get(businessId: string, implementation: SystemImplementation): Promise<Content | null>;
}

export const MAKE_REAL_CONTENT_KIND = "make_real_content";

/** Content-addressed and business-scoped. For tests and local fixtures. */
export function createInMemoryRevisionContent(): RevisionContentPort & { size(): number } {
  const blobs = new Map<string, Content>();
  return {
    async put(businessId, content) {
      const hash = sha256(canonicalJson(content));
      blobs.set(`${businessId}:${hash}`, structuredClone(content));
      return { kind: MAKE_REAL_CONTENT_KIND, ref: `sha256:${hash}`, contentHash: hash };
    },
    async get(businessId, implementation) {
      if (implementation.kind !== MAKE_REAL_CONTENT_KIND || !implementation.contentHash) return null;
      const blob = blobs.get(`${businessId}:${implementation.contentHash}`);
      return blob ? structuredClone(blob) : null;
    },
    size: () => blobs.size,
  };
}

export interface SystemStoreLiveSystemsOptions {
  store: SystemStore;
  content: RevisionContentPort;
  /** Who live writes are recorded as. Make real checks authority per step
   * through AuthorityPort; the store still rechecks this actor's access. */
  actor: WorkspaceActor;
  /** Descriptor for Systems a Possibility introduces. Kind is not identity. */
  introducedKind?: string;
}

/** SystemStore command ids are UUIDs; Make real keys are `activation:step`. */
function commandId(key: string, part: string): string {
  return uuidFromSeed(`make-real:${part}:${key}`);
}

function isBaselineMoved(error: unknown): boolean {
  return error instanceof SystemRuleError && error.code === "system_baseline_moved";
}

/**
 * LiveSystemsPort over the spine's SystemStore.
 *
 * - stageRevision: recordRevision with `{ activate: false }`. The revision
 *   exists; the current pointer does not move.
 * - activate / restore: setCurrentRevision, compare-and-set on the pinned
 *   baseline. `system_baseline_moved` becomes BaselineMovedError. Activating
 *   a draft System also makes it live.
 * - introduceSystem: createSystem plus a staged first revision.
 * - connect: a System-to-System connection. disconnect: state `disconnected`.
 *
 * Restoring an introduced System to "no revision" has no store equivalent: a
 * revision pointer is never cleared and a live System never returns to draft.
 * The adapter pauses it instead, which keeps its records.
 */
export function createSystemStoreLiveSystems(options: SystemStoreLiveSystemsOptions): LiveSystemsPort {
  const { store, content, actor } = options;
  const introducedKind = options.introducedKind ?? "other";

  async function currentRevisionId(ref: SystemRef): Promise<string | null> {
    const { system } = await store.readSystem(actor, ref);
    return system.currentRevision?.revisionId ?? null;
  }

  async function swap(ref: SystemRef, revisionId: string, expectedCurrent: string | null) {
    try {
      return await store.setCurrentRevision(actor, ref, revisionId, expectedCurrent);
    } catch (error) {
      if (isBaselineMoved(error)) throw new BaselineMovedError(ref.systemId, await currentRevisionId(ref));
      throw error;
    }
  }

  // A pinned baseline is a SystemRevisionRef; the store takes a bare SystemRef
  // and its Postgres implementation refuses extra keys.
  const bare = (ref: SystemRef): SystemRef => ({ businessId: ref.businessId, systemId: ref.systemId });

  return {
    async current(raw) {
      const ref = bare(raw);
      const detail = await store.readSystem(actor, ref);
      const pointer = detail.system.currentRevision;
      if (!pointer) return null;
      const revision = detail.revisions.find((item) => item.id === pointer.revisionId);
      if (!revision) return null;
      const body = await content.get(ref.businessId, revision.implementation);
      if (!body) throw new Error(`Revision ${revision.number} of System ${ref.systemId} has no readable content.`);
      return { revisionId: revision.id, number: revision.number, content: body };
    },

    async stageRevision(ref, candidate, key) {
      const implementation = await content.put(ref.businessId, candidate.content);
      const { revision } = await store.recordRevision(
        actor, { businessId: ref.businessId, systemId: ref.systemId }, null,
        { implementation, summary: candidate.summary }, commandId(key, "stage"), { activate: false },
      );
      return { revisionId: revision.id };
    },

    async introduceSystem(businessId, intro, key) {
      const nativeWebsite = intro.candidate.content.kind === "ask-website-pages"
        ? z.string().uuid().safeParse(intro.candidate.content.rebuildWorkId) : null;
      const system = await store.createSystem(actor, businessId, {
        name: intro.name, purpose: intro.purpose,
        kind: nativeWebsite?.success ? "website" : introducedKind,
        ...(nativeWebsite?.success ? { origin: { kind: "saved_work" as const, ref: nativeWebsite.data } } : {}),
      }, commandId(key, "create"));
      const implementation = await content.put(businessId, intro.candidate.content);
      const { revision } = await store.recordRevision(
        actor, { businessId, systemId: system.id }, null,
        { implementation, summary: intro.candidate.summary }, commandId(key, "revision"), { activate: false },
      );
      return { systemId: system.id, revisionId: revision.id };
    },

    async activate(raw, revisionId, expectedCurrent) {
      const ref = bare(raw);
      const system = await swap(ref, revisionId, expectedCurrent);
      if (system.lifecycle === "draft") {
        await store.transitionLifecycle(actor, ref, system.changeNumber, "live");
      }
    },

    async restore(raw, revisionId, expectedCurrent) {
      const ref = bare(raw);
      if (revisionId !== null) {
        await swap(ref, revisionId, expectedCurrent);
        return;
      }
      const { system } = await store.readSystem(actor, ref);
      const current = system.currentRevision?.revisionId ?? null;
      if (current !== expectedCurrent) throw new BaselineMovedError(ref.systemId, current);
      if (system.lifecycle === "live") await store.transitionLifecycle(actor, ref, system.changeNumber, "paused");
    },

    async connect(businessId, connection, key) {
      const created = await store.connect(actor, {
        source: { businessId, systemId: connection.from },
        kind: connection.kind,
        target: { type: "system", system: { businessId, systemId: connection.to } },
        purpose: connection.purpose,
      }, commandId(key, "connect"));
      return { connectionId: created.id };
    },

    async disconnect(businessId, connectionId) {
      await store.setConnectionState(actor, businessId, connectionId, "disconnected");
    },
  };
}

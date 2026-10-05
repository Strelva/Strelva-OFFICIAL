import {
  assertShareableDefinition,
  changedPaths,
  cloneJson,
  jsonEqual,
  readPath,
  threeWayCompare,
  writePath,
  type JsonObject,
  type JsonValue,
} from "./compare";
import { sameSystem, type SystemRef, type SystemRevisionRef } from "./refs";
import type { ConnectionOwnership, VersionStore } from "./store";
import {
  VERSION_CONTEXT_KINDS,
  VersionAccessError,
  VersionConflictError,
  VersionIncompatibleError,
  VersionStaleError,
  VersionValidationError,
  type ImprovementComparison,
  type LocalBinding,
  type SourceRevision,
  type VersionActor,
  type VersionConflictResolution,
  type VersionContext,
  type VersionGrantScope,
  type VersionLineage,
  type VersionOverride,
  type VersionView,
} from "./types";

export interface SystemVersionsDeps {
  store: VersionStore;
  connections: ConnectionOwnership;
  now?: () => string;
  id?: (prefix: string) => string;
}

function overlaps(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

function validPath(path: string): string {
  if (typeof path !== "string" || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(path) || path.length > 300) {
    throw new VersionValidationError("The override path is invalid.");
  }
  return path;
}

function text(value: string, field: string, max = 200): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) throw new VersionValidationError(`Add a ${field} within ${max} characters.`);
  return result;
}

/** Baseline plus local overrides, shallowest first. */
export function applyOverrides(baseline: JsonObject, overrides: readonly VersionOverride[]): JsonObject {
  const result = cloneJson(baseline);
  for (const override of [...overrides].sort((left, right) => left.path.length - right.path.length)) {
    writePath(result, override.path, override.value);
  }
  return result;
}

export function createSystemVersions(deps: SystemVersionsDeps) {
  const { store, connections } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  let counter = 0;
  const id = deps.id ?? ((prefix: string) => `${prefix}_${(counter += 1).toString().padStart(4, "0")}`);

  function roleIn(actor: VersionActor, businessId: string) {
    return actor.memberships.find((membership) => membership.businessId === businessId)?.role ?? null;
  }

  function requireManage(actor: VersionActor, businessId: string): void {
    const role = roleIn(actor, businessId);
    if (role !== "owner" && role !== "admin") throw new VersionAccessError();
  }

  function requireMember(actor: VersionActor, businessId: string): void {
    if (!roleIn(actor, businessId)) throw new VersionAccessError();
  }

  function sourceVisibleTo(source: SystemRef, businessId: string): boolean {
    if (source.businessId === businessId) return true;
    return store.getSource(source)?.sharedWith.includes(businessId) ?? false;
  }

  function loadOwned(actor: VersionActor, versionId: string, manage: boolean): VersionLineage {
    const lineage = store.getLineage(versionId);
    // Same error for missing and forbidden so IDs cannot be probed.
    if (!lineage) throw new VersionAccessError();
    if (manage) requireManage(actor, lineage.version.businessId);
    else requireMember(actor, lineage.version.businessId);
    return lineage;
  }

  function save(lineage: VersionLineage, expectedRowRevision: number): VersionLineage {
    const next = { ...lineage, updatedAt: now() };
    store.updateLineage(next, expectedRowRevision);
    return store.getLineage(lineage.id)!;
  }

  function working(lineage: VersionLineage): JsonObject {
    return applyOverrides(lineage.baseline.definition, lineage.overrides);
  }

  function compareWith(lineage: VersionLineage, revision: SourceRevision): ImprovementComparison & { upstreamPaths: string[] } {
    const local = working(lineage);
    if (revision.source.number <= lineage.baseline.revision) {
      return {
        versionId: lineage.id,
        baselineRevision: lineage.baseline.revision,
        sourceRevision: revision.source.number,
        summary: revision.summary,
        status: "up_to_date",
        changes: [],
        conflicts: [],
        missingBindings: [],
        preview: local,
        upstreamPaths: [],
      };
    }
    // Overrides are the unit of local change. Adoption keeps or drops whole
    // overrides, so an upstream change anywhere inside (or above) one must be
    // a conflict, or adoption would silently discard part of the local edit.
    const result = threeWayCompare({
      base: lineage.baseline.definition,
      upstream: revision.definition,
      local,
      localEditPaths: lineage.overrides.map((override) => override.path),
    });
    const bound = new Set(lineage.bindings.map((binding) => binding.kind));
    const missingBindings = revision.requires.bindingKinds.filter((kind) => !bound.has(kind));
    return {
      versionId: lineage.id,
      baselineRevision: lineage.baseline.revision,
      sourceRevision: revision.source.number,
      summary: revision.summary,
      status: result.conflicts.length > 0 || missingBindings.length > 0 ? "blocked" : "auto_applicable",
      changes: result.changes,
      conflicts: result.conflicts,
      missingBindings,
      preview: result.merged,
      upstreamPaths: result.upstreamPaths,
    };
  }

  function loadImprovement(lineage: VersionLineage, revisionNumber: number): SourceRevision {
    if (!sourceVisibleTo(lineage.source, lineage.version.businessId)) throw new VersionAccessError("The source of this Version is no longer shared with this business.");
    const revision = store.getRevision(lineage.source, revisionNumber);
    if (!revision) throw new VersionValidationError("That source revision does not exist.");
    return revision;
  }

  return {
    /** Author side: publish an immutable shareable revision of a source System. */
    publishSourceRevision(
      actor: VersionActor,
      input: { source: SystemRef; definition: JsonObject; requires?: { bindingKinds: string[] }; summary: string; label?: string },
    ): SourceRevision {
      requireManage(actor, input.source.businessId);
      assertShareableDefinition(input.definition);
      if (!store.getSource(input.source)) store.putSource({ source: input.source, sharedWith: [], createdAt: now() });
      const previous = store.listRevisions(input.source).at(-1);
      const revision: SourceRevision = {
        source: {
          businessId: input.source.businessId,
          systemId: input.source.systemId,
          revisionId: id("source_revision"),
          number: (previous?.source.number ?? 0) + 1,
        },
        ...(input.label ? { label: input.label } : {}),
        summary: text(input.summary, "summary", 500),
        definition: cloneJson(input.definition),
        requires: { bindingKinds: [...new Set(input.requires?.bindingKinds ?? [])].sort() },
        publishedBy: actor.userId,
        publishedAt: now(),
      };
      store.insertRevision(revision);
      return cloneJson(revision);
    },

    /** Author side: let another business base Versions on this source. */
    shareSource(actor: VersionActor, source: SystemRef, businessId: string): void {
      requireManage(actor, source.businessId);
      const record = store.getSource(source);
      if (!record) throw new VersionValidationError("Publish a source revision before sharing it.");
      if (!record.sharedWith.includes(businessId)) record.sharedWith.push(businessId);
      store.putSource(record);
    },

    unshareSource(actor: VersionActor, source: SystemRef, businessId: string): void {
      requireManage(actor, source.businessId);
      const record = store.getSource(source);
      if (!record) return;
      record.sharedWith = record.sharedWith.filter((item) => item !== businessId);
      store.putSource(record);
    },

    /**
     * Descendant side: create a Version owned by the descendant business.
     * Only the shareable definition is copied. Bindings, data, grants and
     * people start empty and are chosen locally.
     */
    createVersion(actor: VersionActor, input: { source: SystemRevisionRef; version: SystemRef; context: VersionContext }): VersionLineage {
      requireManage(actor, input.version.businessId);
      if (sameSystem(input.source, input.version)) throw new VersionValidationError("A Version needs its own System identity.");
      if (!VERSION_CONTEXT_KINDS.includes(input.context.kind)) throw new VersionValidationError("Choose a supported Version context.");
      if (!sourceVisibleTo(input.source, input.version.businessId)) throw new VersionAccessError("That source is not shared with this business.");
      const revision = store.getRevision(input.source, input.source.number);
      if (!revision || revision.source.revisionId !== input.source.revisionId) {
        throw new VersionValidationError("That source revision does not exist.");
      }
      if (store.findLineageByVersion(input.version)) throw new VersionValidationError("That System is already a Version of a source.");
      const at = now();
      const lineage: VersionLineage = {
        id: id("version"),
        version: { businessId: input.version.businessId, systemId: input.version.systemId },
        source: { businessId: input.source.businessId, systemId: input.source.systemId },
        context: { kind: input.context.kind, label: text(input.context.label, "context label") },
        baseline: { revision: revision.source.number, definition: cloneJson(revision.definition) },
        overrides: [],
        bindings: [],
        localData: {},
        releases: [],
        currentRelease: null,
        decisions: [],
        grants: [],
        rowRevision: 1,
        createdBy: actor.userId,
        createdAt: at,
        updatedAt: at,
      };
      store.insertLineage(lineage);
      return cloneJson(lineage);
    },

    /** Set (or with `undefined`, clear) one business-owned override. */
    setOverride(actor: VersionActor, versionId: string, input: { path: string; value: JsonValue | undefined; expectedRowRevision: number }): VersionLineage {
      const lineage = loadOwned(actor, versionId, true);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      const path = validPath(input.path);
      const at = now();
      let overrides = lineage.overrides.filter((override) => !override.path.startsWith(`${path}.`));
      const ancestor = overrides.find((override) => path.startsWith(`${override.path}.`));
      if (ancestor) {
        if (input.value === undefined) throw new VersionValidationError("Clear the broader override that contains this path instead.");
        const wrapper: JsonObject = { value: cloneJson(ancestor.value) };
        try {
          writePath(wrapper, `value${path.slice(ancestor.path.length)}`, input.value);
        } catch {
          throw new VersionValidationError("A broader local override replaced this part of the System.");
        }
        overrides = overrides.map((override) =>
          override === ancestor ? { ...override, value: wrapper.value!, setBy: actor.userId, setAt: at } : override);
      } else {
        overrides = overrides.filter((override) => override.path !== path);
        if (input.value !== undefined && !jsonEqual(readPath(lineage.baseline.definition, path), input.value)) {
          overrides.push({ path, value: cloneJson(input.value), setBy: actor.userId, setAt: at });
        }
      }
      const next = { ...lineage, overrides };
      try {
        assertShareableDefinition(working(next));
      } catch (error) {
        throw new VersionValidationError(error instanceof Error ? error.message : "The override is invalid.");
      }
      return save(next, input.expectedRowRevision);
    },

    /**
     * Bind a live account or resource. The connection must belong to the
     * Version's own business: a source's or sibling's credentials are never
     * reused.
     */
    bindAccount(actor: VersionActor, versionId: string, input: { kind: string; connectionId: string; expectedRowRevision: number }): VersionLineage {
      const lineage = loadOwned(actor, versionId, true);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      const owner = connections.ownerOf(input.connectionId);
      if (owner !== lineage.version.businessId) {
        throw new VersionAccessError("Connect an account owned by this business. Accounts from another business are never reused.");
      }
      const holder = store.findLineageByConnection(input.connectionId);
      if (holder && holder.id !== lineage.id) {
        // Two locations of one business still get their own live accounts.
        throw new VersionValidationError("That account is already connected to another Version. Connect a separate account for this one.");
      }
      const binding: LocalBinding = {
        kind: text(input.kind, "binding kind", 80),
        connectionId: input.connectionId,
        ownerBusinessId: owner,
        boundBy: actor.userId,
        boundAt: now(),
      };
      const bindings = [...lineage.bindings.filter((item) => item.kind !== binding.kind), binding];
      return save({ ...lineage, bindings }, input.expectedRowRevision);
    },

    putLocalData(actor: VersionActor, versionId: string, input: { key: string; value: JsonValue; expectedRowRevision: number }): VersionLineage {
      const lineage = loadOwned(actor, versionId, false);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      const key = text(input.key, "data key", 120);
      return save({ ...lineage, localData: { ...lineage.localData, [key]: cloneJson(input.value) } }, input.expectedRowRevision);
    },

    /** Descendant side: every newer source revision, each compared against local state. */
    listAvailableImprovements(actor: VersionActor, versionId: string): ImprovementComparison[] {
      const lineage = loadOwned(actor, versionId, false);
      if (!sourceVisibleTo(lineage.source, lineage.version.businessId)) return [];
      return store
        .listRevisions(lineage.source)
        .filter((revision) => revision.source.number > lineage.baseline.revision)
        .map((revision) => {
          const { upstreamPaths: _paths, ...comparison } = compareWith(lineage, revision);
          return comparison;
        });
    },

    compareImprovement(actor: VersionActor, versionId: string, revision: number): ImprovementComparison {
      const lineage = loadOwned(actor, versionId, false);
      const { upstreamPaths: _paths, ...comparison } = compareWith(lineage, loadImprovement(lineage, revision));
      return comparison;
    },

    /**
     * Adopt a source revision into the working definition. Non-overlapping
     * upstream changes apply; every conflict needs an explicit choice; missing
     * local accounts block adoption outright. Adoption never releases.
     */
    adoptImprovement(
      actor: VersionActor,
      versionId: string,
      input: { revision: number; expectedRowRevision: number; resolutions?: VersionConflictResolution[] },
    ): VersionLineage {
      const lineage = loadOwned(actor, versionId, true);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      const revision = loadImprovement(lineage, input.revision);
      const comparison = compareWith(lineage, revision);
      if (comparison.status === "up_to_date") throw new VersionValidationError("This Version already includes that revision.");
      if (comparison.missingBindings.length > 0) throw new VersionIncompatibleError(comparison.missingBindings);
      const resolutions = input.resolutions ?? [];
      const expected = new Map(comparison.conflicts.map((conflict) => [conflict.path, conflict]));
      const seen = new Set<string>();
      for (const resolution of resolutions) {
        if (!expected.has(resolution.path) || seen.has(resolution.path)) throw new VersionValidationError("Each conflict must be resolved exactly once.");
        if (resolution.choice !== "keep_local" && resolution.choice !== "take_upstream") throw new VersionValidationError("Choose keep local or take upstream.");
        seen.add(resolution.path);
      }
      if (seen.size !== expected.size) throw new VersionConflictError(comparison.conflicts);

      const at = now();
      const overrides: VersionOverride[] = [];
      for (const override of lineage.overrides) {
        if (comparison.conflicts.some((conflict) => overlaps(conflict.path, override.path))) continue;
        // Upstream now matches this local value; the override is no longer needed.
        if (comparison.upstreamPaths.some((path) => overlaps(path, override.path))) continue;
        overrides.push(override);
      }
      const local = working(lineage);
      for (const resolution of resolutions) {
        if (resolution.choice !== "keep_local") continue;
        const value = readPath(local, resolution.path);
        if (value === undefined) throw new VersionValidationError("A local value to keep is missing.");
        const original = lineage.overrides.find((override) => override.path === resolution.path);
        overrides.push(original ?? { path: resolution.path, value, setBy: actor.userId, setAt: at });
      }
      const next: VersionLineage = {
        ...lineage,
        baseline: { revision: revision.source.number, definition: cloneJson(revision.definition) },
        overrides,
        decisions: [...lineage.decisions, { sourceRevision: revision.source.number, choice: "adopted", resolutions, by: actor.userId, at }],
      };
      // Every override path is still writable on the new baseline, and the
      // adopted result is exactly the preview with the chosen upstream values.
      const expectedResult = cloneJson(comparison.preview);
      for (const resolution of resolutions) {
        if (resolution.choice !== "take_upstream") continue;
        try {
          writePath(expectedResult, resolution.path, readPath(revision.definition, resolution.path));
        } catch {
          throw new VersionValidationError("Adopting this revision would change local edits beyond the preview. Nothing was changed.");
        }
      }
      if (!jsonEqual(working(next), expectedResult)) {
        throw new VersionValidationError("Adopting this revision would change local edits beyond the preview. Nothing was changed.");
      }
      return save(next, input.expectedRowRevision);
    },

    /** Stay on the current baseline. Recorded so the choice is visible. */
    declineImprovement(actor: VersionActor, versionId: string, input: { revision: number; reason: string; expectedRowRevision: number }): VersionLineage {
      const lineage = loadOwned(actor, versionId, true);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      loadImprovement(lineage, input.revision);
      return save({
        ...lineage,
        decisions: [...lineage.decisions, { sourceRevision: input.revision, choice: "declined", reason: text(input.reason, "reason", 500), by: actor.userId, at: now() }],
      }, input.expectedRowRevision);
    },

    /** Release the working definition. Release numbers belong to this Version alone. */
    release(actor: VersionActor, versionId: string, input: { expectedRowRevision: number }): VersionLineage {
      const lineage = loadOwned(actor, versionId, true);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      const definition = working(lineage);
      const latest = lineage.releases.at(-1);
      if (latest && jsonEqual(latest.definition, definition)) throw new VersionValidationError("Nothing changed since the current release.");
      const number = (latest?.number ?? 0) + 1;
      return save({
        ...lineage,
        releases: [...lineage.releases, {
          number,
          definition,
          baselineRevision: lineage.baseline.revision,
          overridePaths: changedPaths(lineage.baseline.definition, definition),
          releasedBy: actor.userId,
          releasedAt: now(),
        }],
        currentRelease: number,
      }, input.expectedRowRevision);
    },

    grantAccess(actor: VersionActor, versionId: string, input: { granteeBusinessId: string; scope: VersionGrantScope; expectedRowRevision: number }): VersionLineage {
      const lineage = loadOwned(actor, versionId, true);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      if (input.scope !== "lineage" && input.scope !== "lineage_and_data") throw new VersionValidationError("Choose a supported grant scope.");
      const grants = lineage.grants.map((grant) =>
        grant.granteeBusinessId === input.granteeBusinessId && !grant.revokedAt ? { ...grant, revokedAt: now() } : grant);
      grants.push({ granteeBusinessId: input.granteeBusinessId, scope: input.scope, grantedBy: actor.userId, grantedAt: now() });
      return save({ ...lineage, grants }, input.expectedRowRevision);
    },

    revokeAccess(actor: VersionActor, versionId: string, input: { granteeBusinessId: string; expectedRowRevision: number }): VersionLineage {
      const lineage = loadOwned(actor, versionId, true);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      const grants = lineage.grants.map((grant) =>
        grant.granteeBusinessId === input.granteeBusinessId && !grant.revokedAt ? { ...grant, revokedAt: now() } : grant);
      return save({ ...lineage, grants }, input.expectedRowRevision);
    },

    /**
     * Read one Version. Members of the owning business see everything.
     * Another business (including the source author) sees nothing without an
     * active grant, and never sees bindings even with one.
     */
    readVersion(actor: VersionActor, versionId: string): VersionView {
      const lineage = store.getLineage(versionId);
      if (!lineage) throw new VersionAccessError();
      const base = {
        id: lineage.id,
        version: lineage.version,
        source: lineage.source,
        context: lineage.context,
        baselineRevision: lineage.baseline.revision,
        overrides: lineage.overrides,
        workingDefinition: working(lineage),
        releases: lineage.releases,
        currentRelease: lineage.currentRelease,
        decisions: lineage.decisions,
      };
      if (roleIn(actor, lineage.version.businessId)) {
        return cloneJson({ ...base, access: "owner" as const, bindings: lineage.bindings, localData: lineage.localData, grants: lineage.grants });
      }
      const mine = new Set(actor.memberships.map((membership) => membership.businessId));
      const grant = lineage.grants.find((item) => !item.revokedAt && mine.has(item.granteeBusinessId));
      if (!grant) throw new VersionAccessError();
      if (grant.scope === "lineage_and_data") return cloneJson({ ...base, access: grant.scope, localData: lineage.localData });
      return cloneJson({ ...base, access: grant.scope });
    },
  };
}

export type SystemVersions = ReturnType<typeof createSystemVersions>;

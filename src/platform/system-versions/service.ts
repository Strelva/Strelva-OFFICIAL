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
import { assertDeclaredPackageBehavior } from "./declarations";
import type { ConnectionOwnership, VersionStore } from "./store";
import {
  VERSION_CONTEXT_KINDS,
  VersionAccessError,
  VersionConflictError,
  VersionDeclarationError,
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
  return left === "*" || right === "*" || left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

function validPath(path: string): string {
  if (path === "*") return path;
  if (typeof path !== "string" || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(path) || path.length > 300
    || path.split(".").some(part => ["__proto__", "constructor", "prototype"].includes(part))) {
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
  // UUIDs by default so the same ids are valid in the in-memory store and in Postgres.
  const id = deps.id ?? ((_prefix: string) => globalThis.crypto.randomUUID());

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

  async function sourceVisibleTo(actor: VersionActor, source: SystemRef, businessId: string): Promise<boolean> {
    if (source.businessId === businessId) return true;
    return (await store.getSource(actor, source))?.sharedWith.includes(businessId) ?? false;
  }

  async function loadOwned(actor: VersionActor, versionId: string, manage: boolean): Promise<VersionLineage> {
    const lineage = await store.getLineage(actor, versionId);
    // Same error for missing and forbidden so IDs cannot be probed.
    if (!lineage) throw new VersionAccessError();
    if (manage) requireManage(actor, lineage.version.businessId);
    else requireMember(actor, lineage.version.businessId);
    return lineage;
  }

  async function save(actor: VersionActor, lineage: VersionLineage, expectedRowRevision: number): Promise<VersionLineage> {
    const next = { ...lineage, updatedAt: now() };
    const saved = await store.updateLineage(actor, next, expectedRowRevision);
    return saved ?? (await store.getLineage(actor, lineage.id))!;
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

  async function loadImprovement(actor: VersionActor, lineage: VersionLineage, revisionNumber: number): Promise<SourceRevision> {
    if (!(await sourceVisibleTo(actor, lineage.source, lineage.version.businessId))) throw new VersionAccessError("The source of this Version is no longer shared with this business.");
    const revision = await store.getRevision(actor, lineage.source, revisionNumber);
    if (!revision) throw new VersionValidationError("That source revision does not exist.");
    return revision;
  }

  return {
    /** Author side: publish an immutable shareable revision of a source System. */
    async publishSourceRevision(
      actor: VersionActor,
      input: { source: SystemRef; definition: JsonObject; requires?: { bindingKinds: string[] }; summary: string; label?: string },
    ): Promise<SourceRevision> {
      requireManage(actor, input.source.businessId);
      assertShareableDefinition(input.definition);
      // Non-native sources also serve product-specific draft planners (for
      // example Google listing copy). They cannot use this release path.
      // Native packages and every supplied declaration must be inspected.
      if (input.definition.kind === "internal_app" || input.definition.declaration !== undefined) {
        assertDeclaredPackageBehavior(input.definition, input.definition.declaration, input.requires?.bindingKinds ?? []);
      }
      if (!(await store.getSource(actor, input.source))) await store.putSource(actor, { source: input.source, sharedWith: [], createdAt: now() });
      const previous = (await store.listRevisions(actor, input.source)).at(-1);
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
      const stored = await store.insertRevision(actor, revision);
      return cloneJson(stored ?? revision);
    },

    /** Author side: let another business base Versions on this source. */
    async shareSource(actor: VersionActor, source: SystemRef, businessId: string): Promise<void> {
      requireManage(actor, source.businessId);
      const record = await store.getSource(actor, source);
      if (!record) throw new VersionValidationError("Publish a source revision before sharing it.");
      if (!record.sharedWith.includes(businessId)) record.sharedWith.push(businessId);
      await store.putSource(actor, record);
    },

    async unshareSource(actor: VersionActor, source: SystemRef, businessId: string): Promise<void> {
      requireManage(actor, source.businessId);
      const record = await store.getSource(actor, source);
      if (!record) return;
      record.sharedWith = record.sharedWith.filter((item) => item !== businessId);
      await store.putSource(actor, record);
    },

    /**
     * Descendant side: create a Version owned by the descendant business.
     * Only the shareable definition is copied. Bindings, data, grants and
     * people start empty and are chosen locally.
     */
    async createVersion(actor: VersionActor, input: { source: SystemRevisionRef; version: SystemRef; context: VersionContext }): Promise<VersionLineage> {
      requireManage(actor, input.version.businessId);
      if (sameSystem(input.source, input.version)) throw new VersionValidationError("A Version needs its own System identity.");
      if (!VERSION_CONTEXT_KINDS.includes(input.context.kind)) throw new VersionValidationError("Choose a supported Version context.");
      if (!(await sourceVisibleTo(actor, input.source, input.version.businessId))) throw new VersionAccessError("That source is not shared with this business.");
      const revision = await store.getRevision(actor, input.source, input.source.number);
      if (!revision || revision.source.revisionId !== input.source.revisionId) {
        throw new VersionValidationError("That source revision does not exist.");
      }
      if (await store.findLineageByVersion(actor, input.version)) throw new VersionValidationError("That System is already a Version of a source.");
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
      const stored = await store.insertLineage(actor, lineage);
      return cloneJson(stored ?? lineage);
    },

    /** Set (or with `undefined`, clear) one business-owned override. */
    async setOverride(actor: VersionActor, versionId: string, input: { path: string; value: JsonValue | undefined; expectedRowRevision: number }): Promise<VersionLineage> {
      const lineage = await loadOwned(actor, versionId, true);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      const path = validPath(input.path);
      if (path === "declaration" || path.startsWith("declaration.")) {
        throw new VersionDeclarationError("Declarations belong to the immutable source revision. Publish and adopt a new revision to change one.");
      }
      const at = now();
      const restored = lineage.overrides.find(override => override.path === "*");
      if (path === "*" || restored) {
        const definition = path === "*" ? input.value : cloneJson(restored!.value);
        if (path !== "*") writePath(definition as JsonObject, path, input.value === undefined ? readPath(lineage.baseline.definition, path) : input.value);
        if (definition !== undefined) assertShareableDefinition(definition);
        return save(actor, { ...lineage, overrides: definition === undefined ? [] : [{ path: "*", value: definition, setBy: actor.userId, setAt: at }] }, input.expectedRowRevision);
      }
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
      return save(actor, next, input.expectedRowRevision);
    },

    /**
     * Bind a live account or resource. The connection must belong to the
     * Version's own business: a source's or sibling's credentials are never
     * reused.
     */
    async bindAccount(actor: VersionActor, versionId: string, input: { kind: string; connectionId: string; expectedRowRevision: number }): Promise<VersionLineage> {
      const lineage = await loadOwned(actor, versionId, true);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      const owner = await connections.ownerOf(actor, input.connectionId);
      if (owner !== lineage.version.businessId) {
        throw new VersionAccessError("Connect an account owned by this business. Accounts from another business are never reused.");
      }
      const holder = await store.connectionHolder(actor, input.connectionId);
      if (holder && holder !== lineage.id) {
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
      return save(actor, { ...lineage, bindings }, input.expectedRowRevision);
    },

    /** Restore an immutable release into a draft. The baseline never moves
     * backward, histories stay append-only, and Live waits for approval. A
     * whole-definition override also removes fields added after that release. */
    async restoreReleaseDraft(actor: VersionActor, versionId: string, input: { releaseNumber: number; expectedRowRevision: number }): Promise<VersionLineage> {
      const lineage = await loadOwned(actor, versionId, true);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      const release = lineage.releases.find(item => item.number === input.releaseNumber);
      if (!release) throw new VersionValidationError("That release is not in this Version's History.");
      assertShareableDefinition(release.definition);
      const definition = cloneJson(release.definition);
      // Restoring old behavior never restores an old permission ceiling.
      if (lineage.baseline.definition.declaration !== undefined) definition.declaration = cloneJson(lineage.baseline.definition.declaration);
      else delete definition.declaration;
      return save(actor, { ...lineage, overrides: [{ path: "*", value: definition, setBy: actor.userId, setAt: now() }] }, input.expectedRowRevision);
    },

    async putLocalData(actor: VersionActor, versionId: string, input: { key: string; value: JsonValue; expectedRowRevision: number }): Promise<VersionLineage> {
      const lineage = await loadOwned(actor, versionId, false);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      const key = text(input.key, "data key", 120);
      return save(actor, { ...lineage, localData: { ...lineage.localData, [key]: cloneJson(input.value) } }, input.expectedRowRevision);
    },

    /** Descendant side: every newer source revision, each compared against local state. */
    async listAvailableImprovements(actor: VersionActor, versionId: string): Promise<ImprovementComparison[]> {
      const lineage = await loadOwned(actor, versionId, false);
      if (!(await sourceVisibleTo(actor, lineage.source, lineage.version.businessId))) return [];
      return (await store.listRevisions(actor, lineage.source))
        .filter((revision) => revision.source.number > lineage.baseline.revision)
        .map((revision) => {
          const { upstreamPaths: _paths, ...comparison } = compareWith(lineage, revision);
          return comparison;
        });
    },

    async compareImprovement(actor: VersionActor, versionId: string, revision: number): Promise<ImprovementComparison> {
      const lineage = await loadOwned(actor, versionId, false);
      const { upstreamPaths: _paths, ...comparison } = compareWith(lineage, await loadImprovement(actor, lineage, revision));
      return comparison;
    },

    /**
     * Adopt a source revision into the working definition. Non-overlapping
     * upstream changes apply; every conflict needs an explicit choice; missing
     * local accounts block adoption outright. Adoption never releases.
     */
    async adoptImprovement(
      actor: VersionActor,
      versionId: string,
      input: { revision: number; expectedRowRevision: number; resolutions?: VersionConflictResolution[] },
    ): Promise<VersionLineage> {
      const lineage = await loadOwned(actor, versionId, true);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      const revision = await loadImprovement(actor, lineage, input.revision);
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
      // A whole-definition local edit may retain behavior, but never old or
      // caller-expanded declaration metadata after adopting new authority.
      for (const override of next.overrides) {
        if (override.path !== "*") continue;
        const definition = override.value as JsonObject;
        if (revision.definition.declaration !== undefined) definition.declaration = cloneJson(revision.definition.declaration);
        else delete definition.declaration;
      }
      return save(actor, next, input.expectedRowRevision);
    },

    /** Stay on the current baseline. Recorded so the choice is visible. */
    async declineImprovement(actor: VersionActor, versionId: string, input: { revision: number; reason: string; expectedRowRevision: number }): Promise<VersionLineage> {
      const lineage = await loadOwned(actor, versionId, true);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      await loadImprovement(actor, lineage, input.revision);
      return save(actor, {
        ...lineage,
        decisions: [...lineage.decisions, { sourceRevision: input.revision, choice: "declined", reason: text(input.reason, "reason", 500), by: actor.userId, at: now() }],
      }, input.expectedRowRevision);
    },

    /** Release the working definition. Release numbers belong to this Version alone. */
    async release(actor: VersionActor, versionId: string, input: { expectedRowRevision: number }): Promise<VersionLineage> {
      const lineage = await loadOwned(actor, versionId, true);
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      const definition = working(lineage);
      const source = await store.getPinnedRevision(actor, lineage.id);
      if (!source || source.source.number !== lineage.baseline.revision || !sameSystem(source.source, lineage.source)
        || !jsonEqual(source.definition, lineage.baseline.definition)) throw new VersionDeclarationError("The immutable source revision could not be confirmed. Nothing was released.");
      assertDeclaredPackageBehavior(definition, source.definition.declaration, source.requires.bindingKinds);
      if (!jsonEqual(definition.declaration, source.definition.declaration)) throw new VersionDeclarationError("Local edits cannot change the source revision's declaration.");
      const missing: string[] = [];
      for (const kind of source.requires.bindingKinds) {
        const binding = lineage.bindings.find(item => item.kind === kind);
        if (!binding || binding.ownerBusinessId !== lineage.version.businessId
          || await connections.ownerOf(actor, binding.connectionId) !== lineage.version.businessId
          || await store.connectionHolder(actor, binding.connectionId) !== lineage.id) missing.push(kind);
      }
      if (missing.length) throw new VersionIncompatibleError(missing);
      const latest = lineage.releases.at(-1);
      if (latest && jsonEqual(latest.definition, definition)) throw new VersionValidationError("Nothing changed since the current release.");
      const number = (latest?.number ?? 0) + 1;
      return save(actor, {
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

    async grantAccess(actor: VersionActor, versionId: string, input: { granteeBusinessId: string; scope: VersionGrantScope; expectedRowRevision: number }): Promise<VersionLineage> {
      const lineage = await loadOwned(actor, versionId, true);
      if (roleIn(actor, lineage.version.businessId) !== "owner") throw new VersionAccessError("Only the business owner can share Version lineage or data.");
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      if (input.scope !== "lineage" && input.scope !== "lineage_and_data") throw new VersionValidationError("Choose a supported grant scope.");
      const grants = lineage.grants.map((grant) =>
        grant.granteeBusinessId === input.granteeBusinessId && !grant.revokedAt ? { ...grant, revokedAt: now() } : grant);
      grants.push({ granteeBusinessId: input.granteeBusinessId, scope: input.scope, grantedBy: actor.userId, grantedAt: now() });
      return save(actor, { ...lineage, grants }, input.expectedRowRevision);
    },

    async revokeAccess(actor: VersionActor, versionId: string, input: { granteeBusinessId: string; expectedRowRevision: number }): Promise<VersionLineage> {
      const lineage = await loadOwned(actor, versionId, true);
      if (roleIn(actor, lineage.version.businessId) !== "owner") throw new VersionAccessError("Only the business owner can change Version sharing.");
      if (lineage.rowRevision !== input.expectedRowRevision) throw new VersionStaleError();
      const grants = lineage.grants.map((grant) =>
        grant.granteeBusinessId === input.granteeBusinessId && !grant.revokedAt ? { ...grant, revokedAt: now() } : grant);
      return save(actor, { ...lineage, grants }, input.expectedRowRevision);
    },

    /**
     * Read one Version. Members of the owning business see everything.
     * Another business (including the source author) sees nothing without an
     * active grant, and never sees bindings even with one.
     */
    async readVersion(actor: VersionActor, versionId: string): Promise<VersionView> {
      const lineage = await store.getLineage(actor, versionId);
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

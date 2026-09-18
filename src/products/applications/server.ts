import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type SavedWork,
  type WorkspaceActor,
} from "@/platform/workspaces/types";
import { boundedStore, initial, type BoundedStore } from "@/platform/bounded-work/repository";
import {
  applicationCandidateSchema,
  applicationCommandSchema,
  applicationPublishInputSchema,
  applicationRehearseInputSchema,
  applicationReleaseSchema,
  applicationReviseInputSchema,
  applicationRollbackInputSchema,
  applicationRuntimeSchema,
  applicationSchema,
  applicationSpecSchema,
  applicationSubmitInputSchema,
  APPLICATION_RECORD_LIMIT,
  APPLICATION_VERSION_HISTORY_LIMIT,
  recordSchema,
  type ApplicationCandidate,
  type ApplicationRecord,
  type ApplicationRelease,
  type ApplicationRuntime,
  type ApplicationSpec,
} from "./contracts";

export {
  applicationCandidateSchema,
  applicationCommandSchema,
  applicationPublishInputSchema,
  applicationRehearseInputSchema,
  applicationReleaseSchema,
  applicationReviseInputSchema,
  applicationRollbackInputSchema,
  applicationRuntimeSchema,
  applicationSchema,
  applicationSpecSchema,
  applicationSubmitInputSchema,
  APPLICATION_RECORD_LIMIT,
  APPLICATION_VERSION_HISTORY_LIMIT,
  recordSchema,
} from "./contracts";

export {
  ApplicationUseAccessError,
  ApplicationUseConflictError,
  ApplicationUseInputError,
  ApplicationUseUnavailableError,
  applicationAccessService,
  applicationUseGrantInputSchema,
} from "./access";

type ApplicationStatus = "draft" | "installed" | "retired";
type VersionedSpec = { version: number; spec: ApplicationSpec };
type ApplicationPayload = z.infer<typeof applicationSchema>;
type ApplicationRehearsal = ApplicationCandidate["rehearsal"];

interface ApplicationState {
  candidate: ApplicationCandidate;
  versions: VersionedSpec[];
  releases: ApplicationRelease[];
  currentReleaseVersion: number | null;
  records: ApplicationRecord[];
  recordsRevision: number;
  status: ApplicationStatus;
  installation?: ApplicationPayload["installation"];
  history: ApplicationPayload["history"];
  legacyRevision: number;
}

interface ApplicationRead {
  work: SavedWork;
  state: ApplicationState;
}

type DbFailure = { message?: string; code?: string } | null;
type DbRow = Record<string, unknown>;
type ApplicationQueryResult = { data: unknown; error: DbFailure; count?: number | null };
interface ApplicationQuery {
  select(columns?: string, options?: Record<string, unknown>): ApplicationQuery;
  eq(column: string, value: unknown): ApplicationQuery;
  order(column: string, options?: Record<string, unknown>): ApplicationQuery;
  limit(count: number): ApplicationQuery;
  maybeSingle(): Promise<ApplicationQueryResult>;
  then<TResult1 = ApplicationQueryResult, TResult2 = never>(
    onfulfilled?: ((value: ApplicationQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}
type ApplicationDb = {
  from(table: string): ApplicationQuery;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: DbFailure }>;
};

/** Optional gate owned by the focused application surface. */
export type ApplicationUseAuthorization = (input: {
  actor: WorkspaceActor;
  application: SavedWork;
  release: ApplicationRelease;
}) => Promise<void> | void;

type ManagerCapableStore = BoundedStore & {
  manager?: (actor: WorkspaceActor, workspaceId: string) => Promise<void>;
};

const memoryStates = new WeakMap<BoundedStore, Map<string, ApplicationState>>();
const memoryLanes = new WeakMap<BoundedStore, Map<string, Promise<unknown>>>();

function stateMap(store: BoundedStore): Map<string, ApplicationState> {
  let states = memoryStates.get(store);
  if (!states) {
    states = new Map();
    memoryStates.set(store, states);
  }
  return states;
}

function laneMap(store: BoundedStore): Map<string, Promise<unknown>> {
  let lanes = memoryLanes.get(store);
  if (!lanes) {
    lanes = new Map();
    memoryLanes.set(store, lanes);
  }
  return lanes;
}

function durableDb(store: BoundedStore): ApplicationDb | null {
  // A caller-provided store is the explicit in-memory adapter used by focused
  // tests. The production bounded store must never silently fall back when its
  // database is missing or its release migration is unavailable.
  if (store !== boundedStore) return null;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Application storage is unavailable.");
  return client as unknown as ApplicationDb;
}

function appendVersion<T>(values: T[], value: T, message: string): T[] {
  if (values.length >= APPLICATION_VERSION_HISTORY_LIMIT) throw new WorkspaceConflictError(message);
  return [...values, value];
}

function isMissingRelation(error: DbFailure): boolean {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return detail.includes("42p01") || detail.includes("does not exist") || detail.includes("application_states");
}

function mapDbFailure(error: DbFailure, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (detail.includes("access_denied") || detail.includes("verified_identity_required")) {
    throw new WorkspaceAccessError();
  }
  if (
    detail.includes("revision_conflict") ||
    detail.includes("release_conflict") ||
    detail.includes("source_conflict") ||
    detail.includes("schema_invalid") ||
    detail.includes("record_invalid") ||
    detail.includes("rehearsal_required") ||
    detail.includes("record_duplicate") ||
    detail.includes("record_conflict") ||
    detail.includes("version_unavailable") ||
    detail.includes("history_limit") ||
    detail.includes("record_limit") ||
    detail.includes("release_publication_required")
  ) {
    throw new WorkspaceConflictError(error?.message || fallback);
  }
  throw new WorkspaceStoreError(fallback);
}

function parseRelease(value: unknown): ApplicationRelease | null {
  const parsed = applicationReleaseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseRehearsal(value: unknown): ApplicationRehearsal {
  if (value === null || value === undefined) return null;
  const parsed = applicationCandidateSchema.shape.rehearsal.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseStateFromPayload(raw: unknown): ApplicationState {
  const payload = applicationSchema.parse(raw);
  const candidate = applicationCandidateSchema.safeParse(payload.candidate).success
    ? applicationCandidateSchema.parse(payload.candidate)
    : {
      designRevision: payload.designRevision ?? payload.revision,
      specVersion: payload.specVersion,
      spec: payload.spec,
      rehearsal: payload.rehearsal,
    } satisfies ApplicationCandidate;
  const release = parseRelease(payload.release);
  const releases = (payload.releases ?? []).map(parseRelease).filter((value): value is ApplicationRelease => Boolean(value));
  if (release && !releases.some((value) => value.version === release.version)) releases.push(release);
  if (!releases.length && payload.status === "installed") {
    releases.push({
      version: payload.specVersion,
      spec: payload.spec,
      publishedAt: null,
      publishedBy: null,
      provenance: "legacy_migrated",
    });
  }
  return {
    candidate,
    versions: payload.versions,
    releases,
    currentReleaseVersion: release?.version ?? (releases.at(-1)?.version ?? null),
    records: payload.records,
    recordsRevision: payload.recordsRevision ?? payload.records.length,
    status: payload.status,
    installation: payload.installation,
    history: payload.history,
    legacyRevision: payload.revision,
  };
}

function currentRelease(state: ApplicationState): ApplicationRelease | null {
  if (state.currentReleaseVersion === null) return null;
  return state.releases.find((release) => release.version === state.currentReleaseVersion) ?? null;
}

function releaseSpec(state: ApplicationState): ApplicationSpec | null {
  return currentRelease(state)?.spec ?? null;
}

function touchLegacy(state: ApplicationState, kind: string, actor: WorkspaceActor): void {
  if (state.legacyRevision >= 2_147_483_646) throw new WorkspaceConflictError("This application has reached its revision limit.");
  state.legacyRevision += 1;
  state.history = [
    ...state.history,
    { revision: state.legacyRevision, kind, actorId: actor.userId, at: new Date().toISOString() },
  ];
  if (state.history.length > 500) state.history = state.history.slice(-500);
}

function validateRecord(spec: ApplicationSpec, record: ApplicationRecord): void {
  const fields = new Map(spec.fields.map((field) => [field.id, field]));
  for (const key of Object.keys(record.values)) {
    if (!fields.has(key)) throw new WorkspaceConflictError("This form contains unknown fields.");
  }
  for (const field of spec.fields) {
    const value = record.values[field.id];
    if (value === undefined || value === "") {
      if (field.required) throw new WorkspaceConflictError(`${field.label} is required.`);
      continue;
    }
    const expectedType = field.type === "text" ? "string" : field.type;
    if (typeof value !== expectedType) throw new WorkspaceConflictError(`${field.label} has the wrong type.`);
  }
}

function compatibilityChecks(state: ApplicationState): Array<{ name: string; passed: boolean }> {
  const specValid = applicationSpecSchema.safeParse(state.candidate.spec).success;
  const executableRejected = applicationSpecSchema.safeParse({ ...state.candidate.spec, script: "alert(1)" }).success === false;
  let recordsFit = true;
  try {
    for (const record of state.records) validateRecord(state.candidate.spec, record);
  } catch {
    recordsFit = false;
  }
  return [
    { name: "Declared fields and approved components", passed: specValid },
    { name: "Executable code rejected", passed: executableRejected },
    { name: "Existing records fit this version", passed: recordsFit },
  ];
}

function toPayload(work: SavedWork, state: ApplicationState): ApplicationPayload {
  const release = currentRelease(state);
  const candidate = applicationCandidateSchema.parse(state.candidate);
  return applicationSchema.parse({
    version: 1,
    revision: state.legacyRevision,
    title: candidate.spec.title,
    createdBy: work.createdBy,
    createdAt: work.createdAt,
    history: state.history,
    spec: candidate.spec,
    specVersion: candidate.specVersion,
    status: state.status,
    versions: state.versions,
    rehearsal: candidate.rehearsal,
    records: state.records,
    installation: state.installation,
    designRevision: candidate.designRevision,
    recordsRevision: state.recordsRevision,
    candidate,
    release,
    releases: state.releases,
  });
}

function output(work: SavedWork, state: ApplicationState): SavedWork & { payload: ApplicationPayload } {
  return { ...work, title: state.candidate.spec.title, payload: toPayload(work, state) };
}

function runtime(work: SavedWork, state: ApplicationState): ApplicationRuntime {
  const release = currentRelease(state);
  if (!release || state.status === "retired") throw new WorkspaceConflictError("This application has no usable released version.");
  return applicationRuntimeSchema.parse({
    workId: work.id,
    workspaceId: work.workspaceId,
    title: release.spec.title,
    release,
    recordsRevision: state.recordsRevision,
    records: state.records,
  });
}

function normalizeReleaseVersion(value: number | null | undefined): number | null {
  return value === undefined || value === null || value === 0 ? null : value;
}

function cloneState(state: ApplicationState): ApplicationState {
  return structuredClone(state);
}

async function withMemoryLane<T>(store: BoundedStore, id: string, callback: () => Promise<T>): Promise<T> {
  const lanes = laneMap(store);
  const prior = lanes.get(id) ?? Promise.resolve();
  const current = prior.then(callback, callback);
  const settled = current.then(() => undefined, () => undefined);
  lanes.set(id, settled);
  try {
    return await current;
  } finally {
    if (lanes.get(id) === settled) lanes.delete(id);
  }
}

async function durableRpc(db: ApplicationDb, name: string, args: Record<string, unknown>, fallback: string): Promise<unknown> {
  const result = await db.rpc(name, args);
  if (result.error) mapDbFailure(result.error, fallback);
  return result.data;
}

async function assertApplicationStorage(db: ApplicationDb): Promise<void> {
  const result = await db.from("application_states").select("work_id").limit(1);
  if (result.error) {
    if (isMissingRelation(result.error)) throw new WorkspaceStoreError("Application release storage is unavailable.");
    mapDbFailure(result.error, "Application release storage is unavailable.");
  }
}

async function readDurable(db: ApplicationDb, work: SavedWork): Promise<ApplicationState | null> {
  const stateResult = await db.from("application_states").select("*").eq("work_id", work.id).maybeSingle();
  if (stateResult.error) {
    if (isMissingRelation(stateResult.error)) throw new WorkspaceStoreError("Application release storage is unavailable.");
    mapDbFailure(stateResult.error, "Application release state is unavailable.");
  }
  if (!stateResult.data) throw new WorkspaceStoreError("Application release state is unavailable.");
  const stateRow = stateResult.data as DbRow;
  const [releaseResult, recordResult] = await Promise.all([
    db.from("application_releases").select("*").eq("work_id", work.id).order("version", { ascending: true }),
    db.from("application_records").select("*").eq("work_id", work.id).order("created_at", { ascending: true }),
  ]);
  if (releaseResult.error || recordResult.error) mapDbFailure(releaseResult.error || recordResult.error, "Application release data is unavailable.");
  const payload = applicationSchema.parse(work.payload);
  const candidateVersions = applicationSchema.shape.versions.safeParse(stateRow.candidate_versions).success
    ? applicationSchema.shape.versions.parse(stateRow.candidate_versions)
    : payload.versions;
  const candidate = applicationCandidateSchema.parse({
    designRevision: Number(stateRow.candidate_design_revision),
    specVersion: Number(stateRow.candidate_spec_version),
    spec: stateRow.candidate_spec,
    rehearsal: parseRehearsal(stateRow.candidate_rehearsal),
  });
  const releases = ((releaseResult.data ?? []) as DbRow[]).map((row) => applicationReleaseSchema.parse({
    version: Number(row.version),
    spec: row.spec,
    publishedAt: row.published_at === null || row.published_at === undefined ? null : String(row.published_at),
    publishedBy: row.published_by === null || row.published_by === undefined ? null : String(row.published_by),
    provenance: row.publication_source === "legacy_migrated" ? "legacy_migrated" : "published",
  }));
  const records = ((recordResult.data ?? []) as DbRow[]).map((row) => recordSchema.parse({ id: String(row.record_id), values: row.values }));
  return {
    candidate,
    versions: candidateVersions,
    releases,
    currentReleaseVersion: stateRow.current_release_version === null || stateRow.current_release_version === undefined ? null : Number(stateRow.current_release_version),
    records,
    recordsRevision: Number(stateRow.records_revision),
    status: stateRow.lifecycle_status === "draft" || stateRow.lifecycle_status === "installed" || stateRow.lifecycle_status === "retired"
      ? stateRow.lifecycle_status
      : payload.status,
    installation: payload.installation,
    history: payload.history,
    legacyRevision: payload.revision,
  };
}

async function load(store: BoundedStore, actor: WorkspaceActor, id: string): Promise<ApplicationRead> {
  const db = durableDb(store);
  const work = await store.read(actor, id);
  if (!work || work.productId !== "applications" || work.resourceKind !== "application") throw new WorkspaceAccessError();
  if (db) {
    const state = await readDurable(db, work);
    if (!state) throw new WorkspaceStoreError("Application release state is unavailable.");
    return { work, state };
  }
  const states = stateMap(store);
  if (states.has(id)) return { work, state: states.get(id)! };
  const state = parseStateFromPayload(work.payload);
  states.set(id, state);
  return { work, state };
}

async function saveMemory(store: BoundedStore, actor: WorkspaceActor, loaded: ApplicationRead, state: ApplicationState, kind: string): Promise<SavedWork & { payload: ApplicationPayload }> {
  touchLegacy(state, kind, actor);
  const previousPayload = applicationSchema.parse(loaded.work.payload);
  const saved = await store.update(actor, loaded.work, previousPayload.revision, toPayload(loaded.work, state));
  stateMap(store).set(saved.id, state);
  return output(saved, state);
}

async function ensureActorMember(store: BoundedStore, actor: WorkspaceActor, work: SavedWork): Promise<void> {
  await store.member(actor, work.workspaceId);
}

async function ensureManager(store: BoundedStore, actor: WorkspaceActor, work: SavedWork): Promise<void> {
  await store.member(actor, work.workspaceId);
  const managerStore = store as ManagerCapableStore;
  if (managerStore.manager) {
    await managerStore.manager(actor, work.workspaceId);
    return;
  }
  // The built-in database RPCs perform the role check against the live
  // membership row. A memory store has no role surface, so its saved owner is
  // the only trustworthy manager identity available to this service.
  if (!durableDb(store) && work.createdBy !== actor.userId) throw new WorkspaceAccessError("Application design access is required.");
}

/** Builds private initial state; persistence and plan-output receipts retain their existing transaction boundaries. */
export function createApplicationDraft(raw: unknown, actor: WorkspaceActor) {
  const spec = applicationSpecSchema.parse(raw);
  if (spec.maintenanceOwner !== actor.userId) throw new WorkspaceConflictError("The creator must own maintenance until a scoped handoff is accepted.");
  return applicationSchema.parse({
    ...initial(spec.title, actor),
    spec,
    specVersion: 1,
    status: "draft",
    versions: [{ version: 1, spec }],
    rehearsal: null,
    records: [],
  });
}

export function createApplicationService(store: BoundedStore = boundedStore) {
  const read = async (actor: WorkspaceActor, id: string) => {
    const loaded = await load(store, actor, id);
    return output(loaded.work, loaded.state);
  };

  const readRuntime = async (actor: WorkspaceActor, id: string) => {
    const loaded = await load(store, actor, id);
    return runtime(loaded.work, loaded.state);
  };

  async function create(actor: WorkspaceActor, workspaceId: string, raw: unknown) {
    const db = durableDb(store);
    await store.member(actor, workspaceId);
    if (db) await assertApplicationStorage(db);
    const payload = createApplicationDraft(raw, actor);
    const saved = await store.create(actor, workspaceId, {
      productId: "applications",
      resourceKind: "application",
      title: payload.spec.title,
      payload,
    });
    const state = parseStateFromPayload(saved.payload);
    if (!db) stateMap(store).set(saved.id, state);
    return output(saved, state);
  }

  async function fromSource(actor: WorkspaceActor, workspaceId: string, sourceWorkId: string) {
    const db = durableDb(store);
    await store.member(actor, workspaceId);
    const source = await load(store, actor, sourceWorkId);
    await ensureActorMember(store, actor, source.work);
    const sourceSpec = releaseSpec(source.state);
    if (!sourceSpec || source.state.status === "retired") throw new WorkspaceConflictError("Only an installed application version can be reused.");
    const spec = applicationSpecSchema.parse({ ...sourceSpec, maintenanceOwner: actor.userId });
    const payload = applicationSchema.parse({
      ...initial(spec.title, actor),
      spec,
      specVersion: 1,
      status: "draft",
      versions: [{ version: 1, spec }],
      rehearsal: null,
      records: [],
      installation: { sourceWorkId, sourceVersion: source.state.currentReleaseVersion ?? 1, baseSpec: spec },
    });
    const saved = await store.create(actor, workspaceId, {
      productId: "applications",
      resourceKind: "application",
      title: spec.title,
      payload,
      sourceWorkId,
    });
    const state = parseStateFromPayload(saved.payload);
    if (!db) stateMap(store).set(saved.id, state);
    return output(saved, state);
  }

  async function revise(actor: WorkspaceActor, id: string, raw: unknown) {
    const input = applicationReviseInputSchema.parse(raw);
    const db = durableDb(store);
    const permission = await load(store, actor, id);
    await ensureManager(store, actor, permission.work);
    if (db) {
      await durableRpc(db, "update_application_candidate", {
        p_work_id: id,
        p_workspace_id: permission.work.workspaceId,
        p_expected_design_revision: input.expectedDesignRevision,
        p_user_id: actor.userId,
        p_verified_email: actor.verifiedEmail,
        p_spec: input.spec,
      }, "The application candidate could not be updated.");
      return read(actor, id);
    }
    return withMemoryLane(store, id, async () => {
      const loaded = await load(store, actor, id);
      if (loaded.state.candidate.designRevision !== input.expectedDesignRevision) throw new WorkspaceConflictError("This application candidate changed. Reload before editing it.");
      const state = cloneState(loaded.state);
      if (input.spec.maintenanceOwner !== state.candidate.spec.maintenanceOwner) {
        throw new WorkspaceConflictError("Changing maintenance responsibility requires an accepted handoff.");
      }
      state.candidate = {
        designRevision: input.expectedDesignRevision + 1,
        specVersion: state.candidate.specVersion + 1,
        spec: input.spec,
        rehearsal: null,
      };
      state.versions = appendVersion(state.versions, { version: state.candidate.specVersion, spec: input.spec }, "This application has reached its candidate history limit.");
      state.status = state.currentReleaseVersion === null ? "draft" : "draft";
      return saveMemory(store, actor, loaded, state, "revise_candidate");
    });
  }

  async function rehearse(actor: WorkspaceActor, id: string, raw: unknown) {
    const input = applicationRehearseInputSchema.parse(raw);
    const db = durableDb(store);
    const permission = await load(store, actor, id);
    await ensureManager(store, actor, permission.work);
    if (db) {
      await durableRpc(db, "rehearse_application_candidate", {
        p_work_id: id,
        p_workspace_id: permission.work.workspaceId,
        p_expected_design_revision: input.expectedDesignRevision,
        p_user_id: actor.userId,
        p_verified_email: actor.verifiedEmail,
      }, "The application candidate could not be rehearsed.");
      return read(actor, id);
    }
    return withMemoryLane(store, id, async () => {
      const loaded = await load(store, actor, id);
      if (loaded.state.candidate.designRevision !== input.expectedDesignRevision) throw new WorkspaceConflictError("This application candidate changed. Reload before rehearsing it.");
      const state = cloneState(loaded.state);
      state.candidate.rehearsal = { specVersion: state.candidate.specVersion, checks: compatibilityChecks(state) };
      return saveMemory(store, actor, loaded, state, "rehearse_candidate");
    });
  }

  async function publish(actor: WorkspaceActor, id: string, raw: unknown) {
    const input = applicationPublishInputSchema.parse(raw);
    const db = durableDb(store);
    const permission = await load(store, actor, id);
    await ensureManager(store, actor, permission.work);
    if (db) {
      await durableRpc(db, "publish_application_candidate", {
        p_work_id: id,
        p_workspace_id: permission.work.workspaceId,
        p_expected_candidate_revision: input.expectedCandidateRevision,
        p_expected_release_version: normalizeReleaseVersion(input.expectedReleaseVersion),
        p_user_id: actor.userId,
        p_verified_email: actor.verifiedEmail,
      }, "The application candidate could not be published.");
      return read(actor, id);
    }
    return withMemoryLane(store, id, async () => {
      const loaded = await load(store, actor, id);
      const state = cloneState(loaded.state);
      if (state.candidate.designRevision !== input.expectedCandidateRevision) throw new WorkspaceConflictError("This application candidate changed. Reload before publishing it.");
      if (state.currentReleaseVersion !== normalizeReleaseVersion(input.expectedReleaseVersion)) throw new WorkspaceConflictError("This application release changed. Reload before publishing it.");
      if (!state.candidate.rehearsal || state.candidate.rehearsal.specVersion !== state.candidate.specVersion || state.candidate.rehearsal.checks.some((check) => !check.passed)) {
        throw new WorkspaceConflictError("Run a passing rehearsal for this candidate first.");
      }
      // Recheck under the same lane as submit. A record accepted before this
      // lock is included; a record after it sees the new release version.
      for (const record of state.records) validateRecord(state.candidate.spec, record);
      const nextVersion = Math.max(0, ...state.releases.map((release) => release.version)) + 1;
      const release = applicationReleaseSchema.parse({
        version: nextVersion,
        spec: state.candidate.spec,
        publishedAt: new Date().toISOString(),
        publishedBy: actor.userId,
        provenance: "published",
      });
      state.releases = appendVersion(state.releases, release, "This application has reached its release history limit.");
      state.currentReleaseVersion = release.version;
      state.status = "installed";
      return saveMemory(store, actor, loaded, state, "publish_candidate");
    });
  }

  async function rollback(actor: WorkspaceActor, id: string, raw: unknown) {
    const input = applicationRollbackInputSchema.parse(raw);
    const db = durableDb(store);
    const permission = await load(store, actor, id);
    await ensureManager(store, actor, permission.work);
    if (db) {
      await durableRpc(db, "rollback_application_release", {
        p_work_id: id,
        p_workspace_id: permission.work.workspaceId,
        p_expected_design_revision: input.expectedDesignRevision,
        p_expected_release_version: normalizeReleaseVersion(input.expectedReleaseVersion),
        p_target_release_version: input.version,
        p_user_id: actor.userId,
        p_verified_email: actor.verifiedEmail,
      }, "The application release could not be rolled back.");
      return read(actor, id);
    }
    return withMemoryLane(store, id, async () => {
      const loaded = await load(store, actor, id);
      const state = cloneState(loaded.state);
      if (state.candidate.designRevision !== input.expectedDesignRevision) throw new WorkspaceConflictError("This application candidate changed. Reload before rolling it back.");
      if (state.currentReleaseVersion !== normalizeReleaseVersion(input.expectedReleaseVersion)) throw new WorkspaceConflictError("This application release changed. Reload before rolling it back.");
      const target = state.releases.find((release) => release.version === input.version);
      if (!target) throw new WorkspaceConflictError("That released application version is unavailable.");
      for (const record of state.records) validateRecord(target.spec, record);
      state.currentReleaseVersion = target.version;
      state.candidate = {
        designRevision: state.candidate.designRevision + 1,
        specVersion: state.candidate.specVersion + 1,
        spec: target.spec,
        rehearsal: null,
      };
      state.versions = appendVersion(state.versions, { version: state.candidate.specVersion, spec: target.spec }, "This application has reached its candidate history limit.");
      state.status = "installed";
      return saveMemory(store, actor, loaded, state, "rollback_release");
    });
  }

  async function submit(actor: WorkspaceActor, id: string, raw: unknown, authorize?: ApplicationUseAuthorization) {
    const input = applicationSubmitInputSchema.parse(raw);
    const db = durableDb(store);
    if (db) {
      const loaded = await load(store, actor, id);
      const release = currentRelease(loaded.state);
      if (!release) throw new WorkspaceConflictError("This application has no usable released version.");
      if (authorize) await authorize({ actor, application: loaded.work, release });
      await durableRpc(db, "submit_application_record", {
        p_work_id: id,
        p_workspace_id: loaded.work.workspaceId,
        p_expected_release_version: input.expectedReleaseVersion,
        p_expected_records_revision: input.expectedRecordsRevision,
        p_record_id: input.record.id,
        p_values: input.record.values,
        p_user_id: actor.userId,
        p_verified_email: actor.verifiedEmail,
      }, "The application record could not be saved.");
      return readRuntime(actor, id);
    }
    return withMemoryLane(store, id, async () => {
      const loaded = await load(store, actor, id);
      const state = cloneState(loaded.state);
      const release = currentRelease(state);
      if (!release || state.status === "retired") throw new WorkspaceConflictError("This application has no usable released version.");
      if (release.version !== input.expectedReleaseVersion) throw new WorkspaceConflictError("This application release changed. Reload before submitting.");
      if (state.recordsRevision !== input.expectedRecordsRevision) throw new WorkspaceConflictError("These records changed. Reload before submitting.");
      if (state.records.some((record) => record.id === input.record.id)) throw new WorkspaceConflictError("That record already exists.");
      if (state.records.length >= APPLICATION_RECORD_LIMIT) throw new WorkspaceConflictError("This application has reached its record limit.");
      if (authorize) await authorize({ actor, application: loaded.work, release });
      validateRecord(release.spec, input.record);
      state.records = [...state.records, input.record];
      state.recordsRevision += 1;
      const saved = await saveMemory(store, actor, loaded, state, "submit_record");
      return runtime(saved, state);
    });
  }

  async function command(actor: WorkspaceActor, id: string, raw: unknown) {
    const command = applicationCommandSchema.parse(raw);
    if (command.kind === "publish") {
      return publish(actor, id, {
        expectedCandidateRevision: command.expectedCandidateRevision,
        expectedReleaseVersion: command.expectedReleaseVersion,
      });
    }
    if (command.kind === "rollback_release") {
      return rollback(actor, id, {
        expectedDesignRevision: command.expectedDesignRevision,
        expectedReleaseVersion: command.expectedReleaseVersion,
        version: command.version,
      });
    }
    if (command.kind === "submit" && command.expectedReleaseVersion !== undefined && command.expectedRecordsRevision !== undefined) {
      await submit(actor, id, { expectedReleaseVersion: command.expectedReleaseVersion, expectedRecordsRevision: command.expectedRecordsRevision, record: command.record });
      return read(actor, id);
    }

    // Translate the aggregate-revision dashboard commands into the durable
    // lifecycle RPCs when Postgres is available. The old revision is checked
    // before translation so stale dashboard links retain their conflict UX.
    if (durableDb(store)) {
      const loaded = await load(store, actor, id);
      if (command.kind !== "submit") await ensureManager(store, actor, loaded.work);
      const aggregateRevision = "expectedRevision" in command ? command.expectedRevision : undefined;
      const designRevision = "expectedDesignRevision" in command ? command.expectedDesignRevision : undefined;
      if (aggregateRevision !== undefined) {
        if (loaded.state.legacyRevision !== aggregateRevision) throw new WorkspaceConflictError("This work changed. Reload before trying again.");
      } else if (designRevision !== undefined && loaded.state.candidate.designRevision !== designRevision) {
        throw new WorkspaceConflictError("This application candidate changed. Reload before trying again.");
      }
      if (command.kind === "revise") return revise(actor, id, { expectedDesignRevision: loaded.state.candidate.designRevision, spec: command.spec });
      if (command.kind === "rehearse") return rehearse(actor, id, { expectedDesignRevision: loaded.state.candidate.designRevision });
      if (command.kind === "install") return publish(actor, id, { expectedCandidateRevision: loaded.state.candidate.designRevision, expectedReleaseVersion: loaded.state.currentReleaseVersion });
      if (command.kind === "retire") {
        await durableRpc(durableDb(store)!, "retire_application", {
          p_work_id: id,
          p_workspace_id: loaded.work.workspaceId,
          p_expected_design_revision: loaded.state.candidate.designRevision,
          p_user_id: actor.userId,
          p_verified_email: actor.verifiedEmail,
        }, "The application could not be retired.");
        return read(actor, id);
      }
      if (command.kind === "rollback") {
        const version = loaded.state.versions.find((value) => value.version === command.version);
        if (!version) throw new WorkspaceConflictError("That application version is unavailable.");
        return revise(actor, id, { expectedDesignRevision: loaded.state.candidate.designRevision, spec: version.spec });
      }
      if (command.kind === "submit") {
        const release = currentRelease(loaded.state);
        if (!release) throw new WorkspaceConflictError("This application is not accepting records.");
        await submit(actor, id, { expectedReleaseVersion: release.version, expectedRecordsRevision: loaded.state.recordsRevision, record: command.record });
        return read(actor, id);
      }
      if (command.kind === "adopt_update") {
        if (!loaded.state.installation) throw new WorkspaceConflictError("This application has no reusable source.");
        await durableRpc(durableDb(store)!, "adopt_application_source_update", {
          p_work_id: id,
          p_workspace_id: loaded.work.workspaceId,
          p_user_id: actor.userId,
          p_verified_email: actor.verifiedEmail,
          p_expected_revision: command.expectedRevision,
          p_source_work_id: loaded.state.installation.sourceWorkId,
          p_source_version: command.sourceVersion,
        }, "The application source update could not be applied.");
        return read(actor, id);
      }
    }

    return withMemoryLane(store, id, async () => {
      const loaded = await load(store, actor, id);
      if (command.kind !== "submit") await ensureManager(store, actor, loaded.work);
      const state = cloneState(loaded.state);
      const aggregateRevision = "expectedRevision" in command ? command.expectedRevision : undefined;
      const designRevision = "expectedDesignRevision" in command ? command.expectedDesignRevision : undefined;
      if (aggregateRevision !== undefined) {
        if (state.legacyRevision !== aggregateRevision) throw new WorkspaceConflictError("This work changed. Reload before trying again.");
      } else if (designRevision !== undefined && state.candidate.designRevision !== designRevision) {
        throw new WorkspaceConflictError("This application candidate changed. Reload before trying again.");
      }

      if (command.kind === "adopt_update") {
        if (!state.installation) throw new WorkspaceConflictError("This application has no reusable source.");
        const source = await load(store, actor, state.installation.sourceWorkId);
        await ensureActorMember(store, actor, source.work);
        const sourceRelease = source.state.releases.find((release) => release.version === command.sourceVersion);
        if (!sourceRelease || source.state.currentReleaseVersion !== command.sourceVersion || source.state.status === "retired") {
          throw new WorkspaceConflictError("The selected source version is not currently available for installation.");
        }
        if (state.installation.sourceVersion === command.sourceVersion) throw new WorkspaceConflictError("This source version is already installed.");
        const base = state.installation.baseSpec;
        const remote = applicationSpecSchema.parse({ ...sourceRelease.spec, maintenanceOwner: state.candidate.spec.maintenanceOwner });
        function merge<T>(previous: T, local: T, incoming: T): T {
          const changed = JSON.stringify(local) !== JSON.stringify(previous);
          if (changed && JSON.stringify(incoming) !== JSON.stringify(previous) && JSON.stringify(local) !== JSON.stringify(incoming)) {
            throw new WorkspaceConflictError("This source update conflicts with local changes. Keep the current version until those changes are reconciled.");
          }
          return changed ? local : incoming;
        }
        const spec = applicationSpecSchema.parse({
          title: merge(base.title, state.candidate.spec.title, remote.title),
          maintenanceOwner: state.candidate.spec.maintenanceOwner,
          fields: merge(base.fields, state.candidate.spec.fields, remote.fields),
          components: merge(base.components, state.candidate.spec.components, remote.components),
        });
        for (const record of state.records) validateRecord(spec, record);
        state.candidate = { designRevision: state.candidate.designRevision + 1, specVersion: state.candidate.specVersion + 1, spec, rehearsal: null };
        state.versions = appendVersion(state.versions, { version: state.candidate.specVersion, spec }, "This application has reached its candidate history limit.");
        state.installation = { ...state.installation, sourceVersion: command.sourceVersion, baseSpec: remote };
        state.status = "draft";
        return saveMemory(store, actor, loaded, state, "adopt_update");
      }
      if (command.kind === "revise") {
        // The compatibility command preserves the old dashboard contract and
        // rejects data-breaking edits immediately. The explicit revise method
        // allows a candidate to be rehearsed and rejected at publication.
        for (const record of state.records) validateRecord(command.spec, record);
        if (command.spec.maintenanceOwner !== state.candidate.spec.maintenanceOwner) throw new WorkspaceConflictError("Changing maintenance responsibility requires an accepted handoff.");
        state.candidate = { designRevision: state.candidate.designRevision + 1, specVersion: state.candidate.specVersion + 1, spec: command.spec, rehearsal: null };
        state.versions = appendVersion(state.versions, { version: state.candidate.specVersion, spec: command.spec }, "This application has reached its candidate history limit.");
        state.status = "draft";
        return saveMemory(store, actor, loaded, state, "revise");
      }
      if (command.kind === "rehearse") {
        state.candidate.rehearsal = { specVersion: state.candidate.specVersion, checks: compatibilityChecks(state) };
        return saveMemory(store, actor, loaded, state, "rehearse");
      }
      if (command.kind === "install") {
        if (!state.candidate.rehearsal || state.candidate.rehearsal.specVersion !== state.candidate.specVersion || state.candidate.rehearsal.checks.some((check) => !check.passed)) throw new WorkspaceConflictError("Run a passing rehearsal for this version first.");
        for (const record of state.records) validateRecord(state.candidate.spec, record);
        const nextVersion = Math.max(0, ...state.releases.map((release) => release.version)) + 1;
        const release = applicationReleaseSchema.parse({ version: nextVersion, spec: state.candidate.spec, publishedAt: new Date().toISOString(), publishedBy: actor.userId, provenance: "published" });
        state.releases = appendVersion(state.releases, release, "This application has reached its release history limit.");
        state.currentReleaseVersion = release.version;
        state.status = "installed";
        return saveMemory(store, actor, loaded, state, "install");
      }
      if (command.kind === "retire") {
        state.status = "retired";
        return saveMemory(store, actor, loaded, state, "retire");
      }
      if (command.kind === "rollback") {
        const spec = state.versions.find((value) => value.version === command.version)?.spec;
        if (!spec) throw new WorkspaceConflictError("That application version is unavailable.");
        if (spec.maintenanceOwner !== state.candidate.spec.maintenanceOwner) throw new WorkspaceConflictError("Changing maintenance responsibility requires an accepted handoff.");
        for (const record of state.records) validateRecord(spec, record);
        state.candidate = { designRevision: state.candidate.designRevision + 1, specVersion: state.candidate.specVersion + 1, spec, rehearsal: null };
        state.versions = appendVersion(state.versions, { version: state.candidate.specVersion, spec }, "This application has reached its candidate history limit.");
        state.status = "draft";
        return saveMemory(store, actor, loaded, state, "rollback");
      }
      if (command.kind === "submit") {
        const spec = releaseSpec(state);
        if (!spec || state.status === "retired") throw new WorkspaceConflictError("This application is not accepting records.");
        if (state.records.some((record) => record.id === command.record.id)) throw new WorkspaceConflictError("That record already exists.");
        if (state.records.length >= APPLICATION_RECORD_LIMIT) throw new WorkspaceConflictError("This application has reached its record limit.");
        validateRecord(spec, command.record);
        state.records = [...state.records, command.record];
        state.recordsRevision += 1;
        const saved = await saveMemory(store, actor, loaded, state, "submit");
        return output(saved, state);
      }
      throw new WorkspaceConflictError("This application command is unavailable.");
    });
  }

  return {
    read,
    readRuntime,
    create,
    fromSource,
    revise,
    rehearse,
    publish,
    rollback,
    submit,
    command,
  };
}

export type ApplicationService = ReturnType<typeof createApplicationService>;

export const {
  create: createWorkspaceApplication,
  fromSource: createWorkspaceApplicationFromSource,
  read: readWorkspaceApplication,
  readRuntime: readWorkspaceApplicationRuntime,
  revise: reviseWorkspaceApplication,
  rehearse: rehearseWorkspaceApplication,
  publish: publishWorkspaceApplication,
  rollback: rollbackWorkspaceApplication,
  submit: submitWorkspaceApplicationRecord,
  command: changeWorkspaceApplication,
} = createApplicationService();

// Names used by the focused application surface are intentionally explicit.
export const readApplication = readWorkspaceApplication;
export const readApplicationRuntime = readWorkspaceApplicationRuntime;
export const reviseApplication = reviseWorkspaceApplication;
export const rehearseApplication = rehearseWorkspaceApplication;
export const publishApplication = publishWorkspaceApplication;
export const rollbackApplication = rollbackWorkspaceApplication;
export const submitApplicationRecord = submitWorkspaceApplicationRecord;

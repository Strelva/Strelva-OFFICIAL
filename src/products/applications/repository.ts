import { getSupabase } from "@/lib/db/client";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  WORKSPACE_EXIT_RESOURCES_STOPPED_MESSAGE,
  WORKSPACE_EXIT_STOPPED_MESSAGE,
  type SavedWork,
  type WorkspaceActor,
} from "@/platform/workspaces/types";
import { boundedStore, type BoundedStore } from "@/platform/bounded-work/repository";
import {
  applicationCandidateSchema,
  applicationReleaseSchema,
  applicationRuntimeSchema,
  applicationSchema,
  recordSchema,
  type ApplicationCandidate,
  type ApplicationRelease,
  type ApplicationRuntime,
} from "./contracts";
import {
  currentRelease,
  type ApplicationPayload,
  type ApplicationRehearsal,
  type ApplicationState,
} from "./domain";

/** Canonical storage and compatibility projections; never an alternate production authority. */
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

const memoryStates = new WeakMap<BoundedStore, Map<string, ApplicationState>>();

const memoryLanes = new WeakMap<BoundedStore, Map<string, Promise<unknown>>>();

export function stateMap(store: BoundedStore): Map<string, ApplicationState> {
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

export function durableDb(store: BoundedStore): ApplicationDb | null {
  // A caller-provided store is the explicit in-memory adapter used by focused
  // tests. The production bounded store must never silently fall back when its
  // database is missing or its release migration is unavailable.
  if (store !== boundedStore) return null;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Application storage is unavailable.");
  return client as unknown as ApplicationDb;
}

function isMissingRelation(error: DbFailure): boolean {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return detail.includes("42p01") || detail.includes("does not exist") || detail.includes("application_states");
}

function mapDbFailure(error: DbFailure, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (detail.includes("access_denied") || detail.includes("agency_application_draft_edit_denied") || detail.includes("verified_identity_required")) {
    throw new WorkspaceAccessError();
  }
  if (detail.includes("workspace_exit_future_work_blocked")) {
    throw new WorkspaceConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
  }
  if (detail.includes("workspace_exit_resource_stopped")) {
    throw new WorkspaceConflictError(WORKSPACE_EXIT_RESOURCES_STOPPED_MESSAGE);
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

export function parseStateFromPayload(raw: unknown): ApplicationState {
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

function touchLegacy(state: ApplicationState, kind: string, actor: WorkspaceActor): void {
  if (state.legacyRevision >= 2_147_483_646) throw new WorkspaceConflictError("This application has reached its revision limit.");
  state.legacyRevision += 1;
  state.history = [
    ...state.history,
    { revision: state.legacyRevision, kind, actorId: actor.userId, at: new Date().toISOString() },
  ];
  if (state.history.length > 500) state.history = state.history.slice(-500);
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

export function output(work: SavedWork, state: ApplicationState): SavedWork & { payload: ApplicationPayload } {
  return { ...work, title: state.candidate.spec.title, payload: toPayload(work, state) };
}

export function runtime(work: SavedWork, state: ApplicationState): ApplicationRuntime {
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

export async function withMemoryLane<T>(store: BoundedStore, id: string, callback: () => Promise<T>): Promise<T> {
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

export async function durableRpc(db: ApplicationDb, name: string, args: Record<string, unknown>, fallback: string): Promise<unknown> {
  const result = await db.rpc(name, args);
  if (result.error) mapDbFailure(result.error, fallback);
  return result.data;
}

export async function assertApplicationStorage(db: ApplicationDb): Promise<void> {
  const result = await db.from("application_states").select("work_id").limit(1);
  if (result.error) {
    if (isMissingRelation(result.error)) throw new WorkspaceStoreError("Application release storage is unavailable.");
    mapDbFailure(result.error, "Application release storage is unavailable.");
  }
}

async function readDurable(db: ApplicationDb, work: SavedWork): Promise<ApplicationState> {
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

export async function load(store: BoundedStore, actor: WorkspaceActor, id: string): Promise<ApplicationRead> {
  const db = durableDb(store);
  const work = await store.read(actor, id);
  if (!work || work.productId !== "applications" || work.resourceKind !== "application") throw new WorkspaceAccessError();
  if (db) {
    const state = await readDurable(db, work);
    return { work, state };
  }
  const states = stateMap(store);
  if (states.has(id)) return { work, state: states.get(id)! };
  const state = parseStateFromPayload(work.payload);
  states.set(id, state);
  return { work, state };
}

export async function saveMemory(store: BoundedStore, actor: WorkspaceActor, loaded: ApplicationRead, state: ApplicationState, kind: string): Promise<SavedWork & { payload: ApplicationPayload }> {
  touchLegacy(state, kind, actor);
  const previousPayload = applicationSchema.parse(loaded.work.payload);
  const saved = await store.update(actor, loaded.work, previousPayload.revision, toPayload(loaded.work, state));
  stateMap(store).set(saved.id, state);
  return output(saved, state);
}

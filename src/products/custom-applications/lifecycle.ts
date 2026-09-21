import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { boundedStore, type BoundedStore } from "@/platform/bounded-work/repository";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  WORKSPACE_EXIT_RESOURCES_STOPPED_MESSAGE,
  WORKSPACE_EXIT_STOPPED_MESSAGE,
  type SavedWork,
  type WorkspaceActor,
} from "@/platform/workspaces/types";
import { buildCustomApplication, type CustomApplicationArtifact } from "./build";
import {
  CUSTOM_APPLICATION_PRODUCT,
  CUSTOM_APPLICATION_RESOURCE_KIND,
  customApplicationArtifactSummarySchema,
  customApplicationBudgetSchema,
  customApplicationBudgetBindingSchema,
  customApplicationBuildInputSchema,
  customApplicationCreateInputSchema,
  customApplicationFilesSchema,
  customApplicationGrantInputSchema,
  customApplicationGrantSchema,
  customApplicationReleaseInputSchema,
  customApplicationReleaseSchema,
  customApplicationReviewInputSchema,
  customApplicationReviewSchema,
  customApplicationReviseInputSchema,
  customApplicationRollbackInputSchema,
  customApplicationSchema,
  customApplicationPreviewSchema,
  customApplicationUseSchema,
  type CustomApplication,
  type CustomApplicationArtifactSummary,
  type CustomApplicationBudget,
  type CustomApplicationBudgetBinding,
  type CustomApplicationCandidate,
  type CustomApplicationCreateInput,
  type CustomApplicationGrant,
  type CustomApplicationRelease,
  type CustomApplicationReview,
  type CustomApplicationPreview,
  type CustomApplicationUse,
} from "./contracts";

export class CustomApplicationAccessError extends WorkspaceAccessError {
  constructor(message = "Custom application access denied") { super(message); this.name = "CustomApplicationAccessError"; }
}
export class CustomApplicationConflictError extends WorkspaceConflictError {
  constructor(message = "The custom application changed. Reload before continuing.") { super(message); this.name = "CustomApplicationConflictError"; }
}
export class CustomApplicationBuildError extends WorkspaceStoreError {
  constructor(message = "The custom application build could not be confirmed.") { super(message); this.name = "CustomApplicationBuildError"; }
}
export class CustomApplicationBudgetRecoveryError extends CustomApplicationConflictError {
  constructor(readonly workId: string, readonly budget: CustomApplicationBudget, message = "Budget admission did not finish. Reopen this draft to retry the same workspace work.") {
    super(message);
    this.name = "CustomApplicationBudgetRecoveryError";
  }
}

export interface CustomBuildTarget {
  workspaceId: string;
  workId: string;
  version: number;
  maximumCents: number;
  jobId: string;
}

export interface CustomBuildAdmission {
  ensureBudget(
    actor: WorkspaceActor,
    target: { workspaceId: string; workId: string },
    budget: CustomApplicationBudget,
  ): Promise<CustomApplicationBudgetBinding>;
  execute<T>(
    actor: WorkspaceActor,
    target: CustomBuildTarget,
    perform: () => Promise<T>,
    recheck?: () => Promise<void>,
  ): Promise<{ disposition: "performed" | "replayed"; value?: T }>;
}

export interface CustomApplicationLifecycleOptions {
  build?: (input: unknown) => Promise<CustomApplicationArtifact>;
  economics?: CustomBuildAdmission;
  now?: () => Date;
}

type CustomApplicationState = {
  workId: string;
  workspaceId: string;
  maintenanceOwner: string;
  candidate: CustomApplicationCandidate;
  artifacts: Map<number, CustomApplicationArtifact>;
  reviews: Map<number, CustomApplicationReview>;
  releases: CustomApplicationRelease[];
  currentReleaseVersion: number | null;
  budget: CustomApplicationBudgetBinding | null;
  status: CustomApplication["status"];
  workRevision: number;
  updatedAt: string;
};

type DbFailure = { message?: string; code?: string } | null;
type DbResult = { data: unknown; error: DbFailure };
type CustomDb = {
  rpc(name: string, args: Record<string, unknown>): Promise<DbResult>;
};

const memoryStates = new WeakMap<BoundedStore, Map<string, CustomApplicationState>>();
const memoryWorks = new WeakMap<BoundedStore, Map<string, SavedWork>>();
const memoryGrants = new WeakMap<BoundedStore, Map<string, CustomApplicationGrant>>();
const memoryLanes = new WeakMap<BoundedStore, Map<string, Promise<unknown>>>();
const memoryExecutions = new WeakMap<BoundedStore, Map<string, { value?: unknown }>>();

function mapFor<T>(collection: WeakMap<BoundedStore, Map<string, T>>, store: BoundedStore): Map<string, T> {
  let value = collection.get(store);
  if (!value) {
    value = new Map();
    collection.set(store, value);
  }
  return value;
}

function durableDb(store: BoundedStore): CustomDb | null {
  if (store !== boundedStore) return null;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Custom application storage is unavailable.");
  return client as unknown as CustomDb;
}

function nowIso(now: () => Date): string { return now().toISOString(); }

export function customApplicationSourceDigest(files: Record<string, string>): string {
  return createHash("sha256")
    .update(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))))
    .digest("hex");
}

function summary(artifact: CustomApplicationArtifact, review: CustomApplicationReview | null): CustomApplicationArtifactSummary {
  return customApplicationArtifactSummarySchema.parse({
    applicationVersion: artifact.applicationVersion,
    sourceDigest: artifact.sourceDigest,
    artifactDigest: artifact.artifactDigest,
    image: artifact.image,
    builtAt: artifact.builtAt,
    durationMs: artifact.durationMs,
    state: artifact.state,
    limits: artifact.limits,
    review,
  });
}

function candidate(state: CustomApplicationState): CustomApplicationCandidate {
  const artifact = state.artifacts.get(state.candidate.version);
  return {
    ...state.candidate,
    artifact: artifact ? summary(artifact, state.reviews.get(artifact.applicationVersion) ?? null) : null,
  };
}

function projection(work: SavedWork, state: CustomApplicationState): Record<string, unknown> {
  const app = toApplication(work, state);
  const previous = (work.payload && typeof work.payload === "object" && !Array.isArray(work.payload))
    ? work.payload as Record<string, unknown> : {};
  const history = Array.isArray(previous.history) ? previous.history : [];
  return {
    version: 1,
    revision: state.workRevision,
    title: state.candidate.title,
    createdBy: work.createdBy,
    createdAt: work.createdAt,
    history,
    product: CUSTOM_APPLICATION_PRODUCT,
    status: app.status,
    maintenanceOwner: app.maintenanceOwner,
    candidate: app.candidate,
    currentReleaseVersion: app.currentReleaseVersion,
    releases: app.releases,
    budget: app.budget,
    updatedAt: app.updatedAt,
  };
}

function toApplication(work: SavedWork, state: CustomApplicationState): CustomApplication {
  return customApplicationSchema.parse({
    version: 1,
    workId: work.id,
    workspaceId: work.workspaceId,
    title: state.candidate.title,
    maintenanceOwner: state.maintenanceOwner,
    status: state.status,
    candidate: candidate(state),
    currentReleaseVersion: state.currentReleaseVersion,
    releases: state.releases,
    budget: state.budget,
    updatedAt: state.updatedAt,
  });
}

function cloneState(state: CustomApplicationState): CustomApplicationState {
  return {
    ...state,
    candidate: structuredClone(state.candidate),
    artifacts: new Map([...state.artifacts.entries()].map(([key, value]) => [key, structuredClone(value)])),
    reviews: new Map([...state.reviews.entries()].map(([key, value]) => [key, structuredClone(value)])),
    releases: structuredClone(state.releases),
    budget: state.budget ? structuredClone(state.budget) : null,
  };
}

function makeState(workId: string, workspaceId: string, actor: WorkspaceActor, input: CustomApplicationCreateInput, now: () => Date): CustomApplicationState {
  const parsedFiles = customApplicationFilesSchema.parse(input.files);
  const owner = input.maintenanceOwner ?? actor.userId;
  if (owner !== actor.userId) throw new CustomApplicationConflictError("The creator must own maintenance until a scoped handoff is accepted.");
  return {
    workId,
    workspaceId,
    maintenanceOwner: owner,
    candidate: {
      revision: 0,
      version: 1,
      title: input.title,
      files: parsedFiles,
      sourceDigest: customApplicationSourceDigest(parsedFiles),
      artifact: null,
    },
    artifacts: new Map(),
    reviews: new Map(),
    releases: [],
    currentReleaseVersion: null,
    budget: null,
    status: "draft",
    workRevision: 0,
    updatedAt: nowIso(now),
  };
}

function mapRpcFailure(error: DbFailure): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (/custom_application_(access_denied|recipient_denied|maintenance_denied)|verified_identity_required|workspace_access_denied/.test(detail)) throw new CustomApplicationAccessError();
  if (detail.includes("workspace_exit_future_work_blocked")) throw new CustomApplicationConflictError(WORKSPACE_EXIT_STOPPED_MESSAGE);
  if (detail.includes("workspace_exit_resource_stopped")) throw new CustomApplicationConflictError(WORKSPACE_EXIT_RESOURCES_STOPPED_MESSAGE);
  if (/custom_application_(revision_conflict|release_conflict|review_required|artifact_conflict|budget_required|version_unavailable|grant_conflict|grant_expired|retired)/.test(detail)) throw new CustomApplicationConflictError(error?.message || "The custom application changed. Reload before continuing.");
  if (/custom_application_(build_failed|storage_unavailable|unavailable)/.test(detail)) throw new CustomApplicationBuildError();
  throw new WorkspaceStoreError("Custom application storage is unavailable.");
}

async function rpc(db: CustomDb, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await db.rpc(name, args);
  if (result.error) mapRpcFailure(result.error);
  return result.data;
}

function rpcRow(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new WorkspaceStoreError("Custom application state is unreadable.");
  return row as Record<string, unknown>;
}

function parseDurable(value: unknown): CustomApplication {
  const row = rpcRow(value);
  const parsed = customApplicationSchema.safeParse(row);
  if (!parsed.success) throw new WorkspaceStoreError("Custom application state is unreadable.");
  return parsed.data;
}

function parseGrant(value: unknown): CustomApplicationGrant {
  const row = Array.isArray(value) ? value[0] : value;
  const source = row && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : null;
  const parsed = customApplicationGrantSchema.safeParse(source ? {
    id: source.id,
    workId: source.work_id,
    workspaceId: source.workspace_id,
    recipientEmail: source.recipient_email,
    releaseVersion: source.release_version,
    purpose: source.purpose,
    expiresAt: source.expires_at,
    status: source.status,
    grantedBy: source.granted_by,
    createdAt: source.created_at,
    revokedAt: source.revoked_at ?? null,
  } : row);
  if (!parsed.success) {
    throw new WorkspaceStoreError("Custom application access is unreadable.");
  }
  return parsed.data;
}

function parseUse(value: unknown): CustomApplicationUse {
  const parsed = customApplicationUseSchema.safeParse(value);
  if (!parsed.success) throw new WorkspaceStoreError("Custom application use is unreadable.");
  return parsed.data;
}

async function lane<T>(store: BoundedStore, id: string, callback: () => Promise<T>): Promise<T> {
  const lanes = mapFor(memoryLanes, store);
  const prior = lanes.get(id) ?? Promise.resolve();
  const current = prior.then(callback, callback);
  const settled = current.then(() => undefined, () => undefined);
  lanes.set(id, settled);
  try { return await current; }
  finally { if (lanes.get(id) === settled) lanes.delete(id); }
}

function managerForMemory(store: BoundedStore, actor: WorkspaceActor, work: SavedWork): void {
  if (work.createdBy !== actor.userId) throw new CustomApplicationAccessError("Custom application design access is required.");
}

async function manager(store: BoundedStore, actor: WorkspaceActor, work: SavedWork): Promise<void> {
  await store.member(actor, work.workspaceId);
  if (!durableDb(store)) managerForMemory(store, actor, work);
}

async function load(store: BoundedStore, actor: WorkspaceActor, id: string, allowRecipient = false): Promise<{ work: SavedWork; state?: CustomApplicationState; app?: CustomApplication }> {
  const db = durableDb(store);
  if (db) {
    let work: SavedWork | null;
    try {
      work = await store.read(actor, id);
    } catch (error) {
      if (error instanceof WorkspaceAccessError) throw new CustomApplicationAccessError();
      throw error;
    }
    if (!work || work.productId !== CUSTOM_APPLICATION_PRODUCT || work.resourceKind !== CUSTOM_APPLICATION_RESOURCE_KIND) throw new CustomApplicationAccessError();
    if (allowRecipient) return { work };
    return { work, app: parseDurable(await rpc(db, "custom_application_read", { p_work_id: id, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail })) };
  }
  const work = mapFor(memoryWorks, store).get(id);
  const state = mapFor(memoryStates, store).get(id);
  if (!work || !state || work.productId !== CUSTOM_APPLICATION_PRODUCT || work.resourceKind !== CUSTOM_APPLICATION_RESOURCE_KIND) throw new CustomApplicationAccessError();
  if (!allowRecipient) await store.member(actor, work.workspaceId);
  return { work: structuredClone(work), state };
}

async function saveMemory(store: BoundedStore, actor: WorkspaceActor, work: SavedWork, state: CustomApplicationState, kind: string, now: () => Date): Promise<CustomApplication> {
  const previous = work.payload && typeof work.payload === "object" && !Array.isArray(work.payload)
    ? work.payload as Record<string, unknown> : {};
  const revision = typeof previous.revision === "number" ? previous.revision : 0;
  state.workRevision = revision + 1;
  state.updatedAt = nowIso(now);
  const history = Array.isArray(previous.history) ? previous.history.slice(-499) : [];
  history.push({ revision: state.workRevision, kind, actorId: actor.userId, at: state.updatedAt });
  const payload = projection(work, state);
  payload.history = history;
  const saved = await store.update(actor, work, revision, payload);
  mapFor(memoryWorks, store).set(saved.id, structuredClone(saved));
  mapFor(memoryStates, store).set(saved.id, state);
  return toApplication(saved, state);
}

function localEconomics(store: BoundedStore): CustomBuildAdmission {
  const budgets = mapFor(memoryExecutions, store);
  return {
    async ensureBudget(_actor, target, budget) {
      return customApplicationBudgetBindingSchema.parse({ jobId: randomUUID(), maxAuthorizedCents: budget.maxAuthorizedCents, estimateCents: budget.estimateCents, status: "accepted" });
    },
    async execute<T>(_actor: WorkspaceActor, target: CustomBuildTarget, perform: () => Promise<T>, recheck?: () => Promise<void>): Promise<{ disposition: "performed" | "replayed"; value?: T }> {
      const key = `${target.jobId}:${target.version}`;
      const existing = budgets.get(key);
      if (existing) return { disposition: "replayed", value: existing.value as T };
      await recheck?.();
      const value = await perform();
      budgets.set(key, { value });
      return { disposition: "performed", value };
    },
  };
}

/** Thin adapter over the existing work-economics ledger and runtime executor. */
export function sharedCustomApplicationEconomics(): CustomBuildAdmission {
  return {
    async ensureBudget(actor, target, budget) {
      const service = await import("@/platform/work-economics/service");
      const inspection = await service.executeJobEconomicsCommand(actor, {
        action: "create",
        productId: CUSTOM_APPLICATION_PRODUCT,
        resourceKind: CUSTOM_APPLICATION_RESOURCE_KIND,
        workspaceId: target.workspaceId,
        workId: target.workId,
        payerId: budget.payerId ?? actor.userId,
        estimateCents: budget.estimateCents,
        maxAuthorizedCents: budget.maxAuthorizedCents,
      });
      let accepted = inspection;
      if (inspection.job.status === "draft") accepted = await service.executeJobEconomicsCommand(actor, { action: "accept", jobId: inspection.job.id });
      return customApplicationBudgetBindingSchema.parse({
        jobId: accepted.job.id,
        maxAuthorizedCents: accepted.job.maxAuthorizedCents,
        estimateCents: accepted.job.estimateCents,
        status: "accepted",
      });
    },
    async execute(actor, target, perform, recheck) {
      const runtime = await import("@/platform/work-economics/runtime");
      const result = await runtime.executeBudgetedAction(actor, {
        jobId: target.jobId,
        executionKey: `custom-application:${target.workId}:${target.version}`,
        maximumCents: target.maximumCents,
        kind: "tool",
        expectedTarget: { workspaceId: target.workspaceId, workId: target.workId },
      }, {
        recheck: async () => { await recheck?.(); },
        perform: async () => ({ value: await perform(), amountCents: 0, effect: "accepted" as const }),
      });
      return result.disposition === "performed"
        ? { disposition: "performed", value: result.value }
        : { disposition: "replayed" };
    },
  };
}

export function createCustomApplicationService(store: BoundedStore = boundedStore, options: CustomApplicationLifecycleOptions = {}) {
  const build = options.build ?? buildCustomApplication;
  const now = options.now ?? (() => new Date());
  const economics = options.economics ?? (store === boundedStore ? sharedCustomApplicationEconomics() : localEconomics(store));

  async function read(actor: WorkspaceActor, id: string): Promise<CustomApplication> {
    const loaded = await load(store, actor, id);
    if (loaded.app) return loaded.app;
    return toApplication(loaded.work, loaded.state!);
  }

  async function create(actor: WorkspaceActor, workspaceId: string, raw: unknown): Promise<CustomApplication> {
    const input = customApplicationCreateInputSchema.parse(raw);
    await store.member(actor, workspaceId);
    const temporary = makeState(randomUUID(), workspaceId, actor, input, now);
    const payload = {
      version: 1,
      revision: 0,
      title: input.title,
      createdBy: actor.userId,
      createdAt: nowIso(now),
      history: [],
      product: CUSTOM_APPLICATION_PRODUCT,
      status: "draft",
      maintenanceOwner: temporary.maintenanceOwner,
      candidate: temporary.candidate,
      currentReleaseVersion: null,
      releases: [],
      budget: null,
      updatedAt: temporary.updatedAt,
    };
    const work = await store.create(actor, workspaceId, {
      productId: CUSTOM_APPLICATION_PRODUCT,
      resourceKind: CUSTOM_APPLICATION_RESOURCE_KIND,
      title: input.title,
      payload,
      input: { sourceDigest: temporary.candidate.sourceDigest, files: Object.keys(input.files) },
    });
    const state = makeState(work.id, workspaceId, actor, input, now);
    if (durableDb(store)) {
      try {
        const binding = await economics.ensureBudget(actor, { workspaceId, workId: work.id }, input.budget);
        await rpc(durableDb(store)!, "custom_application_set_budget", {
          p_work_id: work.id, p_workspace_id: workspaceId, p_job_id: binding.jobId,
          p_max_authorized_cents: binding.maxAuthorizedCents, p_estimate_cents: binding.estimateCents,
          p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
        });
      } catch {
        throw new CustomApplicationBudgetRecoveryError(work.id, input.budget);
      }
      return read(actor, work.id);
    }
    mapFor(memoryWorks, store).set(work.id, structuredClone(work));
    mapFor(memoryStates, store).set(work.id, state);
    try {
      state.budget = await economics.ensureBudget(actor, { workspaceId, workId: work.id }, input.budget);
    } catch {
      throw new CustomApplicationBudgetRecoveryError(work.id, input.budget);
    }
    return saveMemory(store, actor, work, state, "create_custom_application", now);
  }

  async function admitBudget(actor: WorkspaceActor, id: string, raw: unknown): Promise<CustomApplication> {
    const budget = customApplicationBudgetSchema.parse(raw);
    const loaded = await load(store, actor, id);
    await manager(store, actor, loaded.work);
    if (durableDb(store)) {
      const binding = await economics.ensureBudget(actor, { workspaceId: loaded.work.workspaceId, workId: id }, budget);
      await rpc(durableDb(store)!, "custom_application_set_budget", {
        p_work_id: id, p_workspace_id: loaded.work.workspaceId, p_job_id: binding.jobId,
        p_max_authorized_cents: binding.maxAuthorizedCents, p_estimate_cents: binding.estimateCents,
        p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
      });
      return read(actor, id);
    }
    return lane(store, id, async () => {
      const current = await load(store, actor, id);
      const state = cloneState(current.state!);
      if (state.budget) {
        if (state.budget.maxAuthorizedCents !== budget.maxAuthorizedCents || state.budget.estimateCents !== budget.estimateCents) {
          throw new CustomApplicationConflictError("This draft already has a different accepted budget.");
        }
        return toApplication(current.work, state);
      }
      state.budget = await economics.ensureBudget(actor, { workspaceId: current.work.workspaceId, workId: id }, budget);
      return saveMemory(store, actor, current.work, state, "admit_custom_build", now);
    });
  }

  async function revise(actor: WorkspaceActor, id: string, raw: unknown): Promise<CustomApplication> {
    const input = customApplicationReviseInputSchema.parse(raw);
    const loaded = await load(store, actor, id);
    await manager(store, actor, loaded.work);
    if (durableDb(store)) {
      await rpc(durableDb(store)!, "custom_application_update_candidate", {
        p_work_id: id, p_expected_candidate_revision: input.expectedCandidateRevision,
        p_title: input.title, p_files: input.files, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
      });
      return read(actor, id);
    }
    return lane(store, id, async () => {
      const current = await load(store, actor, id);
      const state = cloneState(current.state!);
      if (state.candidate.revision !== input.expectedCandidateRevision) throw new CustomApplicationConflictError("This candidate changed. Reload before editing it.");
      const nextVersion = Math.max(state.candidate.version, ...state.releases.map(release => release.version), 0) + 1;
      state.candidate = {
        revision: state.candidate.revision + 1,
        version: nextVersion,
        title: input.title,
        files: customApplicationFilesSchema.parse(input.files),
        sourceDigest: customApplicationSourceDigest(input.files),
        artifact: null,
      };
      return saveMemory(store, actor, current.work, state, "revise_custom_candidate", now);
    });
  }

  async function buildCandidate(actor: WorkspaceActor, id: string, raw: unknown): Promise<CustomApplication> {
    const input = customApplicationBuildInputSchema.parse(raw);
    const loaded = await load(store, actor, id);
    await manager(store, actor, loaded.work);
    if (durableDb(store)) {
      const app = loaded.app!;
      if (app.candidate.revision !== input.expectedCandidateRevision) throw new CustomApplicationConflictError("This candidate changed. Reload before building it.");
      if (!app.budget || app.budget.status !== "accepted") throw new CustomApplicationConflictError("Accept a build budget before building this application.");
      const recheck = async () => {
        const current = await read(actor, id);
        if (current.status === "retired"
          || current.candidate.revision !== app.candidate.revision
          || current.candidate.version !== app.candidate.version
          || current.candidate.sourceDigest !== app.candidate.sourceDigest
          || current.currentReleaseVersion !== app.currentReleaseVersion
          || !current.budget
          || current.budget.status !== "accepted"
          || current.budget.jobId !== app.budget!.jobId) {
          throw new CustomApplicationConflictError("The build target, budget, or live release changed before execution.");
        }
      };
      const built = await economics.execute(actor, {
        workspaceId: loaded.work.workspaceId, workId: id, version: app.candidate.version,
        maximumCents: app.budget.maxAuthorizedCents, jobId: app.budget.jobId,
      }, async () => {
        const artifact = await build({ workspaceId: loaded.work.workspaceId, resourceId: id, applicationVersion: app.candidate.version, files: app.candidate.files });
        await rpc(durableDb(store)!, "custom_application_store_artifact", {
          p_work_id: id, p_application_version: artifact.applicationVersion, p_source_digest: artifact.sourceDigest,
          p_artifact_digest: artifact.artifactDigest, p_image: artifact.image, p_html: artifact.html,
          p_built_at: artifact.builtAt, p_duration_ms: artifact.durationMs, p_limits: artifact.limits,
          p_expected_candidate_revision: input.expectedCandidateRevision, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
        });
        return artifact;
      }, recheck);
      if (built.disposition === "replayed" && !app.candidate.artifact) throw new CustomApplicationBuildError("The prior build receipt exists but its artifact is unavailable.");
      return read(actor, id);
    }
    return lane(store, id, async () => {
      const current = await load(store, actor, id);
      const state = cloneState(current.state!);
      if (state.candidate.revision !== input.expectedCandidateRevision) throw new CustomApplicationConflictError("This candidate changed. Reload before building it.");
      if (!state.budget || state.budget.status !== "accepted") throw new CustomApplicationConflictError("Accept a build budget before building this application.");
      const authority = toApplication(current.work, state);
      const recheck = async () => {
        const reread = await read(actor, id);
        if (reread.status === "retired"
          || reread.candidate.revision !== authority.candidate.revision
          || reread.candidate.version !== authority.candidate.version
          || reread.candidate.sourceDigest !== authority.candidate.sourceDigest
          || reread.currentReleaseVersion !== authority.currentReleaseVersion
          || !reread.budget
          || reread.budget.status !== "accepted"
          || reread.budget.jobId !== authority.budget!.jobId) {
          throw new CustomApplicationConflictError("The build target, budget, or live release changed before execution.");
        }
      };
      const built = await economics.execute(actor, {
        workspaceId: current.work.workspaceId, workId: id, version: state.candidate.version,
        maximumCents: state.budget.maxAuthorizedCents, jobId: state.budget.jobId,
      }, async () => {
        const artifact = await build({ workspaceId: current.work.workspaceId, resourceId: id, applicationVersion: state.candidate.version, files: state.candidate.files });
        if (artifact.artifactDigest !== createHash("sha256").update(JSON.stringify([current.work.workspaceId, id, artifact.applicationVersion, artifact.html])).digest("hex")) throw new CustomApplicationBuildError("The build returned an invalid artifact digest.");
        state.artifacts.set(artifact.applicationVersion, artifact);
        return artifact;
      }, recheck);
      if (built.disposition === "replayed" && !state.artifacts.has(state.candidate.version)) throw new CustomApplicationBuildError("The prior build receipt exists but its artifact is unavailable.");
      return saveMemory(store, actor, current.work, state, "build_custom_candidate", now);
    });
  }

  async function review(actor: WorkspaceActor, id: string, raw: unknown): Promise<CustomApplication> {
    const input = customApplicationReviewInputSchema.parse(raw);
    const loaded = await load(store, actor, id);
    await manager(store, actor, loaded.work);
    if (durableDb(store)) {
      await rpc(durableDb(store)!, "custom_application_review", {
        p_work_id: id, p_expected_candidate_revision: input.expectedCandidateRevision,
        p_artifact_digest: input.artifactDigest, p_checks: input.checks,
        p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
      });
      return read(actor, id);
    }
    return lane(store, id, async () => {
      const current = await load(store, actor, id);
      const state = cloneState(current.state!);
      if (state.candidate.revision !== input.expectedCandidateRevision) throw new CustomApplicationConflictError("This candidate changed. Reload before reviewing it.");
      const artifact = state.artifacts.get(state.candidate.version);
      if (!artifact || artifact.artifactDigest !== input.artifactDigest) throw new CustomApplicationConflictError("Review the exact built artifact before releasing it.");
      const reviewRecord = customApplicationReviewSchema.parse({ artifactDigest: input.artifactDigest, checks: input.checks, reviewedBy: actor.userId, reviewedAt: nowIso(now) });
      state.reviews.set(artifact.applicationVersion, reviewRecord);
      return saveMemory(store, actor, current.work, state, "review_custom_artifact", now);
    });
  }

  async function release(actor: WorkspaceActor, id: string, raw: unknown): Promise<CustomApplication> {
    const input = customApplicationReleaseInputSchema.parse(raw);
    const loaded = await load(store, actor, id);
    await manager(store, actor, loaded.work);
    if (durableDb(store)) {
      await rpc(durableDb(store)!, "custom_application_release", {
        p_work_id: id, p_expected_candidate_revision: input.expectedCandidateRevision,
        p_expected_release_version: input.expectedReleaseVersion, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
      });
      return read(actor, id);
    }
    return lane(store, id, async () => {
      const current = await load(store, actor, id);
      const state = cloneState(current.state!);
      if (state.candidate.revision !== input.expectedCandidateRevision) throw new CustomApplicationConflictError("This candidate changed. Reload before releasing it.");
      if (state.currentReleaseVersion !== input.expectedReleaseVersion) throw new CustomApplicationConflictError("The live release changed. Reload before releasing it.");
      const artifact = state.artifacts.get(state.candidate.version);
      const reviewRecord = artifact ? state.reviews.get(artifact.applicationVersion) : null;
      if (!artifact || !reviewRecord || reviewRecord.artifactDigest !== artifact.artifactDigest) throw new CustomApplicationConflictError("A reviewed build is required before release.");
      const nextVersion = Math.max(0, ...state.releases.map(releaseItem => releaseItem.version)) + 1;
      const releaseRecord = customApplicationReleaseSchema.parse({ version: nextVersion, artifactDigest: artifact.artifactDigest, publishedAt: nowIso(now), publishedBy: actor.userId, review: reviewRecord });
      if (state.releases.length >= 100) throw new CustomApplicationConflictError("This application has reached its release history limit.");
      state.releases.push(releaseRecord);
      state.currentReleaseVersion = nextVersion;
      state.status = "released";
      return saveMemory(store, actor, current.work, state, "release_custom_artifact", now);
    });
  }

  async function rollback(actor: WorkspaceActor, id: string, raw: unknown): Promise<CustomApplication> {
    const input = customApplicationRollbackInputSchema.parse(raw);
    const loaded = await load(store, actor, id);
    await manager(store, actor, loaded.work);
    if (durableDb(store)) {
      await rpc(durableDb(store)!, "custom_application_rollback", {
        p_work_id: id, p_expected_release_version: input.expectedReleaseVersion,
        p_target_release_version: input.version, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
      });
      return read(actor, id);
    }
    return lane(store, id, async () => {
      const current = await load(store, actor, id);
      const state = cloneState(current.state!);
      if (state.currentReleaseVersion !== input.expectedReleaseVersion) throw new CustomApplicationConflictError("The live release changed. Reload before rolling back.");
      const target = state.releases.find(releaseItem => releaseItem.version === input.version);
      if (!target) throw new CustomApplicationConflictError("That released custom application version is unavailable.");
      if (!state.artifacts.has(state.candidate.version) && ![...state.artifacts.values()].some(artifact => artifact.artifactDigest === target.artifactDigest)) {
        throw new CustomApplicationConflictError("The rollback artifact is unavailable.");
      }
      state.currentReleaseVersion = target.version;
      state.status = "released";
      return saveMemory(store, actor, current.work, state, "rollback_custom_release", now);
    });
  }

  async function retire(actor: WorkspaceActor, id: string): Promise<CustomApplication> {
    const loaded = await load(store, actor, id);
    await manager(store, actor, loaded.work);
    if (durableDb(store)) {
      await rpc(durableDb(store)!, "custom_application_retire", { p_work_id: id, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
      return read(actor, id);
    }
    return lane(store, id, async () => {
      const current = await load(store, actor, id);
      const state = cloneState(current.state!);
      state.status = "retired";
      return saveMemory(store, actor, current.work, state, "retire_custom_application", now);
    });
  }

  async function grant(actor: WorkspaceActor, id: string, raw: unknown): Promise<CustomApplicationGrant> {
    const input = customApplicationGrantInputSchema.parse(raw);
    const loaded = await load(store, actor, id);
    await manager(store, actor, loaded.work);
    if (Date.parse(input.expiresAt) <= now().getTime()) throw new CustomApplicationConflictError("Choose a future expiry.");
    if (durableDb(store)) return parseGrant(await rpc(durableDb(store)!, "custom_application_grant", {
      p_work_id: id, p_recipient_email: input.recipientEmail, p_release_version: input.releaseVersion ?? null,
      p_purpose: input.purpose, p_expires_at: input.expiresAt, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
    }));
    return lane(store, id, async () => {
      const current = await load(store, actor, id);
      const state = current.state!;
      if (state.status !== "released" || state.currentReleaseVersion === null) throw new CustomApplicationConflictError("Release the application before granting access.");
      const releaseVersion = input.releaseVersion ?? state.currentReleaseVersion;
      if (!state.releases.some(releaseItem => releaseItem.version === releaseVersion)) throw new CustomApplicationConflictError("That release is unavailable.");
      const grants = mapFor(memoryGrants, store);
      const existing = [...grants.values()].find(grantItem => grantItem.workId === id && grantItem.recipientEmail === input.recipientEmail && grantItem.status === "active");
      if (existing) throw new CustomApplicationConflictError("This recipient already has active access.");
      const grantRecord = customApplicationGrantSchema.parse({ id: randomUUID(), workId: id, workspaceId: current.work.workspaceId, recipientEmail: input.recipientEmail, releaseVersion, purpose: input.purpose, expiresAt: input.expiresAt, status: "active", grantedBy: actor.userId, createdAt: nowIso(now), revokedAt: null });
      grants.set(grantRecord.id, grantRecord);
      return grantRecord;
    });
  }

  async function listGrants(actor: WorkspaceActor, id: string): Promise<CustomApplicationGrant[]> {
    const loaded = await load(store, actor, id);
    await manager(store, actor, loaded.work);
    if (durableDb(store)) {
      const rows = await rpc(durableDb(store)!, "custom_application_list_grants", { p_work_id: id, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
      if (!Array.isArray(rows)) throw new WorkspaceStoreError("Custom application access is unreadable.");
      return rows.map(parseGrant);
    }
    return [...mapFor(memoryGrants, store).values()].filter(grantItem => grantItem.workId === id).map(value => structuredClone(value));
  }

  async function revoke(actor: WorkspaceActor, id: string, grantId: string): Promise<void> {
    z.string().uuid().parse(grantId);
    const loaded = await load(store, actor, id);
    await manager(store, actor, loaded.work);
    if (durableDb(store)) {
      await rpc(durableDb(store)!, "custom_application_revoke_grant", { p_work_id: id, p_grant_id: grantId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
      return;
    }
    const grants = mapFor(memoryGrants, store);
    const grantRecord = grants.get(grantId);
    if (!grantRecord || grantRecord.workId !== id || grantRecord.status !== "active") throw new CustomApplicationAccessError("That access grant is unavailable.");
    grants.set(grantId, { ...grantRecord, status: "revoked", revokedAt: nowIso(now) });
  }

  async function use(actor: WorkspaceActor, id: string): Promise<CustomApplicationUse> {
    z.string().uuid().parse(id);
    const db = durableDb(store);
    if (db) return parseUse(await rpc(db, "custom_application_use", { p_work_id: id, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }));
    const work = mapFor(memoryWorks, store).get(id);
    const state = mapFor(memoryStates, store).get(id);
    if (!work || !state) throw new CustomApplicationAccessError();
    const grantRecord = [...mapFor(memoryGrants, store).values()].find(value => value.workId === id && value.recipientEmail === actor.verifiedEmail.trim().toLowerCase() && value.status === "active");
    if (!grantRecord || Date.parse(grantRecord.expiresAt) <= now().getTime()) throw new CustomApplicationAccessError("This custom application link is no longer available to your account.");
    if (state.status === "retired") throw new CustomApplicationAccessError("This custom application is no longer available.");
    const release = state.releases.find(releaseItem => releaseItem.version === grantRecord.releaseVersion);
    if (!release) throw new CustomApplicationAccessError("The granted custom application version is unavailable.");
    const artifact = [...state.artifacts.values()].find(value => value.artifactDigest === release.artifactDigest);
    if (!artifact) throw new CustomApplicationBuildError("The granted artifact is unavailable.");
    return customApplicationUseSchema.parse({ workId: id, title: state.candidate.title, releaseVersion: release.version, artifactDigest: artifact.artifactDigest, html: artifact.html, grant: grantRecord });
  }

  async function preview(actor: WorkspaceActor, id: string): Promise<CustomApplicationPreview> {
    z.string().uuid().parse(id);
    const db = durableDb(store);
    if (db) return customApplicationPreviewSchema.parse(await rpc(db, "custom_application_preview", {
      p_work_id: id, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
    }));
    const loaded = await load(store, actor, id);
    await manager(store, actor, loaded.work);
    const state = loaded.state!;
    const artifact = state.artifacts.get(state.candidate.version);
    if (!artifact) throw new CustomApplicationBuildError("Build a candidate before previewing it.");
    return customApplicationPreviewSchema.parse({
      applicationVersion: artifact.applicationVersion,
      artifactDigest: artifact.artifactDigest,
      html: artifact.html,
    });
  }

  return { read, create, admitBudget, revise, build: buildCandidate, review, release, rollback, retire, grant, listGrants, revoke, use, preview };
}

export type CustomApplicationService = ReturnType<typeof createCustomApplicationService>;

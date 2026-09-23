import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type SavedWork,
  type WorkspaceActor,
} from "@/platform/workspaces/types";
import { boundedStore, initial, type BoundedStore } from "@/platform/bounded-work/repository";
import { applicationCommandSchema, applicationPublishInputSchema, applicationRehearseInputSchema, applicationReviseInputSchema, applicationRollbackInputSchema, applicationSchema, applicationSpecSchema, applicationSubmitInputSchema, APPLICATION_RECORD_LIMIT, type ApplicationRelease } from "./contracts";
import { applyLegacyApplicationCommand, assertLegacyApplicationRevision, cloneState, currentRelease, normalizeReleaseVersion, releaseSpec, reviseCandidate, rehearseCandidate, publishCandidate, rollbackRelease, validateRecord } from "./domain";
import {
  assertApplicationStorage,
  durableDb,
  durableRpc,
  load,
  output,
  parseStateFromPayload,
  runtime,
  saveMemory,
  stateMap,
  withMemoryLane,
} from "./repository";

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
  APPLICATION_SELECT_OPTION_LIMIT,
  APPLICATION_SELECT_OPTION_LENGTH_LIMIT,
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

/** Optional gate owned by the focused application surface. */
export type ApplicationUseAuthorization = (input: {
  actor: WorkspaceActor;
  application: SavedWork;
  release: ApplicationRelease;
}) => Promise<void> | void;

type ManagerCapableStore = BoundedStore & {
  manager?: (actor: WorkspaceActor, workspaceId: string) => Promise<void>;
};

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

/**
 * Candidate writes have a second durable authority: a customer may name one
 * active agency operator for one installed application draft. The database
 * RPC rechecks that grant together with the current assignment, delivery,
 * installation, sponsor, membership, and candidate revision while holding
 * the work lock. In-memory stores have no delegated authority surface, so
 * they retain the manager-only behavior used by focused unit tests.
 */
async function ensureCandidateEditor(store: BoundedStore, actor: WorkspaceActor, work: SavedWork): Promise<void> {
  if (!durableDb(store)) await ensureManager(store, actor, work);
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
    await ensureCandidateEditor(store, actor, permission.work);
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
      const state = reviseCandidate(loaded.state, input);
      return saveMemory(store, actor, loaded, state, "revise_candidate");
    });
  }

  async function rehearse(actor: WorkspaceActor, id: string, raw: unknown) {
    const input = applicationRehearseInputSchema.parse(raw);
    const db = durableDb(store);
    const permission = await load(store, actor, id);
    await ensureCandidateEditor(store, actor, permission.work);
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
      const state = rehearseCandidate(loaded.state, input);
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
      const state = publishCandidate(loaded.state, input, { at: new Date().toISOString(), by: actor.userId });
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
      const state = rollbackRelease(loaded.state, input);
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
      if (command.kind !== "submit" && command.kind !== "revise" && command.kind !== "rehearse") await ensureManager(store, actor, loaded.work);
      assertLegacyApplicationRevision(loaded.state, command);
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
      assertLegacyApplicationRevision(loaded.state, command);
      let source;
      if (command.kind === "adopt_update") {
        if (!loaded.state.installation) throw new WorkspaceConflictError("This application has no reusable source.");
        const loadedSource = await load(store, actor, loaded.state.installation.sourceWorkId);
        await ensureActorMember(store, actor, loadedSource.work);
        source = loadedSource.state;
      }
      const state = applyLegacyApplicationCommand(loaded.state, command, actor.userId, new Date().toISOString(), source);
      const saved = await saveMemory(store, actor, loaded, state, command.kind);
      return command.kind === "submit" ? output(saved, state) : saved;
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

/**
 * Rehearse the exact application named by an accepted operational assignment.
 * The database RPC rechecks the accepted delivery and native resource before
 * writing the rehearsal receipt; this entry point intentionally skips the
 * ordinary customer-manager gate because the assignment is the scoped grant.
 */
export async function rehearseApplicationCandidateForAssignment(
  actor: WorkspaceActor,
  workId: string,
  expectedDesignRevision: number,
) {
  const loaded = await load(boundedStore, actor, workId);
  if (loaded.state.candidate.designRevision !== expectedDesignRevision) {
    throw new WorkspaceConflictError("This application candidate changed. Reload before rehearsing it.");
  }
  const db = durableDb(boundedStore);
  if (!db) throw new WorkspaceStoreError("Application release storage is unavailable.");
  await durableRpc(db, "rehearse_application_candidate", {
    p_work_id: workId,
    p_workspace_id: loaded.work.workspaceId,
    p_expected_design_revision: expectedDesignRevision,
    p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
  }, "The application candidate could not be rehearsed.");
  return readWorkspaceApplication(actor, workId);
}

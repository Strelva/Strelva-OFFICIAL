/** Agency authoring uses the existing funded planner, native output and Version
 * stores. No provider write, message, client grant or owner decision is implied. */
import { z } from "zod";
import { applicationSchema } from "@/products/applications/contracts";
import { rehearseApplicationPackage } from "@/products/applications/package-rehearsal";
import { createWorkPlan, executeWorkPlanOutput, presentWorkPlan, type CreateWorkPlanRequest, type ExecuteWorkPlanOutputRequest } from "@/products/work-plans";
import { getWork, WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces";
import { createSupabaseSystemStore, listBusinessSystems, type SystemStore } from "@/platform/systems";
import { assertShareableDefinition, createSystemVersions, type JsonObject, type VersionStore } from "@/platform/system-versions";
import { createSupabaseConnectionOwnership, createSupabaseVersionStore, mapVersionsError, readVersionActor, versionsDb, type VersionsDb } from "@/platform/system-versions/supabase-store";

export async function requireAgencyAuthoring(actor: WorkspaceActor, agencyWorkspaceId: string, workspaceId: string, db: VersionsDb = versionsDb()): Promise<void> {
  const { data, error } = await db.rpc("require_agency_authoring_scope", {
    p_agency_workspace_id: agencyWorkspaceId, p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
  });
  if (error) mapVersionsError(error, "Agency authoring could not be authorized.");
  if (data !== true) throw new WorkspaceAccessError();
}

export async function prepareAgencyBuild(actor: WorkspaceActor, agencyWorkspaceId: string, input: CreateWorkPlanRequest) {
  await requireAgencyAuthoring(actor, agencyWorkspaceId, input.workspaceId);
  return presentWorkPlan(await createWorkPlan({ actor, ...input }));
}

/** A stable native-work id also keys adoption; a lost reply retries one output,
 * then the same System command. No duplicate native artifact or System. */
export async function executeAgencyBuild(actor: WorkspaceActor, agencyWorkspaceId: string, input: ExecuteWorkPlanOutputRequest,
  ports = { scope: requireAgencyAuthoring, execute: executeWorkPlanOutput, systems: createSupabaseSystemStore() }) {
  await ports.scope(actor, agencyWorkspaceId, input.workspaceId);
  const execution = await ports.execute({ actor, ...input });
  if (execution.nativeProductId === "applications" || execution.nativeProductId === "tracker") {
    await ports.systems.createSystem(actor, input.workspaceId, {
      name: typeof input.inputs?.title === "string" ? input.inputs.title.slice(0, 160) : "Internal tool", kind: "internal_app", origin: { kind: "saved_work", ref: execution.nativeWorkId },
    }, execution.nativeWorkId);
  }
  return execution;
}

/** An app's reusable shape. Local records, release history, installation,
 * maintenance owner and accounts never enter a source definition. */
export function applicationPackageDefinition(payload: unknown): JsonObject {
  const application = applicationSchema.parse(payload);
  const spec = application.candidate?.spec ?? application.spec;
  const definition = { kind: "internal_app", title: spec.title, fields: spec.fields, components: spec.components } as unknown as JsonObject;
  assertShareableDefinition(definition);
  return definition;
}

export interface PackageChoice { systemId: string; name: string; revision: number; fingerprint: string; definition: JsonObject; requires: { bindingKinds: string[] } }

async function packageChoice(actor: WorkspaceActor, agencyWorkspaceId: string, systemId: string, db: VersionsDb): Promise<PackageChoice> {
  const listing = await listBusinessSystems(actor, agencyWorkspaceId, { store: createSupabaseSystemStore(db), db });
  const row = listing.systems.find(item => item.system.id === systemId);
  if (!row) throw new WorkspaceAccessError();
  const versionActor = await readVersionActor(actor, db);
  const store = createSupabaseVersionStore(db);
  const source = { businessId: agencyWorkspaceId, systemId };
  const revisions = await store.listRevisions(versionActor, source);
  const lineage = await store.findLineageByVersion(versionActor, source);
  let definition: JsonObject;
  let fingerprint: string;
  let requires = { bindingKinds: [] as string[] };
  if (lineage) {
    const view = await createSystemVersions({ store, connections: createSupabaseConnectionOwnership(db) }).readVersion(versionActor, lineage.id);
    const baseline = await store.getRevision(versionActor, lineage.source, lineage.baseline.revision);
    if (!baseline) throw new WorkspaceStoreError("The source requirements could not be read.");
    requires = baseline.requires;
    definition = view.workingDefinition; fingerprint = `version:${lineage.rowRevision}`;
  } else if (row.references.savedWorkId) {
    const work = await getWork(actor, row.references.savedWorkId);
    if (!work || work.workspaceId !== agencyWorkspaceId || work.productId !== "applications") throw new WorkspaceStoreError("This System has no reusable definition. Prepare an internal tool or a Version first.");
    definition = applicationPackageDefinition(work.payload); fingerprint = `work:${work.updatedAt}`;
  } else {
    const latest = revisions.at(-1);
    if (!latest) throw new WorkspaceStoreError("This System has no reusable definition yet.");
    definition = latest.definition; requires = latest.requires; fingerprint = `source:${latest.source.revisionId}`;
  }
  assertShareableDefinition(definition);
  return { systemId, name: row.system.name, revision: revisions.at(-1)?.source.number ?? 0, fingerprint, definition, requires };
}

export async function readPackageChoices(actor: WorkspaceActor, agencyWorkspaceId: string, db: VersionsDb = versionsDb()) {
  await requireAgencyAuthoring(actor, agencyWorkspaceId, agencyWorkspaceId, db);
  const listing = await listBusinessSystems(actor, agencyWorkspaceId, { store: createSupabaseSystemStore(db), db });
  const choices: PackageChoice[] = [];
  const unavailable: Array<{ systemId: string; name: string }> = [];
  for (const row of listing.systems) {
    try { choices.push(await packageChoice(actor, agencyWorkspaceId, row.system.id, db)); }
    catch { unavailable.push({ systemId: row.system.id, name: row.system.name }); }
  }
  return { workspaceId: agencyWorkspaceId, choices, unavailable };
}

export async function packageAgencySystem(actor: WorkspaceActor, input: { workspaceId: string; systemId: string; commandId: string; fingerprint: string; expectedRevision: number; summary: string }, db: VersionsDb = versionsDb()) {
  await requireAgencyAuthoring(actor, input.workspaceId, input.workspaceId, db);
  const packageReceipt = (value: unknown) => {
    const parsed = z.object({ source: z.object({ businessId: z.string().uuid(), systemId: z.string().uuid(), revisionId: z.string().uuid(), number: z.number().int().positive() }).strict() }).passthrough().safeParse(value);
    if (!parsed.success || parsed.data.source.businessId !== input.workspaceId || parsed.data.source.systemId !== input.systemId || parsed.data.source.number !== input.expectedRevision + 1) throw new WorkspaceStoreError("The package receipt could not be confirmed.");
    return parsed.data.source;
  };
  const replay = await db.rpc("read_agency_package_command", {
    p_workspace_id: input.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
    p_command_id: input.commandId, p_system_id: input.systemId, p_fingerprint: input.fingerprint,
    p_expected_revision: input.expectedRevision, p_summary: input.summary,
  });
  if (replay.error) mapVersionsError(replay.error, "The package could not be confirmed. Retry the same request.");
  if (replay.data !== null) {
    const receipt = packageReceipt(replay.data);
    return { workspaceId: input.workspaceId, systemId: input.systemId, revision: receipt.number, revisionId: receipt.revisionId };
  }
  const choice = await packageChoice(actor, input.workspaceId, input.systemId, db);
  if (choice.fingerprint !== input.fingerprint) throw new WorkspaceStoreError("This System changed. Reload the package before publishing.");
  const actorForVersions = await readVersionActor(actor, db);
  const base = createSupabaseVersionStore(db);
  // Reuse all the source store's checks. Only insertion has a command receipt.
  const store: VersionStore = { ...base, async insertRevision(_actor, revision) {
    const publication = { ...revision, source: { ...revision.source, number: input.expectedRevision + 1 }, packageFingerprint: input.fingerprint };
    const { data, error } = await db.rpc("publish_agency_package", {
      p_workspace_id: input.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
      p_command_id: input.commandId, p_expected_revision: input.expectedRevision, p_revision: publication,
    });
    if (error) mapVersionsError(error, "The package could not be confirmed. Retry the same request.");
    packageReceipt(data);
    return data as Awaited<ReturnType<VersionStore["getRevision"]>> & {};
  } };
  // Derived native Systems are adopted at their existing identity before source publication.
  const systems: SystemStore = createSupabaseSystemStore(db);
  const detail = await listBusinessSystems(actor, input.workspaceId, { store: systems, db });
  const row = detail.systems.find(item => item.system.id === input.systemId)!;
  if (row.provenance === "existing") await systems.createSystem(actor, input.workspaceId, {
    name: row.system.name, kind: row.system.kind, origin: row.system.origin,
  }, input.systemId);
  const revision = await createSystemVersions({ store, connections: createSupabaseConnectionOwnership(db), rehearsePackage: revision => rehearseApplicationPackage(revision.source.revisionId, revision.definition) }).publishSourceRevision(actorForVersions, {
    source: { businessId: input.workspaceId, systemId: input.systemId }, definition: choice.definition, requires: choice.requires, summary: input.summary,
  });
  return { workspaceId: input.workspaceId, systemId: input.systemId, revision: revision.source.number, revisionId: revision.source.revisionId };
}

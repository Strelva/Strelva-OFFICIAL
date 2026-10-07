import { createSystemVersions, VersionAccessError, VersionStaleError, VersionValidationError, type VersionConflictResolution, type JsonValue, type SystemRevisionRef, type VersionContext } from "@/platform/system-versions";
import { createSupabaseConnectionOwnership, createSupabaseVersionStore, readVersionActor, versionsDb, type VersionsDb } from "@/platform/system-versions/supabase-store";
import { prepareVersionRelease } from "@/platform/system-versions/preparation";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { requireAgencyAuthoring } from "./authoring-server";
import { readAgencyLibrary } from "../agency-server";
import { createSupabaseSystemStore } from "@/platform/systems";
import { z } from "zod";
import { mapVersionsError } from "@/platform/system-versions/supabase-store";

/** The System id, never a caller-chosen client id, resolves its lineage. Every
 * native store read rechecks the same business scope in Postgres. */
export async function readSystemVersion(actor: WorkspaceActor, workspaceId: string, systemId: string, db: VersionsDb = versionsDb()) {
  const versionActor = await readVersionActor(actor, db);
  const store = createSupabaseVersionStore(db);
  const lineage = await store.findLineageByVersion(versionActor, { businessId: workspaceId, systemId });
  if (!lineage || lineage.version.businessId !== workspaceId || lineage.version.systemId !== systemId) throw new VersionAccessError();
  const versions = createSystemVersions({ store, connections: createSupabaseConnectionOwnership(db) });
  const view = await versions.readVersion(versionActor, lineage.id);
  if (view.access !== "owner") throw new VersionAccessError();
  const offers = await versions.listAvailableImprovements(versionActor, lineage.id);
  return { workspaceId, systemId, versionId: lineage.id, rowRevision: lineage.rowRevision,
    label: lineage.context.label, baselineRevision: lineage.baseline.revision, currentRelease: lineage.currentRelease,
    workingDefinition: view.workingDefinition, overrides: view.overrides, bindings: view.bindings ?? [], releases: view.releases, source: view.source,
    offers, canManage: versionActor.memberships.some(membership => membership.businessId === workspaceId && (membership.role === "owner" || membership.role === "admin")),
  };
}

export async function readVersionCreationChoices(actor: WorkspaceActor, agencyWorkspaceId: string, db: VersionsDb = versionsDb()) {
  await requireAgencyAuthoring(actor, agencyWorkspaceId, agencyWorkspaceId, db);
  const library = await readAgencyLibrary(actor, agencyWorkspaceId, db);
  const versionActor = await readVersionActor(actor, db), store = createSupabaseVersionStore(db);
  return { workspaceId: agencyWorkspaceId, sources: await Promise.all(library.sources.map(async source => ({ systemId: source.systemId, name: source.name,
    revisions: (await store.listRevisions(versionActor, { businessId: agencyWorkspaceId, systemId: source.systemId })).map(revision => ({ source: revision.source, summary: revision.summary })) }))) };
}

export async function readVersionManagement(actor: WorkspaceActor, workspaceId: string, systemId: string, db: VersionsDb = versionsDb()) {
  const view = await readSystemVersion(actor, workspaceId, systemId, db);
  const { data, error } = await db.rpc("read_version_binding_choices", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  if (error) mapVersionsError(error, "This business's accounts could not be read.");
  const choices = z.array(z.object({ connectionId: z.string(), kind: z.string(), label: z.string() }).strict()).safeParse(data);
  if (!choices.success) throw new WorkspaceStoreError("The account list could not be read.");
  return { ...view, bindingChoices: choices.data };
}

export async function createBusinessVersion(actor: WorkspaceActor, input: { agencyWorkspaceId: string; workspaceId: string; source: SystemRevisionRef;
  context: VersionContext; name: string; commandId: string }, db: VersionsDb = versionsDb()) {
  await requireAgencyAuthoring(actor, input.agencyWorkspaceId, input.workspaceId, db);
  if (input.source.businessId !== input.agencyWorkspaceId) throw new VersionAccessError();
  const versionActor = await readVersionActor(actor, db);
  const sourceSystem = await createSupabaseSystemStore(db).readSystem(actor, { businessId: input.source.businessId, systemId: input.source.systemId });
  const base = createSupabaseVersionStore(db);
  const services = createSystemVersions({ store: base, connections: createSupabaseConnectionOwnership(db) });
  // This action deliberately shares the definition with this business. The
  // same native service still enforces source and descendant ownership.
  if (input.source.businessId !== input.workspaceId) await services.shareSource(versionActor, input.source, input.workspaceId);
  const atomicDb: VersionsDb = { rpc(name, args) {
    return name === "create_system_version" ? db.rpc("create_version_system_command", { ...args, p_name: input.name, p_kind: sourceSystem.system.kind, p_command_id: input.commandId }) : db.rpc(name, args);
  } };
  const versions = createSystemVersions({ store: createSupabaseVersionStore(atomicDb), connections: createSupabaseConnectionOwnership(db) });
  const lineage = await versions.createVersion(versionActor, { source: input.source, version: { businessId: input.workspaceId, systemId: input.commandId }, context: input.context });
  return { workspaceId: input.workspaceId, systemId: lineage.version.systemId, versionId: lineage.id, rowRevision: lineage.rowRevision, outcome: "created" as const };
}

export type ManageVersionInput = { workspaceId: string; systemId: string; versionId: string; rowRevision: number } & (
  { action: "override"; path: string; value?: JsonValue; clear?: boolean } | { action: "bind"; kind: string; connectionId: string }
  | { action: "restore"; releaseNumber: number } | { action: "prepare_release" });

export async function manageBusinessVersion(actor: WorkspaceActor, input: ManageVersionInput, db: VersionsDb = versionsDb()) {
  const versionActor = await readVersionActor(actor, db), store = createSupabaseVersionStore(db);
  const lineage = await store.findLineageByVersion(versionActor, { businessId: input.workspaceId, systemId: input.systemId });
  if (!lineage || lineage.id !== input.versionId) throw new VersionAccessError();
  if (!versionActor.memberships.some(member => member.businessId === input.workspaceId && (member.role === "owner" || member.role === "admin"))) throw new VersionAccessError();
  if (lineage.rowRevision !== input.rowRevision) throw new VersionStaleError();
  const versions = createSystemVersions({ store, connections: createSupabaseConnectionOwnership(db) });
  let draft = lineage;
  if (input.action === "override") {
    if (!input.clear && input.value === undefined) throw new VersionValidationError("Add a JSON value or clear this override.");
    draft = await versions.setOverride(versionActor, lineage.id, { path: input.path, value: input.clear ? undefined : input.value, expectedRowRevision: input.rowRevision });
  } else if (input.action === "bind") draft = await versions.bindAccount(versionActor, lineage.id, { kind: input.kind, connectionId: input.connectionId, expectedRowRevision: input.rowRevision });
  else if (input.action === "restore") draft = await versions.restoreReleaseDraft(versionActor, lineage.id, { releaseNumber: input.releaseNumber, expectedRowRevision: input.rowRevision });
  else {
    if (!needsYouReleaseEnabled()) throw new WorkspaceStoreError("Needs you is not enabled. Nothing went live.");
    return { outcome: "prepared" as const, rowRevision: draft.rowRevision, receipt: await prepareVersionRelease(actor, draft, { db }) };
  }
  return { outcome: "saved" as const, rowRevision: draft.rowRevision, receipt: null };
}

export async function decideSystemImprovement(actor: WorkspaceActor, input: { workspaceId: string; systemId: string; versionId: string; rowRevision: number; revision: number;
  action: "adopt" | "decline"; resolutions?: VersionConflictResolution[]; reason?: string }, db: VersionsDb = versionsDb()) {
  const versionActor = await readVersionActor(actor, db);
  const store = createSupabaseVersionStore(db);
  const lineage = await store.findLineageByVersion(versionActor, { businessId: input.workspaceId, systemId: input.systemId });
  if (!lineage || lineage.id !== input.versionId) throw new VersionAccessError();
  if (lineage.rowRevision !== input.rowRevision) {
    // Adoption and decision preparation use separate durable stores. Resume
    // only this actor's exact last command after an uncertain reply; a later
    // edit, a different choice or another actor still requires a fresh read.
    const last = lineage.decisions.at(-1);
    const sameChoices = last?.choice === "adopted" && JSON.stringify([...last.resolutions].sort((a, b) => a.path.localeCompare(b.path)))
      === JSON.stringify([...(input.resolutions ?? [])].sort((a, b) => a.path.localeCompare(b.path)));
    if (lineage.rowRevision !== input.rowRevision + 1 || last?.by !== actor.userId || last.sourceRevision !== input.revision
      || last.choice !== (input.action === "adopt" ? "adopted" : "declined")
      || (last.choice === "adopted" ? lineage.baseline.revision !== input.revision || !sameChoices : last.reason !== input.reason)) throw new VersionStaleError();
    if (!versionActor.memberships.some(item => item.businessId === input.workspaceId && (item.role === "owner" || item.role === "admin"))) throw new VersionAccessError();
    if (input.action === "decline") return { outcome: "declined", rowRevision: lineage.rowRevision, receipt: null };
    if (!needsYouReleaseEnabled()) throw new WorkspaceStoreError("Needs you is not enabled. Nothing was released.");
    return { outcome: "prepared", rowRevision: lineage.rowRevision, receipt: await prepareVersionRelease(actor, lineage, { db }) };
  }
  const versions = createSystemVersions({ store, connections: createSupabaseConnectionOwnership(db) });
  if (input.action === "decline") {
    const declined = await versions.declineImprovement(versionActor, lineage.id, { revision: input.revision, reason: input.reason ?? "", expectedRowRevision: input.rowRevision });
    return { outcome: "declined", rowRevision: declined.rowRevision, receipt: null };
  }
  if (!needsYouReleaseEnabled()) throw new WorkspaceStoreError("Needs you is not enabled. Nothing was adopted or released.");
  const adopted = await versions.adoptImprovement(versionActor, lineage.id, { revision: input.revision, resolutions: input.resolutions, expectedRowRevision: input.rowRevision });
  const receipt = await prepareVersionRelease(actor, adopted, { db });
  return { outcome: "prepared", rowRevision: adopted.rowRevision, receipt };
}

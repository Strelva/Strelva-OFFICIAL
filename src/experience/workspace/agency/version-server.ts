import { createSystemVersions, VersionAccessError, VersionStaleError, type VersionConflictResolution } from "@/platform/system-versions";
import { createSupabaseConnectionOwnership, createSupabaseVersionStore, readVersionActor, versionsDb, type VersionsDb } from "@/platform/system-versions/supabase-store";
import { prepareVersionRelease } from "@/platform/system-versions/preparation";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";

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
    workingDefinition: view.workingDefinition, offers, canManage: versionActor.memberships.some(membership => membership.businessId === workspaceId && (membership.role === "owner" || membership.role === "admin")),
  };
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

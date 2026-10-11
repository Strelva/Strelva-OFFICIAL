import { isDeepStrictEqual } from "node:util";
import { applicationSpecSchema, readWorkspaceApplication, reviseWorkspaceApplication, rehearseWorkspaceApplication } from "@/products/applications/server";
import { createSupabaseSystemStore, listBusinessSystems } from "@/platform/systems";
import { createSupabaseVersionStore, readVersionActor, versionsDb } from "@/platform/system-versions/supabase-store";
import { readVersionRuntime } from "@/platform/system-versions/native-runtime";
import { manageBusinessVersion, readSystemVersion } from "@/experience/workspace/agency/version-server";
import { systemsReleasedFor } from "@/platform/systems-release";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import { WorkspaceAccessError, WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { askNativeChangeSchema, AskNativePreparationIncompleteError, AskNativeUnsupportedError, type AskNativeSystemPort } from "@/platform/ask/native-systems";
import { nativeAppItem } from "@/platform/needs-you/sources/application-release";
import { versionReleaseRevision } from "@/platform/needs-you/sources/version-release";
import type { NeedsYouStore } from "@/platform/needs-you/repository";

export async function resolveAskNativeVersion(actor: WorkspaceActor, workspaceId: string, systemId: string) {
  const db = versionsDb(), current = await readVersionActor(actor, db);
  const lineage = await createSupabaseVersionStore(db).findLineageByVersion(current, { businessId: workspaceId, systemId });
  if (!lineage) return null;
  if (lineage.version.businessId !== workspaceId || lineage.version.systemId !== systemId) throw new WorkspaceAccessError();
  const view = await readSystemVersion(actor, workspaceId, systemId, db);
  if (view.workspaceId !== workspaceId || view.systemId !== systemId || view.versionId !== lineage.id || view.rowRevision !== lineage.rowRevision || view.currentRelease !== lineage.currentRelease) throw new WorkspaceConflictError("This Version changed while it was read. Read its current state again.");
  const runtime = await readVersionRuntime(actor, lineage, db);
  if (!runtime || runtime.kind !== "internal_app") throw new AskNativeUnsupportedError("This System needs its own supported native change tool.");
  return { versionId: lineage.id, rowRevision: lineage.rowRevision, sourceSystemId: lineage.source.systemId,
    workId: runtime.workId, designRevision: runtime.designRevision, currentRelease: runtime.releaseNumber,
    definition: view.workingDefinition, canManage: view.canManage };
}

/** Canonical services remain the only writers. No publish, rollback or send port. */
export function createAskNativeSystemPort(deps: {
  decisions: Pick<NeedsYouStore, "list">;
  sync(actor: WorkspaceActor, workspaceId: string): Promise<unknown>;
  list?: (actor: WorkspaceActor, workspaceId: string) => ReturnType<typeof listBusinessSystems>;
  version?: typeof resolveAskNativeVersion;
  read?: typeof readWorkspaceApplication; revise?: typeof reviseWorkspaceApplication; rehearse?: typeof rehearseWorkspaceApplication;
  manageVersion?: typeof manageBusinessVersion; released?: typeof systemsReleasedFor; decisionsReleased?: () => boolean;
}): AskNativeSystemPort {
  const read = deps.read ?? readWorkspaceApplication;
  async function selected(actor: WorkspaceActor, scope: { workspaceId: string; systemId: string }) {
    if (!await (deps.released ?? systemsReleasedFor)(actor, scope.workspaceId)) throw new WorkspaceAccessError();
    const graph = await (deps.list ?? ((a, w) => listBusinessSystems(a, w, { store: createSupabaseSystemStore() })))(actor, scope.workspaceId);
    if (graph.businessId !== scope.workspaceId) throw new WorkspaceAccessError();
    const system = graph.systems.find(row => row.system.id === scope.systemId && row.system.businessId === scope.workspaceId);
    if (!system) throw new WorkspaceAccessError();
    if (system.system.kind !== "internal_app") throw new AskNativeUnsupportedError("This is not a supported native internal app.");
    const version = await (deps.version ?? resolveAskNativeVersion)(actor, scope.workspaceId, scope.systemId);
    const workId = system.references.savedWorkId;
    if (!workId || version && version.workId !== workId) throw new WorkspaceAccessError();
    const app = await read(actor, workId);
    if (app.id !== workId || app.workspaceId !== scope.workspaceId) throw new WorkspaceAccessError();
    if (app.productId !== "applications" || app.resourceKind !== "application" || app.payload.status === "retired" || !app.payload.candidate) throw new AskNativeUnsupportedError("This app needs operator-prepared work; arbitrary runtimes cannot be changed here.");
    if (version && (app.payload.candidate.designRevision !== version.designRevision || (app.payload.release?.version ?? null) !== version.currentRelease)) throw new WorkspaceConflictError("The native app and its Version changed. Reload before preparing a change.");
    const definition = version ? version.definition : { kind: "internal_app", ...app.payload.candidate.spec };
    if (definition.kind !== "internal_app") throw new AskNativeUnsupportedError("This Version needs its own native adapter.");
    const { kind: _kind, ...spec } = definition;
    const working = applicationSpecSchema.parse({ ...spec, maintenanceOwner: app.payload.candidate.spec.maintenanceOwner });
    return { app, version, working };
  }
  return {
    async read(actor, scope) {
      const { app, version, working } = await selected(actor, scope);
      const { maintenanceOwner: _maintenanceOwner, ...presentation } = working;
      return { workspaceId: scope.workspaceId, systemId: scope.systemId, workId: app.id,
        designRevision: app.payload.candidate!.designRevision, versionId: version?.versionId ?? null,
        rowRevision: version?.rowRevision ?? null, sourceSystemId: version?.sourceSystemId ?? null,
        candidate: presentation, rehearsal: app.payload.candidate!.rehearsal,
        currentRelease: app.payload.release?.version ?? null,
        releases: (app.payload.releases ?? []).map(release => ({ number: release.version, publishedAt: release.publishedAt, provenance: release.provenance })),
        releaseHistoryComplete: false, sourceProof: "Current native app definition and recent immutable release history; older releases remain in the native archive. Record values and account credentials are not included." };
    },
    async prepare(actor, raw) {
      const { workspaceId, systemId } = raw, input = askNativeChangeSchema.parse({ workId: raw.workId, designRevision: raw.designRevision, versionId: raw.versionId, rowRevision: raw.rowRevision, change: raw.change });
      if (!(deps.decisionsReleased ?? needsYouReleaseEnabled)()) throw new WorkspaceConflictError("Needs you is unavailable. Nothing was drafted or put live.");
      const { app, version, working } = await selected(actor, { workspaceId, systemId });
      if (app.id !== input.workId || app.payload.candidate!.designRevision !== input.designRevision || (version?.versionId ?? null) !== input.versionId || (version?.rowRevision ?? null) !== input.rowRevision) throw new WorkspaceConflictError("This exact app or Version changed. Read it again before drafting.");
      const change = input.change;
      const index = change.kind === "field_label" ? working.fields.findIndex(field => field.id === change.fieldId) : -1;
      if (change.kind === "field_label" && index < 0) throw new WorkspaceConflictError("The selected field is not in this exact app definition.");
      if ((change.kind === "title" ? working.title : working.fields[index]!.label) === change.value) throw new WorkspaceConflictError("This app already uses that title or label. Nothing was changed.");
      if (version) {
        if (!version.canManage) throw new WorkspaceAccessError();
        const manage = deps.manageVersion ?? manageBusinessVersion;
        // The Version domain compares arrays as one value; never invent an
        // unsupported dotted index override. Preserve every existing field.
        const fields = structuredClone(working.fields);
        if (change.kind === "field_label") fields[index]!.label = change.value;
        const saved = await manage(actor, { workspaceId, systemId, versionId: version.versionId, rowRevision: version.rowRevision,
          action: "override", path: change.kind === "title" ? "title" : "fields", value: change.kind === "title" ? change.value : fields });
        try {
          if (saved.outcome !== "saved" || saved.rowRevision !== version.rowRevision + 1) throw new Error("Exact saved Version unavailable");
          const prepared = await manage(actor, { workspaceId, systemId, versionId: version.versionId, rowRevision: saved.rowRevision, action: "prepare_release" });
          const receipt = prepared.receipt;
          if (prepared.outcome !== "prepared" || !receipt || !("decisionId" in receipt) || receipt.workspaceId !== workspaceId || receipt.versionId !== version.versionId || receipt.rowRevision !== saved.rowRevision) throw new Error("Exact decision unavailable");
          const decision = (await deps.decisions.list(actor, workspaceId, false)).find(row => row.id === receipt.decisionId && row.workspaceId === workspaceId && row.systemId === systemId && row.state === "open" && row.sourceLifecycle === "version_release" && row.sourceId === version.versionId && row.revisionHash === versionReleaseRevision(version.versionId, saved.rowRevision));
          if (!decision) throw new Error("Current exact release decision unavailable");
          return { workId: app.id, versionId: version.versionId, rowRevision: saved.rowRevision, decisionSyncPending: false,
            routing: { route: decision.route, itemRef: receipt.decisionId, decideAt: `/workspace?workspaceId=${encodeURIComponent(workspaceId)}` } };
        } catch { throw new AskNativePreparationIncompleteError(app.id, version.versionId, saved.rowRevision); }
      }
      const spec = structuredClone(working);
      if (change.kind === "title") spec.title = change.value; else spec.fields[index]!.label = change.value;
      const expectedRevision = input.designRevision + 1;
      const expectedSpecVersion = app.payload.candidate!.specVersion + 1;
      const saved = await (deps.revise ?? reviseWorkspaceApplication)(actor, app.id, { expectedDesignRevision: input.designRevision, spec });
      try {
        if (saved.id !== app.id || saved.workspaceId !== workspaceId || saved.payload.candidate?.designRevision !== expectedRevision || saved.payload.candidate.specVersion !== expectedSpecVersion || !isDeepStrictEqual(saved.payload.candidate.spec, spec)) throw new Error("The writer returned a different candidate");
        const rehearsed = await (deps.rehearse ?? rehearseWorkspaceApplication)(actor, app.id, { expectedDesignRevision: expectedRevision });
        if (rehearsed.id !== app.id || rehearsed.workspaceId !== workspaceId || rehearsed.payload.candidate?.designRevision !== expectedRevision || rehearsed.payload.candidate.specVersion !== expectedSpecVersion || !isDeepStrictEqual(rehearsed.payload.candidate.spec, spec)) throw new Error("The rehearsal returned a different candidate");
        const item = nativeAppItem({ id: app.id, workspaceId, title: spec.title, candidate: rehearsed.payload.candidate, release: rehearsed.payload.release ?? null });
        if (!item) throw new Error("Exact rehearsal unavailable");
        await deps.sync(actor, workspaceId);
        const decision = (await deps.decisions.list(actor, workspaceId, false)).find(row => row.workspaceId === workspaceId && row.state === "open" && row.sourceLifecycle === item.sourceLifecycle && row.sourceId === item.sourceId && row.revisionHash === item.revisionHash && row.route === "owner_decides");
        if (!decision) throw new Error("Exact decision unavailable");
        return { workId: app.id, versionId: null, rowRevision: null, decisionSyncPending: false,
          routing: { route: "owner_decides", itemRef: decision.id, decideAt: `/workspace?workspaceId=${encodeURIComponent(workspaceId)}` } };
      } catch { throw new AskNativePreparationIncompleteError(app.id, null, null); }
    },
  };
}

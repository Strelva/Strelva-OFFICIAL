import { z } from "zod";
import { canonicalJson, sha256, uuidFromSeed } from "@/platform/business-record/tenant-import";
import { factValueSchemas } from "@/platform/business-record/contracts";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { systemsReleasedFor } from "@/platform/systems-release";
import { createSupabaseSystemStore, systemOriginId, type SystemStore } from "@/platform/systems";
import { applyOverrides, createSystemVersions, VersionAccessError, VersionStaleError, VersionValidationError, type VersionActor, type VersionStore, type SystemVersions, type SystemRef } from "@/platform/system-versions";
import { createSourceSystem, createSupabaseConnectionOwnership, createSupabaseVersionStore, readVersionActor } from "@/platform/system-versions/supabase-store";
import { publishingEnabledForWorkspace, readPublishingSnapshot, type PublishingSnapshot } from "@/products/publishing/server";
import { postInputSchema } from "./contracts";
import type { prepareGoogleListingDraft } from "./workspace";

/** Shareable copy only. Google grants, location IDs and approval policy never travel upstream. */
export const googleLocationDefinitionSchema = z.object({
  kind: z.literal("google_listing"),
  hours: factValueSchemas.hours.nullable().optional(),
  post: postInputSchema.nullable().optional(),
}).strict();
export type GoogleLocationDefinition = z.infer<typeof googleLocationDefinitionSchema>;

export const googleVersionPinSchema = z.object({
  versionId: z.string().uuid(), systemId: z.string().uuid(), bindingId: z.string().uuid(),
  rowRevision: z.number().int().positive(), definitionDigest: z.string().regex(/^[a-f0-9]{64}$/),
  preparedBy: z.object({ userId: z.string().uuid(), verifiedEmail: z.string().email() }).strict(),
}).strict();
export type GoogleVersionPin = z.infer<typeof googleVersionPinSchema>;

export const googleLocationVersionCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish"), workspaceId: z.string().uuid(), sourceSystemId: z.string().uuid().optional(), name: z.string().trim().min(1).max(160), definition: googleLocationDefinitionSchema, expectedSourceRevision: z.number().int().nonnegative().default(0), summary: z.string().trim().min(1).max(500), commandId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("share"), workspaceId: z.string().uuid(), sourceSystemId: z.string().uuid(), businessId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("attach"), workspaceId: z.string().uuid(), sourceWorkspaceId: z.string().uuid(), sourceSystemId: z.string().uuid(), revision: z.number().int().positive(), bindingId: z.string().uuid(), locationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), label: z.string().trim().min(1).max(200), commandId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("override"), workspaceId: z.string().uuid(), versionId: z.string().uuid(), expectedRowRevision: z.number().int().positive(), path: z.enum(["hours", "post"]), value: z.unknown().optional() }).strict(),
  z.object({ action: z.literal("prepare"), workspaceId: z.string().uuid(), sourceSystemId: z.string().uuid(), revision: z.number().int().positive(), kind: z.enum(["hours", "post"]), versions: z.array(z.object({ workspaceId: z.string().uuid(), versionId: z.string().uuid(), expectedRowRevision: z.number().int().positive(), resolutions: z.array(z.object({ path: z.string().max(300), choice: z.enum(["keep_local", "take_upstream"]) }).strict()).max(100).optional() }).strict()).min(1).max(100), commandId: z.string().uuid() }).strict(),
]);

export interface GoogleLocationVersionsDeps {
  store: VersionStore;
  versions: SystemVersions;
  systems: SystemStore;
  actor(actor: WorkspaceActor): Promise<VersionActor>;
  enabled(actor: WorkspaceActor, workspaceId: string): Promise<boolean>;
  snapshot(actor: WorkspaceActor, workspaceId: string): Promise<PublishingSnapshot>;
  source: typeof createSourceSystem;
  prepare: typeof prepareGoogleListingDraft;
}
export function googleLocationVersionsDeps(): GoogleLocationVersionsDeps {
  const store = createSupabaseVersionStore();
  return {
    store, versions: createSystemVersions({ store, connections: createSupabaseConnectionOwnership() }), systems: createSupabaseSystemStore(),
    actor: readVersionActor, enabled: async (actor, id) => await systemsReleasedFor(actor, id) && await publishingEnabledForWorkspace(id, actor),
    snapshot: readPublishingSnapshot, source: createSourceSystem, prepare: async (...args) => (await import("./workspace")).prepareGoogleListingDraft(...args),
  };
}

async function requireEnabled(deps: GoogleLocationVersionsDeps, actor: WorkspaceActor, workspaceId: string) {
  if (!(await deps.enabled(actor, workspaceId))) throw new VersionAccessError("Google location Versions are not enabled for this business.");
}

/** A stored System and a live business-owned target must agree. Nothing is inferred from names or payer. */
async function locationTarget(deps: GoogleLocationVersionsDeps, actor: WorkspaceActor, ref: SystemRef) {
  const snapshot = await deps.snapshot(actor, ref.businessId);
  if (snapshot.businessId !== ref.businessId || snapshot.scope !== "business") throw new VersionAccessError();
  const detail = await deps.systems.readSystem(actor, ref);
  if (detail.system.kind !== "listing" || detail.system.origin?.kind !== "google_location") throw new VersionValidationError("This Version is not a Google listing.");
  for (const binding of snapshot.bindings) for (const location of binding.locations) {
    if (binding.workspaceId !== ref.businessId || !binding.originTenantId || binding.status !== "connected") continue;
    const origin = { kind: "google_location" as const, ref: `${binding.id}:${location.locationId}` };
    if (systemOriginId(ref.businessId, origin) === ref.systemId && detail.system.origin.ref === origin.ref) {
      return { workspaceId: ref.businessId, tenantId: binding.originTenantId, bindingId: binding.id, locationId: location.locationId };
    }
  }
  throw new VersionValidationError("Connect this location's own Google account first.");
}

export async function readGoogleLocationVersion(actor: WorkspaceActor, workspaceId: string, versionId: string, deps = googleLocationVersionsDeps()) {
  await requireEnabled(deps, actor, workspaceId);
  const versionActor = await deps.actor(actor);
  const lineage = await deps.store.getLineage(versionActor, versionId);
  if (!lineage || lineage.version.businessId !== workspaceId) throw new VersionAccessError();
  const view = await deps.versions.readVersion(versionActor, versionId);
  await locationTarget(deps, actor, lineage.version);
  googleLocationDefinitionSchema.parse(view.workingDefinition);
  return { version: view, rowRevision: lineage.rowRevision, improvements: await deps.versions.listAvailableImprovements(versionActor, versionId) };
}

/** Explicitly attach locations: #242's one-business/two-business decision is never guessed. */
export async function commandGoogleLocationVersions(actor: WorkspaceActor, raw: unknown, deps = googleLocationVersionsDeps()) {
  const input = googleLocationVersionCommandSchema.parse(raw);
  await requireEnabled(deps, actor, input.workspaceId);
  const versionActor = await deps.actor(actor);
  if (!versionActor.memberships.some(row => row.businessId === input.workspaceId && (row.role === "owner" || row.role === "admin"))) throw new VersionAccessError();
  if (input.action === "publish") {
    const source = input.sourceSystemId ? { businessId: input.workspaceId, systemId: input.sourceSystemId } : (await deps.source(versionActor, {
      businessId: input.workspaceId, name: input.name, kind: "listing", hidden: true, commandId: input.commandId,
    })).source;
    // The supplied source must be a listing source, not an unrelated Library System.
    const detail = await deps.systems.readSystem(actor, source);
    if (detail.system.kind !== "listing") throw new VersionValidationError("Choose a Google listing source.");
    const latest = (await deps.store.listRevisions(versionActor, source)).at(-1);
    if ((latest?.source.number ?? 0) !== input.expectedSourceRevision) {
      if (latest?.source.number === input.expectedSourceRevision + 1 && latest.summary === input.summary && canonicalJson(latest.definition) === canonicalJson(input.definition)) return { source, revision: latest, replayed: true };
      throw new VersionStaleError("The source changed. Reload it before publishing another improvement.");
    }
    const revision = await deps.versions.publishSourceRevision(versionActor, { source, definition: input.definition, summary: input.summary, requires: { bindingKinds: [] } });
    return { source, revision };
  }
  if (input.action === "share") {
    const source = { businessId: input.workspaceId, systemId: input.sourceSystemId };
    const revisions = await deps.store.listRevisions(versionActor, source);
    googleLocationDefinitionSchema.parse(revisions.at(-1)?.definition);
    await deps.versions.shareSource(versionActor, source, input.businessId);
    return { shared: true };
  }
  if (input.action === "attach") {
    const snapshot = await deps.snapshot(actor, input.workspaceId);
    if (snapshot.businessId !== input.workspaceId || snapshot.scope !== "business") throw new VersionAccessError();
    const binding = snapshot.bindings.find(row => row.id === input.bindingId && row.workspaceId === input.workspaceId && row.originTenantId);
    const location = binding?.locations.find(row => row.locationId === input.locationId);
    if (!binding || !location) throw new VersionAccessError();
    const source = { businessId: input.sourceWorkspaceId, systemId: input.sourceSystemId };
    const revision = await deps.store.getRevision(versionActor, source, input.revision);
    if (!revision) throw new VersionAccessError();
    googleLocationDefinitionSchema.parse(revision.definition);
    const origin = { kind: "google_location" as const, ref: `${binding.id}:${location.locationId}` };
    const ref = { businessId: input.workspaceId, systemId: systemOriginId(input.workspaceId, origin) };
    const graph = await deps.systems.readGraph(actor, input.workspaceId);
    let adopted = graph.systems.find(row => row.id === ref.systemId);
    if (!adopted) adopted = await deps.systems.createSystem(actor, input.workspaceId, { name: location.title ?? input.label, kind: "listing", origin }, input.commandId);
    if (!adopted.currentRevision) {
      adopted = (await deps.systems.recordRevision(actor, ref, adopted.changeNumber, {
        implementation: { kind: "google_location", ref: origin.ref }, summary: "Connected Google listing adopted for location lineage. No Google change was sent.",
      }, uuidFromSeed(`google-location-adoption:${input.commandId}`))).system;
    }
    if (adopted.lifecycle === "draft") await deps.systems.transitionLifecycle(actor, ref, adopted.changeNumber, snapshot.controls?.find(row => row.locationId === location.locationId)?.paused ? "paused" : "live");
    const prior = await deps.store.findLineageByVersion(versionActor, ref);
    if (prior) {
      if (prior.source.businessId !== source.businessId || prior.source.systemId !== source.systemId || prior.context.kind !== "location" || prior.context.label !== input.label) throw new VersionValidationError("This listing already descends from a different source or context.");
      return { lineage: prior, replayed: true };
    }
    return { lineage: await deps.versions.createVersion(versionActor, { source: revision.source, version: ref, context: { kind: "location", label: input.label } }) };
  }
  if (input.action === "override") {
    const lineage = await deps.store.getLineage(versionActor, input.versionId);
    if (!lineage || lineage.version.businessId !== input.workspaceId) throw new VersionAccessError();
    await locationTarget(deps, actor, lineage.version);
    const value = input.value === undefined ? undefined : input.path === "hours" ? factValueSchemas.hours.nullable().parse(input.value) : postInputSchema.nullable().parse(input.value);
    return { lineage: await deps.versions.setOverride(versionActor, input.versionId, { path: input.path, value, expectedRowRevision: input.expectedRowRevision }) };
  }
  const source = { businessId: input.workspaceId, systemId: input.sourceSystemId };
  const results = [];
  const seen = new Set<string>();
  for (const selected of input.versions) {
    if (seen.has(selected.versionId)) continue;
    seen.add(selected.versionId);
    try {
      await requireEnabled(deps, actor, selected.workspaceId);
      if (!versionActor.memberships.some(row => row.businessId === selected.workspaceId && (row.role === "owner" || row.role === "admin"))) throw new VersionAccessError();
      let lineage = await deps.store.getLineage(versionActor, selected.versionId);
      if (!lineage || lineage.version.businessId !== selected.workspaceId || lineage.source.businessId !== source.businessId || lineage.source.systemId !== source.systemId || lineage.context.kind !== "location") throw new VersionAccessError();
      if (lineage.rowRevision !== selected.expectedRowRevision) throw new VersionStaleError();
      const target = await locationTarget(deps, actor, lineage.version);
      const offered = await deps.store.getRevision(versionActor, source, input.revision);
      if (!offered) throw new VersionAccessError();
      const offeredDefinition = googleLocationDefinitionSchema.parse(offered.definition);
      if (input.kind === "hours" && offeredDefinition.hours === undefined || input.kind === "post" && !offeredDefinition.post) throw new VersionValidationError("This source has no change of that kind to offer.");
      // Three-way compare and explicit conflict choices remain owned by Versions.
      if (lineage.baseline.revision < input.revision) {
        lineage = await deps.versions.adoptImprovement(versionActor, lineage.id, { revision: input.revision, expectedRowRevision: lineage.rowRevision, resolutions: selected.resolutions });
      } else if (lineage.baseline.revision !== input.revision) throw new VersionStaleError();
      const definition = googleLocationDefinitionSchema.parse(applyOverrides(lineage.baseline.definition, lineage.overrides));
      if (input.kind === "hours" && definition.hours === undefined || input.kind === "post" && !definition.post) throw new VersionValidationError("This source has no change of that kind to offer.");
      const pin: GoogleVersionPin = { versionId: lineage.id, systemId: lineage.version.systemId, bindingId: target.bindingId, rowRevision: lineage.rowRevision, definitionDigest: sha256(canonicalJson(definition)), preparedBy: actor };
      // Adoption changes working copy only. This event is each location's own approval; never approve here.
      const event = await deps.prepare(actor, { workspaceId: target.workspaceId, tenantId: target.tenantId, locationId: target.locationId, kind: input.kind, ...(input.kind === "post" ? { post: definition.post! } : {}), commandId: uuidFromSeed(`google-version-draft:${input.commandId}:${lineage.id}`) }, { pin, ...(input.kind === "hours" ? { hours: definition.hours! } : {}) });
      results.push({ versionId: lineage.id, workspaceId: selected.workspaceId, status: "needs_approval" as const, eventId: event.id, rowRevision: lineage.rowRevision });
    } catch (error) {
      results.push({ versionId: selected.versionId, workspaceId: selected.workspaceId, status: "blocked" as const, reason: error instanceof Error ? error.message : "This location could not be prepared." });
    }
  }
  return { source, revision: input.revision, results };
}

/** Checked again just before dispatch, including sessionless owner approvals. A pin grants no write authority. */
export async function googleVersionDraftCurrent(input: { workspaceId: string; locationId: string; bindingId: string | null; pin: GoogleVersionPin; draft: unknown }, store: VersionStore = createSupabaseVersionStore()): Promise<boolean> {
  const pin = googleVersionPinSchema.parse(input.pin);
  const lineage = await store.getLineage({ ...pin.preparedBy, memberships: [] }, pin.versionId);
  if (!lineage || lineage.version.businessId !== input.workspaceId || lineage.version.systemId !== pin.systemId || lineage.context.kind !== "location" || lineage.rowRevision !== pin.rowRevision || input.bindingId !== pin.bindingId) return false;
  if (pin.systemId !== systemOriginId(input.workspaceId, { kind: "google_location", ref: `${pin.bindingId}:${input.locationId}` })) return false;
  const definition = googleLocationDefinitionSchema.parse(applyOverrides(lineage.baseline.definition, lineage.overrides));
  if (sha256(canonicalJson(definition)) !== pin.definitionDigest) return false;
  const draft = z.discriminatedUnion("action", [z.object({ action: z.literal("hours"), hours: factValueSchemas.hours.nullable() }), z.object({ action: z.literal("post"), post: postInputSchema })]).safeParse(input.draft);
  return draft.success && canonicalJson(draft.data.action === "hours" ? draft.data.hours : draft.data.post) === canonicalJson(draft.data.action === "hours" ? definition.hours : definition.post);
}

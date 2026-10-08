import { bookingAgentVisibilityEnabled } from "@/platform/bookings/flags";
/**
 * Server reads behind the agency surface. Each one runs under the signed-in
 * actor; Postgres rechecks access on every row.
 *
 * - `readAgencyClientsPage`: `agency_client_overview`, one call for a page of
 *   every client (20261007150100_agency_client_overview.sql).
 * - `readAgencyLibrary`: the agency's sources (`read_workspace_version_sources`)
 *   and, for each client Version the actor may read, its improvement state from
 *   the Versions service's three-way compare.
 * - `reviewAllImprovements`: "Review all". For each selected Version that is
 *   ready, adopt the latest revision into its working definition so it waits
 *   as a Possibility for that client's own approval. Conflicted, missing-account
 *   and up-to-date Versions are skipped, never forced. Nothing is released
 *   here: going live is a separate release through the release gate.
 */
import { z } from "zod";
import { inquiryReleaseMayBeOn, inquiryReleaseEnabledForWorkspace, inquiryReleasedForCurrentUser, discoverInquiryPortfolio } from "@/products/inquiries";
import { readLinkedSites } from "@/platform/owner-entry/linked-sites";
import { resolveInquiryWorkspace } from "@/products/inquiries/server";
import { operatorQueueReleaseEnabled } from "@/platform/operator-queue/release";
import { addAgencyOperatorOverview } from "./agency/operator-overview";
import { systemsReleasedFor } from "@/platform/systems-release";
import { prepareVersionRelease, type VersionPreparationReceipt } from "@/platform/system-versions/preparation";
import type { VersionLineage } from "@/platform/system-versions";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import { createSystemVersions, improvementState, type VersionActor } from "@/platform/system-versions";
import {
  createSupabaseConnectionOwnership,
  createSupabaseVersionStore,
  mapVersionsError,
  readVersionActor,
  versionsDb,
  type VersionsDb,
} from "@/platform/system-versions/supabase-store";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  AGENCY_CLIENT_PAGE_SIZE,
  agencyClientsPageSchema,
  type AgencyBulkReviewResult,
  type AgencyClientsPage,
  type AgencyLibrary,
  type AgencyLibraryVersion,
} from "./agency-clients";

const uuid = z.string().uuid();

function actorArgs(actor: WorkspaceActor) {
  return { p_user_id: uuid.parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()) };
}

async function rpc(db: VersionsDb, name: string, args: Record<string, unknown>, fallback: string): Promise<unknown> {
  const { data, error } = await db.rpc(name, args);
  if (error) mapVersionsError(error, fallback);
  return data;
}

export async function readAgencyClientsPage(
  actor: WorkspaceActor,
  agencyWorkspaceId: string,
  cursor: string | null,
  db: VersionsDb = versionsDb(),
): Promise<AgencyClientsPage> {
  const released = operatorQueueReleaseEnabled();
  const data = await rpc(db, released ? "agency_client_overview_v2" : "agency_client_overview", {
    p_agency_workspace_id: uuid.parse(agencyWorkspaceId), ...actorArgs(actor),
    p_cursor: cursor ? uuid.parse(cursor) : null, p_limit: AGENCY_CLIENT_PAGE_SIZE,
  }, "Clients could not be loaded.");
  const parsed = agencyClientsPageSchema.safeParse(data);
  if (!parsed.success || parsed.data.agencyWorkspaceId !== agencyWorkspaceId) throw new WorkspaceStoreError("Clients could not be loaded. The response was malformed.");
  const page = { ...parsed.data, clients: parsed.data.clients.map(client => ({ ...client,
    ...(bookingAgentVisibilityEnabled() && client.systems.some(system => ["booking", "bookings"].includes(system.kind)) ? { agentBookings: true } : {}) })) };
  return released ? addAgencyOperatorOverview(actor, page) : page;
}

const sourcesSchema = z.object({
  workspaceId: uuid,
  sources: z.array(z.object({
    systemId: uuid, workspaceId: uuid, hidden: z.boolean(), name: z.string(),
    revisions: z.array(z.object({ number: z.number().int().positive(), label: z.string().nullable(), summary: z.string(), publishedAt: z.string() }).strict()),
    versions: z.array(z.object({
      versionId: uuid, workspaceId: uuid, clientName: z.string(), systemId: uuid, systemName: z.string(),
      access: z.enum(["full", "lineage", "lineage_and_data"]),
    }).strict()),
  }).strict()),
}).strict();

function services(actor: WorkspaceActor, db: VersionsDb) {
  const store = createSupabaseVersionStore(db);
  return {
    store,
    versions: createSystemVersions({ store, connections: createSupabaseConnectionOwnership(db) }),
    actor: readVersionActor(actor, db),
  };
}

async function readSources(actor: WorkspaceActor, agencyWorkspaceId: string, db: VersionsDb) {
  const data = await rpc(db, "read_workspace_version_sources", { p_workspace_id: uuid.parse(agencyWorkspaceId), ...actorArgs(actor) },
    "The library could not be loaded.");
  const parsed = sourcesSchema.safeParse(data);
  if (!parsed.success || parsed.data.workspaceId !== agencyWorkspaceId) throw new WorkspaceStoreError("The library could not be loaded. The response was malformed.");
  return parsed.data.sources;
}

export async function readAgencyLibrary(actor: WorkspaceActor, agencyWorkspaceId: string, db: VersionsDb = versionsDb()): Promise<AgencyLibrary> {
  const sources = await readSources(actor, agencyWorkspaceId, db);
  const { versions, actor: pending } = services(actor, db);
  const versionActor: VersionActor = await pending;
  const result: AgencyLibrary = { agencyWorkspaceId, sources: [] };
  for (const source of sources) {
    const rows: AgencyLibraryVersion[] = [];
    for (const item of source.versions) {
      try {
        const view = await versions.readVersion(versionActor, item.versionId);
        const base = {
          versionId: item.versionId, workspaceId: item.workspaceId, clientName: item.clientName, systemId: item.systemId, systemName: item.systemName,
          context: view.context, baselineRevision: view.baselineRevision, currentRelease: view.currentRelease,
        };
        if (view.access !== "owner") {
          // A grant shows lineage, not accounts: the compare cannot be finished honestly.
          rows.push({ ...base, state: "unavailable", conflicts: [], missingBindings: [], declinedReason: null });
          continue;
        }
        const offers = await versions.listAvailableImprovements(versionActor, item.versionId);
        const { state, latest, declinedReason } = improvementState(offers, view.decisions);
        rows.push({
          ...base, state, declinedReason,
          conflicts: (latest?.conflicts ?? []).map((conflict) => ({ path: conflict.path, local: conflict.local ?? null, upstream: conflict.upstream ?? null })),
          missingBindings: latest?.missingBindings ?? [],
        });
      } catch {
        // One Version that cannot be read is named; the rest still load.
        rows.push({
          versionId: item.versionId, workspaceId: item.workspaceId, clientName: item.clientName, systemId: item.systemId, systemName: item.systemName,
          context: { kind: "agency_client", label: item.clientName }, baselineRevision: 1, currentRelease: null,
          state: "unavailable", conflicts: [], missingBindings: [], declinedReason: null,
        });
      }
    }
    result.sources.push({
      systemId: source.systemId, workspaceId: source.workspaceId, name: source.name, hidden: source.hidden,
      revisions: source.revisions.map((revision) => ({ number: revision.number, label: revision.label, summary: revision.summary, publishedAt: revision.publishedAt })),
      versions: rows,
    });
  }
  if (inquiryReleaseMayBeOn() && await inquiryReleaseEnabledForWorkspace(agencyWorkspaceId, { userId: actor.userId, operator: false, tester: false })) {
    try {
      // Source access is the agency's own current links; target access is the
      // existing portfolio's freshly checked tenant membership. No definition,
      // credential, inquiry, approval or connection is copied into lineage.
      const linked = await readLinkedSites(actor, agencyWorkspaceId);
      const sourceIds = new Set([agencyWorkspaceId, ...await Promise.all(linked.sites.map(async site =>
        (await resolveInquiryWorkspace({ tenantId: site.tenantId, tenantStableId: site.tenantStableId, fallbackBusinessId: site.tenantStableId })).businessId))]);
      const portfolio = await discoverInquiryPortfolio(undefined, inquiryReleasedForCurrentUser);
      result.inquiryVersions = (portfolio.versions ?? []).filter(item => sourceIds.has(item.sourceBusinessId));
      if (portfolio.unavailableTenantIds.length) result.inquiryVersionsUnavailable = true;
    } catch { result.inquiryVersionsUnavailable = true; }
  }
  return result;
}

export async function reviewAllImprovements(
  actor: WorkspaceActor,
  input: { agencyWorkspaceId: string; sourceSystemId: string; revision: number; versionIds: string[] },
  db: VersionsDb = versionsDb(),
  prepare: ((actor: WorkspaceActor, lineage: VersionLineage) => Promise<VersionPreparationReceipt | null>) | null = needsYouReleaseEnabled() ? (actor, lineage) => prepareVersionRelease(actor, lineage, { db }) : null,
): Promise<AgencyBulkReviewResult> {
  const sources = await readSources(actor, input.agencyWorkspaceId, db);
  const source = sources.find((item) => item.systemId === input.sourceSystemId);
  if (!source) throw new WorkspaceStoreError("That source is not in this library.");
  const latest = source.revisions.at(-1)?.number;
  if (latest !== input.revision) throw new WorkspaceStoreError("A newer revision was published. Reload the library.");
  const { versions, store, actor: pending } = services(actor, db);
  const versionActor = await pending;
  const results: AgencyBulkReviewResult["results"] = [];
  for (const versionId of [...new Set(input.versionIds)]) {
    const item = source.versions.find((version) => version.versionId === versionId);
    if (!item) {
      results.push({ versionId, workspaceId: input.agencyWorkspaceId, clientName: "Unknown", outcome: "failed", detail: "Not a Version of this source you can open." });
      continue;
    }
    const named = { versionId, workspaceId: item.workspaceId, clientName: item.clientName };
    try {
      if (!prepare || !(await systemsReleasedFor(actor, item.workspaceId))) throw new WorkspaceStoreError("Review is not enabled for this business. Nothing was adopted.");
      // One business, one decision: each Version is prepared on its own.
      const comparison = await versions.compareImprovement(versionActor, versionId, input.revision);
      if (comparison.status === "up_to_date") {
        // A reply lost after adoption can resume the decision/receipt without adopting twice.
        const existing = await store.getLineage(versionActor, versionId);
        const receipt = existing ? await prepare(actor, existing) : null;
        results.push(receipt ? { ...named, outcome: "prepared", detail: "The draft and its release decision are ready. Nothing went live.", ...receipt } : { ...named, outcome: "skipped_up_to_date", detail: "Already includes this revision." });
        continue;
      }
      if (comparison.conflicts.length) {
        results.push({ ...named, outcome: "skipped_conflicts", detail: `Needs a choice on ${comparison.conflicts.length} change${comparison.conflicts.length === 1 ? "" : "s"}.` });
        continue;
      }
      if (comparison.missingBindings.length) {
        results.push({ ...named, outcome: "skipped_missing_accounts", detail: `Needs ${comparison.missingBindings.join(", ")} connected first.` });
        continue;
      }
      const lineage = await store.getLineage(versionActor, versionId);
      if (!lineage) throw new Error("This Version is unavailable.");
      const adopted = await versions.adoptImprovement(versionActor, versionId, { revision: input.revision, expectedRowRevision: lineage.rowRevision });
      const receipt = await prepare(actor, adopted);
      results.push({ ...named, outcome: "prepared", detail: receipt ? `Ready for ${item.clientName}'s release decision. Nothing is live yet.` : "The working definition is prepared. Needs you is off; no release decision was opened.", ...(receipt ?? {}) });
    } catch (error) {
      results.push({ ...named, outcome: "failed", detail: error instanceof Error ? error.message.slice(0, 300) : "Could not prepare." });
    }
  }
  return { sourceSystemId: input.sourceSystemId, revision: input.revision, results };
}

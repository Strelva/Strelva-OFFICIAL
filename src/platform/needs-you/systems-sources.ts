/**
 * The Systems-side Needs you sources, wired to their live resolvers: Make
 * real (one owner approval per plan) and Version releases (the release gate's
 * approvals port). Both are off unless Systems is on for the business.
 */
import { makeRealForWorkspace, readyMakeRealPlans } from "@/experience/systems/server";
import { systemsReleaseEnabledForWorkspace } from "@/platform/systems-release";
import { changedPaths, createSystemVersions, createVersionReleaseGate, jsonEqual } from "@/platform/system-versions";
import {
  createSupabaseConnectionOwnership,
  createSupabaseVersionStore,
  readBusinessVersions,
  readVersionActor,
} from "@/platform/system-versions/supabase-store";
import { listWork } from "@/platform/workspaces";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { listManagedPresenceWork } from "@/products/managed-presence/server";
import type { SourceAdapter } from "./adapters";
import type { NeedsYouStore } from "./repository";
import { createNeedsYouService, type DecideStatus, type NeedsYouDeps } from "./service";
import type { WorkspaceMakeRealResult } from "@/experience/workspace/contracts";
import { makeRealAdapter, needsYouMakeRealApprovals, type ReadyPlan } from "./sources/make-real";
import { versionReleaseAdapter, type PendingVersionRelease } from "./sources/version-release";
import { recordServiceAction } from "./service-actor";

function systemsOn(workspaceId: string, actor: WorkspaceActor): Promise<boolean> {
  return systemsReleaseEnabledForWorkspace(workspaceId, { operator: false, tester: false, userId: actor.userId }).catch(() => false);
}

async function liveDeps(actor: WorkspaceActor, workspaceId: string) {
  const managed = await listManagedPresenceWork().catch(() => ({ managedWork: [] as Array<{ id: string; domain?: string }> }));
  return {
    actor,
    businessId: workspaceId,
    savedWork: await listWork(actor, workspaceId),
    siteDomains: new Map(managed.managedWork.flatMap((site) => site.domain ? [[site.id, site.domain] as const] : [])),
  };
}

async function pendingVersionReleases(actor: WorkspaceActor, workspaceId: string): Promise<PendingVersionRelease[]> {
  const lineage = await readBusinessVersions(actor, workspaceId);
  if (!lineage.versions.length) return [];
  const store = createSupabaseVersionStore();
  const versions = createSystemVersions({ store, connections: createSupabaseConnectionOwnership() });
  const versionActor = await readVersionActor(actor);
  const pending: PendingVersionRelease[] = [];
  for (const item of lineage.versions) {
    const row = await store.getLineage(versionActor, item.id);
    if (!row || row.version.businessId !== workspaceId) continue;
    const view = await versions.readVersion(versionActor, item.id);
    const latest = row.releases.at(-1);
    if (latest && jsonEqual(latest.definition, view.workingDefinition)) continue;
    pending.push({
      versionId: item.id,
      systemId: item.systemId,
      label: item.context.label,
      rowRevision: row.rowRevision,
      nextRelease: (latest?.number ?? 0) + 1,
      changedPaths: changedPaths(latest?.definition ?? row.baseline.definition, view.workingDefinition),
    });
  }
  return pending;
}

/** Stored plans with a live channel on (systems-live). Lazy: the live bindings load the write paths. */
async function liveReadyPlans(workspaceId: string): Promise<ReadyPlan[]> {
  const { readLiveReadyPlans } = await import("@/platform/make-real/live-server");
  return readLiveReadyPlans(workspaceId);
}

/**
 * The one `make_real` Needs you source. Plans come from two places: the
 * per-request website-rebuild Possibilities (run on the isolated copy) and,
 * where a live channel is on, the stored Possibilities (run live, durably,
 * src/platform/make-real/live.ts). Same item shape, same
 * `<possibility>@<revision>` source id, same approval reader.
 */
function makeRealSource(store: NeedsYouStore, onResult?: (result: WorkspaceMakeRealResult) => void): SourceAdapter {
  return makeRealAdapter({
    enabled: systemsOn,
    readyPlans: async (actor, workspaceId) => readyMakeRealPlans(await liveDeps(actor, workspaceId)),
    livePlans: liveReadyPlans,
    policies: (actor, workspaceId) => store.policies(actor, workspaceId),
    // The one logged run for an owner with no account (owner-entry decision 6).
    recordLinkRun: (session, subject, detail) => recordServiceAction(session, "run", subject, detail),
    async start(actor, workspaceId, possibilityId, approvalId) {
      const live = (await liveReadyPlans(workspaceId)).find((plan) => plan.possibilityId === possibilityId);
      if (live) {
        const { startLiveMakeReal } = await import("@/platform/make-real/live-server");
        return startLiveMakeReal({ actor, workspaceId, possibilityId, approvalId, title: live.title });
      }
      const result = await makeRealForWorkspace(await liveDeps(actor, workspaceId), possibilityId, { canActivate: true }, {
        planApproval: { approvalId, approvals: needsYouMakeRealApprovals((ws, id) => store.read(ws, id)) },
      });
      if (result) onResult?.(result);
      return result ? { status: result.status, isolated: result.isolated, liveUnchanged: result.liveUnchanged, headline: result.headline } : null;
    },
  });
}

/**
 * The owner's "Make it live" on the System page, through Needs you: the same
 * item, the same one approval per plan and the same resolver as Home and the
 * email link. Null: no open Make real decision for this possibility.
 */
export async function makeRealThroughNeedsYou(
  actor: WorkspaceActor,
  workspaceId: string,
  possibilityId: string,
  deps: { store: NeedsYouStore; appOrigin: string; sendEmail: NeedsYouDeps["sendEmail"]; adapter?: (onResult: (result: WorkspaceMakeRealResult) => void) => SourceAdapter },
): Promise<{ status: DecideStatus; result: WorkspaceMakeRealResult | null; reason: string | null; receiptRef: string | null } | null> {
  let captured: WorkspaceMakeRealResult | null = null;
  const capture = (result: WorkspaceMakeRealResult) => { captured = result; };
  const service = createNeedsYouService({
    store: deps.store,
    adapters: [deps.adapter ? deps.adapter(capture) : makeRealSource(deps.store, capture)],
    sendEmail: deps.sendEmail,
    appOrigin: deps.appOrigin,
    now: () => Date.now(),
  });
  await service.sync({ workspaceId, actor });
  const item = (await deps.store.list(actor, workspaceId, false))
    .find((row) => row.state === "open" && row.sourceLifecycle === "make_real" && row.sourceId.startsWith(`${possibilityId}@`));
  if (!item) return null;
  const decided = await service.decide({ workspaceId, itemId: item.id, revision: item.revisionHash, decision: "approve", by: { kind: "session", actor } });
  return { status: decided.status, result: captured, reason: decided.item?.outcomeReason ?? null, receiptRef: decided.item?.receiptRef ?? null };
}

export function systemsSourceAdapters(store: NeedsYouStore): SourceAdapter[] {
  return [
    makeRealSource(store),
    versionReleaseAdapter({
      enabled: systemsOn,
      pending: pendingVersionReleases,
      policies: (actor, workspaceId) => store.policies(actor, workspaceId),
      read: (workspaceId, itemId) => store.read(workspaceId, itemId),
      async release(actor, input) {
        const store = createSupabaseVersionStore();
        const gate = createVersionReleaseGate({
          versions: createSystemVersions({ store, connections: createSupabaseConnectionOwnership() }),
          approvals: input.approvals,
        });
        const released = await gate.release(await readVersionActor(actor), input.versionId, { expectedRowRevision: input.expectedRowRevision });
        return { releaseNumber: released.lineage.currentRelease };
      },
    }),
  ];
}

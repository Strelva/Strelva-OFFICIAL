import { CONTROL_PLANE_URL } from "@/platform/infra/brand";
/**
 * Make real from the System page: which path a request takes. Server only.
 *
 * - A per-request rebuild Possibility (`website-rebuild:<workId>`) runs on
 *   the isolated copy, as before.
 * - A stored rebuild can rehearse while its exact effect channels are not
 *   all released. Other stored plans are unavailable until they can execute.
 * - With every exact effect channel on, the signed-in owner's tap IS the Needs you
 *   decision: the item for this plan is opened (or found) and approved as a
 *   session decision, which starts the durable activation. One approval
 *   store, keyed by workspace; the same path as the email link.
 */
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { MakeRealChannel } from "@/platform/possibilities/contracts";
import { livePlanChannelsAvailable } from "@/platform/make-real/execution-availability";
import type { WorkspaceLiveMakeRealResult } from "@/experience/workspace/contracts";
import { REBUILD_SOURCE_PREFIX } from "./stored-possibilities";

export type MakeRealPath =
  | { kind: "isolated"; possibilityId: string }
  | { kind: "live"; result: WorkspaceLiveMakeRealResult }
  | null;

export interface LiveMakeRealPorts {
  isStored(id: string): boolean;
  sourceRef(actor: WorkspaceActor, workspaceId: string, possibilityId: string): Promise<{ found: false } | { found: true; sourceRef: string | null; status: string; channels?: (MakeRealChannel | undefined)[] }>;
  liveEnabled(workspaceId: string, channels?: readonly (MakeRealChannel | undefined)[]): Promise<boolean>;
  /** Open (or find) the plan's Needs you item and approve it as this signed-in owner. */
  approve(actor: WorkspaceActor, workspaceId: string, possibilityId: string): Promise<{ status: string; reason: string | null; activationId: string | null } | null>;
}

export async function makeRealPath(actor: WorkspaceActor, workspaceId: string, possibilityId: string, ports: LiveMakeRealPorts, expectedExecution?: "live" | "rehearsal"): Promise<MakeRealPath> {
  if (!ports.isStored(possibilityId)) return expectedExecution === "live" ? null : { kind: "isolated", possibilityId };
  const stored = await ports.sourceRef(actor, workspaceId, possibilityId);
  if (!stored.found) return null;
  const live = await ports.liveEnabled(workspaceId, stored.channels);
  if (expectedExecution && (live ? "live" : "rehearsal") !== expectedExecution) return null;
  if (!live) {
    return stored.sourceRef?.startsWith(REBUILD_SOURCE_PREFIX) ? { kind: "isolated", possibilityId: stored.sourceRef } : null;
  }
  if (stored.status !== "ready") return { kind: "live", result: { live: true, status: "not_ready", headline: "It isn't ready to make live yet. Strelva is still building or checking it.", activationId: null } };
  const decided = await ports.approve(actor, workspaceId, possibilityId);
  if (!decided) return { kind: "live", result: { live: true, status: "not_ready", headline: "There is nothing waiting for your approval on this yet.", activationId: null } };
  const headline = decided.status === "done" ? "Live."
    : decided.status === "done_unverified" ? decided.reason ?? "Partly live"
      : decided.status === "changed" ? "This changed since it was shown to you. Reload to see the latest."
        : decided.status === "already_handled" ? "This was already decided."
          : decided.reason ?? "Make real could not start. Your live systems are unchanged.";
  return { kind: "live", result: { live: true, status: decided.status, headline, activationId: decided.activationId } };
}

/** The production ports. The approval goes through the one Make real Needs you source. */
export async function liveMakeRealPorts(expectedPlan?: { candidateRevision: number; fingerprint: string }): Promise<LiveMakeRealPorts> {
  const [{ createSupabasePossibilityRepository, isStoredPossibilityId }, server, { makeRealThroughNeedsYou }, { PostgresNeedsYouStore }, { sendEmailWithReceipt }] = await Promise.all([
    import("@/platform/possibilities/supabase-repository"),
    import("@/experience/systems/live-server"),
    import("@/server/needs-you/systems-sources"),
    import("@/platform/needs-you/repository"),
    import("@/platform/infra/email/send"),
  ]);
  return {
    isStored: isStoredPossibilityId,
    async sourceRef(actor, workspaceId, possibilityId) {
      const row = (await createSupabasePossibilityRepository(actor).listWithSources(workspaceId)).find((item) => item.possibility.id === possibilityId);
      return row ? { found: true, sourceRef: row.sourceRef, status: row.possibility.status, channels: row.possibility.effects.map(effect => effect.channel) } : { found: false };
    },
    liveEnabled: async (workspaceId, channels) => livePlanChannelsAvailable(channels ?? [], channel => server.makeRealChannelEnabled(workspaceId, channel)),
    async approve(actor, workspaceId, possibilityId) {
      const decided = await makeRealThroughNeedsYou(actor, workspaceId, possibilityId, {
        expectedPlan, google: server.googleMakeRealPorts, store: PostgresNeedsYouStore, sendEmail: sendEmailWithReceipt,
        appOrigin: process.env.NEXT_PUBLIC_APP_URL || CONTROL_PLANE_URL,
      });
      if (!decided) return null;
      if (decided.status === "forbidden" || decided.status === "not_owner") throw new WorkspaceAccessError("Only an owner of this business can make a possibility real.");
      return { status: decided.status, reason: decided.reason, activationId: decided.receiptRef };
    },
  };
}

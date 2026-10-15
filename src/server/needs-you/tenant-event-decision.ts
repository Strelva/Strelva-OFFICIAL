/**
 * A signed-in decision on one tenant event, recorded once through the
 * business's Needs you item (STRELVA_ONE_APPROVAL_PATH). The owner's and an
 * agency's decisions on a converted business land as one owner_decisions row
 * that resolves through the tenant-event adapter's own resolver. Anything the
 * item path does not cover (flag off, a tenant with no business, an item on
 * another route) runs `fallback`, the resolver the caller used before.
 */
import { oneApprovalPathEnabled } from "@/platform/needs-you/release";
import type { DecideResult, NeedsYouService } from "@/platform/needs-you/service";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { tenantEventPolicyItem } from "@/platform/needs-you/adapters";

export type TenantEventDecisionResult = { changed: boolean; reason?: string; decisionId?: string };

export type TenantEventDecisionInput = {
  tenantId: string;
  eventId: string;
  /** The business, when the caller already knows it (workspace publishing and Google, whose event scope is not a linked site). */
  workspaceId?: string;
  action: "approved" | "dismissed";
  by: { kind: "session"; actor: WorkspaceActor } | { kind: "agency"; actor: WorkspaceActor };
  fallback: () => Promise<{ changed: boolean; reason?: string }>;
};

/** How a Needs you decide status reads as a tenant-event decision. */
export function decisionToEventResult(result: DecideResult): TenantEventDecisionResult {
  const decisionId = result.item?.id;
  const withId = <T extends object>(value: T) => (decisionId ? { ...value, decisionId } : value);
  switch (result.status) {
    case "done": return withId({ changed: true });
    case "done_unverified": return withId({ changed: true, reason: "accepted_unverified" });
    case "already_handled": return withId({ changed: false, reason: "already_resolved" });
    case "changed": return withId({ changed: false, reason: "stale_superseded" });
    case "forbidden":
    case "not_owner":
    case "sign_in": return withId({ changed: false, reason: "permission_denied" });
    case "expired": return withId({ changed: false, reason: "expired" });
    case "not_found": return withId({ changed: false, reason: "not_found" });
    case "failed":
    default: return withId({ changed: false, reason: result.item?.outcomeReason ?? "not_changed" });
  }
}

export async function decideTenantEventOnce(input: TenantEventDecisionInput): Promise<TenantEventDecisionResult> {
  if (!oneApprovalPathEnabled()) return input.fallback();
  let linked: { workspaceId: string; itemId: string; revision: string } | null = null;
  try {
    const workspaceId = input.workspaceId ?? await (await import("@/platform/release-flags/store")).releaseWorkspaceForTenant(input.tenantId);
    if (!workspaceId) return input.fallback();
    const { needsYouService } = await import("./server");
    const item = await needsYouService().openForSource(workspaceId, "tenant_event", `${input.tenantId}:${input.eventId}`);
    if (!item || item.state !== "open" || item.route !== "owner_decides") return input.fallback();
    linked = { workspaceId, itemId: item.id, revision: item.revisionHash };
  } catch (error) {
    console.error(`[tenant-event-decision] Needs you lookup failed for ${input.tenantId}/${input.eventId}; using the direct resolver:`, error);
    return input.fallback();
  }
  const { needsYouService, needsYouStore } = await import("./server");
  const result = await needsYouService(needsYouStore).decide({
    workspaceId: linked.workspaceId,
    itemId: linked.itemId,
    revision: linked.revision,
    decision: input.action === "approved" ? "approve" : "not_yet",
    by: input.by,
  });
  return decisionToEventResult(result);
}

export { oneApprovalPathEnabled };

/**
 * A due review auto-post for a business with a workspace, recorded as a policy
 * decision (route handle_after_notice) so What changed shows it once. "direct"
 * leaves the post to the caller's own resolver: no business holds the tenant,
 * the event is not a policy item, or Needs you is off. A failed write throws.
 */
export async function recordAutoPostPolicyDecision(tenantId: string, event: Parameters<typeof tenantEventPolicyItem>[0]): Promise<"direct" | { status: Awaited<ReturnType<NeedsYouService["recordPolicyDecision"]>>["status"] }> {
  const { releaseWorkspaceForTenant } = await import("@/platform/release-flags/store");
  const workspaceId = await releaseWorkspaceForTenant(tenantId);
  if (!workspaceId) return "direct";
  const { tenantEventPolicyItem } = await import("@/platform/needs-you/adapters");
  const item = tenantEventPolicyItem(event);
  if (!item) return "direct";
  const { needsYouService, needsYouReleaseEnabled } = await import("./server");
  if (!needsYouReleaseEnabled()) return "direct";
  const recorded = await needsYouService().recordPolicyDecision({ workspaceId, item, policy: "auto_reply_policy" });
  return { status: recorded.status };
}

/**
 * A signed-in decision on one tenant event, recorded once through the
 * business's Needs you item (STRELVA_ONE_APPROVAL_PATH). The owner's and an
 * agency's decisions on a converted business land as one owner_decisions row
 * that resolves through the tenant-event adapter's own resolver. Anything the
 * item path does not cover (flag off, a tenant with no business, an item on
 * another route) runs `fallback`, the resolver the caller used before.
 */
import { oneApprovalPathEnabled } from "@/platform/needs-you/release";
import type { DecideResult } from "@/platform/needs-you/service";
import type { WorkspaceActor } from "@/platform/workspaces/types";

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

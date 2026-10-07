import type { WorkspaceActor } from "@/platform/workspaces/types";
import { isSuperAdmin } from "@/platform/infra/auth";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";

/** Both switches are off by default; the env is a global kill switch. */
export async function publishingEnabledForWorkspace(workspaceId: string, actor: WorkspaceActor): Promise<boolean> {
  const operator = await isSuperAdmin().catch(() => false);
  return workspaceReleaseFlagEnabled("publishing", workspaceId, { operator, tester: false, userId: actor.userId }).catch(() => false);
}

/** Prepared policy, not an accepted decision. Jacob must authorize activation. */
export async function recordGoogleApprovalPolicyEnabled(workspaceId: string, actor: WorkspaceActor): Promise<boolean> {
  if (!(await publishingEnabledForWorkspace(workspaceId, actor))) return false;
  const operator = await isSuperAdmin().catch(() => false);
  return workspaceReleaseFlagEnabled("publishing_record_google_policy", workspaceId, { operator, tester: false, userId: actor.userId }).catch(() => false);
}

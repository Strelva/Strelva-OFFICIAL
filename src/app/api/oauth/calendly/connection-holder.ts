import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getActorContext } from "@/platform/infra/auth";
import { getSupabase } from "@/platform/infra/db/client";
import { assertWorkspaceMember } from "@/platform/workspaces/repository";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { connectionEligibilityFor } from "@/platform/connections/server";
import { recordConnectionHolder } from "@/platform/connections/holders";
import type { CredentialHolder } from "@/platform/connections/contracts";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { tenantOAuthRef, type TenantOAuthProvider } from "./connection-source";

interface OAuthHolderOperation {
  provider: TenantOAuthProvider;
  tenantId: string;
  stableId: string;
  workspaceId: string;
  actor: WorkspaceActor;
  through: CredentialHolder;
  commandId: string;
}

/** Legacy tenant-only accounts stay unclassified until linked and reconnected. */
export async function beginOAuthHolder(provider: TenantOAuthProvider, tenantId: string): Promise<OAuthHolderOperation | null> {
  if (!workspaceReleaseEnabled()) return null;
  const db = getSupabase();
  if (!db) throw new Error("Connection storage is unavailable.");
  const tenant = await db.from("tenants").select("stable_id").eq("id", tenantId).maybeSingle();
  if (tenant.error || !tenant.data) throw new Error("The connected business could not be resolved.");
  const stableId = z.string().uuid().parse(tenant.data.stable_id);
  const link = await db.from("tenant_workspace_links").select("workspace_id").eq("tenant_stable_id", stableId).maybeSingle();
  if (link.error) throw new Error("The connected business could not be resolved.");
  if (!link.data) return null;
  const workspaceId = z.string().uuid().parse(link.data.workspace_id);
  const context = await getActorContext(tenantId);
  if (context.type !== "user" || context.isImpersonating) throw new Error("Connect this account as a member of the business.");
  const actor = { userId: z.string().uuid().parse(context.userId), verifiedEmail: z.string().email().parse(context.email?.trim().toLowerCase()) };
  await assertWorkspaceMember(actor, workspaceId);
  const eligible = await connectionEligibilityFor(actor, { provider, businessWorkspaceId: workspaceId });
  if (!eligible.eligible) throw new Error(eligible.message);
  return { provider, tenantId, stableId, workspaceId, actor, through: eligible.through, commandId: randomUUID() };
}

export async function assertCurrentOAuthHolder(operation: OAuthHolderOperation | null): Promise<void> {
  if (!operation) return;
  // Current linkage and membership must still agree after the provider round trip.
  const current = await beginOAuthHolder(operation.provider, operation.tenantId);
  if (!current || current.stableId !== operation.stableId || current.workspaceId !== operation.workspaceId || current.actor.userId !== operation.actor.userId || JSON.stringify(current.through) !== JSON.stringify(operation.through)) throw new Error("The connected business changed. Reconnect this account.");
}

export async function completeOAuthHolder(operation: OAuthHolderOperation | null): Promise<void> {
  if (!operation) return;
  await assertCurrentOAuthHolder(operation);
  await recordConnectionHolder({
    ref: tenantOAuthRef(operation.provider, operation.stableId), provider: operation.provider,
    workspaceId: operation.workspaceId, accountHolder: { kind: "business", workspaceId: operation.workspaceId },
    accessThrough: operation.through, actor: operation.actor, commandId: operation.commandId,
  });
}

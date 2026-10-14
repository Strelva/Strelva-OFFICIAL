import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { ownerDecisionSchema, type OwnerDecision } from "@/platform/needs-you/contracts";
import { WorkspaceAccessError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { needsYouService } from "../needs-you-server";
import { NeedsYouRefusedError, type NeedsYouStore } from "@/platform/needs-you/repository";

/** Possibilities and private fact confirmation retain their owner-only resolver. */
export function agencyDecisionExecutionSupported(item: Pick<OwnerDecision, "sourceLifecycle" | "sourceId">): boolean {
  return item.sourceLifecycle !== "make_real" && (item.sourceLifecycle !== "website_document" || /:(approve|launch)$/.test(item.sourceId));
}

type Db = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** No source sync under an agency identity: read only the decisions its current grant covers. */
export async function readAgencyDecisions(actor: WorkspaceActor, workspaceId: string, agencyWorkspaceId?: string, client?: Db): Promise<OwnerDecision[]> {
  const db = client ?? getSupabase() as unknown as Db | null;
  if (!db) throw new WorkspaceStoreError("Client decisions could not be checked.");
  const { data, error } = await db.rpc("list_agency_owner_decisions", {
    p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase(),
    p_agency_workspace_id: agencyWorkspaceId ?? null,
  });
  if (error) {
    if (error.message.includes("owner_decision_access_denied")) throw new WorkspaceAccessError();
    throw new WorkspaceStoreError("Client decisions could not be checked.");
  }
  const checked = z.array(ownerDecisionSchema).safeParse(data);
  if (!checked.success || checked.data.some(item => item.workspaceId !== workspaceId || item.route !== "owner_decides" || item.state !== "open")) {
    throw new WorkspaceStoreError("Client decisions could not be confirmed for this business.");
  }
  return checked.data.filter(agencyDecisionExecutionSupported);
}

/** The same source-owned complete review used by the owner; unreadable reviews remain disabled. */
export async function reviewAgencyDecisions(actor: WorkspaceActor, workspaceId: string, agencyWorkspaceId?: string) {
  const items = await readAgencyDecisions(actor, workspaceId, agencyWorkspaceId);
  const service = needsYouService();
  const reviewed = await Promise.all(items.map(async item => {
    const review = await service.review(item, { workspaceId, actor });
    return review === undefined ? item : { ...item, review };
  }));
  return { items: reviewed, complete: reviewed.every(item => item.review !== null) };
}

/** Bind the actor's selected agency through the service's existing store port. */
export async function claimAgencyDecision(input: Parameters<NeedsYouStore["claim"]>[0], agencyWorkspaceId: string, client?: Db) {
  const db = client ?? getSupabase() as unknown as Db | null;
  if (!db || !input.actor || input.by !== "agency") throw new WorkspaceAccessError();
  const { data, error } = await db.rpc("claim_scoped_agency_owner_decision", {
    p_workspace_id: input.workspaceId, p_decision_id: input.itemId, p_revision_hash: input.revision, p_decision: input.decision,
    p_user_id: input.actor.userId, p_verified_email: input.actor.verifiedEmail.trim().toLowerCase(), p_agency_workspace_id: agencyWorkspaceId,
  });
  if (error) {
    if (error.message.includes("owner_decision_owner_only") || error.message.includes("owner_decision_permission_denied")) {
      throw new NeedsYouRefusedError("owner_decision_owner_only", "Your agency cannot decide this under its current access.");
    }
    throw new WorkspaceStoreError("The agency decision could not be confirmed.");
  }
  const result = z.object({ status: z.enum(["claimed", "already_handled", "changed", "expired"]), item: ownerDecisionSchema }).safeParse(data);
  if (!result.success || result.data.item.workspaceId !== input.workspaceId || result.data.item.id !== input.itemId) {
    throw new WorkspaceStoreError("The agency decision could not be confirmed.");
  }
  return result.data;
}

/** Exact outcome only: this never exposes the owner's full change feed. SQL checks current assignment and every captured scope. */
export async function readAgencyDecisionReceipt(actor: WorkspaceActor, workspaceId: string, agencyWorkspaceId: string, itemId: string, revision: string, client?: Db) {
  const db = client ?? getSupabase() as unknown as Db | null;
  if (!db) throw new WorkspaceStoreError("The decision outcome could not be checked.");
  const { data, error } = await db.rpc("read_agency_decision_receipt", {
    p_workspace_id: workspaceId, p_agency_workspace_id: agencyWorkspaceId, p_decision_id: itemId, p_revision_hash: revision,
    p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase(),
  });
  if (error) {
    if (error.message.includes("owner_decision_access_denied")) throw new WorkspaceAccessError();
    throw new WorkspaceStoreError("The decision outcome could not be checked.");
  }
  const item = ownerDecisionSchema.safeParse(data);
  if (!item.success || item.data.workspaceId !== workspaceId || item.data.id !== itemId || item.data.revisionHash !== revision || item.data.route !== "owner_decides") {
    throw new WorkspaceStoreError("The decision outcome could not be confirmed for this review.");
  }
  return item.data;
}

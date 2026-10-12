import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { isSuperAdminUser } from "@/platform/infra/db/repositories";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listWorkspaces } from "@/platform/workspaces";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { needsYouReleaseEnabled, needsYouService, needsYouStore, readStrelvaHandled } from "@/experience/workspace/needs-you-server";
import { claimAgencyDecision, readAgencyDecisions, readAgencyDecisionReceipt, reviewAgencyDecisions } from "@/experience/workspace/agency/decision-server";

export const dynamic = "force-dynamic";

const workspaceIdSchema = z.string().uuid();
const decideInput = z.object({
  workspaceId: z.string().uuid(),
  itemId: z.string().uuid(),
  revision: z.string().regex(/^[0-9a-f]{64}$/),
  decision: z.enum(["approve", "not_yet"]),
  asAgency: z.boolean().optional(),
  agencyWorkspaceId: z.string().uuid().optional(),
}).strict();

async function memberWorkspace(actor: { userId: string; verifiedEmail: string }, workspaceId: string) {
  const workspace = (await listWorkspaces(actor)).find(item => item.id === workspaceId);
  return workspace && workspace.kind === "customer" && workspace.access === "member" ? workspace : null;
}

/**
 * Needs you and What changed for one business: the owner's open
 * decisions, oldest first, and the last week of what Strelva did. Direct
 * members, or exact Full-control agency scope; SQL rechecks every read.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !needsYouReleaseEnabled()) return workspaceJson({ error: "Needs you is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const workspaceId = workspaceIdSchema.parse(new URL(request.url).searchParams.get("workspaceId"));
    const agencyWorkspaceId = workspaceIdSchema.optional().parse(new URL(request.url).searchParams.get("agencyWorkspaceId") ?? undefined);
    const itemId = new URL(request.url).searchParams.get("itemId");
    if (itemId !== null) {
      const revision = z.string().regex(/^[0-9a-f]{64}$/).parse(new URL(request.url).searchParams.get("revision"));
      const selectedAgency = workspaceIdSchema.parse(agencyWorkspaceId);
      const item = await readAgencyDecisionReceipt(actor, workspaceId, selectedAgency, workspaceIdSchema.parse(itemId), revision);
      return workspaceJson({ authority: "agency", agencyWorkspaceId: selectedAgency, item });
    }
    const workspace = await memberWorkspace(actor, workspaceId);
    if (!workspace || agencyWorkspaceId || new URL(request.url).searchParams.get("asAgency") === "1") {
      const needs = await reviewAgencyDecisions(actor, workspaceId, agencyWorkspaceId);
      return workspaceJson({ role: "member", authority: "agency", agencyWorkspaceId, canDecide: true,
        items: needs.items, complete: needs.complete, handled: [], handledAvailable: false });
    }
    const [needs, handled] = await Promise.all([
      needsYouService().list(actor, workspaceId),
      readStrelvaHandled(actor, workspaceId).then(items => ({ items, available: true })).catch(() => ({ items: [], available: false })),
    ]);
    return workspaceJson({
      role: workspace.role ?? "member",
      items: needs.items,
      complete: needs.complete,
      handled: handled.items,
      handledAvailable: handled.available,
    });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

/** Approve or Not yet, signed in. Same resolver as the email link; the SQL decides who may. */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !needsYouReleaseEnabled()) return workspaceJson({ error: "Needs you is not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = decideInput.parse(await readWorkspaceBody(request, 2_000));
    if (await isRateLimitedWindowedAsync(`workspace:needs-you:${actor.userId}`, 30, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const workspace = body.asAgency || body.agencyWorkspaceId ? null : await memberWorkspace(actor, body.workspaceId);
    // ADR 0015: an agency with full control of an item's scope decides it as
    // the agency. Its staff hold a seat, not a membership; SQL checks the grant.
    // An explicit agency selection uses ordinary current scope, even when the
    // person also holds a support role. Support authority grants no decision.
    if (!body.agencyWorkspaceId && workspace?.role !== "owner" && (await isSuperAdminUser(actor.userId))) {
      return workspaceJson({ status: "forbidden", error: "The owner decides this. Nothing changed." }, 403);
    }
    if (!workspace) {
      // Authorize before the service reads/reconciles the source. Never expose
      // an out-of-scope item's content through a stale/closed decision response.
      const allowed = await readAgencyDecisions(actor, body.workspaceId, body.agencyWorkspaceId);
      if (!allowed.some(item => item.id === body.itemId)) return workspaceJson({ status: "forbidden", error: "This decision is outside your current Full-control access." }, 403);
    }
    // Confirmed business facts carry on to native websites (#509).
    const { createConfirmedNativeFactsEffect } = await import("@/app/workspace/business-details/native-website-facts");
    const store = !workspace && body.agencyWorkspaceId ? { ...needsYouStore, claim: (input: Parameters<typeof needsYouStore.claim>[0]) => claimAgencyDecision(input, body.agencyWorkspaceId!) } : needsYouStore;
    const result = await needsYouService(store, { businessFactsConfirmed: createConfirmedNativeFactsEffect() }).decide({ workspaceId: body.workspaceId, itemId: body.itemId, revision: body.revision, decision: body.decision, by: workspace ? { kind: "session", actor } : { kind: "agency", actor } });

    const status = result.status === "forbidden" || result.status === "not_owner" ? 403
      : result.status === "not_found" ? 404
      : result.status === "changed" || result.status === "already_handled" || result.status === "expired" ? 409
      : 200;
    return workspaceJson({ status: result.status, item: result.item }, status);
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

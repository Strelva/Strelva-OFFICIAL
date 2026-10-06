import { z } from "zod";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listWorkspaces } from "@/platform/workspaces";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { needsYouReleaseEnabled } from "@/platform/needs-you/release";
import {
  PolicySettingRefusedError,
  PostgresPolicySettingsStore,
  applyPolicyChange,
  buildPolicyView,
  ownerChangeSchema,
  planOwnerChange,
} from "@/platform/needs-you/policy";

export const dynamic = "force-dynamic";

const workspaceIdSchema = z.string().uuid();
const changeInput = z.object({ workspaceId: z.string().uuid(), change: ownerChangeSchema }).strict();

async function memberWorkspace(actor: { userId: string; verifiedEmail: string }, workspaceId: string) {
  const workspace = (await listWorkspaces(actor)).find(item => item.id === workspaceId);
  return workspace && workspace.kind === "customer" && workspace.access === "member" ? workspace : null;
}

/**
 * Who decides, for one business (needs-you spec 3.3): for each kind of
 * change, the route in force, Strelva's setting, the floor and the owner's
 * own setting, with recent policy receipts. Direct members read; agencies
 * and other businesses get nothing. The SQL rechecks membership.
 */
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled() || !needsYouReleaseEnabled()) return workspaceJson({ error: "Needs you is not enabled." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const workspaceId = workspaceIdSchema.parse(new URL(request.url).searchParams.get("workspaceId"));
    const workspace = await memberWorkspace(actor, workspaceId);
    if (!workspace) return workspaceJson({ error: "This business is unavailable to your account." }, 403);
    const rows = await PostgresPolicySettingsStore.read(actor, workspaceId);
    return workspaceJson({ role: workspace.role ?? "member", view: buildPolicyView(rows) });
  } catch (error) {
    return workspaceHttpFailure(error);
  }
}

/**
 * The owner makes a kind stricter, sets it back to Strelva's default, or
 * undoes their last change. Owners only; never below the floor or looser
 * than Strelva's setting. Refused before SQL when the plan refuses; the SQL
 * checks again and writes the history receipt.
 */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled() || !needsYouReleaseEnabled()) return workspaceJson({ error: "Needs you is not enabled. Nothing changed." }, 503);
  const guarded = workspaceWriteGuard(request);
  if (guarded) return guarded;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in with a confirmed email to continue." }, 401);
    const body = changeInput.parse(await readWorkspaceBody(request, 2_000));
    if (await isRateLimitedWindowedAsync(`workspace:needs-you-policy:${actor.userId}`, 20, 60_000)) return workspaceJson({ error: "Please wait before trying again." }, 429);
    const workspace = await memberWorkspace(actor, body.workspaceId);
    if (!workspace) return workspaceJson({ error: "This business is unavailable to your account." }, 403);
    if (workspace.role !== "owner") return workspaceJson({ error: "Only the owner can change who decides. Nothing changed.", permission: "not_owner" }, 403);
    const rows = await applyPolicyChange(PostgresPolicySettingsStore, actor, body.workspaceId, current => planOwnerChange(current, body.change));
    return workspaceJson({ role: workspace.role, view: buildPolicyView(rows) });
  } catch (error) {
    if (error instanceof PolicySettingRefusedError) return workspaceJson({ error: error.message, code: error.code }, error.code === "stale" ? 409 : 422);
    return workspaceHttpFailure(error);
  }
}

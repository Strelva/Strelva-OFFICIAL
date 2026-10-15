import { NextResponse } from "next/server";
import { z } from "zod";
import { getActorContext, isSuperAdmin } from "@/platform/infra/auth";
import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { aiControlsReleaseEnabled } from "@/platform/infra/ai-controls-release";
import { releaseWorkspaceForTenant } from "@/platform/release-flags/store";
import { operatorAiControlsCommandSchema } from "@/platform/ai-controls/contracts";
import { readOperatorAiControls, setOperatorAiControls } from "@/platform/ai-controls/service";
import { logAuditEvent } from "@/lib/storage";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

/**
 * Usage controls for one client, set by a Strelva operator: pause, monthly
 * limit and review-reply hold. The same controls an agency has, with the
 * operator named as who set them.
 */
const UNLINKED = "This client has no linked business, so usage controls don't apply.";
const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return json({ error: "Forbidden" }, 403);
  if (error instanceof WorkspaceConflictError) return json({ error: error.message }, 409);
  if (error instanceof z.ZodError) return json({ error: "Check the request. Some fields are missing or invalid." }, 400);
  return json({ error: "Usage controls could not be read. Nothing changed." }, 503);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) return json({ error: "Forbidden" }, 403);
  if (!aiControlsReleaseEnabled()) return json({ error: "Usage controls are not enabled." }, 503);
  await authorizeAdminOperatorRead("admin.tenant-controls.read");
  const { id } = await params;
  try {
    const workspaceId = await releaseWorkspaceForTenant(id);
    if (!workspaceId) return json({ error: UNLINKED }, 404);
    const operator = await getActorContext(id);
    return json({ ...(await readOperatorAiControls(operator.email ?? "", workspaceId)), budgetEnforced: process.env.STRELVA_BUSINESS_AI_BUDGET === "1" });
  } catch (error) { return failure(error); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) return json({ error: "Forbidden" }, 403);
  if (!aiControlsReleaseEnabled()) return json({ error: "Usage controls are not enabled." }, 503);
  const { id } = await params;
  try {
    const workspaceId = await releaseWorkspaceForTenant(id);
    if (!workspaceId) return json({ error: UNLINKED }, 404);
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "Invalid request body" }, 400); }
    const command = operatorAiControlsCommandSchema.parse(body);
    if (command.workspaceId !== workspaceId) return json({ error: "Check the request. Some fields are missing or invalid." }, 400);
    const operator = await getActorContext(id);
    const before = await readOperatorAiControls(operator.email ?? "", workspaceId);
    const after = await setOperatorAiControls(operator.email ?? "", command);
    await logAuditEvent({
      tenant: id,
      action: "tenant.ai_controls",
      targetType: "tenant",
      targetId: id,
      actor: operator,
      metadata: { reason: command.reason, before: before.budget.controls, after: after.budget.controls },
    }).catch(() => {});
    return json({ ...after, budgetEnforced: process.env.STRELVA_BUSINESS_AI_BUDGET === "1" });
  } catch (error) { return failure(error); }
}

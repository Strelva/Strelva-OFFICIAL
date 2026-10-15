import { NextResponse } from "next/server";
import { z } from "zod";
import { logAuditEvent } from "@/lib/storage";
import { appEventsMayBeOn } from "@/platform/app-events/release";
import { operatorRetryAppEvent, readOperatorAppEventDeliveries } from "@/platform/app-events/service";
import { getActorContext, isSuperAdmin } from "@/platform/infra/auth";
import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { releaseWorkspaceForTenant } from "@/platform/release-flags/store";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

/**
 * Events delivery for one client, read by a Strelva operator: what each App and
 * Webhook has received, what could not be delivered, and a way to try again.
 */
const UNLINKED = "This client has no linked business, so events don't apply.";
const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const retrySchema = z.object({ action: z.literal("retry"), deadLetterId: z.string().uuid() }).strict();

function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return json({ error: "Forbidden" }, 403);
  if (error instanceof WorkspaceConflictError) return json({ error: error.message }, 409);
  if (error instanceof z.ZodError) return json({ error: "Check the request. Some fields are missing or invalid." }, 400);
  return json({ error: "Events could not be read. Nothing changed." }, 503);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) return json({ error: "Forbidden" }, 403);
  if (!appEventsMayBeOn()) return json({ error: "Events aren't turned on." }, 503);
  await authorizeAdminOperatorRead("admin.tenant-app-events.read");
  const { id } = await params;
  try {
    const workspaceId = await releaseWorkspaceForTenant(id);
    if (!workspaceId) return json({ error: UNLINKED }, 404);
    const operator = await getActorContext(id);
    return json(await readOperatorAppEventDeliveries(operator.email ?? "", workspaceId));
  } catch (error) { return failure(error); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) return json({ error: "Forbidden" }, 403);
  if (!appEventsMayBeOn()) return json({ error: "Events aren't turned on." }, 503);
  const { id } = await params;
  try {
    const workspaceId = await releaseWorkspaceForTenant(id);
    if (!workspaceId) return json({ error: UNLINKED }, 404);
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "Invalid request body" }, 400); }
    const command = retrySchema.parse(body);
    const operator = await getActorContext(id);
    // The command carries only a dead letter id: it must be one of this client's own.
    const before = await readOperatorAppEventDeliveries(operator.email ?? "", workspaceId);
    const letter = before.deadLetters.find((item) => item.id === command.deadLetterId);
    if (!letter) return json({ error: "That event is not in this client's list." }, 404);
    const after = await operatorRetryAppEvent(operator.email ?? "", command.deadLetterId);
    await logAuditEvent({
      tenant: id,
      action: "tenant.app-events.retry",
      targetType: "tenant",
      targetId: id,
      actor: operator,
      metadata: { deadLetterId: command.deadLetterId, eventType: letter.type, sequence: letter.sequence },
    }).catch(() => {});
    return json(after);
  } catch (error) { return failure(error); }
}

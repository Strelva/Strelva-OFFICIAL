import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { z } from "zod";
import { operatorOwnerInvitationContext, ownerInvitationsReleaseEnabled } from "@/platform/owner-entry/operator-invitations";
import { inviteBusinessOwner, revokeOwnerInvitation } from "@/platform/workspaces/business-ownership";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

type Context = { params: Promise<{ id: string }> };
const tenantId = z.string().min(1).max(120).regex(/^[a-z0-9-]+$/);
const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("invite"),
    recipientEmail: z.string().trim().toLowerCase().email().max(254).optional(),
    approvalId: z.string().uuid().optional(),
  }).strict(),
  z.object({ action: z.literal("revoke"), invitationId: z.string().uuid() }).strict(),
]);
const unavailable = () => NextResponse.json({ error: "Owner invitations are not released." }, { status: 404 });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function refused(error: unknown): NextResponse {
  if (error instanceof WorkspaceAccessError) return json({ error: "An active Strelva operator with business admin membership is required." }, 403);
  if (error instanceof WorkspaceConflictError) return json({ error: error.message }, 409);
  return json({ error: "Owner invitation storage is unavailable. Refresh the invitation state before trying again." }, 503);
}

export async function GET(_request: Request, { params }: Context) {
  if (!ownerInvitationsReleaseEnabled()) return unavailable();
  const parsed = tenantId.safeParse((await params).id);
  if (!parsed.success) return json({ error: "Invalid tenant." }, 400);
  try {
    await authorizeAdminOperatorRead("admin.tenant-controls.read");
    const { state } = await operatorOwnerInvitationContext(parsed.data);
    return json({ state });
  } catch (error) { return refused(error); }
}

export async function POST(request: Request, { params }: Context) {
  if (!ownerInvitationsReleaseEnabled()) return unavailable();
  // Require the browser's same-origin mutation, never caller-supplied host headers.
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "A same-origin request is required." }, 403);
  const parsedTenant = tenantId.safeParse((await params).id);
  if (!parsedTenant.success) return json({ error: "Invalid tenant." }, 400);
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid invitation request." }, 400); }
  const parsed = command.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid owner invitation request." }, 400);
  const input = parsed.data;
  try {
    const { actor, authTime, state } = await operatorOwnerInvitationContext(parsedTenant.data);
    if (input.action === "revoke") {
      // A super-admin's other business membership cannot revoke across this route's tenant scope.
      if (!state.pending.some((invitation) => invitation.invitationId === input.invitationId)) return json({ error: "This invitation is not pending for this business. Refresh its state." }, 409);
      const status = await revokeOwnerInvitation(actor, input.invitationId);
      return json({ status });
    }
    const result = await inviteBusinessOwner(actor, state.workspaceId, {
      recipientEmail: input.recipientEmail,
      approvalId: input.approvalId,
      authTime,
    });
    // The bearer link belongs only in the authenticated response when delivery did not happen.
    return json({ invitation: result.invitation, delivery: result.delivery,
      ...(result.delivery.status === "not_sent" ? { acceptUrl: result.acceptUrl } : {}) });
  } catch (error) { return refused(error); }
}

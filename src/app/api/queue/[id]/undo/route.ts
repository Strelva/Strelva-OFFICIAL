import { NextResponse } from "next/server";
import { verifyAuth, requireTenantPermission } from "@/platform/infra/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireActiveSubscription } from "@/lib/subscription";
import { isDelegateDecider, sessionTenantDecider } from "@/lib/operator-decisions";
import { queueUndoRefusal, undoApprovedSectionEvent } from "@/lib/queue-undo";

/**
 * POST /api/queue/<id>/undo: Undo right after "Make it live" on a section
 * change. Same authority as the approval (publishing:manage, a session
 * decider, an active subscription); see src/lib/queue-undo.ts for what it
 * restores and when it refuses.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await getTenantFromHeaders();
  const permissionDenied = await requireTenantPermission(tenant, "publishing:manage");
  if (permissionDenied) return permissionDenied;
  const decider = await sessionTenantDecider(tenant);
  if (!decider) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const { id } = await params;
  const result = await undoApprovedSectionEvent({ tenantId: tenant, eventId: id, author: isDelegateDecider(decider) ? "admin" : "user" });
  if (!result.undone) {
    const refused = queueUndoRefusal(result.reason);
    return NextResponse.json({ error: refused.error, reason: result.reason }, { status: refused.status });
  }
  return NextResponse.json({ success: true, undone: true });
}

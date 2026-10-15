import { readPlatformStaffStrict } from "@/platform/infra/platform-staff-read";
import { NextResponse } from "next/server";
import {
  CLIENT_ROLES,
  isSuperAdmin,
  assignUserToTenant,
  getActorContext,
  findUserIdByEmail,
  LastOwnerError,
  type ClientRole,
} from "@/platform/infra/auth";
import { logAuditEvent } from "@/lib/storage";
import { releaseWorkspaceForTenant } from "@/platform/release-flags/store";
import { NON_OWNER_ON_BUSINESS, oneInvitationPathEnabled } from "@/platform/owner-entry/operator-invitations";

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Assign a user (by email) to a tenant */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email: rawEmail, tenant, role: requestedRole, reason: rawReason } = body as {
    email?: unknown;
    tenant?: unknown;
    role?: unknown;
    reason?: unknown;
  };
  const email = normalizeEmail(rawEmail);
  if (!email || typeof tenant !== "string" || !tenant.trim()) {
    return NextResponse.json({ error: "Missing email or tenant" }, { status: 400 });
  }
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (!reason || reason.length > 1000) {
    return NextResponse.json({ error: "Give a reason for this access change (up to 1000 characters)." }, { status: 400 });
  }
  if (requestedRole !== undefined && (typeof requestedRole !== "string" || !CLIENT_ROLES.includes(requestedRole as ClientRole))) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const tenantId = tenant.trim();
  const role: ClientRole =
    typeof requestedRole === "string" && CLIENT_ROLES.includes(requestedRole as ClientRole)
      ? (requestedRole as ClientRole)
      : "owner";

  // This route lives under /api/admin and is super-admin-only. The tenantId
  // is taken from the request body, which makes a non-super-admin fallback
  // unsafe (a caller could supply an arbitrary tenantId). Tenant-owner
  // team-management belongs on a tenant-scoped route such as
  // /api/dashboard/team/* where the tenant comes from the authenticated
  // session, not from caller-supplied input.
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // A converted business is joined through workspace invitations, never by direct assignment.
  let legacy = false;
  if (oneInvitationPathEnabled()) {
    let workspaceId: string | null;
    try {
      workspaceId = await releaseWorkspaceForTenant(tenantId);
    } catch {
      return NextResponse.json({ error: "Access checks are unavailable. Try again later." }, { status: 503 });
    }
    if (workspaceId) {
      return NextResponse.json({ error: role === "owner" ? "Invite the owner instead. Direct assignment is off for businesses." : NON_OWNER_ON_BUSINESS }, { status: 409 });
    }
    legacy = true;
  }

  try {
    const userId = await findUserIdByEmail(email);
    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const actor = await getActorContext(tenantId);
    if (!actor.userId || !actor.isSuperAdmin || actor.isImpersonating) {
      return NextResponse.json({ error: "Verified platform operator required" }, { status: 403 });
    }
    if (userId === actor.userId) {
      return NextResponse.json({ error: "Platform operators cannot assign themselves to a client." }, { status: 403 });
    }
    // Unlike the best-effort identity reader, this boundary must hold on an
    // unavailable staff read. Support never gains a content-writing role.
    let staff: boolean;
    try { staff = await readPlatformStaffStrict(userId); }
    catch { return NextResponse.json({ error: "Access checks are unavailable. Try again later." }, { status: 503 }); }
    if (staff && role !== "viewer") {
      return NextResponse.json({ error: "Platform staff can only have read-only support access." }, { status: 403 });
    }
    // An audit failure must prevent the grant, rather than leave an unlogged
    // assignment. The completion event below records the accepted result.
    await logAuditEvent({ tenant: tenantId, action: "tenant.assign_user_requested", targetType: "user", targetId: userId, actor, metadata: { email, role, reason } });

    let assigned: boolean;
    try {
      assigned = await assignUserToTenant(userId, tenantId, role);
    } catch (assignErr) {
      if (assignErr instanceof LastOwnerError) {
        return NextResponse.json(
          { error: "Cannot demote the last owner of this tenant" },
          { status: 409 }
        );
      }
      throw assignErr;
    }

    if (!assigned) {
      return NextResponse.json({ error: "Failed to assign user - tenant may not exist" }, { status: 400 });
    }

    await logAuditEvent({
      tenant: tenantId,
      action: "tenant.assign_user",
      targetType: "user",
      targetId: userId,
      actor,
      metadata: { email, role, reason },
    });

    return NextResponse.json({ success: true, userId, tenant: tenantId, role, ...(legacy ? { legacy: true } : {}) });
  } catch {
    return NextResponse.json(
      { error: "Access change could not be confirmed. Refresh the member list before trying again." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import {
  CLIENT_ROLES,
  isSuperAdmin,
  assignUserToTenant,
  getActorContext,
  findUserIdByEmail,
  LastOwnerError,
  type ClientRole,
} from "@/lib/auth";
import { logAuditEvent } from "@/lib/storage";

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

  const { email: rawEmail, tenant, role: requestedRole } = body as {
    email?: unknown;
    tenant?: unknown;
    role?: unknown;
  };
  const email = normalizeEmail(rawEmail);
  if (!email || typeof tenant !== "string" || !tenant.trim()) {
    return NextResponse.json({ error: "Missing email or tenant" }, { status: 400 });
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

  try {
    const userId = await findUserIdByEmail(email);
    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

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
      actor: await getActorContext(tenantId),
      metadata: { email, role },
    });

    return NextResponse.json({ success: true, userId, tenant: tenantId, role });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to assign user" },
      { status: 500 }
    );
  }
}

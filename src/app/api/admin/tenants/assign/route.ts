import { NextResponse } from "next/server";
import {
  CLIENT_ROLES,
  isSuperAdmin,
  assignUserToTenant,
  requireTenantPermission,
  getActorContext,
  LastOwnerError,
  type ClientRole,
} from "@/lib/auth";
import { logAuditEvent } from "@/lib/storage";
import { clerkClient } from "@clerk/nextjs/server";

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Assign a Clerk user (by email) to a tenant */
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

  if (!(await isSuperAdmin())) {
    const denied = await requireTenantPermission(tenantId, "team:manage");
    if (denied) return denied;
  }

  try {
    const client = await clerkClient();
    const users = await client.users.getUserList({ emailAddress: [email] });

    if (users.data.length === 0) {
      return NextResponse.json({ error: "User not found in Clerk" }, { status: 404 });
    }

    const userId = users.data[0].id;
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

import { NextResponse } from "next/server";
import {
  CLIENT_ROLES,
  isSuperAdmin,
  assignUserToTenant,
  requireTenantPermission,
  type ClientRole,
} from "@/lib/auth";
import { clerkClient } from "@clerk/nextjs/server";

/** Assign a Clerk user (by email) to a tenant */
export async function POST(req: Request) {
  const { email, tenant, role: requestedRole } = await req.json();
  if (!email || !tenant) {
    return NextResponse.json({ error: "Missing email or tenant" }, { status: 400 });
  }
  const role: ClientRole =
    typeof requestedRole === "string" && CLIENT_ROLES.includes(requestedRole as ClientRole)
      ? (requestedRole as ClientRole)
      : "owner";

  if (!(await isSuperAdmin())) {
    const denied = await requireTenantPermission(tenant, "team:manage");
    if (denied) return denied;
  }

  try {
    const client = await clerkClient();
    const users = await client.users.getUserList({ emailAddress: [email] });

    if (users.data.length === 0) {
      return NextResponse.json({ error: "User not found in Clerk" }, { status: 404 });
    }

    const userId = users.data[0].id;
    const assigned = await assignUserToTenant(userId, tenant, role);

    if (!assigned) {
      return NextResponse.json({ error: "Failed to assign user - tenant may not exist" }, { status: 400 });
    }

    return NextResponse.json({ success: true, userId, tenant, role });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to assign user" },
      { status: 500 }
    );
  }
}

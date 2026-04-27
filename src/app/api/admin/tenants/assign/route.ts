import { NextResponse } from "next/server";
import { isSuperAdmin, assignUserToTenant } from "@/lib/auth";
import { clerkClient } from "@clerk/nextjs/server";

/** Assign a Clerk user (by email) to a tenant */
export async function POST(req: Request) {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email, tenant } = await req.json();
  if (!email || !tenant) {
    return NextResponse.json({ error: "Missing email or tenant" }, { status: 400 });
  }

  try {
    const client = await clerkClient();
    const users = await client.users.getUserList({ emailAddress: [email] });

    if (users.data.length === 0) {
      return NextResponse.json({ error: "User not found in Clerk" }, { status: 404 });
    }

    const userId = users.data[0].id;
    const assigned = await assignUserToTenant(userId, tenant);

    if (!assigned) {
      return NextResponse.json({ error: "Failed to assign user - tenant may not exist" }, { status: 400 });
    }

    return NextResponse.json({ success: true, userId, tenant });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to assign user" },
      { status: 500 }
    );
  }
}

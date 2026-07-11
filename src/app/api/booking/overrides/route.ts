import { NextResponse } from "next/server";
import { getDateOverrides, setDateOverrides } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { dateOverridesSchema } from "@/lib/schemas";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const overrides = await getDateOverrides(tenant);
    return NextResponse.json(overrides);
  } catch {
    return NextResponse.json({ error: "Failed to get overrides" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const permissionDenied = await requireTenantPermission(tenant, "settings:write");
    if (permissionDenied) return permissionDenied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;

    // The body is an array, so read it directly rather than via readJsonObject
    // (which expects an object). Guard the parse so a malformed body 400s.
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      raw = null;
    }
    if (raw === null || raw === undefined) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = dateOverridesSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid overrides", details: parsed.error.issues },
        { status: 400 }
      );
    }

    await setDateOverrides(parsed.data, tenant);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update overrides" }, { status: 500 });
  }
}

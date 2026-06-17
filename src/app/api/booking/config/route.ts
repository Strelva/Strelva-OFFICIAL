import { NextResponse } from "next/server";
import { getBookingConfig, setBookingConfig } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription";
import { readJsonObject } from "@/lib/request-body";
import { bookingConfigSchema } from "@/lib/schemas";

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const config = await getBookingConfig(tenant);
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ error: "Failed to get config" }, { status: 500 });
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

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = bookingConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid booking config", details: parsed.error.issues },
        { status: 400 }
      );
    }

    await setBookingConfig(parsed.data, tenant);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
  }
}

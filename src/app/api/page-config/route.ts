import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getPageConfig, logAuditEvent, setPageConfig } from "@/lib/storage";
import { getTenantFromHeaders, requireTenantFromHeaders } from "@/lib/tenant";
import { getActorContext, verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription";

export async function GET() {
  try {
    const tenant = await getTenantFromHeaders();
    const config = await getPageConfig(tenant);
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ error: "Failed to load page config" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authed = await verifyAuth();
    if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenant = await requireTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const permissionDenied = await requireTenantPermission(tenant, "content:write");
    if (permissionDenied) return permissionDenied;
    const blocked = await requireActiveSubscription(tenant);
    if (blocked) return blocked;
    const actor = await getActorContext(tenant);

    const body = await request.json();
    await setPageConfig(body, tenant);
    if (actor.isImpersonating) {
      await logAuditEvent({
        tenant,
        actor,
        action: "page_config.updated",
        targetType: "page_config",
        targetId: tenant,
        metadata: { pages: Object.keys(body || {}) },
      });
    }
    revalidatePath("/");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save page config" }, { status: 500 });
  }
}

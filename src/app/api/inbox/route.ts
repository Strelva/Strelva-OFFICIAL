import { authorizeTenantOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { getInboxItems, markInboxRead, markAllInboxRead } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess, requireTenantPermission } from "@/platform/infra/auth";
import { trackError } from "@/platform/infra/monitoring";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { readJsonObject } from "@/lib/request-body";

export async function GET(request: Request) {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    await authorizeTenantOperatorRead(tenant);

    const url = new URL(request.url);
    const type = url.searchParams.get("type") || undefined;
    const unreadOnly = url.searchParams.get("unread") === "true";

    const items = await getInboxItems(tenant, { type, unreadOnly });
    const unreadCount = items.filter((i) => !i.read).length;

    return NextResponse.json({ items, unreadCount });
  } catch (err) {
    if (err instanceof WorkspaceAccessError) {
      return NextResponse.json({ error: "You don't have access to this inbox.", code: "inbox_forbidden" }, { status: 403 });
    }
    trackError(err, { route: "api/inbox", op: "GET" });
    return NextResponse.json({ error: "The inbox couldn't be read right now. Nothing changed.", code: "inbox_unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantPermission(tenant, "content:write");
    if (denied) return denied;

    const body = await readJsonObject(request);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const action = typeof body.action === "string" ? body.action : undefined;
    const itemId = typeof body.itemId === "string" ? body.itemId : undefined;

    if (action === "mark-all-read") {
      await markAllInboxRead(tenant);
      return NextResponse.json({ success: true });
    }

    if (action === "mark-read" && itemId) {
      const ok = await markInboxRead(itemId, tenant);
      return NextResponse.json({ success: ok });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[inbox PATCH]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

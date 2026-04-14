import { NextResponse } from "next/server";
import { getInboxItems, markInboxRead, markAllInboxRead } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const url = new URL(request.url);
    const type = url.searchParams.get("type") || undefined;
    const unreadOnly = url.searchParams.get("unread") === "true";

    const items = await getInboxItems(tenant, { type, unreadOnly });
    const unreadCount = items.filter((i) => !i.read).length;

    return NextResponse.json({ items, unreadCount });
  } catch (err) {
    console.error("[inbox GET]", err);
    return NextResponse.json({ items: [], unreadCount: 0 }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const body = await request.json();

    if (body.action === "mark-all-read") {
      await markAllInboxRead(tenant);
      return NextResponse.json({ success: true });
    }

    if (body.action === "mark-read" && typeof body.itemId === "string") {
      const ok = await markInboxRead(body.itemId, tenant);
      return NextResponse.json({ success: ok });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[inbox PATCH]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

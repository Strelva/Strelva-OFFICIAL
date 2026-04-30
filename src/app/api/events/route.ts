import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getEvents } from "@/lib/events";
import { requireActiveSubscription } from "@/lib/subscription";

export async function GET(req: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as "pending" | "approved" | "dismissed" | null;
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  if (status && !["pending", "approved", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const events = await getEvents(tenant, {
    status: status || undefined,
    limit,
  });

  return NextResponse.json({ events });
}

import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getContentAutonomy, saveContentAutonomy } from "@/lib/content-autonomy";

/** GET the tenant's content-autonomy mode ("auto" | "approve"). */
export async function GET() {
  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  return NextResponse.json({ mode: await getContentAutonomy(tenant) });
}

/** PUT { mode } to update how much Strelva handles on its own. */
export async function PUT(req: Request) {
  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  const blocked = await requireTenantPermission(tenant, "settings:write");
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  const mode = await saveContentAutonomy(tenant, body?.mode === "auto" ? "auto" : "approve");
  return NextResponse.json({ mode });
}

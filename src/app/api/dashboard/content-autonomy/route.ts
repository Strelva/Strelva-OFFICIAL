import { authorizeTenantOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess, requireTenantPermission } from "@/platform/infra/auth";
import { getContentAutonomy, saveContentAutonomySetting } from "@/lib/content-autonomy";
import { tenantPolicyWriter } from "@/lib/tenant-policy-writer";
import { TenantSettingRefusedError } from "@/platform/needs-you/tenant-settings";

/** GET the tenant's content-autonomy mode ("auto" | "approve"). */
export async function GET() {
  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  await authorizeTenantOperatorRead(tenant);
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
  try {
    // For a business-linked site this is the owner's Needs you setting; the
    // reply says what is in force and why when the choice didn't take effect.
    const result = await saveContentAutonomySetting(tenant, body?.mode === "auto" ? "auto" : "approve", await tenantPolicyWriter(tenant));
    return NextResponse.json({ mode: result.mode, requested: result.requested, note: result.note });
  } catch (error) {
    if (error instanceof TenantSettingRefusedError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

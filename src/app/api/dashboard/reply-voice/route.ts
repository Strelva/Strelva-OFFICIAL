import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getReplyVoice, saveReplyVoice } from "@/lib/reviews/reply-voice";
import { tenantPolicyWriter } from "@/lib/tenant-policy-writer";
import { TenantSettingRefusedError } from "@/platform/needs-you/tenant-settings";

/** GET the tenant's review-reply voice (mode + guidance + templates). */
export async function GET() {
  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  return NextResponse.json({ voice: await getReplyVoice(tenant) });
}

/** PUT { mode, guidance, templates } to update the reply voice. */
export async function PUT(req: Request) {
  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  const blocked = await requireTenantPermission(tenant, "settings:write");
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  try {
    const voice = await saveReplyVoice(tenant, {
      mode: body?.mode,
      guidance: body?.guidance,
      templates: Array.isArray(body?.templates) ? body.templates : [],
    }, await tenantPolicyWriter(tenant));
    return NextResponse.json({ voice });
  } catch (error) {
    if (error instanceof TenantSettingRefusedError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

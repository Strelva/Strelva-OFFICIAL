import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { readJsonObject } from "@/lib/request-body";
import { revalidateClientSite } from "@/lib/revalidate-client";
import { logAuditEvent } from "@/lib/storage";
import { logger } from "@/lib/logger";

/**
 * Re-trigger revalidation for a single tenant. Thin wrapper over the existing
 * `revalidateClientSite` primitive — handles SSRF, missing config, retries, and
 * failure recording internally. Super-admin only. Audit-logged.
 */
export async function POST(req: Request) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  }

  logger.info("[ops] Operator-triggered revalidation retry", { tenantId });

  const result = await revalidateClientSite(tenantId, "all");

  await logAuditEvent({
    tenant: tenantId,
    action: "ops.revalidation.retry",
    targetType: "tenant",
    targetId: tenantId,
    actor: await getActorContext(tenantId),
    metadata: {
      success: result.success,
      skipped: result.skipped ?? false,
      error: result.error ?? null,
    },
  });

  if (result.skipped) {
    return NextResponse.json({ success: true, skipped: true, tenantId });
  }
  if (!result.success) {
    return NextResponse.json(
      { success: false, tenantId, error: result.error ?? "Revalidation failed" },
      { status: 502 }
    );
  }
  return NextResponse.json({ success: true, tenantId });
}

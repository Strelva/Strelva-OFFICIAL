import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import { setAnalyticsConfig } from "@/lib/analytics";

/**
 * Per-tenant Search + Analytics wiring — the GSC property URL and GA4 property
 * id the reporting service account reads from.
 *
 * POST — apply whichever of { gscProperty, ga4PropertyId } are present, return
 *        the final config. Audit-logged. Super-admin only.
 */

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await getTenantConfig(id))) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { gscProperty, ga4PropertyId } = (body ?? {}) as {
    gscProperty?: unknown;
    ga4PropertyId?: unknown;
  };

  if (
    gscProperty !== undefined &&
    gscProperty !== null &&
    typeof gscProperty !== "string"
  ) {
    return NextResponse.json(
      { error: "gscProperty must be a string or null." },
      { status: 400 },
    );
  }
  if (
    ga4PropertyId !== undefined &&
    ga4PropertyId !== null &&
    typeof ga4PropertyId !== "string"
  ) {
    return NextResponse.json(
      { error: "ga4PropertyId must be a string or null." },
      { status: 400 },
    );
  }

  // Normalize empty strings to null so "clear the field" reads as unconfigured.
  const patch: { gscProperty?: string | null; ga4PropertyId?: string | null } = {};
  const applied: string[] = [];
  if (gscProperty !== undefined) {
    const trimmed = typeof gscProperty === "string" ? gscProperty.trim() : "";
    patch.gscProperty = trimmed || null;
    applied.push("gscProperty");
  }
  if (ga4PropertyId !== undefined) {
    const trimmed = typeof ga4PropertyId === "string" ? ga4PropertyId.trim() : "";
    patch.ga4PropertyId = trimmed || null;
    applied.push("ga4PropertyId");
  }

  const config = await setAnalyticsConfig(id, patch);

  if (applied.length > 0) {
    await logAuditEvent({
      tenant: id,
      action: "analytics.config",
      targetType: "tenant",
      targetId: id,
      actor: await getActorContext(id),
      metadata: { fields: applied },
    }).catch(() => {});
  }

  return NextResponse.json({ config });
}

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { isSuperAdmin, getActorContext } from "@/platform/infra/auth";
import { getTenantConfig, updateTenant } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import { runDeprovision, readDeprovisionCleanup, isValidDeprovisionTenantId } from "@/lib/deprovision";

/** Recover the durable receipt after a lost response or process interruption. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!isValidDeprovisionTenantId(id)) return NextResponse.json({ error: "Invalid tenant id." }, { status: 400 });
  try {
    return NextResponse.json({ tenantId: id, cleanup: await readDeprovisionCleanup(id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Cleanup receipt unavailable. Do not reuse this slug." }, { status: 503 });
  }
}

/**
 * POST /api/admin/tenants/[id]/deprovision
 *
 * This single endpoint handles two distinct super-admin operations, selected by
 * the `action` field in the request body. Both require super-admin and an
 * existing tenant; they are co-located because both are destructive/sensitive
 * tenant-lifecycle operations exposed only on this route.
 *
 * --- action: "rotate-secret" (body: { action: "rotate-secret" }) ---
 * Generates a new revalidation secret server-side, persists it via updateTenant,
 * and returns it ONCE so the operator can hand it to Jacob for the client repo.
 * Audit-logged. The secret is NOT returned on any subsequent read — the stored
 * value is encrypted at rest (AES-256-GCM via secrets.ts).
 * Success: 200 { newSecret: string }
 *
 * --- deprovision (body: { confirmSlug: string }) ---
 * Permanently tears down a tenant: purges all Postgres rows across 35 tables,
 * clears Redis keys and domain claims, and deletes the Vercel project.
 * Two layers of confirmation:
 *   1. The UI requires the operator to type the exact slug before the button
 *      enables (client-side guard).
 *   2. This route re-checks confirmSlug === id server-side (belt-and-suspenders).
 * Safety guards inside runDeprovision:
 *   - PROTECTED_TENANTS denylist (gldf, rohlax)
 *   - Active-subscription refusal (active/trialing/past_due + any build_payments)
 * Success: 200 { ok: true, tenantId, summary, pgRowTotal }
 * Refused: 403/404/400 with { error }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!isValidDeprovisionTenantId(id)) return NextResponse.json({ error: "Invalid tenant id." }, { status: 400 });
  const tenant = await getTenantConfig(id);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const rawBody = (body ?? {}) as Record<string, unknown>;
  const retryCleanup = rawBody.action === "retry-cleanup";
  if (!tenant && !retryCleanup) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  if (retryCleanup && (typeof rawBody.cleanupReceiptId !== "string" || !/^[a-f0-9-]{36}$/i.test(rawBody.cleanupReceiptId))) {
    return NextResponse.json({ error: "Supply the exact cleanup receipt id." }, { status: 400 });
  }

  // --- Branch: rotate-secret ---
  if (rawBody.action === "rotate-secret") {
    const newSecret = randomBytes(32).toString("hex");
    const updated = await updateTenant(id, { revalidationSecret: newSecret } as Parameters<typeof updateTenant>[1]);
    if (!updated) {
      return NextResponse.json({ error: "Failed to persist new secret" }, { status: 500 });
    }
    await logAuditEvent({
      tenant: id,
      action: "tenant.rotate_revalidation_secret",
      targetType: "tenant",
      targetId: id,
      actor: await getActorContext(id),
      metadata: {},
    }).catch(() => {});
    return NextResponse.json({ newSecret });
  }

  // --- Branch: deprovision ---
  const confirmSlug = typeof rawBody.confirmSlug === "string" ? rawBody.confirmSlug.trim() : "";
  if (confirmSlug !== id) {
    return NextResponse.json(
      { error: `confirmSlug must equal the tenant id "${id}" exactly.` },
      { status: 400 },
    );
  }

  const result = await runDeprovision({
    tenantId: id,
    tenant: tenant ?? null,
    dryRun: false,
    force: false,
    keepVercel: false,
    ...(retryCleanup ? { cleanupReceiptId: rawBody.cleanupReceiptId as string } : {}),
  });

  if (!result.ok && result.refusalReason) {
    return NextResponse.json(
      { error: result.refusalDetail ?? result.refusalReason, ...result },
      { status: 403 },
    );
  }

  await logAuditEvent({
    tenant: id,
    action: retryCleanup ? "tenant.cleanup.retry" : "tenant.deprovision",
    targetType: "tenant",
    targetId: id,
    actor: await getActorContext(id),
    metadata: {
      pgRowTotal: result.pgRowTotal,
      databaseDeleted: result.databaseDeleted,
      cleanupReceiptId: result.cleanup?.id,
      cleanupComplete: result.cleanup?.complete,
      tablesAffected: (result.summary.postgres ?? []).map((a) => a.target),
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: result.ok,
    tenantId: id,
    pgRowTotal: result.pgRowTotal,
    summary: result.summary,
    databaseDeleted: result.databaseDeleted,
    cleanup: result.cleanup,
  }, { status: result.ok ? 200 : 202 });
}

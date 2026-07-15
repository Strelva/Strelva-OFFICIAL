import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import { renameTenantSlug } from "@/lib/tenant-rename";

/**
 * Rename a tenant's subdomain slug. `id` is the CURRENT slug; body `{ newSlug }`.
 * The DB rename cascades to all child tables (ON UPDATE CASCADE) and the Redis
 * catch-up moves every authoritative store (see src/lib/tenant-rename.ts).
 * Super-admin only, audit-logged. Returns the rename result (incl. any Redis
 * catch-up errors so the operator can re-run rekey if needed).
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
  const newSlug = (body as { newSlug?: unknown })?.newSlug;
  if (typeof newSlug !== "string" || !newSlug.trim()) {
    return NextResponse.json({ error: "newSlug (string) is required." }, { status: 400 });
  }

  const result = await renameTenantSlug(id, newSlug.trim());
  if (!result.ok) {
    // Map the validation reasons to a 4xx; a DB failure is a 500.
    const clientErrors = new Set(["same_slug", "invalid_new_slug", "new_slug_taken", "tenant_not_found"]);
    const status = clientErrors.has(result.reason ?? "") ? 400 : 500;
    return NextResponse.json({ error: result.reason, ...result }, { status });
  }

  await logAuditEvent({
    tenant: newSlug.trim(),
    action: "tenant.rename",
    targetType: "tenant",
    targetId: newSlug.trim(),
    actor: await getActorContext(newSlug.trim()),
    metadata: { from: id, to: newSlug.trim(), movedKeys: result.movedKeys, rewrittenBlobs: result.rewrittenBlobs, redisErrors: result.redisErrors },
  });

  return NextResponse.json(result);
}

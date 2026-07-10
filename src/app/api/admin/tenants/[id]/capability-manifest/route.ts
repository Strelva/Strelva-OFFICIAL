import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getTenantConfig, updateTenant } from "@/lib/tenants";
import { isSafeFetchUrl } from "@/lib/safe-fetch";
import { logAuditEvent } from "@/lib/storage";

/**
 * Per-tenant capability-manifest URL (B4). A custom repo can publish a manifest
 * declaring the sections its LIVE site actually renders; storing its URL here
 * lets the control plane fetch + merge it (see `getSiteCapabilityManifest`), so
 * the AI edits what the live site renders, not just the template's built-in set.
 *
 * This was previously settable ONLY at tenant-create; existing tenants (gldf,
 * rohlax) predate the field. POST here sets/updates/clears it in place.
 *
 * POST — body { capabilityManifestUrl: string | null }. An https URL that passes
 *        the same SSRF guard as the fetch path, or null/"" to clear. The value
 *        is merged into the existing `customRepo` blob (other fields untouched).
 *        Audit-logged. Super-admin only.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const tenant = await getTenantConfig(id);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { capabilityManifestUrl } = (body ?? {}) as { capabilityManifestUrl?: unknown };

  if (
    capabilityManifestUrl !== undefined &&
    capabilityManifestUrl !== null &&
    typeof capabilityManifestUrl !== "string"
  ) {
    return NextResponse.json(
      { error: "capabilityManifestUrl must be a string or null." },
      { status: 400 },
    );
  }

  // Empty/null clears the field; anything else must pass the same guard the
  // fetch path applies, so we never persist a non-https or SSRF-unsafe target.
  const trimmed = typeof capabilityManifestUrl === "string" ? capabilityManifestUrl.trim() : "";
  const nextUrl = trimmed || undefined;
  if (nextUrl && !isSafeFetchUrl(nextUrl)) {
    return NextResponse.json(
      { error: "capabilityManifestUrl must be a public https URL." },
      { status: 400 },
    );
  }

  // Merge into the existing customRepo blob — never clobber repoUrl/etc.
  const nextCustomRepo = { ...(tenant.customRepo ?? {}), capabilityManifestUrl: nextUrl };
  const updated = await updateTenant(id, { customRepo: nextCustomRepo });
  if (!updated) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  await logAuditEvent({
    tenant: id,
    action: "tenant.capability-manifest",
    targetType: "tenant",
    targetId: id,
    actor: await getActorContext(id),
    metadata: { capabilityManifestUrl: nextUrl ?? null },
  }).catch(() => {});

  return NextResponse.json({ customRepo: updated.customRepo ?? null });
}

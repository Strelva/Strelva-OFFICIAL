import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireActiveSubscription } from "@/lib/subscription";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";
import { listTenantMedia, uploadTenantMedia, deleteTenantMedia } from "@/lib/media-store";
import { verifyRasterImage } from "@/lib/image-signature";

const MAX_SIZE = 5 * 1024 * 1024;

// --- GET: List image assets for this tenant (Blob + legacy Sanity, transitional) ---

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  const assets = await listTenantMedia(tenant);
  return NextResponse.json({ assets });
}

// --- POST: Upload a new image to the tenant's Blob library ---

export async function POST(request: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  const permissionDenied = await requireTenantPermission(tenant, "content:write");
  if (permissionDenied) return permissionDenied;
  const blocked = await requireActiveSubscription(tenant);
  if (blocked) return blocked;

  // Cap uploads per tenant — each writes a 5MB file, so an authed editor
  // shouldn't be able to hammer the store.
  if (await isRateLimitedAsync(rateLimitKey(request, `media:${tenant}`), 20)) {
    return NextResponse.json({ error: "Too many uploads, slow down" }, { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  // Allowlist raster image types only. `startsWith("image/")` would accept
  // image/svg+xml — an SVG can carry inline script, so it's a stored-XSS vector
  // when served from a tenant's domain. Block SVG (and anything non-raster).
  const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF, AVIF." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // `file.type` is client-supplied — sniff the real bytes so a declared
  // image/png can't smuggle an SVG/HTML/script payload (stored XSS).
  const verified = verifyRasterImage(buffer, ALLOWED);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.reason }, { status: 400 });
  }

  const asset = await uploadTenantMedia(tenant, buffer, file.name, file.type);
  return NextResponse.json(asset, { status: 201 });
}

// --- DELETE: Remove an image asset owned by this tenant ---

export async function DELETE(request: Request) {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;
  const permissionDenied = await requireTenantPermission(tenant, "content:write");
  if (permissionDenied) return permissionDenied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing asset id" }, { status: 400 });
  }

  // Tenant-scoped delete: Blob assets by pathname prefix, legacy Sanity by
  // label == tenant. Prevents deleting another tenant's media by guessing an id.
  const result = await deleteTenantMedia(tenant, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Delete failed" }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}

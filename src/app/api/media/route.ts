import { NextResponse } from "next/server";
import { verifyAuth, requireTenantAccess, requireTenantPermission } from "@/lib/auth";
import { getSanityClient, getSanityReadClient } from "@/lib/sanity";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireActiveSubscription } from "@/lib/subscription";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";
import type { MediaAsset } from "@/lib/media";
import { verifyRasterImage } from "@/lib/image-signature";

const MAX_SIZE = 5 * 1024 * 1024;

// --- GET: List image assets for this tenant ---

export async function GET() {
  const authed = await verifyAuth();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getTenantFromHeaders();
  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  // Query assets tagged with this tenant's label, falling back to all assets
  const query = `*[_type == "sanity.imageAsset" && label == $tenant] | order(_createdAt desc) {
    _id,
    _createdAt,
    url,
    originalFilename,
    metadata { dimensions { width, height }, lqip },
    size
  }`;

  const raw = await getSanityReadClient().fetch(query, { tenant });

  const assets: MediaAsset[] = (raw || []).map(
    (doc: {
      _id: string;
      _createdAt: string;
      url: string;
      originalFilename: string;
      metadata?: { dimensions?: { width: number; height: number }; lqip?: string };
      size: number;
    }) => ({
      id: doc._id,
      url: doc.url,
      filename: doc.originalFilename || "untitled",
      width: doc.metadata?.dimensions?.width || 0,
      height: doc.metadata?.dimensions?.height || 0,
      size: doc.size || 0,
      lqip: doc.metadata?.lqip || undefined,
      createdAt: doc._createdAt,
    })
  );

  return NextResponse.json({ assets });
}

// --- POST: Upload a new image to Sanity ---

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

  // Cap uploads per tenant (parity with /api/upload) — each writes a 5MB file
  // to the shared dataset, so an authed editor shouldn't be able to hammer it.
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
  const asset = await getSanityClient().assets.upload("image", buffer, {
    filename: file.name,
    contentType: file.type,
    label: tenant, // Tag with tenant ID for multi-tenant filtering
  });

  const result: MediaAsset = {
    id: asset._id,
    url: asset.url,
    filename: asset.originalFilename || file.name,
    width: asset.metadata?.dimensions?.width || 0,
    height: asset.metadata?.dimensions?.height || 0,
    size: asset.size || file.size,
    createdAt: asset._createdAt,
  };

  return NextResponse.json(result, { status: 201 });
}

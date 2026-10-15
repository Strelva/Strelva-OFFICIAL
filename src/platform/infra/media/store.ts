/**
 * Tenant media library backed by Vercel Blob — the replacement for the
 * Sanity-hosted image library.
 *
 * Blob is the SINGLE source (no sidecar DB index): tenant isolation is a
 * `media/{tenant}/` pathname prefix, enforced on both list and delete. Blob's
 * `list` can't supply pixel dimensions, so we persist them WHERE Blob does read
 * them back — the pathname itself: a known size becomes a `{w}x{h}` path segment
 * (`media/{tenant}/{id}/{w}x{h}/{name}`) that `list` parses on the way out. No
 * sidecar to drift; `lqip` stays unused.
 *
 * Each upload lands in a per-upload subfolder (`media/{tenant}/{id}/[{w}x{h}/]{name}`)
 * so a same-name re-upload gets a unique path WITHOUT mangling the display
 * filename (the last path segment stays the clean name). Blobs uploaded before
 * this (or whose header we couldn't read — e.g. AVIF) have no size segment and
 * honestly read back as "Unknown"; we never backfill a guess.
 *
 * Images uploaded to the old Sanity library before the migration keep rendering
 * wherever they're already referenced in content (served by the read-only Sanity
 * CDN until the dataset is locked), but are no longer LISTED here — the library
 * is Blob-only.
 */

import { randomUUID } from "crypto";
import type { MediaAsset } from "./contracts";
import { readImageDimensions, verifyRasterImage } from "./image-signature";

/** Vercel Blob public-store host — used to gate the id passed to DELETE. */
const BLOB_HOST = "blob.vercel-storage.com";

const mediaPrefix = (tenant: string): string => `media/${tenant}/`;

const blobEnabled = (): boolean => !!process.env.BLOB_READ_WRITE_TOKEN;

export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Raster types only. `startsWith("image/")` would accept image/svg+xml, and an
 * SVG can carry inline script: a stored-XSS vector when served from a
 * tenant's domain.
 */
export const MEDIA_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

/** The upload itself is not acceptable (too big, wrong type); maps to 400. */
export class MediaUploadRejectedError extends Error {}

/** Storage is not configured; maps to 503. */
export class MediaStoreUnavailableError extends Error {}

/**
 * Only local `next dev` may write uploads to disk. Not "test", so tests keep
 * asserting the Blob-only failure, and not "production", so `next start` and
 * Vercel fail closed instead of silently writing to a server's local disk.
 */
function localMediaFallbackAllowed(): boolean {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL_ENV;
}

/**
 * The `media/{tenant}/` prefix IS the tenant-isolation boundary, so a tenant id
 * must never contain a `/` (which would let `a` prefix-match `a/b`'s blobs) or be
 * empty. Tenant ids come from validated auth/headers today, so this is
 * defense-in-depth — fail closed rather than silently mis-scope.
 */
function assertTenant(tenant: string): void {
  if (!tenant || tenant.includes("/")) {
    throw new Error(`Invalid tenant id for media store: ${JSON.stringify(tenant)}`);
  }
}

/** Sanitize an upload filename to the same charset the old path used. */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "image";
}

/** Display filename from a blob pathname (`media/{tenant}/{id}/[{w}x{h}/]{name}`). */
function filenameFromPathname(pathname: string): string {
  return pathname.split("/").pop() || pathname;
}

/**
 * Pixel dimensions encoded as the path segment before the filename
 * (`.../{w}x{h}/{name}`), or {0,0} when there's no size segment (a pre-dimension
 * blob, or one whose header we couldn't read). The uuid subfolder never matches
 * `\d+x\d+`, so a legacy `.../{uuid}/{name}` path reads back as unknown.
 */
function dimsFromPathname(pathname: string): { width: number; height: number } {
  const segs = pathname.split("/");
  const m = segs[segs.length - 2]?.match(/^(\d+)x(\d+)$/);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 0, height: 0 };
}

export interface TenantMedia {
  assets: MediaAsset[];
  /** True if the Blob list FAILED — the list is partial. Callers that need
   *  completeness (owner export) must treat this as an error. */
  degraded: boolean;
}

/**
 * Collect a tenant's media from Blob, newest first, WITH a `degraded` flag. Never
 * throws for a source failure; instead reports it so completeness-sensitive callers
 * (export) can tell "genuinely empty" from "a source was down". `opts.limit` caps
 * the read (a single Blob page) for surfaces that only need a preview.
 */
export async function collectTenantMedia(
  tenant: string,
  opts: { limit?: number } = {},
): Promise<TenantMedia> {
  assertTenant(tenant);
  const { limit } = opts;
  const assets: MediaAsset[] = [];
  let degraded = false;

  if (blobEnabled()) {
    try {
      const { list } = await import("@vercel/blob");
      let cursor: string | undefined;
      do {
        const res = await list({
          prefix: mediaPrefix(tenant),
          cursor,
          limit: limit ? Math.min(limit, 1000) : 1000,
        });
        for (const b of res.blobs) {
          const uploadedAt = b.uploadedAt instanceof Date ? b.uploadedAt : new Date(b.uploadedAt);
          const { width, height } = dimsFromPathname(b.pathname);
          assets.push({
            id: b.url, // opaque id = the blob URL (DELETE takes it back)
            url: b.url,
            filename: filenameFromPathname(b.pathname),
            width,
            height,
            size: b.size,
            createdAt: uploadedAt.toISOString(),
          });
        }
        // Stop after one page when a limit was requested (preview surfaces).
        cursor = !limit && res.hasMore ? res.cursor : undefined;
      } while (cursor);
    } catch (err) {
      console.warn("[media] blob list failed", tenant, err);
      degraded = true;
    }
  }

  assets.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return { assets: limit ? assets.slice(0, limit) : assets, degraded };
}

/** List a tenant's media (fail-soft; drops the degraded flag). Use `collectTenantMedia` when completeness matters. */
export async function listTenantMedia(tenant: string, opts: { limit?: number } = {}): Promise<MediaAsset[]> {
  return (await collectTenantMedia(tenant, opts)).assets;
}

/**
 * Upload a verified image buffer to the tenant's Blob library, in a per-upload
 * subfolder so the display filename stays clean and same-name re-uploads don't
 * collide. The caller does size/type/raster-byte verification. Requires
 * BLOB_READ_WRITE_TOKEN — the media library is Blob-only now.
 */
export async function uploadTenantMedia(
  tenant: string,
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<MediaAsset> {
  assertTenant(tenant);
  if (!blobEnabled()) {
    if (!localMediaFallbackAllowed()) {
      throw new MediaStoreUnavailableError("Media uploads require BLOB_READ_WRITE_TOKEN (Vercel Blob) to be configured.");
    }
    return writeLocalMedia(tenant, buffer, filename);
  }
  const { put } = await import("@vercel/blob");
  const safe = sanitizeFilename(filename);
  // Persist real pixel size in the pathname so a page reload (which reads Blob's
  // `list`, not this response) still shows dimensions. Unreadable headers just
  // omit the segment and stay honestly "Unknown".
  const dims = readImageDimensions(buffer);
  const dimSeg = dims ? `${dims.width}x${dims.height}/` : "";
  const blob = await put(`${mediaPrefix(tenant)}${randomUUID()}/${dimSeg}${safe}`, buffer, {
    access: "public",
    contentType,
  });
  return {
    id: blob.url,
    url: blob.url,
    filename: safe,
    width: dims?.width ?? 0,
    height: dims?.height ?? 0,
    size: buffer.length,
    createdAt: new Date().toISOString(),
  };
}

async function writeLocalMedia(tenant: string, buffer: Buffer, filename: string): Promise<MediaAsset> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const safe = sanitizeFilename(filename);
  const id = randomUUID();
  const dir = path.join(process.cwd(), "public", "uploads", "media", tenant, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, safe), buffer);
  console.warn("[media] BLOB_READ_WRITE_TOKEN missing; wrote upload to local disk (development only)");
  const url = `/uploads/media/${tenant}/${id}/${safe}`;
  const dims = readImageDimensions(buffer);
  return {
    id: url,
    url,
    filename: safe,
    width: dims?.width ?? 0,
    height: dims?.height ?? 0,
    size: buffer.length,
    createdAt: new Date().toISOString(),
  };
}

/**
 * The one image upload path for the editor and the media library: size, type
 * and real-bytes checks, then the tenant's Blob library.
 */
export async function uploadTenantImageFile(tenant: string, file: File): Promise<MediaAsset> {
  assertTenant(tenant);
  if (file.size > MEDIA_MAX_BYTES) throw new MediaUploadRejectedError("File too large (max 5MB)");
  if (!MEDIA_ALLOWED_TYPES.has(file.type)) {
    throw new MediaUploadRejectedError("Invalid file type. Allowed: JPEG, PNG, WebP, GIF, AVIF.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  // `file.type` is client-supplied; sniff the real bytes so a declared
  // image/png can't smuggle an SVG/HTML/script payload.
  const verified = verifyRasterImage(buffer, MEDIA_ALLOWED_TYPES);
  if (!verified.ok) throw new MediaUploadRejectedError(verified.reason);
  return uploadTenantMedia(tenant, buffer, file.name, file.type);
}

/** Status and plain message for a failed upload; shared by /api/upload and /api/media. */
export function mediaUploadErrorResponse(err: unknown): { status: number; error: string } {
  if (err instanceof MediaUploadRejectedError) return { status: 400, error: err.message };
  if (err instanceof MediaStoreUnavailableError) {
    return { status: 503, error: "Image uploads are not available right now: storage is not configured." };
  }
  console.error("[media] upload failed", err);
  return { status: 500, error: "Upload failed." };
}

export interface MediaDeleteResult {
  ok: boolean;
  status: number;
  error?: string;
}

/**
 * Delete a tenant-owned asset. `id` is the blob URL; the tenant is enforced by
 * the `media/{tenant}/` pathname prefix, so this never deletes cross-tenant. A
 * non-Blob id (e.g. a stale legacy Sanity `_id`) is a 404 — the library is
 * Blob-only.
 */
export async function deleteTenantMedia(tenant: string, id: string): Promise<MediaDeleteResult> {
  assertTenant(tenant);

  if (id.includes(BLOB_HOST)) {
    let pathname: string;
    try {
      pathname = new URL(id).pathname.replace(/^\/+/, "");
    } catch {
      return { ok: false, status: 400, error: "Invalid asset id" };
    }
    if (!pathname.startsWith(mediaPrefix(tenant))) {
      return { ok: false, status: 404, error: "Asset not found" };
    }
    const { del } = await import("@vercel/blob");
    await del(id);
    return { ok: true, status: 200 };
  }

  return { ok: false, status: 404, error: "Asset not found" };
}

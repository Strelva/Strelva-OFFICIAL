/**
 * Tenant media library backed by Vercel Blob — the replacement for the
 * Sanity-hosted image library.
 *
 * Blob is the SINGLE source (no sidecar DB index): tenant isolation is a
 * `media/{tenant}/` pathname prefix, enforced on both list and delete. The only
 * fields Blob can't supply (width/height/lqip) aren't load-bearing — `lqip` is
 * unused and the UI's Dimensions row already degrades to "Unknown" — so no index
 * is needed and there's no dual-write to drift.
 *
 * Each upload lands in a per-upload subfolder (`media/{tenant}/{id}/{name}`) so a
 * same-name re-upload gets a unique path WITHOUT mangling the display filename
 * (the last path segment stays the clean name).
 *
 * TRANSITION: images already uploaded to Sanity keep rendering wherever they're
 * referenced (the Sanity CDN stays read-only until the dataset is locked), and
 * are still surfaced here via a fail-soft legacy read so an owner's picker
 * doesn't lose them. NEW uploads go to Blob only. When the Sanity dataset is
 * locked (the deliberate end-step), the legacy read + Sanity-delete branch drop
 * out and this becomes Blob-only.
 */

import { randomUUID } from "crypto";
import type { MediaAsset } from "./media";
import { hasSanity } from "./storage/core";

/** Vercel Blob public-store host — used to tell a Blob id from a legacy Sanity _id. */
const BLOB_HOST = "blob.vercel-storage.com";

const mediaPrefix = (tenant: string): string => `media/${tenant}/`;

const blobEnabled = (): boolean => !!process.env.BLOB_READ_WRITE_TOKEN;

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

/** Display filename from a blob pathname (`media/{tenant}/{id}/{name}`). */
function filenameFromPathname(pathname: string): string {
  return pathname.split("/").pop() || pathname;
}

export interface TenantMedia {
  assets: MediaAsset[];
  /** True if an enabled source (Blob and/or Sanity) FAILED — the list is partial.
   *  Callers that need completeness (owner export) must treat this as an error. */
  degraded: boolean;
}

/**
 * Collect a tenant's media — Blob (new) + a fail-soft Sanity legacy read
 * (existing), newest first — WITH a `degraded` flag. Never throws for a source
 * failure; instead reports it so completeness-sensitive callers (export) can tell
 * "genuinely empty" from "a source was down". `opts.limit` caps the read (a
 * single Blob page + capped Sanity fetch) for surfaces that only need a preview.
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
          assets.push({
            id: b.url, // opaque id = the blob URL (DELETE takes it back)
            url: b.url,
            filename: filenameFromPathname(b.pathname),
            width: 0,
            height: 0,
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

  // Transitional: existing Sanity-hosted images. Fail-soft.
  if (hasSanity) {
    try {
      const { getSanityReadClient } = await import("./sanity");
      const slice = limit ? `[0...${limit}]` : "";
      const raw = await getSanityReadClient().fetch(
        `*[_type == "sanity.imageAsset" && label == $tenant] | order(_createdAt desc) ${slice} {
          _id, _createdAt, url, originalFilename,
          metadata { dimensions { width, height }, lqip }, size
        }`,
        { tenant },
      );
      for (const d of (raw || []) as Array<{
        _id: string;
        _createdAt: string;
        url: string;
        originalFilename?: string;
        metadata?: { dimensions?: { width: number; height: number }; lqip?: string };
        size?: number;
      }>) {
        assets.push({
          id: d._id,
          url: d.url,
          filename: d.originalFilename || "untitled",
          width: d.metadata?.dimensions?.width || 0,
          height: d.metadata?.dimensions?.height || 0,
          size: d.size || 0,
          lqip: d.metadata?.lqip || undefined,
          createdAt: d._createdAt,
        });
      }
    } catch (err) {
      console.warn("[media] sanity legacy list failed", tenant, err);
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
    throw new Error("Media uploads require BLOB_READ_WRITE_TOKEN (Vercel Blob) to be configured.");
  }
  const { put } = await import("@vercel/blob");
  const safe = sanitizeFilename(filename);
  const blob = await put(`${mediaPrefix(tenant)}${randomUUID()}/${safe}`, buffer, {
    access: "public",
    contentType,
  });
  return {
    id: blob.url,
    url: blob.url,
    filename: safe,
    width: 0,
    height: 0,
    size: buffer.length,
    createdAt: new Date().toISOString(),
  };
}

export interface MediaDeleteResult {
  ok: boolean;
  status: number;
  error?: string;
}

/**
 * Delete a tenant-owned asset. `id` is the blob URL for Blob-hosted assets
 * (tenant enforced by the `media/{tenant}/` pathname prefix) or a legacy Sanity
 * `_id` (tenant enforced by a `label == tenant` ownership query). Never deletes
 * cross-tenant.
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

  // Transitional: legacy Sanity asset. Ownership-checked (label == tenant).
  if (hasSanity) {
    const { getSanityReadClient, getSanityClient } = await import("./sanity");
    const owned = await getSanityReadClient().fetch<string | null>(
      `*[_type == "sanity.imageAsset" && _id == $id && label == $tenant][0]._id`,
      { id, tenant },
    );
    if (!owned) return { ok: false, status: 404, error: "Asset not found" };
    await getSanityClient().delete(id);
    return { ok: true, status: 200 };
  }

  return { ok: false, status: 404, error: "Asset not found" };
}

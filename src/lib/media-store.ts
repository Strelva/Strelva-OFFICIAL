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
 * TRANSITION: images already uploaded to Sanity keep rendering wherever they're
 * referenced (the Sanity CDN stays read-only until the dataset is locked), and
 * are still surfaced here via a fail-soft legacy read so an owner's picker
 * doesn't lose them. NEW uploads go to Blob only. When the Sanity dataset is
 * locked (the deliberate end-step), the legacy read + Sanity-delete branch drop
 * out and this becomes Blob-only.
 */

import type { MediaAsset } from "./media";
import { hasSanity } from "./storage/core";

/** Vercel Blob public-store host — used to tell a Blob id from a legacy Sanity _id. */
const BLOB_HOST = "blob.vercel-storage.com";

const mediaPrefix = (tenant: string): string => `media/${tenant}/`;

const blobEnabled = (): boolean => !!process.env.BLOB_READ_WRITE_TOKEN;

/** Sanitize an upload filename to the same charset the old path used. */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "image";
}

/** Display filename from a blob pathname (`media/{tenant}/{name}`). */
function filenameFromPathname(pathname: string): string {
  return pathname.split("/").pop() || pathname;
}

/**
 * List a tenant's media library — Blob (new) merged with a fail-soft Sanity
 * legacy read (existing), newest first. Never throws: a failing source is
 * skipped so the library still renders what the other source has.
 */
export async function listTenantMedia(tenant: string): Promise<MediaAsset[]> {
  const assets: MediaAsset[] = [];

  if (blobEnabled()) {
    try {
      const { list } = await import("@vercel/blob");
      let cursor: string | undefined;
      do {
        const res = await list({ prefix: mediaPrefix(tenant), cursor, limit: 1000 });
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
        cursor = res.hasMore ? res.cursor : undefined;
      } while (cursor);
    } catch (err) {
      console.warn("[media] blob list failed", tenant, err);
    }
  }

  // Transitional: existing Sanity-hosted images. Fail-soft.
  if (hasSanity) {
    try {
      const { getSanityReadClient } = await import("./sanity");
      const raw = await getSanityReadClient().fetch(
        `*[_type == "sanity.imageAsset" && label == $tenant] | order(_createdAt desc) {
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
    }
  }

  assets.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return assets;
}

/**
 * Upload a verified image buffer to the tenant's Blob library. The caller does
 * size/type/raster-byte verification; this just stores it under the tenant
 * prefix. `put` adds a random suffix so same-name re-uploads don't collide.
 */
export async function uploadTenantMedia(
  tenant: string,
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<MediaAsset> {
  const { put } = await import("@vercel/blob");
  const safe = sanitizeFilename(filename);
  const blob = await put(`${mediaPrefix(tenant)}${safe}`, buffer, {
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

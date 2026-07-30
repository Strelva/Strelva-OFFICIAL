/**
 * File upload storage - Vercel Blob, or local disk in dev.
 */

import { promises as fs } from "fs";
import path from "path";
import { verifyRasterImage } from "../image-signature";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

export async function uploadFile(file: File): Promise<{ url: string }> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File too large (max 5MB)");
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Invalid file type. Allowed: JPEG, PNG, WebP, GIF");
  }

  // `file.type` is client-supplied — verify the real bytes match a raster
  // image so a declared image/png can't smuggle an SVG/HTML/script payload.
  const buffer = Buffer.from(await file.arrayBuffer());
  const verified = verifyRasterImage(buffer, ALLOWED_MIME_TYPES);
  if (!verified.ok) {
    throw new Error(verified.reason);
  }

  const safeName = sanitizeFilename(file.name);

  // Vercel Blob in prod; local disk for dev (no Blob token).
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  if (hasBlob) {
    const { put } = await import("@vercel/blob");
    // addRandomSuffix: a same-name re-upload gets a unique path instead of
    // throwing (v2 Blob rejects a duplicate pathname by default).
    const blob = await put(safeName, buffer, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: true,
    });
    return { url: blob.url };
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  const filename = `${Date.now()}-${safeName}`;
  const filePath = path.join(uploadsDir, filename);
  await fs.writeFile(filePath, buffer);

  return { url: `/uploads/${filename}` };
}

/**
 * Upload a file scoped to a specific tenant, prefixing the Blob pathname with
 * the tenant slug so files from different tenants are structurally isolated.
 * The tenant id must not be empty or contain a `/` (enforced below) — this is
 * the same invariant that `media-store.ts` enforces on its prefix.
 *
 * Use this instead of the bare `uploadFile` whenever the caller has a tenant
 * context (e.g. the /api/upload route). The local dev fallback uses a matching
 * subdirectory under public/uploads/{tenant}/.
 */
export async function uploadTenantFile(
  tenant: string,
  file: File
): Promise<{ url: string }> {
  if (!tenant || tenant.includes("/")) {
    throw new Error(`Invalid tenant id for upload store: ${JSON.stringify(tenant)}`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File too large (max 5MB)");
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Invalid file type. Allowed: JPEG, PNG, WebP, GIF");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const verified = verifyRasterImage(buffer, ALLOWED_MIME_TYPES);
  if (!verified.ok) {
    throw new Error(verified.reason);
  }

  const safeName = sanitizeFilename(file.name);

  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  if (hasBlob) {
    const { put } = await import("@vercel/blob");
    // Prefix with the tenant slug — structural isolation in the shared Blob namespace.
    const blob = await put(`${tenant}/${safeName}`, buffer, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: true,
    });
    return { url: blob.url };
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads", tenant);
  await fs.mkdir(uploadsDir, { recursive: true });

  const filename = `${Date.now()}-${safeName}`;
  const filePath = path.join(uploadsDir, filename);
  await fs.writeFile(filePath, buffer);

  return { url: `/uploads/${tenant}/${filename}` };
}

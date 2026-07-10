/**
 * File upload storage - Sanity assets, Vercel Blob, or local fallback.
 */

import { promises as fs } from "fs";
import path from "path";
import { getSanityClient, sanityImageUrl } from "../sanity";
import { hasSanity } from "./core";
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

  // Blob-first (the Sanity library is being decommissioned); Sanity is a
  // transitional fallback until its dataset is locked; local disk for dev.
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  if (hasBlob) {
    const { put } = await import("@vercel/blob");
    const blob = await put(safeName, buffer, {
      access: "public",
      contentType: file.type,
    });
    return { url: blob.url };
  }

  if (hasSanity) {
    const asset = await getSanityClient().assets.upload("image", buffer, {
      filename: safeName,
      contentType: file.type,
    });
    return { url: sanityImageUrl(asset) };
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  const filename = `${Date.now()}-${safeName}`;
  const filePath = path.join(uploadsDir, filename);
  await fs.writeFile(filePath, buffer);

  return { url: `/uploads/${filename}` };
}

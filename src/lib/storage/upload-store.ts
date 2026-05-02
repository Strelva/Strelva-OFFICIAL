/**
 * File upload storage - Sanity assets, Vercel Blob, or local fallback.
 */

import { promises as fs } from "fs";
import path from "path";
import { getSanityClient, sanityImageUrl } from "../sanity";
import { hasSanity } from "./core";

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

  const safeName = sanitizeFilename(file.name);

  if (hasSanity) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await getSanityClient().assets.upload("image", buffer, {
      filename: safeName,
      contentType: file.type,
    });
    return { url: sanityImageUrl(asset) };
  }

  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  if (hasBlob) {
    const { put } = await import("@vercel/blob");
    const blob = await put(safeName, file, { access: "public" });
    return { url: blob.url };
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${Date.now()}-${safeName}`;
  const filePath = path.join(uploadsDir, filename);
  await fs.writeFile(filePath, buffer);

  return { url: `/uploads/${filename}` };
}

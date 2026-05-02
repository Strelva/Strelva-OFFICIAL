/**
 * File upload storage - Sanity assets, Vercel Blob, or local fallback.
 */

import { promises as fs } from "fs";
import path from "path";
import { getSanityClient, sanityImageUrl } from "../sanity";
import { hasSanity } from "./core";

export async function uploadFile(file: File): Promise<{ url: string }> {
  if (hasSanity) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await getSanityClient().assets.upload("image", buffer, {
      filename: file.name,
      contentType: file.type,
    });
    return { url: sanityImageUrl(asset) };
  }

  // Vercel Blob fallback
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  if (hasBlob) {
    const { put } = await import("@vercel/blob");
    const blob = await put(file.name, file, { access: "public" });
    return { url: blob.url };
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${Date.now()}-${file.name}`;
  const filePath = path.join(uploadsDir, filename);
  await fs.writeFile(filePath, buffer);

  return { url: `/uploads/${filename}` };
}

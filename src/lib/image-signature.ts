/**
 * Magic-byte sniffing for uploaded images.
 *
 * The upload routes previously trusted the client-supplied `file.type` MIME
 * string to allowlist raster images. That string is attacker-controlled: a
 * request can declare `Content-Type: image/png` while the body is an SVG, HTML,
 * or script payload — a stored-XSS vector once the asset is served from a
 * tenant's domain. We sniff the real bytes and reject anything whose content
 * doesn't match a known raster signature, regardless of the declared type.
 */

export type RasterMime =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "image/avif";

function bytesAt(buf: Uint8Array, offset: number, sig: number[]): boolean {
  if (buf.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
}

function ascii(buf: Uint8Array, offset: number, text: string): boolean {
  return bytesAt(
    buf,
    offset,
    text.split("").map((c) => c.charCodeAt(0))
  );
}

/**
 * Returns the detected raster image MIME from the buffer's magic bytes, or
 * null if the content is not a recognized raster image (SVG/HTML/script/etc.).
 */
export function sniffImageType(buf: Uint8Array): RasterMime | null {
  // JPEG: FF D8 FF
  if (bytesAt(buf, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytesAt(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  // GIF: "GIF87a" or "GIF89a"
  if (ascii(buf, 0, "GIF87a") || ascii(buf, 0, "GIF89a")) return "image/gif";

  // WebP: "RIFF" .... "WEBP"
  if (ascii(buf, 0, "RIFF") && ascii(buf, 8, "WEBP")) return "image/webp";

  // AVIF/HEIF family: ISO-BMFF "ftyp" box at offset 4, brand "avif"/"avis"
  if (ascii(buf, 4, "ftyp") && (ascii(buf, 8, "avif") || ascii(buf, 8, "avis"))) {
    return "image/avif";
  }

  return null;
}

/**
 * Verify a buffer is a raster image whose real content is in `allowed`.
 * Returns the detected MIME on success, or an error reason on failure.
 */
export function verifyRasterImage(
  buf: Uint8Array,
  allowed: ReadonlySet<string>
): { ok: true; mime: RasterMime } | { ok: false; reason: string } {
  const detected = sniffImageType(buf);
  if (!detected) {
    return { ok: false, reason: "File content is not a recognized image." };
  }
  if (!allowed.has(detected)) {
    return { ok: false, reason: `Image type ${detected} is not allowed.` };
  }
  return { ok: true, mime: detected };
}

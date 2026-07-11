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

/** Read a big-endian uint from the buffer (2 or 4 bytes). */
function beUint(buf: Uint8Array, offset: number, bytes: number): number {
  let n = 0;
  for (let i = 0; i < bytes; i++) n = n * 256 + buf[offset + i];
  return n;
}

/**
 * Read the pixel dimensions from a raster image's header — dependency-free,
 * parsing only the few bytes each format puts its size in (PNG IHDR, JPEG SOF,
 * GIF logical-screen, WebP VP8/VP8L/VP8X). Returns null for anything it can't
 * confidently read (AVIF, a truncated header, an unrecognized format) so the
 * caller keeps an honest "Unknown" rather than a fabricated size.
 */
export function readImageDimensions(
  buf: Uint8Array
): { width: number; height: number } | null {
  // PNG: 8-byte signature, then IHDR chunk — width @16, height @20 (BE uint32).
  if (bytesAt(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    if (buf.length < 24) return null;
    const width = beUint(buf, 16, 4);
    const height = beUint(buf, 20, 4);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // GIF: "GIF87a"/"GIF89a", logical-screen width @6, height @8 (LE uint16).
  if (ascii(buf, 0, "GIF87a") || ascii(buf, 0, "GIF89a")) {
    if (buf.length < 10) return null;
    const width = buf[6] | (buf[7] << 8);
    const height = buf[8] | (buf[9] << 8);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // JPEG: scan segments for a Start-Of-Frame marker; its payload is
  // precision(1), height(2 BE), width(2 BE).
  if (bytesAt(buf, 0, [0xff, 0xd8])) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++; // resync past padding/fill bytes
        continue;
      }
      const marker = buf[offset + 1];
      // Standalone markers (no length): RSTn, SOI, EOI, TEM.
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const segLen = beUint(buf, offset + 2, 2);
      if (segLen < 2) return null;
      // SOF markers carry the frame dimensions (exclude DHT/DAC/SOS/APPn).
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        const height = beUint(buf, offset + 5, 2);
        const width = beUint(buf, offset + 7, 2);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      offset += 2 + segLen;
    }
    return null;
  }

  // WebP: "RIFF"...."WEBP", then a VP8 / VP8L / VP8X chunk.
  if (ascii(buf, 0, "RIFF") && ascii(buf, 8, "WEBP")) {
    // Lossy VP8: 3-byte start code @23, then width/height (14-bit LE) @26/@28.
    if (ascii(buf, 12, "VP8 ") && buf.length >= 30) {
      const width = (buf[26] | (buf[27] << 8)) & 0x3fff;
      const height = (buf[28] | (buf[29] << 8)) & 0x3fff;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    // Lossless VP8L: 14-bit width-1 / height-1 packed from @21.
    if (ascii(buf, 12, "VP8L") && buf.length >= 25) {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return width > 0 && height > 0 ? { width, height } : null;
    }
    // Extended VP8X: 24-bit canvas width-1 @24, height-1 @27 (LE).
    if (ascii(buf, 12, "VP8X") && buf.length >= 30) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return width > 0 && height > 0 ? { width, height } : null;
    }
    return null;
  }

  // AVIF and anything else: not read here — honest Unknown.
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

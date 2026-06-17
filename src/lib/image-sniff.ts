/**
 * Magic-byte detection for raster images.
 *
 * Used as defense-in-depth on upload paths where the declared MIME type is
 * attacker-controllable (e.g. the agent's `upload_image` tool, which takes a
 * `data:<mime>;base64,...` string). Sniffing the real bytes stops a mislabeled
 * payload — most importantly an SVG (a stored-XSS vector when served from a
 * tenant's domain) smuggled as `image/png` — from being uploaded.
 *
 * Allowlist mirrors `/api/media` (JPEG, PNG, WebP, GIF, AVIF).
 */
export function sniffRasterImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "image/png";
  }

  // GIF: "GIF87a" or "GIF89a"
  const head6 = buf.toString("ascii", 0, 6);
  if (head6 === "GIF87a" || head6 === "GIF89a") return "image/gif";

  // RIFF container: "RIFF" .... "WEBP"
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }

  // AVIF / ISO-BMFF: "ftyp" at offset 4, brand "avif"/"avis" at offset 8
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }

  return null;
}

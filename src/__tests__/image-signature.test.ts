import { describe, expect, it } from "vitest";
import { sniffImageType, verifyRasterImage } from "@/lib/image-signature";

const RASTER = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

function bytes(...parts: (number[] | string)[]): Uint8Array {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") out.push(...p.split("").map((c) => c.charCodeAt(0)));
    else out.push(...p);
  }
  return Uint8Array.from(out);
}

describe("sniffImageType", () => {
  it("detects real raster signatures", () => {
    expect(sniffImageType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(bytes("GIF89a"))).toBe("image/gif");
    expect(sniffImageType(bytes("RIFF", [0, 0, 0, 0], "WEBP"))).toBe("image/webp");
    expect(sniffImageType(bytes([0, 0, 0, 0x20], "ftyp", "avif"))).toBe("image/avif");
  });

  it("returns null for non-raster content", () => {
    expect(sniffImageType(bytes("<svg xmlns="))).toBeNull();
    expect(sniffImageType(bytes("<!DOCTYPE html>"))).toBeNull();
    expect(sniffImageType(bytes("<?xml version"))).toBeNull();
    expect(sniffImageType(bytes([0x00, 0x01, 0x02]))).toBeNull();
  });
});

describe("verifyRasterImage", () => {
  it("rejects an SVG payload declared as png", () => {
    const r = verifyRasterImage(bytes("<svg onload=alert(1)>"), RASTER);
    expect(r.ok).toBe(false);
  });

  it("accepts a genuine png", () => {
    const r = verifyRasterImage(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), RASTER);
    expect(r.ok).toBe(true);
  });

  it("rejects a raster type not in the allowlist", () => {
    const r = verifyRasterImage(bytes("GIF89a"), new Set(["image/png"]));
    expect(r.ok).toBe(false);
  });
});

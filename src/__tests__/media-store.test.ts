import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mockList = vi.hoisted(() => vi.fn());
const mockPut = vi.hoisted(() => vi.fn());
const mockDel = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob", () => ({ list: mockList, put: mockPut, del: mockDel }));
// Blob-only (post-transition) behavior: no Sanity legacy read/delete.
vi.mock("@/lib/storage/core", () => ({ hasSanity: false }));

const mockFs = vi.hoisted(() => ({ mkdir: vi.fn(async (..._a: unknown[]) => undefined), writeFile: vi.fn(async (..._a: unknown[]) => undefined) }));
vi.mock("node:fs/promises", () => ({ default: mockFs, ...mockFs }));

import { listTenantMedia, collectTenantMedia, uploadTenantMedia, deleteTenantMedia } from "@/lib/media-store";
import {
  MediaStoreUnavailableError,
  MediaUploadRejectedError,
  mediaUploadErrorResponse,
  uploadTenantImageFile,
} from "@/platform/infra/media/store";

const BLOB = "https://abc123.public.blob.vercel-storage.com";

/** Minimal valid PNG header (signature + IHDR width/height) for dimension probing. */
function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  vi.unstubAllEnvs();
});

describe("listTenantMedia", () => {
  it("lists the tenant's blobs (prefix-scoped) as MediaAssets, newest first", async () => {
    mockList.mockResolvedValue({
      blobs: [
        { url: `${BLOB}/media/gldf/a.jpg`, pathname: "media/gldf/a.jpg", size: 100, uploadedAt: new Date("2026-07-01T00:00:00Z") },
        { url: `${BLOB}/media/gldf/b.png`, pathname: "media/gldf/b.png", size: 200, uploadedAt: new Date("2026-07-05T00:00:00Z") },
      ],
      hasMore: false,
    });

    const assets = await listTenantMedia("gldf");

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ prefix: "media/gldf/" }));
    expect(assets).toHaveLength(2);
    // Newest first.
    expect(assets[0]!.filename).toBe("b.png");
    expect(assets[0]!).toMatchObject({ url: `${BLOB}/media/gldf/b.png`, id: `${BLOB}/media/gldf/b.png`, size: 200 });
    expect(assets[1]!.filename).toBe("a.jpg");
  });

  it("reads persisted dimensions from the pathname, and stays Unknown (0x0) for legacy paths", async () => {
    mockList.mockResolvedValue({
      blobs: [
        { url: `${BLOB}/media/gldf/uuid1/1024x768/new.jpg`, pathname: "media/gldf/uuid1/1024x768/new.jpg", size: 10, uploadedAt: new Date("2026-07-06T00:00:00Z") },
        { url: `${BLOB}/media/gldf/uuid2/legacy.jpg`, pathname: "media/gldf/uuid2/legacy.jpg", size: 10, uploadedAt: new Date("2026-07-05T00:00:00Z") },
      ],
      hasMore: false,
    });

    const assets = await listTenantMedia("gldf");

    expect(assets[0]).toMatchObject({ filename: "new.jpg", width: 1024, height: 768 });
    expect(assets[1]).toMatchObject({ filename: "legacy.jpg", width: 0, height: 0 });
  });

  it("paginates via cursor until hasMore is false", async () => {
    mockList
      .mockResolvedValueOnce({ blobs: [{ url: `${BLOB}/media/gldf/1.jpg`, pathname: "media/gldf/1.jpg", size: 1, uploadedAt: new Date() }], hasMore: true, cursor: "c1" })
      .mockResolvedValueOnce({ blobs: [{ url: `${BLOB}/media/gldf/2.jpg`, pathname: "media/gldf/2.jpg", size: 1, uploadedAt: new Date() }], hasMore: false });

    const assets = await listTenantMedia("gldf");
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(mockList.mock.calls[1]![0]).toMatchObject({ cursor: "c1" });
    expect(assets).toHaveLength(2);
  });

  it("is fail-soft: a blob-list error yields an empty list, not a throw", async () => {
    mockList.mockRejectedValue(new Error("blob down"));
    await expect(listTenantMedia("gldf")).resolves.toEqual([]);
  });
});

describe("uploadTenantMedia", () => {
  it("puts in a per-upload subfolder under the tenant prefix (unique path, clean filename)", async () => {
    mockPut.mockResolvedValue({ url: `${BLOB}/media/gldf/uuid/photo.jpg`, pathname: "media/gldf/uuid/photo.jpg" });

    const asset = await uploadTenantMedia("gldf", Buffer.from("bytes"), "photo.jpg", "image/jpeg");

    const [pathname, body, opts] = mockPut.mock.calls[0]!;
    // media/{tenant}/{uuid}/{cleanname} — the uuid subfolder makes the path unique
    // without mangling the display filename (no addRandomSuffix drift on reload).
    expect(pathname).toMatch(/^media\/gldf\/[0-9a-f-]{36}\/photo\.jpg$/);
    expect(body).toBeInstanceOf(Buffer);
    expect(opts).toMatchObject({ access: "public", contentType: "image/jpeg" });
    expect(asset).toMatchObject({ url: `${BLOB}/media/gldf/uuid/photo.jpg`, filename: "photo.jpg", size: 5 });
  });

  it("probes real pixel dimensions and persists them in the pathname + asset", async () => {
    mockPut.mockResolvedValue({ url: `${BLOB}/media/gldf/uuid/800x600/photo.png`, pathname: "media/gldf/uuid/800x600/photo.png" });

    const asset = await uploadTenantMedia("gldf", pngHeader(800, 600), "photo.png", "image/png");

    // Size rides in the pathname (before the clean filename) so a later `list` reads it back.
    expect(mockPut.mock.calls[0]![0] as string).toMatch(/^media\/gldf\/[0-9a-f-]{36}\/800x600\/photo\.png$/);
    expect(asset).toMatchObject({ width: 800, height: 600, filename: "photo.png" });
  });

  it("omits the size segment (stays honest 0x0) when the header can't be read", async () => {
    mockPut.mockResolvedValue({ url: `${BLOB}/media/gldf/uuid/x.png`, pathname: "media/gldf/uuid/x.png" });

    const asset = await uploadTenantMedia("gldf", Buffer.from("not-an-image"), "x.png", "image/png");

    expect(mockPut.mock.calls[0]![0] as string).toMatch(/^media\/gldf\/[0-9a-f-]{36}\/x\.png$/);
    expect(asset).toMatchObject({ width: 0, height: 0 });
  });

  it("throws a clear error (not a cryptic BlobError) when the Blob token is missing", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await expect(uploadTenantMedia("gldf", Buffer.from("b"), "x.jpg", "image/jpeg")).rejects.toThrow(
      /BLOB_READ_WRITE_TOKEN/,
    );
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("sanitizes the filename (path traversal can't escape the tenant subfolder)", async () => {
    mockPut.mockResolvedValue({ url: `${BLOB}/x`, pathname: "x" });
    await uploadTenantMedia("gldf", Buffer.from("b"), "../../evil name!.png", "image/png");
    // The `/` in the input became `_`, so the sanitized name is the last segment.
    expect(mockPut.mock.calls[0]![0] as string).toMatch(/^media\/gldf\/[^/]+\/\.\._\.\._evil_name_\.png$/);
  });
});

describe("deleteTenantMedia — tenant isolation", () => {
  it("deletes a blob owned by the tenant (pathname prefix matches)", async () => {
    mockDel.mockResolvedValue(undefined);
    const res = await deleteTenantMedia("gldf", `${BLOB}/media/gldf/a.jpg`);
    expect(res).toEqual({ ok: true, status: 200 });
    expect(mockDel).toHaveBeenCalledWith(`${BLOB}/media/gldf/a.jpg`);
  });

  it("REFUSES to delete another tenant's blob (prefix mismatch) — no del call", async () => {
    const res = await deleteTenantMedia("gldf", `${BLOB}/media/rohlax/secret.jpg`);
    expect(res).toMatchObject({ ok: false, status: 404 });
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("404s a legacy Sanity id when Sanity is off (post-transition)", async () => {
    const res = await deleteTenantMedia("gldf", "image-abc123-legacy");
    expect(res).toMatchObject({ ok: false, status: 404 });
    expect(mockDel).not.toHaveBeenCalled();
  });
});

describe("collectTenantMedia — degraded flag (export completeness)", () => {
  it("reports degraded=true when a media source read fails (list is partial)", async () => {
    mockList.mockRejectedValue(new Error("blob down"));
    const { assets, degraded } = await collectTenantMedia("gldf");
    // A failed source must NOT look like 'genuinely empty' to a departing client.
    expect(degraded).toBe(true);
    expect(assets).toEqual([]);
  });

  it("reports degraded=false on a clean read", async () => {
    mockList.mockResolvedValue({ blobs: [], hasMore: false });
    const { degraded } = await collectTenantMedia("gldf");
    expect(degraded).toBe(false);
  });
});

describe("tenant-id isolation guard", () => {
  it("rejects a tenant id containing a slash (the isolation boundary is a path prefix)", async () => {
    await expect(listTenantMedia("a/b")).rejects.toThrow(/Invalid tenant/);
    await expect(deleteTenantMedia("a/b", `${BLOB}/media/a/x.jpg`)).rejects.toThrow(/Invalid tenant/);
    await expect(uploadTenantMedia("a/b", Buffer.from("x"), "x.jpg", "image/jpeg")).rejects.toThrow(/Invalid tenant/);
    expect(mockDel).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });
});

function imageFile(bytes: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("uploadTenantImageFile", () => {
  it("rejects an oversize file", async () => {
    const big = imageFile(Buffer.alloc(5 * 1024 * 1024 + 1), "big.png", "image/png");
    await expect(uploadTenantImageFile("gldf", big)).rejects.toBeInstanceOf(MediaUploadRejectedError);
  });

  it("rejects an SVG declared as image/png", async () => {
    const svg = imageFile(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), "x.png", "image/png");
    await expect(uploadTenantImageFile("gldf", svg)).rejects.toBeInstanceOf(MediaUploadRejectedError);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("rejects a declared type outside the raster allowlist", async () => {
    await expect(uploadTenantImageFile("gldf", imageFile(pngHeader(1, 1), "x.svg", "image/svg+xml")))
      .rejects.toThrow(/Invalid file type/);
  });

  it("stores a valid PNG under the media/{tenant}/ prefix", async () => {
    mockPut.mockResolvedValue({ url: `${BLOB}/media/gldf/u/10x10/p.png` });
    const asset = await uploadTenantImageFile("gldf", imageFile(pngHeader(10, 10), "p.png", "image/png"));
    expect(mockPut.mock.calls[0]![0]).toMatch(/^media\/gldf\//);
    expect(asset.url).toContain("/media/gldf/");
  });

  it("fails closed without a Blob token outside local development", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await expect(uploadTenantImageFile("gldf", imageFile(pngHeader(10, 10), "p.png", "image/png")))
      .rejects.toBeInstanceOf(MediaStoreUnavailableError);
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("writes to local disk only in next dev without a token", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const asset = await uploadTenantImageFile("gldf", imageFile(pngHeader(10, 10), "p.png", "image/png"));
    expect(String(mockFs.writeFile.mock.calls[0]![0])).toContain("public/uploads/media/gldf/");
    expect(asset.url).toMatch(/^\/uploads\/media\/gldf\//);
  });

  it("still fails closed in a Vercel preview even when NODE_ENV is development", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "preview");
    await expect(uploadTenantImageFile("gldf", imageFile(pngHeader(10, 10), "p.png", "image/png")))
      .rejects.toBeInstanceOf(MediaStoreUnavailableError);
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });
});

describe("mediaUploadErrorResponse", () => {
  it("maps rejected to 400, unavailable to 503 and anything else to 500", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(mediaUploadErrorResponse(new MediaUploadRejectedError("File too large (max 5MB)"))).toEqual({ status: 400, error: "File too large (max 5MB)" });
    expect(mediaUploadErrorResponse(new MediaStoreUnavailableError("x")).status).toBe(503);
    expect(mediaUploadErrorResponse(new Error("boom"))).toEqual({ status: 500, error: "Upload failed." });
  });
});

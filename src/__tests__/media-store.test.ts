import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mockList = vi.hoisted(() => vi.fn());
const mockPut = vi.hoisted(() => vi.fn());
const mockDel = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob", () => ({ list: mockList, put: mockPut, del: mockDel }));
// Blob-only (post-transition) behavior: no Sanity legacy read/delete.
vi.mock("@/lib/storage/core", () => ({ hasSanity: false }));

import { listTenantMedia, uploadTenantMedia, deleteTenantMedia } from "@/lib/media-store";

const BLOB = "https://abc123.public.blob.vercel-storage.com";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
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
    expect(assets[0].filename).toBe("b.png");
    expect(assets[0]).toMatchObject({ url: `${BLOB}/media/gldf/b.png`, id: `${BLOB}/media/gldf/b.png`, size: 200 });
    expect(assets[1].filename).toBe("a.jpg");
  });

  it("paginates via cursor until hasMore is false", async () => {
    mockList
      .mockResolvedValueOnce({ blobs: [{ url: `${BLOB}/media/gldf/1.jpg`, pathname: "media/gldf/1.jpg", size: 1, uploadedAt: new Date() }], hasMore: true, cursor: "c1" })
      .mockResolvedValueOnce({ blobs: [{ url: `${BLOB}/media/gldf/2.jpg`, pathname: "media/gldf/2.jpg", size: 1, uploadedAt: new Date() }], hasMore: false });

    const assets = await listTenantMedia("gldf");
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(mockList.mock.calls[1][0]).toMatchObject({ cursor: "c1" });
    expect(assets).toHaveLength(2);
  });

  it("is fail-soft: a blob-list error yields an empty list, not a throw", async () => {
    mockList.mockRejectedValue(new Error("blob down"));
    await expect(listTenantMedia("gldf")).resolves.toEqual([]);
  });
});

describe("uploadTenantMedia", () => {
  it("puts under the tenant prefix as a public blob and returns the MediaAsset", async () => {
    mockPut.mockResolvedValue({ url: `${BLOB}/media/gldf/photo-x1.jpg`, pathname: "media/gldf/photo-x1.jpg" });

    const asset = await uploadTenantMedia("gldf", Buffer.from("bytes"), "photo.jpg", "image/jpeg");

    expect(mockPut).toHaveBeenCalledWith(
      "media/gldf/photo.jpg",
      expect.any(Buffer),
      expect.objectContaining({ access: "public", contentType: "image/jpeg" }),
    );
    expect(asset).toMatchObject({ url: `${BLOB}/media/gldf/photo-x1.jpg`, filename: "photo.jpg", size: 5 });
  });

  it("sanitizes the filename before using it as the blob path", async () => {
    mockPut.mockResolvedValue({ url: `${BLOB}/x`, pathname: "x" });
    await uploadTenantMedia("gldf", Buffer.from("b"), "../../evil name!.png", "image/png");
    expect(mockPut.mock.calls[0][0]).toBe("media/gldf/.._.._evil_name_.png");
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

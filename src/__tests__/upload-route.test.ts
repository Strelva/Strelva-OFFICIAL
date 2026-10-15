import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({ put: vi.fn() }));
const fs = vi.hoisted(() => ({ mkdir: vi.fn(async () => undefined), writeFile: vi.fn(async () => undefined) }));
vi.mock("@vercel/blob", () => blob);
vi.mock("node:fs/promises", () => ({ default: fs, ...fs }));
vi.mock("@/platform/infra/auth", () => ({
  verifyAuth: vi.fn(async () => true),
  requireTenantPermission: vi.fn(async () => null),
}));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: vi.fn(async () => "gldf") }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: vi.fn(async () => false) }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));

import { POST } from "@/app/api/upload/route";

function png(): Uint8Array<ArrayBuffer> {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(8, 16);
  b.writeUInt32BE(8, 20);
  return new Uint8Array(b) as Uint8Array<ArrayBuffer>;
}

function request(file: File): Request {
  const form = new FormData();
  form.append("file", file);
  return new Request("http://localhost/api/upload", { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe("POST /api/upload", () => {
  it("stores through the Blob media library and returns the url and asset", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "token";
    blob.put.mockResolvedValue({ url: "https://x.public.blob.vercel-storage.com/media/gldf/u/8x8/p.png" });
    const response = await POST(request(new File([png()], "p.png", { type: "image/png" })));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.url).toContain("/media/gldf/");
    expect(body.asset.url).toBe(body.url);
  });

  it("is a 503 with a plain message and writes nothing to disk without a token", async () => {
    const response = await POST(request(new File([png()], "p.png", { type: "image/png" })));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/not available right now/);
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(blob.put).not.toHaveBeenCalled();
  });

  it("is a 400 for a type that is not an allowed image", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "token";
    const response = await POST(request(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" })));
    expect(response.status).toBe(400);
  });
});

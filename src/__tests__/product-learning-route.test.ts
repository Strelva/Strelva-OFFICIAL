import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: session }));
import { GET, POST } from "@/app/api/product-learning/route";

function request(body: unknown, headers: Record<string, string> = {}) { return new Request("http://localhost/api/product-learning", { method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost", ...headers }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("NODE_ENV", "test"); session.mockResolvedValue({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "researcher@example.com", email_confirmed_at: "2026-09-12T12:00:00Z" }); });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("internal learning request boundary", () => {
  it("keeps research off in production without its separate release flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRELVA_PRODUCT_LEARNING_RELEASE", "0");
    expect((await GET(new Request("http://localhost/api/product-learning?workId=anything"))).status).toBe(503);
    expect((await POST(request({}))).status).toBe(503);
  });
  it("requires verified identity after explicit production activation", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRELVA_PRODUCT_LEARNING_RELEASE", "1");
    session.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/product-learning?workId=anything"))).status).toBe(401);
    expect((await POST(request({}))).status).toBe(401);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    expect((await GET(new Request("http://localhost/api/product-learning?workId=anything"))).status).toBe(503);
  });
  it("rejects cross-site writes and unverified identities", async () => {
    expect((await POST(request({}, { origin: "https://elsewhere.example" }))).status).toBe(403);
    session.mockResolvedValue({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "researcher@example.com", email_confirmed_at: null });
    expect((await POST(request({}))).status).toBe(401);
  });
  it("bounds request size and rejects unsupported actions without exposing storage", async () => {
    expect((await POST(request({ unknown: "x".repeat(200001) }))).status).toBe(413);
    const unsupported = await POST(request({ action: "publish_everything" }));
    expect(unsupported.status).toBe(400);
    expect(unsupported.headers.get("cache-control")).toBe("private, no-store");
  });
});

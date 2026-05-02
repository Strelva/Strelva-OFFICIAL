import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

// Mock the tenants module before importing the route
vi.mock("@/lib/tenants", () => ({
  getTenantByDomain: vi.fn().mockResolvedValue({ tenantId: "test-tenant", isAdmin: false }),
}));

describe("domain-map API security", () => {
  const originalEnv = process.env;
  let GET: (request: Request) => Promise<NextResponse>;

  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv, INTERNAL_API_SECRET: "test-secret-123" };
    const routeModule = await import("../app/api/internal/domain-map/route");
    GET = routeModule.GET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createRequest(headers: Record<string, string>, domain = "test.com") {
    return new Request(`http://localhost/api/internal/domain-map?domain=${domain}`, {
      headers,
    });
  }

  it("rejects requests without internal secret", async () => {
    const request = createRequest({});
    const response = await GET(request);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
  });

  it("rejects requests with wrong secret", async () => {
    const request = createRequest({
      "x-internal-secret": "wrong-secret",
      "x-internal-request": "1",
    });
    const response = await GET(request);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
  });

  it("rejects requests missing x-internal-request header", async () => {
    const request = createRequest({
      "x-internal-secret": "test-secret-123",
    });
    const response = await GET(request);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Forbidden");
  });

  it("accepts valid internal request with correct headers", async () => {
    const request = createRequest({
      "x-internal-secret": "test-secret-123",
      "x-internal-request": "1",
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tenant).toBe("test-tenant");
  });
});

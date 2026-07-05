import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTrackClick = vi.fn((..._args: unknown[]) => Promise.resolve());
const mockGetTenantConfig = vi.fn((_tenant?: string): Promise<unknown> =>
  Promise.resolve({ id: "gldf", active: true })
);
const mockIsRateLimited = vi.fn((..._args: unknown[]) => Promise.resolve(false));

vi.mock("@/lib/storage", () => ({
  trackClick: (...args: unknown[]) => mockTrackClick(...args),
}));

vi.mock("@/lib/tenants", () => ({
  getTenantConfig: (tenant: string) => mockGetTenantConfig(tenant),
}));

vi.mock("@/lib/rate-limit", () => ({
  isRateLimitedAsync: (...args: unknown[]) => mockIsRateLimited(...args),
  rateLimitKey: vi.fn((_request: Request, scope: string) => `${scope}:test`),
}));

function post(tenant: string, body: string | object) {
  return new Request(`http://localhost/api/v1/track/${tenant}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("v1 track beacon — POST /api/v1/track/:tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantConfig.mockResolvedValue({ id: "gldf", active: true });
    mockIsRateLimited.mockResolvedValue(false);
  });

  it("stores a page-view as page-view for the tenant", async () => {
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(post("gldf", { event: "page-view" }), {
      params: Promise.resolve({ tenant: "gldf" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mockTrackClick).toHaveBeenCalledTimes(1);
    expect(mockTrackClick).toHaveBeenCalledWith("page-view", "gldf");
  });

  it("stores a service booking-click as both the base and per-service counters", async () => {
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(
      post("gldf", { event: "booking-click", serviceId: "intro-call" }),
      { params: Promise.resolve({ tenant: "gldf" }) }
    );

    expect(response.status).toBe(200);
    // base counter (drives the headline "booking clicks" number)
    expect(mockTrackClick).toHaveBeenCalledWith("booking-click", "gldf");
    // per-service counter (drives reports.ts getClickCountsByPrefix "top services")
    expect(mockTrackClick).toHaveBeenCalledWith("booking-click:intro-call", "gldf");
    expect(mockTrackClick).toHaveBeenCalledTimes(2);
  });

  it("stores a generic booking-click with no serviceId as just the base counter", async () => {
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(post("gldf", { event: "booking-click" }), {
      params: Promise.resolve({ tenant: "gldf" }),
    });

    expect(response.status).toBe(200);
    expect(mockTrackClick).toHaveBeenCalledTimes(1);
    expect(mockTrackClick).toHaveBeenCalledWith("booking-click", "gldf");
  });

  it("rejects an unknown tenant with 404 and never writes", async () => {
    mockGetTenantConfig.mockResolvedValue(undefined);
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(post("nope", { event: "page-view" }), {
      params: Promise.resolve({ tenant: "nope" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Tenant not found" });
    expect(mockTrackClick).not.toHaveBeenCalled();
  });

  it("rejects an inactive tenant with 404 and never writes", async () => {
    mockGetTenantConfig.mockResolvedValue({ id: "gldf", active: false });
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(post("gldf", { event: "page-view" }), {
      params: Promise.resolve({ tenant: "gldf" }),
    });

    expect(response.status).toBe(404);
    expect(mockTrackClick).not.toHaveBeenCalled();
  });

  it("rejects an invalid tenant slug with 400 before any lookup", async () => {
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(post("../", { event: "page-view" }), {
      params: Promise.resolve({ tenant: "../" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid tenant" });
    expect(mockGetTenantConfig).not.toHaveBeenCalled();
    expect(mockTrackClick).not.toHaveBeenCalled();
  });

  it("stores a phone-click as phone-click for the tenant", async () => {
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(post("gldf", { event: "phone-click" }), {
      params: Promise.resolve({ tenant: "gldf" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mockTrackClick).toHaveBeenCalledTimes(1);
    expect(mockTrackClick).toHaveBeenCalledWith("phone-click", "gldf");
  });

  it("rejects a serviceId attached to a phone-click with 400", async () => {
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(
      post("gldf", { event: "phone-click", serviceId: "intro-call" }),
      { params: Promise.resolve({ tenant: "gldf" }) }
    );

    expect(response.status).toBe(400);
    expect(mockTrackClick).not.toHaveBeenCalled();
  });

  it("rejects an event outside the allowed vocabulary with 400", async () => {
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(post("gldf", { event: "share-click" }), {
      params: Promise.resolve({ tenant: "gldf" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid event" });
    expect(mockTrackClick).not.toHaveBeenCalled();
  });

  it("rejects a script-injection event string with 400", async () => {
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(
      post("gldf", { event: "<script>alert(1)</script>" }),
      { params: Promise.resolve({ tenant: "gldf" }) }
    );

    expect(response.status).toBe(400);
    expect(mockTrackClick).not.toHaveBeenCalled();
  });

  it("rejects a malformed serviceId with 400", async () => {
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(
      post("gldf", { event: "booking-click", serviceId: "../etc/passwd" }),
      { params: Promise.resolve({ tenant: "gldf" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid serviceId" });
    expect(mockTrackClick).not.toHaveBeenCalled();
  });

  it("rejects a serviceId attached to a page-view with 400", async () => {
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(
      post("gldf", { event: "page-view", serviceId: "intro-call" }),
      { params: Promise.resolve({ tenant: "gldf" }) }
    );

    expect(response.status).toBe(400);
    expect(mockTrackClick).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with a 400 client error", async () => {
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(post("gldf", "{"), {
      params: Promise.resolve({ tenant: "gldf" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body" });
    expect(mockTrackClick).not.toHaveBeenCalled();
  });

  it("parses a text/plain sendBeacon body (no Content-Type) the same as JSON", async () => {
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const request = new Request("http://localhost/api/v1/track/gldf", {
      method: "POST",
      body: JSON.stringify({ event: "page-view" }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ tenant: "gldf" }),
    });

    expect(response.status).toBe(200);
    expect(mockTrackClick).toHaveBeenCalledWith("page-view", "gldf");
  });

  it("returns 429 when rate-limited and never writes", async () => {
    mockIsRateLimited.mockResolvedValue(true);
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(post("gldf", { event: "page-view" }), {
      params: Promise.resolve({ tenant: "gldf" }),
    });

    expect(response.status).toBe(429);
    expect(mockTrackClick).not.toHaveBeenCalled();
  });

  it("answers CORS preflight with permissive headers", async () => {
    const { OPTIONS } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("sets CORS headers on the success response", async () => {
    const { POST } = await import("@/app/api/v1/track/[tenant]/route");

    const response = await POST(post("gldf", { event: "page-view" }), {
      params: Promise.resolve({ tenant: "gldf" }),
    });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

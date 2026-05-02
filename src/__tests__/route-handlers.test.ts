import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() => Promise.resolve({ userId: "user_123" })),
  currentUser: vi.fn(() =>
    Promise.resolve({
      id: "user_123",
      emailAddresses: [{ emailAddress: "test@example.com" }],
      publicMetadata: { tenants: ["test-tenant"] },
    })
  ),
  clerkClient: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: (key: string) => {
        if (key === "x-tenant") return "test-tenant";
        return null;
      },
    })
  ),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => null),
}));

vi.mock("@/lib/tenants", () => ({
  getTenantConfig: vi.fn(() =>
    Promise.resolve({
      id: "test-tenant",
      subscriptionStatus: "active",
    })
  ),
  getAllTenants: vi.fn(() => Promise.resolve([])),
  updateTenant: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  trackClick: vi.fn(() => Promise.resolve()),
  getContent: vi.fn(() => Promise.resolve({})),
  setContent: vi.fn(() => Promise.resolve()),
  uploadFile: vi.fn(() => Promise.resolve({ url: "https://example.com/image.jpg" })),
  addSubscriber: vi.fn(() => Promise.resolve({ duplicate: false })),
  createBookingAtomic: vi.fn(() =>
    Promise.resolve({ success: true, booking: { id: "b_123" } })
  ),
  logActivity: vi.fn(() => Promise.resolve()),
}));

describe("Track API Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /api/track accepts allowed events", async () => {
    const { POST } = await import("@/app/api/track/route");

    const request = new Request("http://localhost/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "page-view" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
  });

  it("POST /api/track rejects invalid events", async () => {
    const { POST } = await import("@/app/api/track/route");

    const request = new Request("http://localhost/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "malicious-event" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid event");
  });

  it("POST /api/track rejects script injection attempts", async () => {
    const { POST } = await import("@/app/api/track/route");

    const request = new Request("http://localhost/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "<script>alert(1)</script>" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe("Newsletter Subscribe Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /api/newsletter/subscribe accepts valid email", async () => {
    const { POST } = await import("@/app/api/newsletter/subscribe/route");

    const request = new Request("http://localhost/api/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", name: "Test User" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it("POST /api/newsletter/subscribe rejects invalid email", async () => {
    const { POST } = await import("@/app/api/newsletter/subscribe/route");

    const request = new Request("http://localhost/api/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("valid email");
  });

  it("POST /api/newsletter/subscribe rejects missing email", async () => {
    const { POST } = await import("@/app/api/newsletter/subscribe/route");

    const request = new Request("http://localhost/api/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test User" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe("Booking Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /api/booking rejects missing required fields", async () => {
    const { POST } = await import("@/app/api/booking/route");

    const request = new Request("http://localhost/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: "svc_1",
        serviceName: "Test Service",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("Missing required fields");
  });

  it("POST /api/booking rejects invalid email", async () => {
    const { POST } = await import("@/app/api/booking/route");

    const request = new Request("http://localhost/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: "svc_1",
        serviceName: "Test Service",
        date: "2026-05-15",
        startTime: "10:00",
        clientName: "Test Client",
        clientEmail: "invalid-email",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("Invalid email");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdateTenant = vi.fn();
const mockCreateTenant = vi.fn();
const mockLogActivity = vi.fn();
const mockLogAuditEvent = vi.fn();
const mockAddCustomDomain = vi.fn();
const mockRemoveCustomDomain = vi.fn();
const mockRefreshDomainClaim = vi.fn();
const mockListTenantDomainClaims = vi.fn();
const mockResolveEventAction = vi.fn();
const mockGetRewardMember = vi.fn();
const mockCreateThread = vi.fn();
const mockUpdateThread = vi.fn();
const mockSaveChatMessages = vi.fn();
const mockUpdateSuggestion = vi.fn();
const mockHeadersGet = vi.fn((key: string) => {
  if (key === "x-tenant") return "test-tenant";
  return null;
});

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
      get: mockHeadersGet,
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
      autoPublish: false,
      customDomains: ["example.com"],
    })
  ),
  getAllTenants: vi.fn(() => Promise.resolve([])),
  createTenant: (...args: unknown[]) => mockCreateTenant(...args),
  updateTenant: (...args: unknown[]) => mockUpdateTenant(...args),
  invalidateDomainMapCache: vi.fn(),
}));

vi.mock("@/lib/domains", () => ({
  addCustomDomain: (...args: unknown[]) => mockAddCustomDomain(...args),
  removeCustomDomain: (...args: unknown[]) => mockRemoveCustomDomain(...args),
  refreshDomainClaim: (...args: unknown[]) => mockRefreshDomainClaim(...args),
  listTenantDomainClaims: (...args: unknown[]) => mockListTenantDomainClaims(...args),
  serializeDomainClaim: (claim: Record<string, unknown>) => ({
    domain: claim.domain,
    status: claim.status,
    dnsStatus: claim.dnsStatus,
    sslStatus: claim.sslStatus,
    role: claim.role,
    isApex: true,
    verification: [],
    error: claim.error,
    updatedAt: claim.updatedAt,
  }),
}));

vi.mock("@/components/templates/registry", () => ({
  getTemplateForTenant: vi.fn(() =>
    Promise.resolve({
      contentSections: ["hero", "services", "settings", "theme"],
    })
  ),
}));

vi.mock("@/lib/storage", () => ({
  trackClick: vi.fn(() => Promise.resolve()),
  loadChatMessages: vi.fn(() => Promise.resolve([])),
  saveChatMessages: (...args: unknown[]) => mockSaveChatMessages(...args),
  listDrafts: vi.fn(() => Promise.resolve({})),
  getContent: vi.fn(() => Promise.resolve({ headline: "Fresh content" })),
  getSubscribers: vi.fn(() => Promise.resolve([])),
  getDraftContent: vi.fn(() => Promise.resolve(null)),
  getVersions: vi.fn(() => Promise.resolve([])),
  getPageConfig: vi.fn(() => Promise.resolve({ home: { sections: [] } })),
  setContent: vi.fn(() => Promise.resolve()),
  setDraftContent: vi.fn(() => Promise.resolve()),
  clearDraft: vi.fn(() => Promise.resolve()),
  appendVersion: vi.fn(() => Promise.resolve()),
  recordSectionUpdate: vi.fn(() => Promise.resolve()),
  restoreVersion: vi.fn(() => Promise.resolve(null)),
  setPageConfig: vi.fn(() => Promise.resolve()),
  uploadFile: vi.fn(() => Promise.resolve({ url: "https://example.com/image.jpg" })),
  addSubscriber: vi.fn(() => Promise.resolve({ duplicate: false })),
  getInboxItems: vi.fn(() => Promise.resolve([])),
  markInboxRead: vi.fn(() => Promise.resolve(true)),
  markAllInboxRead: vi.fn(() => Promise.resolve()),
  getBookingConfig: vi.fn(() => Promise.resolve({ enabled: true })),
  setBookingConfig: vi.fn(() => Promise.resolve()),
  createBookingAtomic: vi.fn(() =>
    Promise.resolve({ success: true, booking: { id: "b_123" } })
  ),
  updateBooking: vi.fn(() =>
    Promise.resolve({
      id: "b_123",
      serviceName: "Test Service",
      date: "2026-05-15",
      clientName: "Test Client",
    })
  ),
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
  SECTION_TO_TYPE: {
    hero: "hero",
    settings: "siteSettings",
    theme: "theme",
  },
}));

vi.mock("@/lib/event-actions", () => ({
  resolveEventAction: (...args: unknown[]) => mockResolveEventAction(...args),
}));

vi.mock("@/lib/rewards/memberRepositoryKv", () => ({
  getMember: (...args: unknown[]) => mockGetRewardMember(...args),
  saveMember: vi.fn(() => Promise.resolve()),
  logTransaction: vi.fn(() => Promise.resolve({ id: "txn_123" })),
}));

vi.mock("@/lib/threads", () => ({
  listThreads: vi.fn(() => Promise.resolve([])),
  createThread: (...args: unknown[]) => mockCreateThread(...args),
  getThread: vi.fn(() => Promise.resolve({ id: "thread_123", title: "Saved", messages: [] })),
  updateThread: (...args: unknown[]) => mockUpdateThread(...args),
  deleteThread: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/suggestions", () => ({
  getSuggestions: vi.fn(() => Promise.resolve([])),
  updateSuggestion: (...args: unknown[]) => mockUpdateSuggestion(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  isRateLimitedAsync: vi.fn(() => Promise.resolve(false)),
  isRateLimitedWindowedAsync: vi.fn(() => Promise.resolve(false)),
  rateLimitKey: vi.fn((_request: Request, scope: string) => `${scope}:test`),
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

  it("POST /api/track rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/track/route");

    const request = new Request("http://localhost/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
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

describe("Admin access handoff route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPER_ADMIN_EMAILS = "test@example.com";
  });

  it("POST /api/admin/invites rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/admin/invites/route");

    const request = new Request("http://localhost/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("POST /api/admin/invites rejects invalid email or tenant fields before provider work", async () => {
    const { POST } = await import("@/app/api/admin/invites/route");

    const request = new Request("http://localhost/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", tenant: "  " }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Missing email or tenant");
  });

  it("POST /api/admin/tenants/assign rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/admin/tenants/assign/route");

    const request = new Request("http://localhost/api/admin/tenants/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("POST /api/admin/tenants rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/admin/tenants/route");

    const request = new Request("http://localhost/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("PATCH /api/admin/tenants rejects malformed JSON with a client error", async () => {
    const { PATCH } = await import("@/app/api/admin/tenants/route");

    const request = new Request("http://localhost/api/admin/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("POST /api/admin/tenants trims launch-critical tenant setup fields", async () => {
    const { POST } = await import("@/app/api/admin/tenants/route");
    mockCreateTenant.mockResolvedValue({ id: "gldf", siteName: "Great Lakes Dried Fruit" });

    const request = new Request("http://localhost/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteName: " Great Lakes Dried Fruit ",
        ownerName: " Owner Name ",
        ownerEmail: " owner@example.com ",
        industry: " food-brand ",
        template: " food-brand ",
        subdomain: " gldf ",
        features: ["commerce", 1, "newsletter"],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockCreateTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        siteName: "Great Lakes Dried Fruit",
        ownerName: "Owner Name",
        ownerEmail: "owner@example.com",
        industry: "food-brand",
        template: "food-brand",
        subdomain: "gldf",
        features: ["commerce", "newsletter"],
      }),
    );
  });
});

describe("Public Content API Route Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/public/content/:tenant/:section returns tenant content without Clerk auth", async () => {
    const { GET } = await import("@/app/api/public/content/[tenant]/[section]/route");

    const response = await GET(new Request("http://localhost/api/public/content/test-tenant/hero"), {
      params: Promise.resolve({ tenant: "test-tenant", section: "hero" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ headline: "Fresh content" });
  });

  it("GET /api/public/page-config/:tenant returns tenant page config without Clerk auth", async () => {
    const { GET } = await import("@/app/api/public/page-config/[tenant]/route");

    const response = await GET(new Request("http://localhost/api/public/page-config/test-tenant"), {
      params: Promise.resolve({ tenant: "test-tenant" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ home: { sections: [] } });
  });

  it("GET /api/public/content/:tenant/:section rejects invalid tenant slugs", async () => {
    const { GET } = await import("@/app/api/public/content/[tenant]/[section]/route");

    const response = await GET(new Request("http://localhost/api/public/content/../hero"), {
      params: Promise.resolve({ tenant: "../", section: "hero" }),
    });

    expect(response.status).toBe(400);
  });
});

describe("Tenant content write route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === "x-tenant") return "test-tenant";
      return null;
    });
  });

  it("PUT /api/content/:section rejects malformed JSON with a client error", async () => {
    const { PUT } = await import("@/app/api/content/[section]/route");

    const request = new Request("http://localhost/api/content/hero", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await PUT(request, {
      params: Promise.resolve({ section: "hero" }),
    });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("PUT /api/page-config rejects malformed JSON with a client error", async () => {
    const { PUT } = await import("@/app/api/page-config/route");

    const request = new Request("http://localhost/api/page-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("POST /api/content/:section/versions rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/content/[section]/versions/route");

    const request = new Request("http://localhost/api/content/hero/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request, {
      params: Promise.resolve({ section: "hero" }),
    });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });
});

describe("Dashboard action route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateThread.mockResolvedValue({
      id: "thread_123",
      title: "New chat",
      messages: [],
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });
    mockUpdateThread.mockResolvedValue({
      id: "thread_123",
      title: "Updated",
      messages: [],
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });
  });

  it("PATCH /api/queue/:id rejects malformed JSON with a client error", async () => {
    const { PATCH } = await import("@/app/api/queue/[id]/route");

    const request = new Request("http://localhost/api/queue/event_123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "event_123" }),
    });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("PATCH /api/events/:id rejects malformed JSON with a client error", async () => {
    const { PATCH } = await import("@/app/api/events/[id]/route");

    const request = new Request("http://localhost/api/events/event_123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "event_123" }),
    });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("PATCH /api/inbox rejects malformed JSON with a client error", async () => {
    const { PATCH } = await import("@/app/api/inbox/route");

    const request = new Request("http://localhost/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("POST /api/threads accepts an empty body for a new thread", async () => {
    const { POST } = await import("@/app/api/threads/route");

    const request = new Request("http://localhost/api/threads", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockCreateThread).toHaveBeenCalledWith("test-tenant", undefined);
  });

  it("POST /api/threads rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/threads/route");

    const request = new Request("http://localhost/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockCreateThread).not.toHaveBeenCalled();
  });

  it("PATCH /api/threads/:threadId rejects malformed JSON with a client error", async () => {
    const { PATCH } = await import("@/app/api/threads/[threadId]/route");

    const request = new Request("http://localhost/api/threads/thread_123", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ threadId: "thread_123" }),
    });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockUpdateThread).not.toHaveBeenCalled();
  });

  it("POST /api/chat rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/chat/route");

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockSaveChatMessages).not.toHaveBeenCalled();
  });

  it("POST /api/chat rejects non-array JSON before storage", async () => {
    const { POST } = await import("@/app/api/chat/route");

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockSaveChatMessages).not.toHaveBeenCalled();
  });

  it("POST /api/suggestions rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/suggestions/route");

    const request = new Request("http://localhost/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockUpdateSuggestion).not.toHaveBeenCalled();
  });

  it("POST /api/newsletter/send rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/newsletter/send/route");

    const request = new Request("http://localhost/api/newsletter/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });
});

describe("Admin and settings write route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPER_ADMIN_EMAILS = "test@example.com";
  });

  it("PUT /api/tenant-settings rejects malformed JSON with a client error", async () => {
    const { PUT } = await import("@/app/api/tenant-settings/route");

    const request = new Request("http://localhost/api/tenant-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it("POST /api/admin/drafts rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/admin/drafts/route");

    const request = new Request("http://localhost/api/admin/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("POST /api/rewards/members/:email/adjust rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/rewards/members/[email]/adjust/route");

    const request = new Request("http://localhost/api/rewards/members/test%40example.com/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request, {
      params: Promise.resolve({ email: "test%40example.com" }),
    });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockGetRewardMember).not.toHaveBeenCalled();
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

  it("POST /api/newsletter/subscribe rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/newsletter/subscribe/route");

    const request = new Request("http://localhost/api/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
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

  it("POST /api/booking rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/booking/route");

    const request = new Request("http://localhost/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("PUT /api/booking/:id rejects malformed JSON with a client error", async () => {
    const { PUT } = await import("@/app/api/booking/[id]/route");

    const request = new Request("http://localhost/api/booking/b_123", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await PUT(request, {
      params: Promise.resolve({ id: "b_123" }),
    });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("PUT /api/booking/config rejects malformed JSON with a client error", async () => {
    const { PUT } = await import("@/app/api/booking/config/route");

    const request = new Request("http://localhost/api/booking/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });
});

describe("Tenant Settings Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === "x-tenant") return "test-tenant";
      return null;
    });
    mockUpdateTenant.mockResolvedValue({ id: "test-tenant", autoPublish: true });
  });

  it("GET /api/tenant-settings returns the tenant auto-publish setting", async () => {
    const { GET } = await import("@/app/api/tenant-settings/route");

    const response = await GET();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.autoPublish).toBe(false);
  });

  it("PUT /api/tenant-settings persists auto-publish changes", async () => {
    const { PUT } = await import("@/app/api/tenant-settings/route");

    const request = new Request("http://localhost/api/tenant-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoPublish: true }),
    });

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(mockUpdateTenant).toHaveBeenCalledWith("test-tenant", { autoPublish: true });
  });
});

describe("Billing route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPER_ADMIN_EMAILS = "test@example.com";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_SCAFFOLD_PRICE_ID = "price_test_123";
  });

  it("POST /api/billing/create-subscription rejects malformed JSON with a client error", async () => {
    const { POST } = await import("@/app/api/billing/create-subscription/route");

    const request = new Request("http://localhost/api/billing/create-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });
});

describe("Ownership export and offboarding route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("GET /api/tenant-export/content returns an attachment JSON export", async () => {
    const { GET } = await import("@/app/api/tenant-export/content/route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("test-tenant-content-export.json");
    const data = await response.json();
    expect(data.tenant).toBe("test-tenant");
    expect(data.content.hero).toEqual({ headline: "Fresh content" });
    expect(data.pageConfig).toEqual({ home: { sections: [] } });
  });

  it("POST /api/offboarding/request records a handoff request without destructive changes", async () => {
    const { POST } = await import("@/app/api/offboarding/request/route");

    const request = new Request("http://localhost/api/offboarding/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Need to move DNS next Friday" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Offboarding handoff requested from Ownership Center",
        type: "handoff",
        section: "ownership-center",
      }),
      "test-tenant",
    );
    const data = await response.json();
    expect(data.nextSteps).toContain("Export content JSON and asset manifest.");
  });
});

describe("Tenant Domains Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeadersGet.mockImplementation((key: string) => {
      if (key === "x-tenant") return "test-tenant";
      return null;
    });
    mockAddCustomDomain.mockResolvedValue({
      ok: true,
      tenant: { id: "test-tenant" },
      claim: { domain: "new.example.com" },
    });
    mockRemoveCustomDomain.mockResolvedValue({
      ok: true,
      tenant: { id: "test-tenant", customDomains: [] },
    });
    mockRefreshDomainClaim.mockResolvedValue({
      ok: true,
      tenant: { id: "test-tenant" },
      claim: { domain: "example.com" },
    });
    mockListTenantDomainClaims.mockResolvedValue([
      {
        domain: "example.com",
        tenantId: "test-tenant",
        role: "additional",
        status: "verified",
        dnsStatus: "configured",
        sslStatus: "issued",
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T00:00:00.000Z",
      },
    ]);
  });

  it("GET /api/tenant/domains returns domains for the tenant header", async () => {
    const { GET } = await import("@/app/api/tenant/domains/route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      domains: [
        {
          domain: "example.com",
          status: "verified",
          dnsStatus: "configured",
          sslStatus: "issued",
          role: "additional",
          isApex: true,
          verification: [],
          error: undefined,
          updatedAt: "2026-05-07T00:00:00.000Z",
        },
      ],
    });
  });

  it("POST /api/tenant/domains mutates only the tenant from x-tenant", async () => {
    const { POST } = await import("@/app/api/tenant/domains/route");

    const request = new Request("http://localhost/api/tenant/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "new.example.com", tenant: "other-tenant" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockAddCustomDomain).toHaveBeenCalledWith("test-tenant", "new.example.com", undefined);
  });

  it("POST /api/tenant/domains rejects missing tenant headers before mutation", async () => {
    const { POST } = await import("@/app/api/tenant/domains/route");
    mockHeadersGet.mockReturnValue(null);

    const request = new Request("http://localhost/api/tenant/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "new.example.com" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mockAddCustomDomain).not.toHaveBeenCalled();
  });

  it("keeps /api/admin/domains as a backward-compatible alias", async () => {
    const adminRoute = await import("@/app/api/admin/domains/route");
    const tenantRoute = await import("@/app/api/tenant/domains/route");

    expect(adminRoute.GET).toBe(tenantRoute.GET);
    expect(adminRoute.POST).toBe(tenantRoute.POST);
    expect(adminRoute.PATCH).toBe(tenantRoute.PATCH);
    expect(adminRoute.DELETE).toBe(tenantRoute.DELETE);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsSuperAdmin = vi.hoisted(() => vi.fn());

// The operator agent only needs the auth gate exercised; its read/propose tools
// and model are never reached on the 403/400 paths. Stub the heavy deps so the
// module imports cleanly in the test environment.
vi.mock("@/lib/auth", () => ({ isSuperAdmin: mockIsSuperAdmin }));
vi.mock("@/lib/ai-models", () => ({ getPrimaryModel: () => ({ model: {}, label: "test" }) }));
vi.mock("@/lib/portfolio", () => ({
  buildPortfolioSnapshot: vi.fn(),
  getPortfolioSummary: vi.fn(),
}));
vi.mock("@/lib/ops", () => ({ buildOpsReport: vi.fn() }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: vi.fn(), getTenantConfig: vi.fn() }));
vi.mock("@/lib/storage", () => ({ listDrafts: vi.fn(), getAllAuditEvents: vi.fn() }));
vi.mock("@/lib/pay-links", () => ({ listPayLinks: vi.fn() }));

function req(body: unknown) {
  return new Request("http://localhost/api/admin/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSuperAdmin.mockResolvedValue(true);
});

describe("POST /api/admin/agent (operator agent)", () => {
  it("403s a non-super-admin", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const { POST } = await import("@/app/api/admin/agent/route");
    const res = await POST(req({ messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(403);
  });

  it("400s on a malformed messages payload", async () => {
    const { POST } = await import("@/app/api/admin/agent/route");
    const res = await POST(req({ messages: "not-an-array" }));
    expect(res.status).toBe(400);
  });

  it("400s when messages is missing", async () => {
    const { POST } = await import("@/app/api/admin/agent/route");
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The /api/approve route must: verify the HMAC token, map approve→"approved" /
// not-yet→"dismissed" onto resolveEventAction, reject tampered/expired links, and
// be idempotent (already-resolved → friendly page, not an error).

const mockResolveEventAction = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());

vi.mock("@/lib/event-actions", () => ({ resolveEventAction: mockResolveEventAction }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mockGetTenantConfig }));
vi.mock("@/lib/tenant-urls", () => ({
  getTenantDashboardUrl: (t: { id: string }, path: string) => `https://admin.${t.id}.strelva.com${path}`,
}));

const claims = { eventId: "evt_1", tenantId: "gldf", action: "approve" as const };

async function req(token: string | null) {
  const url = token ? `https://admin.gldf.strelva.com/api/approve?token=${encodeURIComponent(token)}` : "https://admin.gldf.strelva.com/api/approve";
  const { GET } = await import("@/app/api/approve/route");
  return GET(new Request(url));
}

describe("GET /api/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APPROVE_LINK_SECRET = "test-approve-secret";
    mockGetTenantConfig.mockResolvedValue({ id: "gldf", siteName: "GLDF" });
    mockResolveEventAction.mockResolvedValue({ changed: true });
  });
  afterEach(() => vi.resetModules());

  it("approves: verifies token and calls resolveEventAction with 'approved'", async () => {
    const { signApproveToken } = await import("@/lib/approve-link");
    const res = await req(signApproveToken(claims));
    expect(res.status).toBe(200);
    expect(mockResolveEventAction).toHaveBeenCalledWith("gldf", "evt_1", "approved");
    expect(await res.text()).toContain("Approved");
  });

  it("not-yet maps to 'dismissed'", async () => {
    const { signApproveToken } = await import("@/lib/approve-link");
    const res = await req(signApproveToken({ ...claims, action: "not-yet" }));
    expect(res.status).toBe(200);
    expect(mockResolveEventAction).toHaveBeenCalledWith("gldf", "evt_1", "dismissed");
    expect(await res.text()).toContain("Skipped");
  });

  it("rejects a tampered token without resolving anything", async () => {
    const { signApproveToken } = await import("@/lib/approve-link");
    const token = signApproveToken(claims);
    const [payload] = token.split(".");
    const res = await req(`${payload}.forged`);
    expect(res.status).toBe(400);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    expect(await res.text()).toContain("invalid or expired");
  });

  it("rejects an expired token", async () => {
    const { signApproveToken } = await import("@/lib/approve-link");
    const past = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const res = await req(signApproveToken(claims, past));
    expect(res.status).toBe(400);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("rejects a missing token", async () => {
    const res = await req(null);
    expect(res.status).toBe(400);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("is idempotent: already-resolved renders a friendly page (200), not an error", async () => {
    mockResolveEventAction.mockResolvedValue({ changed: false, reason: "already_resolved" });
    const { signApproveToken } = await import("@/lib/approve-link");
    const res = await req(signApproveToken(claims));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Already handled");
  });

  it("treats a not_found event as already handled (200)", async () => {
    mockResolveEventAction.mockResolvedValue({ changed: false, reason: "not_found" });
    const { signApproveToken } = await import("@/lib/approve-link");
    const res = await req(signApproveToken(claims));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Already handled");
  });

  it("scopes to tenant: a wrong-tenant resolution is refused (403)", async () => {
    mockResolveEventAction.mockResolvedValue({ changed: false, reason: "wrong_tenant" });
    const { signApproveToken } = await import("@/lib/approve-link");
    const res = await req(signApproveToken(claims));
    expect(res.status).toBe(403);
  });
});

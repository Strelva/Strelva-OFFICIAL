import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockGetActorContext = vi.hoisted(() => vi.fn(() => Promise.resolve({ email: "a@b.com" })));
const mockLogAuditEvent = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockAddCustomDomain = vi.hoisted(() => vi.fn());
const mockListClaims = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
const mockRefresh = vi.hoisted(() => vi.fn());
const mockRemove = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  isSuperAdmin: mockIsSuperAdmin,
  getActorContext: mockGetActorContext,
}));
vi.mock("@/lib/storage", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mockGetTenantConfig }));
vi.mock("@/lib/domains", () => ({
  addCustomDomain: mockAddCustomDomain,
  listTenantDomainClaims: mockListClaims,
  refreshDomainClaim: mockRefresh,
  removeCustomDomain: mockRemove,
  serializeDomainClaim: (c: unknown) => c,
}));

import { GET, POST, DELETE } from "@/app/api/admin/tenants/[id]/domains/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantConfig.mockResolvedValue({ id: "gldf" });
  mockListClaims.mockResolvedValue([]);
});

describe("admin domains route — auth gate", () => {
  it("GET returns 403 for a non-super-admin", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const res = await GET(new Request("http://x/"), params("gldf"));
    expect(res.status).toBe(403);
  });

  it("POST returns 403 for a non-super-admin and never mutates", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const res = await POST(
      new Request("http://x/", { method: "POST", body: JSON.stringify({ domain: "a.com" }) }),
      params("gldf")
    );
    expect(res.status).toBe(403);
    expect(mockAddCustomDomain).not.toHaveBeenCalled();
  });

  it("returns 404 when the tenant does not exist", async () => {
    mockIsSuperAdmin.mockResolvedValue(true);
    mockGetTenantConfig.mockResolvedValue(null);
    const res = await GET(new Request("http://x/"), params("ghost"));
    expect(res.status).toBe(404);
  });
});

describe("admin domains route — mutations (super-admin)", () => {
  beforeEach(() => mockIsSuperAdmin.mockResolvedValue(true));

  it("POST adds a domain with role and audit-logs it", async () => {
    mockAddCustomDomain.mockResolvedValue({ ok: true });
    const res = await POST(
      new Request("http://x/", { method: "POST", body: JSON.stringify({ domain: "new.com", role: "production" }) }),
      params("gldf")
    );
    expect(res.status).toBe(200);
    expect(mockAddCustomDomain).toHaveBeenCalledWith("gldf", "new.com", "production");
    expect(mockLogAuditEvent).toHaveBeenCalled();
  });

  it("POST returns 400 when domain is missing", async () => {
    const res = await POST(
      new Request("http://x/", { method: "POST", body: JSON.stringify({}) }),
      params("gldf")
    );
    expect(res.status).toBe(400);
  });

  it("POST surfaces the lib error status and does not audit-log a failure", async () => {
    mockAddCustomDomain.mockResolvedValue({ ok: false, status: 409, error: "exists" });
    const res = await POST(
      new Request("http://x/", { method: "POST", body: JSON.stringify({ domain: "dup.com" }) }),
      params("gldf")
    );
    expect(res.status).toBe(409);
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it("DELETE removes the domain from the query param and audit-logs it", async () => {
    mockRemove.mockResolvedValue({ ok: true });
    const res = await DELETE(
      new Request("http://x/?domain=gone.com", { method: "DELETE" }),
      params("gldf")
    );
    expect(res.status).toBe(200);
    expect(mockRemove).toHaveBeenCalledWith("gldf", "gone.com");
    expect(mockLogAuditEvent).toHaveBeenCalled();
  });
});

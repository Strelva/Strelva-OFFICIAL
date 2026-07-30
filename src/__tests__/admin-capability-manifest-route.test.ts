import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockUpdateTenant = vi.hoisted(() => vi.fn());
const mockGetActorContext = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  isSuperAdmin: mockIsSuperAdmin,
  getActorContext: mockGetActorContext,
}));
vi.mock("@/lib/tenants", () => ({
  getTenantConfig: mockGetTenantConfig,
  updateTenant: mockUpdateTenant,
}));
vi.mock("@/lib/storage", () => ({ logAuditEvent: mockLogAuditEvent }));
// safe-fetch is used as-is (real https/private-host guard).

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(body: unknown) {
  return new Request("http://x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const TENANT = {
  id: "rohlax",
  siteName: "Rohlax",
  customRepo: { repoUrl: "https://github.com/Strelva/rohlax", contractVersion: "v1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSuperAdmin.mockResolvedValue(true);
  mockGetTenantConfig.mockResolvedValue({ ...TENANT });
  mockGetActorContext.mockResolvedValue({ email: "op@strelva.com", isSuperAdmin: true });
  mockLogAuditEvent.mockResolvedValue(undefined);
  mockUpdateTenant.mockImplementation(async (_id: string, updates: Record<string, unknown>) => ({
    ...TENANT,
    ...updates,
  }));
});

describe("POST /api/admin/tenants/[id]/capability-manifest", () => {
  it("403s a non-super-admin", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const { POST } = await import("@/app/api/admin/tenants/[id]/capability-manifest/route");
    const res = await POST(post({ capabilityManifestUrl: "https://x.com/cap" }), params("rohlax"));
    expect(res.status).toBe(403);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it("404s an unknown tenant", async () => {
    mockGetTenantConfig.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/tenants/[id]/capability-manifest/route");
    const res = await POST(post({ capabilityManifestUrl: "https://x.com/cap" }), params("nope"));
    expect(res.status).toBe(404);
  });

  it("sets the URL and MERGES it into the existing customRepo (repoUrl preserved)", async () => {
    const { POST } = await import("@/app/api/admin/tenants/[id]/capability-manifest/route");
    const res = await POST(
      post({ capabilityManifestUrl: "https://rohlax.com/api/capabilities" }),
      params("rohlax"),
    );
    expect(res.status).toBe(200);
    expect(mockUpdateTenant).toHaveBeenCalledWith("rohlax", {
      customRepo: {
        repoUrl: "https://github.com/Strelva/rohlax",
        contractVersion: "v1",
        capabilityManifestUrl: "https://rohlax.com/api/capabilities",
      },
    });
  });

  it("clears the URL on an empty string (undefined, not empty string)", async () => {
    const { POST } = await import("@/app/api/admin/tenants/[id]/capability-manifest/route");
    await POST(post({ capabilityManifestUrl: "" }), params("rohlax"));
    const [, updates] = mockUpdateTenant.mock.calls[0]!;
    expect((updates.customRepo as Record<string, unknown>).capabilityManifestUrl).toBeUndefined();
  });

  it("rejects a non-https / SSRF-unsafe URL", async () => {
    const { POST } = await import("@/app/api/admin/tenants/[id]/capability-manifest/route");
    const res = await POST(post({ capabilityManifestUrl: "ftp://evil/cap" }), params("rohlax"));
    expect(res.status).toBe(400);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it("400s a non-string, non-null value", async () => {
    const { POST } = await import("@/app/api/admin/tenants/[id]/capability-manifest/route");
    const res = await POST(post({ capabilityManifestUrl: 42 }), params("rohlax"));
    expect(res.status).toBe(400);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });
});

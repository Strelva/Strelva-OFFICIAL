import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockGetActorContext = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());
const mockProvisionTenant = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  isSuperAdmin: mockIsSuperAdmin,
  getActorContext: mockGetActorContext,
}));
vi.mock("@/lib/storage", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/provisioning", () => ({ provisionTenant: mockProvisionTenant }));

import { POST } from "@/app/api/admin/provision/route";

function req(body: unknown) {
  return new Request("http://localhost/api/admin/provision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  subdomain: "Acme-HVAC",
  siteName: "Acme HVAC",
  ownerName: "Jane",
  industry: "trades",
  ownerEmail: "jane@acme.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSuperAdmin.mockResolvedValue(true);
  mockGetActorContext.mockResolvedValue({
    userId: "u1",
    email: "jacob@strelva.com",
    type: "super_admin",
    isSuperAdmin: true,
    isImpersonating: false,
  });
  mockLogAuditEvent.mockResolvedValue(undefined);
  mockProvisionTenant.mockResolvedValue({
    tenantId: "acme-hvac",
    siteUrl: "https://acmehvac.com",
    steps: [{ key: "tenant", label: "Create tenant record", status: "ok" }],
    manualNext: ["..."],
  });
});

describe("POST /api/admin/provision", () => {
  it("403s a non-super-admin", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const res = await POST(req(valid));
    expect(res.status).toBe(403);
    expect(mockProvisionTenant).not.toHaveBeenCalled();
  });

  it("400s on missing required fields", async () => {
    const res = await POST(req({ subdomain: "acme" }));
    expect(res.status).toBe(400);
    expect(mockProvisionTenant).not.toHaveBeenCalled();
  });

  it("400s on an invalid subdomain", async () => {
    const res = await POST(req({ ...valid, subdomain: "bad subdomain!" }));
    expect(res.status).toBe(400);
    expect(mockProvisionTenant).not.toHaveBeenCalled();
  });

  it("lowercases the subdomain and provisions + audits on success", async () => {
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    const arg = mockProvisionTenant.mock.calls[0]![0];
    expect(arg.subdomain).toBe("acme-hvac");
    expect(arg.ownerEmail).toBe("jane@acme.com");
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.tenantId).toBe("acme-hvac");
  });
});

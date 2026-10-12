import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as scan } from "@/app/api/admin/scan/all/route";
import { POST as domains } from "@/app/api/admin/domain-monitor/scan/route";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), actor: vi.fn(), scan: vi.fn(), domains: vi.fn(), save: vi.fn(), audit: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: mocks.admin, getActorContext: mocks.actor }));
vi.mock("@/lib/scan", () => ({ scanAllTenants: mocks.scan }));
vi.mock("@/lib/domain-monitor", () => ({ scanPortfolioDomains: mocks.domains }));
vi.mock("@/lib/domain-monitor-store", () => ({ saveDomainHealth: mocks.save }));
vi.mock("@/lib/storage", () => ({ logAuditEvent: mocks.audit }));

const actor = { userId: "10000000-0000-4000-8000-000000000001", email: "operator@example.test", type: "super_admin", isSuperAdmin: true };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue(true);
  mocks.actor.mockResolvedValue(actor);
  mocks.scan.mockResolvedValue({ scanned: [{ tenant: "alpha", grade: "A", score: 90 }], failed: [{ tenant: "beta", error: "private failure detail" }], deferred: 0 });
  mocks.domains.mockResolvedValue([{ tenantId: "alpha", worst: "healthy" }, { tenantId: "beta", worst: "unknown" }]);
  mocks.audit.mockImplementation(async ({ tenant }) => {
    if (!["alpha", "beta"].includes(tenant)) throw new Error("audit_logs_tenant_id_fkey");
  });
});

describe("portfolio scan audit scope", () => {
  it("records real successful and failed tenant scopes rather than a fictitious wildcard", async () => {
    const response = await scan();
    expect(response.status).toBe(200);
    expect(mocks.audit.mock.calls.map(([entry]) => entry.tenant)).toEqual(["alpha", "beta"]);
    expect(mocks.audit.mock.calls.map(([entry]) => entry.actor)).toEqual([actor, actor]);
    expect(mocks.audit.mock.calls[1]?.[0]).toMatchObject({ action: "scan.run_all", metadata: { outcome: "failed" } });
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("private failure detail");
  });

  it("attributes domain checks to real tenants without storing report PII", async () => {
    const response = await domains();
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.audit.mock.calls.map(([entry]) => entry.tenant)).toEqual(["alpha", "beta"]);
    expect(mocks.audit.mock.calls[0]?.[0]).toMatchObject({ action: "domain_monitor.scan", actor, metadata: { health: "healthy" } });
  });

  it.each([scan, domains])("denies nonoperators before scanning or auditing", async handler => {
    mocks.admin.mockResolvedValue(false);
    expect((await handler()).status).toBe(403);
    expect(mocks.scan).not.toHaveBeenCalled();
    expect(mocks.domains).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([scan, domains])("does not claim an audited success when persistence fails", async handler => {
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    await expect(handler()).rejects.toThrow("audit unavailable");
  });

  it("returns an empty portfolio without inventing a tenant to audit", async () => {
    mocks.scan.mockResolvedValue({ scanned: [], failed: [], deferred: 0 });
    mocks.domains.mockResolvedValue([]);
    expect((await scan()).status).toBe(200);
    expect((await domains()).status).toBe(200);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

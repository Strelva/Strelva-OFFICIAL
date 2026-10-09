import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ operator: true, exists: true }));
const cleanup = vi.hoisted(() => ({ id: "27410000-0000-4000-8000-000000000010", complete: false, databaseDeleted: true }));
const mocks = vi.hoisted(() => ({ run: vi.fn(), read: vi.fn(), audit: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: () => state.operator, getActorContext: vi.fn(async () => ({ kind: "operator" })) }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: async () => state.exists ? { id: "fictional-cleanup" } : null, updateTenant: vi.fn() }));
vi.mock("@/lib/storage", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/lib/deprovision", () => ({ runDeprovision: mocks.run, readDeprovisionCleanup: mocks.read, isValidDeprovisionTenantId: (id: string) => id === "fictional-cleanup" }));
import { GET, POST } from "@/app/api/admin/tenants/[id]/deprovision/route";
const params = { params: Promise.resolve({ id: "fictional-cleanup" }) };
const request = (data: unknown) => new Request("http://localhost/api/admin/tenants/fictional-cleanup/deprovision", { method: "POST", body: JSON.stringify(data) });
beforeEach(() => {
  vi.resetAllMocks(); state.operator = true; state.exists = true;
  mocks.read.mockResolvedValue(cleanup); mocks.audit.mockResolvedValue(undefined);
  mocks.run.mockResolvedValue({ ok: false, tenantId: "fictional-cleanup", executed: true, databaseDeleted: true, pgRowTotal: 1, summary: { postgres: [], redis: [], vercel: [] }, cleanup });
});
describe("operator cleanup recovery after the tenant row disappears", () => {
  it("reports committed database removal plus pending cleanup as 202, never a successful purge", async () => {
    const response = await POST(request({ confirmSlug: "fictional-cleanup" }), params);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: false, databaseDeleted: true, cleanup });
  });
  it("recovers the receipt without requiring a tenant config or exposing it to an ordinary user", async () => {
    state.exists = false;
    expect(await (await GET(request({}), params)).json()).toMatchObject({ cleanup });
    state.operator = false;
    expect((await GET(request({}), params)).status).toBe(403);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("the missing-tenant retry requires the slug confirmation and exact receipt id", async () => {
    state.exists = false;
    expect((await POST(request({ action: "retry-cleanup", cleanupReceiptId: cleanup.id, confirmSlug: "wrong" }), params)).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
    expect((await POST(request({ action: "retry-cleanup", cleanupReceiptId: cleanup.id, confirmSlug: "fictional-cleanup" }), params)).status).toBe(202);
    expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ tenant: null, cleanupReceiptId: cleanup.id, dryRun: false }));
  });
  it("failure to recover a receipt is unavailable, never empty cleanup proof", async () => {
    mocks.read.mockRejectedValueOnce(new Error("store unavailable"));
    expect((await GET(request({}), params)).status).toBe(503);
  });
});

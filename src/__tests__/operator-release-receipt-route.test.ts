import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ operator: vi.fn(), config: vi.fn(), apply: vi.fn(), read: vi.fn(), audit: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ getAuthenticatedOperatorContext: m.operator, isSuperAdmin: async () => true, getCurrentUserEmail: async () => "operator@example.test" }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: async () => undefined }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: m.config }));
vi.mock("@/lib/connections", () => ({ getConnections: async () => [] }));
vi.mock("@/lib/products", () => ({ getProducts: async () => [] }));
vi.mock("@/lib/storage", () => ({ logAuditEvent: m.audit }));
vi.mock("@/platform/owner-entry/operator", () => ({ applyTenantReleaseCommand: m.apply, readTenantReleaseState: m.read }));
import { GET, POST } from "@/app/api/admin/tenants/[id]/release-flags/route";
import { ReleaseFlagConflictError } from "@/platform/release-flags/store";
const actor = { userId: "25600000-0000-4000-8000-000000000003", verifiedEmail: "operator@example.test" };
const workspaceId = "25600000-0000-4000-8000-000000000010";
const body = { kind: "flag", flag: "systems", state: "off", expectedRevision: 2, reason: "Pause for review" };
const params = { params: Promise.resolve({ id: "fixture" }) };
const request = (command: unknown = body) => new Request("http://localhost/api/admin/tenants/fixture/release-flags", { method: "POST", body: JSON.stringify(command) });
beforeEach(() => {
  vi.resetAllMocks();
  m.operator.mockResolvedValue({ actor, email: actor.verifiedEmail });
  m.config.mockResolvedValue({ id: "fixture" });
  m.apply.mockResolvedValue({ workspaceId, flags: {}, testerEmails: [] });
  m.read.mockResolvedValue({ linked: true, workspaceId, flags: [], history: [] });
  m.audit.mockResolvedValue(undefined);
});
describe("operator release mutation receipt", () => {
  it.each([body, { kind: "tester", email: "tester@example.test", present: true, reason: "Bounded review" }])("keeps acceptance independent of failed readback for %j", async command => {
    m.read.mockRejectedValue(new Error("private read details"));
    const response = await POST(request(command), params);
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(result.mutation).toEqual({ status: "accepted", workspaceId, command });
    expect(result.readback.status).toBe("unavailable");
    expect(result.notice).toContain("change was accepted");
    expect(JSON.stringify(result)).not.toMatch(/Nothing was changed|private read details/);
    expect(m.apply).toHaveBeenCalledTimes(1);
  });
  it("returns the accepted receipt even when best-effort audit storage fails", async () => {
    m.audit.mockRejectedValue(new Error("offline"));
    const result = await (await POST(request(), params)).json();
    expect(result.mutation.status).toBe("accepted");
    expect(result.readback.status).toBe("available");
    expect(result.linked).toBe(true);
  });
  it("does not invent a receipt when the mutation conflicts", async () => {
    m.apply.mockRejectedValue(new ReleaseFlagConflictError("Release revision changed"));
    const response = await POST(request(), params);
    expect(response.status).toBe(409);
    expect(await response.json()).not.toHaveProperty("mutation");
    expect(m.read).not.toHaveBeenCalled();
  });
  it("requires an operator and valid reason before mutation", async () => {
    m.operator.mockResolvedValue(null);
    expect((await POST(request(), params)).status).toBe(403);
    m.operator.mockResolvedValue({ actor, email: actor.verifiedEmail });
    expect((await POST(request({ ...body, reason: "" }), params)).status).toBe(400);
    expect(m.apply).not.toHaveBeenCalled();
  });
  it("does not claim a failed GET changed nothing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      m.read.mockRejectedValue(new Error("offline"));
      const response = await GET(request(), params);
      expect(response.status).toBe(503);
      expect((await response.json()).error).not.toContain("Nothing was changed");
      expect(m.apply).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});

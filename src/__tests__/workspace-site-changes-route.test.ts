import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(), rpc: vi.fn(), execute: vi.fn(), snapshot: vi.fn(), released: vi.fn(), workspaceRelease: vi.fn(),
}));

vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: async () => false }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: (...args: unknown[]) => mocks.rpc(...args) }) }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: async (id: string) => ({ id, deliveryModel: "custom_repo" }) }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => mocks.workspaceRelease() }));
vi.mock("@/platform/systems-release", () => ({ systemsReleaseEnabledForWorkspace: (...args: unknown[]) => mocks.released(...args) }));
vi.mock("@/platform/systems/from-existing", () => ({ readExistingSystemsSnapshot: (...args: unknown[]) => mocks.snapshot(...args) }));
vi.mock("@/platform/service-requests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/service-requests")>();
  return { ...actual, PostgresServiceRequestStore: {}, ServiceRequestService: class { execute(...args: unknown[]) { return mocks.execute(...args); } } };
});
vi.mock("@/platform/workspaces/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/workspaces/http")>();
  return { ...actual, workspaceHttpActor: () => mocks.actor() };
});

import { GET, POST } from "@/app/api/workspace/site-changes/route";
import { ServiceRequestAccessError } from "@/platform/service-requests";
import { systemOriginId } from "@/platform/systems/invariants";

const WS = "11111111-1111-4111-8111-111111111111";
const MCLEARS = "aaaaaaaa-0000-4000-8000-000000000002";
const SYSTEM = systemOriginId(WS, { kind: "tenant", ref: MCLEARS });
const REQUEST = "c7a1e0b2-0000-4000-8000-000000000001";
const actor = { userId: "cccccccc-0000-4000-8000-000000000001", verifiedEmail: "owner@mclears.example" };
const post = (body: unknown, origin = "http://localhost") => POST(new Request("http://localhost/api/workspace/site-changes", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }));
const ask = (patch: Record<string, unknown> = {}) => ({ action: "ask", workspaceId: WS, systemId: SYSTEM, request: "Add a private events page", idempotencyKey: "site-change:1", ...patch });

describe("/api/workspace/site-changes", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.workspaceRelease.mockReturnValue(true);
    mocks.released.mockResolvedValue(true);
    mocks.actor.mockResolvedValue(actor);
    mocks.snapshot.mockResolvedValue({ managedWebsites: [{ link: "tenant_link", tenantStableId: MCLEARS, tenantId: "mclears", siteName: "McClear's", tenantActive: true, linkedAt: "2026-10-01T00:00:00Z" }] });
    mocks.rpc.mockResolvedValue({ data: [], error: null });
  });

  it("is closed with the workspace release off, and with Systems off for the workspace", async () => {
    mocks.workspaceRelease.mockReturnValue(false);
    expect((await GET(new Request(`http://localhost/api/workspace/site-changes?workspaceId=${WS}&systemId=${SYSTEM}`))).status).toBe(404);
    expect(mocks.actor).not.toHaveBeenCalled();
    mocks.workspaceRelease.mockReturnValue(true);
    mocks.released.mockResolvedValue(false);
    expect((await post(ask())).status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("needs a confirmed account and a same-site JSON request", async () => {
    mocks.actor.mockResolvedValue(null);
    expect((await post(ask())).status).toBe(401);
    expect((await post(ask(), "https://evil.example")).status).toBe(403);
  });

  it("files Ask for a change as a Request to Strelva on this business's own site", async () => {
    mocks.execute.mockResolvedValue({ id: REQUEST });
    const response = await post(ask({ page: "Home" }));
    expect(response.status).toBe(201);
    expect(mocks.execute).toHaveBeenCalledWith(actor, expect.objectContaining({
      action: "save", businessId: WS, status: "requested", provider: { kind: "strelva" }, scope: ["website.repo_change"],
      context: { source: "website_change", systemId: SYSTEM, tenantStableId: MCLEARS, implementation: "custom_repo", page: "Home" },
    }));
    expect(await response.json()).toMatchObject({ requestId: REQUEST, requests: [] });
  });

  it("refuses a System that isn't this business's site, and says who can ask", async () => {
    mocks.snapshot.mockResolvedValue({ managedWebsites: [] });
    expect((await post(ask())).status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
    mocks.snapshot.mockResolvedValue({ managedWebsites: [{ link: "tenant_link", tenantStableId: MCLEARS, tenantId: "mclears", siteName: "McClear's", tenantActive: true, linkedAt: "2026-10-01T00:00:00Z" }] });
    mocks.execute.mockRejectedValue(new ServiceRequestAccessError());
    const response = await post(ask());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("owner or admin");
  });

  it("rejects malformed asks before reading anything", async () => {
    expect((await post(ask({ request: "x" }))).status).toBe(400);
    expect((await post(ask({ systemId: "nope" }))).status).toBe(400);
    expect((await post({ ...ask(), extra: true })).status).toBe(400);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });

  it("records steps through the database's rules and maps its refusals", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id: "d0000000-0000-4000-8000-000000000001", kind: "approved", previewUrl: null, commitSha: null, deploymentUrl: null, readBack: null, note: null, recordedAt: "2026-10-06T00:00:00Z" }, error: null });
    const ok = await post({ action: "record", workspaceId: WS, requestId: REQUEST, step: { kind: "approved" } });
    expect(ok.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("record_website_change_receipt", expect.objectContaining({ p_workspace_id: WS, p_request_id: REQUEST, p_kind: "approved", p_details: {}, p_verified_email: actor.verifiedEmail }));
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "website_change_owner_required" } });
    expect((await post({ action: "record", workspaceId: WS, requestId: REQUEST, step: { kind: "approved" } })).status).toBe(403);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "website_change_out_of_order" } });
    expect((await post({ action: "record", workspaceId: WS, requestId: REQUEST, step: { kind: "deployed", commitSha: "abc1234", deploymentUrl: "https://x.vercel.app", readBack: "confirmed" } })).status).toBe(409);
    expect((await post({ action: "record", workspaceId: WS, requestId: REQUEST, step: { kind: "preview", previewUrl: "javascript:alert(1)" } })).status).toBe(400);
  });

  it("lists a System's Requests for any member, and reports a store failure as unavailable", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ id: REQUEST, request: "Add a page", status: "requested", accepted: "pending", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", receipts: [] }], error: null });
    const response = await GET(new Request(`http://localhost/api/workspace/site-changes?workspaceId=${WS}&systemId=${SYSTEM}`));
    expect(response.status).toBe(200);
    expect((await response.json()).requests).toHaveLength(1);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "website_change_access_denied" } });
    expect((await GET(new Request(`http://localhost/api/workspace/site-changes?workspaceId=${WS}&systemId=${SYSTEM}`))).status).toBe(403);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
    expect((await GET(new Request(`http://localhost/api/workspace/site-changes?workspaceId=${WS}&systemId=${SYSTEM}`))).status).toBe(503);
  });
});

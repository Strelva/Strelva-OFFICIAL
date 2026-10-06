/**
 * Route wiring with the real release resolvers (only the session, services and
 * flag storage are faked): under `workspace` a route serves only the
 * businesses whose row is on, and the public inquiry form follows the site's
 * business.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setReleaseFlagsDb, type ReleaseFlagsDb } from "@/platform/release-flags/store";

const deps = vi.hoisted(() => ({ list: vi.fn(), tenant: vi.fn() }));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: async () => ({ id: "33333333-3333-4333-8333-333333333333", email: "owner@example.test", email_confirmed_at: "2026-09-01T00:00:00Z" }) }));
vi.mock("@/products/websites/rebuild-service", () => ({ listWebsiteRebuilds: deps.list, createWebsiteRebuild: vi.fn(), retryWebsiteRebuild: vi.fn(), readWebsiteRebuild: vi.fn(), approveWebsiteRebuild: vi.fn(), launchWebsiteRebuild: vi.fn(), connectWebsiteRebuildCapabilities: vi.fn() }));
vi.mock("@/lib/tenants", async (original) => ({ ...await original<typeof import("@/lib/tenants")>(), getTenantConfig: deps.tenant }));
import { GET as listRebuilds } from "@/app/api/websites/rebuild/route";
import { GET as inquiryForm } from "@/app/api/v1/inquiries/[tenant]/route";

const ON_WS = "10000000-0000-4000-8000-000000000001";
const BARE_WS = "10000000-0000-4000-8000-000000000004";
const db: ReleaseFlagsDb = {
  async rpc(name, args) {
    if (name === "resolve_billing_workspace") return { data: args.p_tenant_id === "on-site" ? { workspaceId: ON_WS } : args.p_tenant_id === "bare-site" ? { workspaceId: BARE_WS } : null, error: null };
    if (name === "read_workspace_release_flags") {
      const on = args.p_workspace_id === ON_WS;
      const flags = on ? Object.fromEntries(["inquiries", "website_rebuild"].map((flag) => [flag, { state: "on", revision: 1, changedAt: "2026-10-06T00:00:00Z" }])) : {};
      return { data: { workspaceId: args.p_workspace_id, flags, testers: [], testerEmails: [] }, error: null };
    }
    return { data: null, error: { message: "unexpected" } };
  },
};

beforeEach(() => {
  setReleaseFlagsDb(db);
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  deps.list.mockReset().mockResolvedValue([]);
  deps.tenant.mockReset().mockResolvedValue(null);
});
afterEach(() => { setReleaseFlagsDb(null); vi.unstubAllEnvs(); });

describe("website rebuild list under STRELVA_WEBSITE_REBUILD_RELEASE=workspace", () => {
  it("serves only a workspace whose row is on", async () => {
    vi.stubEnv("STRELVA_WEBSITE_REBUILD_RELEASE", "workspace");
    expect((await listRebuilds(new Request(`https://app.strelva.com/api/websites/rebuild?workspaceId=${ON_WS}`))).status).toBe(200);
    expect((await listRebuilds(new Request(`https://app.strelva.com/api/websites/rebuild?workspaceId=${BARE_WS}`))).status).toBe(503);
    expect(deps.list).toHaveBeenCalledTimes(1);
  });

  it("stays closed everywhere when the env is unset", async () => {
    vi.stubEnv("STRELVA_WEBSITE_REBUILD_RELEASE", "");
    expect((await listRebuilds(new Request(`https://app.strelva.com/api/websites/rebuild?workspaceId=${ON_WS}`))).status).toBe(503);
    expect(deps.list).not.toHaveBeenCalled();
  });
});

describe("public inquiry form under STRELVA_INQUIRIES_RELEASE=workspace", () => {
  it("is closed for a site whose business has no row, before reading the tenant", async () => {
    vi.stubEnv("STRELVA_INQUIRIES_RELEASE", "workspace");
    const response = await inquiryForm(new Request("https://app.strelva.com/api/v1/inquiries/bare-site?capabilityId=intake"), { params: Promise.resolve({ tenant: "bare-site" }) });
    expect(response.status).toBe(503);
    expect(deps.tenant).not.toHaveBeenCalled();
  });

  it("reaches the tenant read for a site whose business row is on", async () => {
    vi.stubEnv("STRELVA_INQUIRIES_RELEASE", "workspace");
    const response = await inquiryForm(new Request("https://app.strelva.com/api/v1/inquiries/on-site?capabilityId=intake"), { params: Promise.resolve({ tenant: "on-site" }) });
    expect(deps.tenant).toHaveBeenCalledWith("on-site");
    expect(response.status).toBe(404);
  });
});

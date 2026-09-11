import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class InquiryConcurrencyError extends Error {
    current: { revision: number } | null;
    constructor(current: { revision: number } | null) {
      super("This inquiry workspace changed. Refresh before trying that action again.");
      this.current = current;
    }
  }
  class InquiryPersistenceError extends Error {}
  class InquiryValidationError extends Error {}
  return {
    verifyAuth: vi.fn(),
    actor: vi.fn(),
    access: vi.fn(),
    permission: vi.fn(),
    routedTenant: vi.fn(),
    config: vi.fn(),
    release: vi.fn(),
    parse: vi.fn(),
    permissionForAction: vi.fn(),
    read: vi.fn(),
    execute: vi.fn(),
    InquiryConcurrencyError,
    InquiryPersistenceError,
    InquiryValidationError,
  };
});

vi.mock("@/lib/auth", () => ({
  verifyAuth: mocks.verifyAuth,
  getAuthUserId: mocks.actor,
  requireTenantAccess: mocks.access,
  requireTenantPermission: mocks.permission,
}));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: mocks.routedTenant }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.config }));
vi.mock("@/products/inquiries/server", () => ({
  inquiryReleaseEnabled: mocks.release,
  parseInquirySurfaceAction: mocks.parse,
  inquiryPermissionForAction: mocks.permissionForAction,
  readInquirySurface: mocks.read,
  executeInquirySurface: mocks.execute,
  InquiryConcurrencyError: mocks.InquiryConcurrencyError,
  InquiryPersistenceError: mocks.InquiryPersistenceError,
  InquiryValidationError: mocks.InquiryValidationError,
}));

import { GET, POST } from "@/app/api/inquiry-workspace/route";

const config = { id: "tenant-a", stableId: "business-stable", active: true, siteName: "Alder Realty" };
const canonicalAction = { kind: "start", input: { actorId: "owner-1", intent: "Collect seller inquiries" } };
const surface = { snapshot: { revision: 4, business: { id: "business-stable" } } };

function getRequest(tenantId = "tenant-a") {
  return new Request(`https://tenant-a.strelva.com/api/inquiry-workspace?tenantId=${tenantId}`);
}

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://tenant-a.strelva.com/api/inquiry-workspace", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://tenant-a.strelva.com", ...headers },
    body: JSON.stringify(body),
  });
}

describe("authenticated inquiry workspace route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.release.mockReturnValue(true);
    mocks.verifyAuth.mockResolvedValue(true);
    mocks.actor.mockResolvedValue("owner-1");
    mocks.access.mockImplementation(async (tenant: string) => tenant === "tenant-a" ? null : new Response(null, { status: 404 }));
    mocks.permission.mockResolvedValue(null);
    mocks.routedTenant.mockResolvedValue("tenant-a");
    mocks.config.mockResolvedValue(config);
    mocks.parse.mockReturnValue(canonicalAction);
    mocks.permissionForAction.mockReturnValue("content:write");
    mocks.read.mockResolvedValue(surface);
    mocks.execute.mockResolvedValue(surface);
  });

  it("keeps both methods closed before authentication when the release is disabled", async () => {
    mocks.release.mockReturnValue(false);
    expect((await GET(getRequest())).status).toBe(503);
    expect((await POST(postRequest({}))).status).toBe(503);
    expect(mocks.verifyAuth).not.toHaveBeenCalled();
  });

  it("requires an explicit tenant authorized by membership", async () => {
    const missing = await GET(new Request("https://tenant-a.strelva.com/api/inquiry-workspace"));
    expect(missing.status).toBe(400);
    const foreign = await GET(getRequest("tenant-b"));
    expect(foreign.status).toBe(404);
    expect(mocks.access).toHaveBeenCalledWith("tenant-b");
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns only the authorized server projection for GET", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(surface);
    expect(mocks.access).toHaveBeenCalledWith("tenant-a");
    expect(mocks.read).toHaveBeenCalledWith({ tenantId: "tenant-a", businessId: "business-stable", config });
  });

  it("binds a mutation to the authenticated actor and server business scope", async () => {
    const browserAction = {
      kind: "start",
      actorId: "attacker",
      input: { actorId: "attacker", intent: "Collect seller inquiries", emailConnection: { status: "connected", consent: "explicit" } },
    };
    const response = await POST(postRequest({ tenantId: "tenant-a", expectedRevision: 3, action: browserAction }));
    expect(response.status).toBe(200);
    expect(mocks.parse).toHaveBeenCalledWith(browserAction, "owner-1", "business-stable");
    expect(mocks.permission).toHaveBeenCalledWith("tenant-a", "content:write");
    expect(mocks.execute).toHaveBeenCalledWith({
      context: { tenantId: "tenant-a", businessId: "business-stable", config },
      action: canonicalAction,
      expectedRevision: 3,
      actorId: "owner-1",
    });
  });

  it("rejects cross-origin, foreign-tenant, and revisionless mutations before execution", async () => {
    const crossOrigin = await POST(postRequest({ tenantId: "tenant-a", expectedRevision: 3, action: canonicalAction }, { origin: "https://evil.invalid" }));
    expect(crossOrigin.status).toBe(403);
    const foreign = await POST(postRequest({ tenantId: "tenant-b", expectedRevision: 3, action: canonicalAction }));
    expect(foreign.status).toBe(404);
    const revisionless = await POST(postRequest({ tenantId: "tenant-a", action: canonicalAction }));
    expect(revisionless.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns a bounded conflict response for a stale canonical action", async () => {
    mocks.execute.mockRejectedValue(new mocks.InquiryConcurrencyError({ revision: 9 }));
    const response = await POST(postRequest({ tenantId: "tenant-a", expectedRevision: 3, action: canonicalAction }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This inquiry workspace changed. Refresh before trying that action again.",
      currentRevision: 9,
    });
  });
});

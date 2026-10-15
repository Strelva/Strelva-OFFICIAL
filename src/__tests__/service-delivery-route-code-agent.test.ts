import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), read: vi.fn(), permissions: vi.fn(), byCode: vi.fn(), oauth: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: () => mocks.user() }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/agent-channel/oauth", () => ({ oauthEnabled: () => mocks.oauth(), resourceUrl: () => "https://app.strelva.com/api/mcp/public" }));
vi.mock("@/products/websites/server", () => ({ sitesByCodeReleased: (...args: unknown[]) => mocks.byCode(...args) }));
vi.mock("@/platform/service-requests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/service-requests")>();
  return {
    ...actual, PostgresServiceRequestStore: {}, readServiceDeliveryPermissions: (...args: unknown[]) => mocks.permissions(...args),
    ServiceRequestService: class { read(...args: unknown[]) { return mocks.read(...args); } },
  };
});

import { GET } from "@/app/api/service-requests/delivery/route";

const REQUEST = "33333333-3333-4333-8333-333333333333";
const BUSINESS = "11111111-1111-4111-8111-111111111111";
const get = () => GET(new Request(`http://localhost/api/service-requests/delivery?requestId=${REQUEST}`));

describe("GET /api/service-requests/delivery for a coding agent", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.user.mockResolvedValue({ id: "cccccccc-0000-4000-8000-000000000001", email: "staff@agency.example", email_confirmed_at: "2026-10-01T00:00:00Z" });
    mocks.permissions.mockResolvedValue({ canManage: true, canOperate: true, stopped: false, websiteBindings: [] });
    mocks.oauth.mockReturnValue(true);
    mocks.byCode.mockResolvedValue(true);
    mocks.read.mockResolvedValue({ id: REQUEST, businessId: BUSINESS, context: { source: "website_change" } });
  });

  it("adds the coding-agent handoff for a website Request with the flag on", async () => {
    const body = await (await get()).json();
    expect(body.codeAgent).toEqual({ mcpUrl: "https://app.strelva.com/api/mcp/public", requestId: REQUEST });
    expect(mocks.byCode).toHaveBeenCalledWith(BUSINESS);
  });

  it("omits it for other Requests, with the flag off, or without the MCP sign-in", async () => {
    mocks.read.mockResolvedValue({ id: REQUEST, businessId: BUSINESS, context: { source: "ask_strelva" } });
    expect(await (await get()).json()).not.toHaveProperty("codeAgent");
    expect(mocks.byCode).not.toHaveBeenCalled();

    mocks.read.mockResolvedValue({ id: REQUEST, businessId: BUSINESS, context: { source: "website_change" } });
    mocks.byCode.mockResolvedValue(false);
    expect(await (await get()).json()).not.toHaveProperty("codeAgent");

    mocks.byCode.mockResolvedValue(true);
    mocks.oauth.mockReturnValue(false);
    expect(await (await get()).json()).not.toHaveProperty("codeAgent");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const ports = vi.hoisted(() => ({ tenants: vi.fn(), list: vi.fn(), load: vi.fn() }));
vi.mock("@/lib/tenants", () => ({ getActiveTenants: ports.tenants }));
vi.mock("@/lib/tenant-urls", () => ({ getTenantPublicUrl: (t: { id: string }) => `https://${t.id}.example` }));
vi.mock("@/products/connected-sites/server", () => ({
  appOrigin: () => "https://app.strelva.test",
  businessPageUrl: (origin: string, handle: string) => `${origin}/biz/${handle}`,
  listPublishedBusinessPages: ports.list, loadPublishedBusinessPage: ports.load,
}));

import { tenantDirectory } from "@/app/api/mcp/_directory";

const WORKSPACE = "7c470000-0000-4000-8000-000000000001";
const page = { workspaceId: WORKSPACE, handle: "native-cuts", facts: { name: "Native Cuts" }, confirmedAt: null };

beforeEach(() => {
  vi.resetAllMocks();
  ports.tenants.mockResolvedValue([{ id: "fixture", siteName: "Fixture Barbers", industry: "barber" }]);
  ports.list.mockResolvedValue([page]);
  ports.load.mockImplementation(async (handle: string) => handle === "native-cuts" ? page : null);
});

describe("platform MCP directory (#547 review: tenantless businesses)", () => {
  it("lists website tenants and published businesses without a website", async () => {
    expect(await tenantDirectory.list()).toEqual([
      { business: "fixture", name: "Fixture Barbers", industry: "barber", website: "https://fixture.example" },
      { business: "biz:native-cuts", name: "Native Cuts", industry: null, website: "https://app.strelva.test/biz/native-cuts" },
    ]);
  });

  it("keeps listing tenants when the business page read fails", async () => {
    ports.list.mockRejectedValue(new Error("down"));
    expect((await tenantDirectory.list()).map(e => e.business)).toEqual(["fixture"]);
  });

  it("resolves a published /biz handle to its workspace scope and never a raw or unpublished one", async () => {
    expect(await tenantDirectory.scope("biz:native-cuts")).toBe(`workspace:${WORKSPACE}`);
    expect(await tenantDirectory.scope("biz:unpublished")).toBeNull();
    expect(await tenantDirectory.scope(`workspace:${WORKSPACE}`)).toBeNull();
    expect(await tenantDirectory.scope("fixture")).toBe("fixture");
    ports.load.mockRejectedValue(new Error("down"));
    expect(await tenantDirectory.scope("biz:native-cuts")).toBeNull();
  });
});

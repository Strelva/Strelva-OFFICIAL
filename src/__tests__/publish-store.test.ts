import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rpc: vi.fn((..._a: unknown[]): unknown => undefined),
  setCachedContent: vi.fn(async () => {}),
  invalidateCachedContent: vi.fn(async () => {}),
  setCachedPageConfig: vi.fn(async () => {}),
  invalidateCachedPageConfig: vi.fn(async () => {}),
  settle: vi.fn(async () => {}),
  setContent: vi.fn(async () => {}),
  getStoredContent: vi.fn(),
  appendVersion: vi.fn(async () => ({})),
  observe: vi.fn(async () => {}),
  clearDraft: vi.fn(async () => {}),
  clearDraftPageConfig: vi.fn(async () => {}),
  getPageConfig: vi.fn(async () => null as unknown),
  setPageConfig: vi.fn(async () => {}),
}));

vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: m.rpc, from: () => { throw new Error("no direct writes"); } }) }));
vi.mock("@/lib/storage/content-cache", () => ({
  setCachedContent: m.setCachedContent,
  invalidateCachedContent: m.invalidateCachedContent,
  setCachedPageConfig: m.setCachedPageConfig,
  invalidateCachedPageConfig: m.invalidateCachedPageConfig,
  getCachedContent: vi.fn(async () => null),
  getCachedPageConfig: vi.fn(async () => null),
}));
vi.mock("@/lib/storage/content-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage/content-store")>()),
  settleContentReceipt: m.settle,
  setContent: m.setContent,
  getStoredContent: m.getStoredContent,
}));
vi.mock("@/lib/storage/version-store", () => ({ appendVersion: m.appendVersion, observeTenantContentVersion: m.observe }));
vi.mock("@/lib/storage/draft-store", () => ({ clearDraft: m.clearDraft }));
vi.mock("@/lib/storage/page-config-store", () => ({
  clearDraftPageConfig: m.clearDraftPageConfig,
  getPageConfig: m.getPageConfig,
  setPageConfig: m.setPageConfig,
}));

import { publishSiteDrafts, SitePublishError } from "@/lib/storage/publish-store";

const HERO = { headline: "After" } as never;
const SETTINGS = { businessName: "Shop" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.getStoredContent.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("publishSiteDrafts in Postgres", () => {
  beforeEach(() => {
    vi.stubEnv("CONTENT_SOURCE", "postgres");
    vi.stubEnv("DATA_SOURCE", "postgres");
    m.rpc.mockResolvedValue({ data: { receipts: {} }, error: null });
  });

  it("is one RPC with the content key, null empty changes and no receipts by default", async () => {
    const out = await publishSiteDrafts({
      tenant: "t1",
      sections: [{ section: "settings", data: SETTINGS, changes: [] }],
      pageConfig: null,
      author: "user",
    });
    expect(m.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = m.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe("publish_site_drafts");
    expect(args).toMatchObject({ p_tenant_id: "t1", p_page_config: null, p_author: "user", p_with_receipts: false });
    expect((args as { p_sections: unknown }).p_sections).toEqual([
      { section: "settings", contentKey: "siteSettings", data: SETTINGS, versionId: out.versionIds.settings, changes: null },
    ]);
    expect(out.versionIds.settings).toMatch(/^v_/);
    expect(m.setContent).not.toHaveBeenCalled();
  });

  it("throws a rolled-back error and invalidates caches when the RPC fails", async () => {
    m.rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    const err = await publishSiteDrafts({
      tenant: "t1", sections: [{ section: "hero", data: HERO, changes: [] }], pageConfig: null, author: "user",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SitePublishError);
    expect(err.rolledBack).toBe(true);
    expect(m.invalidateCachedContent).toHaveBeenCalledWith("hero", "t1");
    expect(m.invalidateCachedPageConfig).toHaveBeenCalledWith("t1");
  });

  it("does not throw when cache writes fail after commit", async () => {
    m.setCachedContent.mockRejectedValueOnce(new Error("redis"));
    m.setCachedPageConfig.mockRejectedValueOnce(new Error("redis"));
    m.observe.mockRejectedValueOnce(new Error("observe"));
    await expect(publishSiteDrafts({
      tenant: "t1", sections: [{ section: "hero", data: HERO, changes: [] }], pageConfig: { home: { sections: [] } } as never, author: "admin",
    })).resolves.toBeTruthy();
    expect(m.invalidateCachedContent).toHaveBeenCalledWith("hero", "t1");
    expect(m.invalidateCachedPageConfig).toHaveBeenCalledWith("t1");
  });

  it("settles receipts when the operator queue release is on", async () => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "1");
    m.rpc.mockResolvedValue({ data: { receipts: { hero: "r1" } }, error: null });
    await publishSiteDrafts({ tenant: "t1", sections: [{ section: "hero", data: HERO, changes: [] }], pageConfig: null, author: "user" });
    expect((m.rpc.mock.calls[0] as [string, Record<string, unknown>])[1].p_with_receipts).toBe(true);
    expect(m.settle).toHaveBeenCalledWith("hero", "t1", HERO, "r1");
    expect(m.setCachedContent).not.toHaveBeenCalled();
  });

  it("makes no call for empty input", async () => {
    await expect(publishSiteDrafts({ tenant: "t1", sections: [], pageConfig: null, author: "user" })).resolves.toEqual({ versionIds: {} });
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

describe("publishSiteDrafts fallback", () => {
  beforeEach(() => {
    vi.stubEnv("CONTENT_SOURCE", "");
    vi.stubEnv("DATA_SOURCE", "");
  });
  const two = [
    { section: "hero" as const, data: HERO, changes: [] },
    { section: "settings" as const, data: SETTINGS, changes: [] },
  ];

  it("puts the first section back when the second fails and keeps drafts", async () => {
    const prior = { headline: "Before" };
    m.getStoredContent.mockImplementation(async (s: string) => (s === "hero" ? prior : { businessName: "Old" }));
    m.setContent.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disk"));
    const err = await publishSiteDrafts({ tenant: "t1", sections: two, pageConfig: null, author: "user" }).catch((e) => e);
    expect(err).toBeInstanceOf(SitePublishError);
    expect(err.rolledBack).toBe(true);
    expect(m.setContent).toHaveBeenLastCalledWith("hero", prior, "t1");
    expect(m.clearDraft).not.toHaveBeenCalled();
  });

  it("names a section that had no prior content", async () => {
    m.getStoredContent.mockResolvedValue(null);
    m.setContent.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disk"));
    const err = await publishSiteDrafts({ tenant: "t1", sections: two, pageConfig: null, author: "user" }).catch((e) => e);
    expect(err.rolledBack).toBe(false);
    expect(err.sectionsNeedingAttention).toEqual(["hero"]);
  });

  it("clears drafts only after every write", async () => {
    const order: string[] = [];
    m.setContent.mockImplementation(async () => { order.push("set"); });
    m.clearDraft.mockImplementation(async () => { order.push("clear"); });
    await publishSiteDrafts({ tenant: "t1", sections: two, pageConfig: null, author: "user" });
    expect(order).toEqual(["set", "set", "clear", "clear"]);
  });
});

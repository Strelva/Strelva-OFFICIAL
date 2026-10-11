import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
import { listPublishedBusinessPages } from "@/products/connected-sites/business-pages";
import type { BusinessPagesStore } from "@/products/connected-sites/business-pages-store";

const WORKSPACE = "7c470000-0000-4000-8000-000000000001";
afterEach(() => vi.unstubAllEnvs());

describe("listPublishedBusinessPages", () => {
  const row = { workspaceId: WORKSPACE, handle: "native-cuts", revision: 1, facts: { display_name: "Native Cuts" }, services: [], confirmedAt: null };
  const store = (rows: unknown[]) => ({ listPublished: vi.fn(async () => rows) }) as unknown as BusinessPagesStore;

  it("serves nothing while the business page release is off", async () => {
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "1");
    vi.stubEnv("STRELVA_BUSINESS_PAGES", "0");
    expect(await listPublishedBusinessPages({ store: store([row]), publicFor: async () => true })).toEqual([]);
  });

  it("applies the same public gates as /biz/<handle>", async () => {
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "1");
    vi.stubEnv("STRELVA_BUSINESS_PAGES", "1");
    const closed = { ...row, workspaceId: "7c470000-0000-4000-8000-000000000002", handle: "closed-shop" };
    const nameless = { ...row, workspaceId: "7c470000-0000-4000-8000-000000000003", handle: "no-name", facts: {} };
    const pages = await listPublishedBusinessPages({ store: store([row, closed, nameless]), publicFor: async id => id !== closed.workspaceId });
    expect(pages.map(p => [p.handle, p.facts.name])).toEqual([["native-cuts", "Native Cuts"]]);
  });
});

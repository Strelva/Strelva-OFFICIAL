import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaults } from "../lib/defaults";

const mocks = vi.hoisted(() => ({
  postgres: vi.fn(), write: vi.fn(), atomic: vi.fn(), stored: vi.fn(), raw: vi.fn(),
  cacheRead: vi.fn(), cacheWrite: vi.fn(), invalidate: vi.fn(), devRead: vi.fn(), devWrite: vi.fn(),
  settle: vi.fn(), context: vi.fn(), overlay: vi.fn(),
}));
vi.mock("@/platform/infra/db/repositories", () => ({ upsertContentData: mocks.write, upsertContentDataWithReceipt: mocks.atomic, getStoredContentData: mocks.stored, getContentData: mocks.raw }));
vi.mock("@/platform/infra/db/source-flags", () => ({ contentSourceIsPostgres: mocks.postgres }));
vi.mock("../lib/storage/content-cache", () => ({ getCachedContent: mocks.cacheRead, setCachedContent: mocks.cacheWrite, invalidateCachedContent: mocks.invalidate }));
vi.mock("../lib/storage/core", () => ({ DEFAULT_TENANT: "fixture", readDevContent: mocks.devRead, writeDevContent: mocks.devWrite }));
vi.mock("../lib/storage/draft-store", () => ({ getDraftContent: vi.fn() }));
vi.mock("../lib/workspace-ports", () => ({ workspacePorts: () => ({ outsideWriteReceipts: async () => ({ recordReadback: mocks.settle }) }) }));
vi.mock("../lib/business-record-reader", () => ({ readReleasedTenantBusinessContext: mocks.context, contentWithBusinessRecord: mocks.overlay }));
vi.mock("../lib/sentry-context", () => ({ addSentryBreadcrumb: vi.fn() }));
import { setContent } from "../lib/storage/content-store";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "1");
  mocks.postgres.mockReturnValue(true);
  mocks.atomic.mockResolvedValue("receipt-1");
  mocks.stored.mockResolvedValue(defaults.hero);
  mocks.cacheRead.mockResolvedValue(defaults.hero);
  mocks.overlay.mockImplementation((_section, data) => data);
  mocks.devRead.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());

describe("content publication receipts", () => {
  it.each(["", "0", "true"])("preserves legacy Postgres path for flag %s", async flag => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", flag);
    await setContent("hero", defaults.hero, "alpha");
    expect(mocks.write).toHaveBeenCalledWith("alpha", "hero", defaults.hero);
    expect(mocks.atomic).not.toHaveBeenCalled();
    expect(mocks.stored).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("preserves local dev-file fallback even when release flag is on", async () => {
    mocks.postgres.mockReturnValue(false);
    await setContent("hero", defaults.hero, "alpha");
    expect(mocks.devWrite).toHaveBeenCalledWith({ hero: defaults.hero }, "alpha");
    expect(mocks.atomic).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("rejects an atomic publication failure and clears stale cache", async () => {
    mocks.atomic.mockRejectedValue(new Error("receipt unavailable"));
    await expect(setContent("hero", defaults.hero, "alpha")).rejects.toThrow("receipt unavailable");
    expect(mocks.invalidate).toHaveBeenCalledWith("hero", "alpha");
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.cacheWrite).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("preserves the actual verified actor for authority and attribution", async () => {
    const actor = { userId: "ab000000-0000-4000-8000-000000000001", email: "staff@agency.example.test" };
    await setContent("hero", defaults.hero, "alpha", actor);
    expect(mocks.atomic).toHaveBeenCalledWith("alpha", "hero", defaults.hero, actor);
  });
  it("records acceptance separately from matched public projection", async () => {
    await setContent("hero", defaults.hero, "alpha");
    expect(mocks.atomic).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledWith("receipt-1", "matched", expect.stringContaining("External storefront rendering is unverified"));
    const acceptedAt = mocks.atomic.mock.invocationCallOrder[0];
    const cachedAt = mocks.cacheWrite.mock.invocationCallOrder[0];
    expect(acceptedAt).toBeDefined();
    expect(cachedAt).toBeDefined();
    if (acceptedAt === undefined || cachedAt === undefined) throw new Error("Publication or cache write did not run");
    expect(acceptedAt).toBeLessThan(cachedAt);
  });
  it("does not confuse public cache data with a successful strict source read", async () => {
    mocks.stored.mockRejectedValue(new Error("Postgres down"));
    await expect(setContent("hero", defaults.hero, "alpha")).resolves.toBeUndefined();
    expect(mocks.settle).toHaveBeenCalledWith("receipt-1", "failed", expect.any(String));
    expect(mocks.atomic).toHaveBeenCalledTimes(1);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("records differs when public projection remains stale", async () => {
    mocks.cacheRead.mockResolvedValue({ ...defaults.hero, headline: "Old headline" });
    await setContent("hero", defaults.hero, "alpha");
    expect(mocks.settle).toHaveBeenCalledWith("receipt-1", "differs", expect.any(String));
    expect(mocks.atomic).toHaveBeenCalledTimes(1);
  });
  it("records differs when the business record overlays saved content", async () => {
    mocks.stored.mockResolvedValue(defaults.contact);
    mocks.cacheRead.mockResolvedValue(defaults.contact);
    mocks.overlay.mockReturnValue({ ...defaults.contact, email: "confirmed@example.test" });
    await setContent("contact", defaults.contact, "alpha");
    expect(mocks.settle).toHaveBeenCalledWith("receipt-1", "differs", expect.any(String));
  });
  it("records failed when no persisted row can be read", async () => {
    mocks.stored.mockResolvedValue(null);
    await setContent("hero", defaults.hero, "alpha");
    expect(mocks.settle).toHaveBeenCalledWith("receipt-1", "failed", expect.any(String));
  });
  it("does not reject or resend accepted publication if settlement fails", async () => {
    mocks.settle.mockRejectedValue(new Error("receipt write unavailable"));
    await expect(setContent("hero", defaults.hero, "alpha")).resolves.toBeUndefined();
    expect(mocks.atomic).toHaveBeenCalledTimes(1);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.settle).toHaveBeenCalledTimes(1);
  });
  it("does not retry committed content if receipt response is missing", async () => {
    mocks.atomic.mockResolvedValue(null);
    await expect(setContent("hero", defaults.hero, "alpha")).resolves.toBeUndefined();
    expect(mocks.atomic).toHaveBeenCalledTimes(1);
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("does not reject accepted publication if cache refresh throws", async () => {
    mocks.cacheWrite.mockRejectedValue(new Error("cache unavailable"));
    await expect(setContent("hero", defaults.hero, "alpha")).resolves.toBeUndefined();
    expect(mocks.atomic).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledWith("receipt-1", "failed", expect.any(String));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUpsertEntry = vi.fn();
const mockListEntries = vi.fn();
const mockGetEntryBySlug = vi.fn();
const mockDeleteEntry = vi.fn();
const mockLogActivity = vi.fn();
const mockRefresh = vi.fn();

vi.mock("@/platform/infra/db/repositories", () => ({
  upsertEntry: (...a: unknown[]) => mockUpsertEntry(...a),
  listEntries: (...a: unknown[]) => mockListEntries(...a),
  getEntryBySlug: (...a: unknown[]) => mockGetEntryBySlug(...a),
  deleteEntry: (...a: unknown[]) => mockDeleteEntry(...a),
}));
vi.mock("@/lib/storage", () => ({
  logActivity: (...a: unknown[]) => mockLogActivity(...a),
}));

vi.mock("@/lib/live-site-refresh", () => ({
  refreshLiveSite: (...a: unknown[]) => mockRefresh(...a),
}));

import { saveEntry, slugify, removeEntry } from "@/lib/cms/collections-service";

beforeEach(() => {
  mockUpsertEntry.mockReset();
  mockListEntries.mockReset();
  mockGetEntryBySlug.mockReset();
  mockDeleteEntry.mockReset();
  mockLogActivity.mockReset();
  mockRefresh.mockReset();
  mockRefresh.mockResolvedValue({ status: "revalidated" });
  mockGetEntryBySlug.mockResolvedValue(null);
  mockUpsertEntry.mockResolvedValue({ slug: "hello-world", type: "blog", status: "draft", data: {} });
  mockLogActivity.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("slugify", () => {
  it("lowercases, strips punctuation, collapses to dashes", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("  Multiple   Spaces  ")).toBe("multiple-spaces");
    expect(slugify("--edge--")).toBe("edge");
  });
});

describe("saveEntry", () => {
  it("validates, derives the slug from the title, and upserts", async () => {
    const res = await saveEntry({ tenant: "gldf", type: "blog", data: { title: "Hello World" } });
    expect(res.ok).toBe(true);
    expect(mockUpsertEntry).toHaveBeenCalledTimes(1);
    const arg = mockUpsertEntry.mock.calls[0]![0];
    expect(arg).toMatchObject({ tenant_id: "gldf", type: "blog", slug: "hello-world", status: "draft" });
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
  });

  it("honors an explicit slug", async () => {
    await saveEntry({ tenant: "gldf", type: "blog", slug: "custom", data: { title: "X" } });
    expect(mockUpsertEntry.mock.calls[0]![0]!.slug).toBe("custom");
  });

  it("rejects invalid data without calling the repo", async () => {
    const res = await saveEntry({ tenant: "gldf", type: "blog", data: { excerpt: "no title" } });
    expect(res.ok).toBe(false);
    expect(mockUpsertEntry).not.toHaveBeenCalled();
  });

  it("surfaces a storage-unavailable failure", async () => {
    mockUpsertEntry.mockResolvedValueOnce(null);
    const res = await saveEntry({ tenant: "gldf", type: "blog", data: { title: "Y" } });
    expect(res.ok).toBe(false);
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("live site refresh on save", () => {
  it("makes no call when a never-published entry is saved as a draft", async () => {
    const res = await saveEntry({ tenant: "gldf", type: "blog", data: { title: "Hello World" } });
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(res).not.toHaveProperty("liveSite");
  });

  it("refreshes the entry paths and collection tags on publish", async () => {
    const res = await saveEntry({ tenant: "gldf", type: "blog", data: { title: "Hello World" }, status: "published" });
    expect(mockRefresh).toHaveBeenCalledExactlyOnceWith(
      "gldf",
      ["/", "/blog", "/blog/hello-world"],
      { tags: ["collections", "collection:blog", "collection:blog:hello-world"] },
    );
    expect(res).toMatchObject({ ok: true, liveSite: { status: "revalidated" } });
  });

  it("refreshes when a published entry goes back to draft", async () => {
    mockGetEntryBySlug.mockResolvedValue({ status: "published" });
    await saveEntry({ tenant: "gldf", type: "blog", data: { title: "Hello World" } });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("still succeeds when the refresh failed", async () => {
    mockRefresh.mockResolvedValue({ status: "failed", error: "HTTP 500" });
    const res = await saveEntry({ tenant: "gldf", type: "blog", data: { title: "Hello World" }, status: "published" });
    expect(res).toMatchObject({ ok: true, liveSite: { status: "failed" } });
  });
});

describe("removeEntry", () => {
  it("deletes and logs", async () => {
    mockDeleteEntry.mockResolvedValue(undefined);
    await removeEntry("gldf", "blog", "hello-world");
    expect(mockDeleteEntry).toHaveBeenCalledWith("gldf", "blog", "hello-world");
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
  });

  it("refreshes when the entry was published or is unknown, not when it was a draft", async () => {
    mockDeleteEntry.mockResolvedValue(undefined);
    mockGetEntryBySlug.mockResolvedValueOnce({ status: "published" });
    await expect(removeEntry("gldf", "blog", "a")).resolves.toEqual({ liveSite: { status: "revalidated" } });
    mockGetEntryBySlug.mockResolvedValueOnce(null);
    await removeEntry("gldf", "blog", "b");
    expect(mockRefresh).toHaveBeenCalledTimes(2);
    mockGetEntryBySlug.mockResolvedValueOnce({ status: "draft" });
    await expect(removeEntry("gldf", "blog", "c")).resolves.toEqual({});
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });
});

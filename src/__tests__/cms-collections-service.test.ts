import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUpsertEntry = vi.fn();
const mockListEntries = vi.fn();
const mockGetEntryBySlug = vi.fn();
const mockDeleteEntry = vi.fn();
const mockLogActivity = vi.fn();

vi.mock("@/lib/db/repositories", () => ({
  upsertEntry: (...a: unknown[]) => mockUpsertEntry(...a),
  listEntries: (...a: unknown[]) => mockListEntries(...a),
  getEntryBySlug: (...a: unknown[]) => mockGetEntryBySlug(...a),
  deleteEntry: (...a: unknown[]) => mockDeleteEntry(...a),
}));
vi.mock("@/lib/storage", () => ({
  logActivity: (...a: unknown[]) => mockLogActivity(...a),
}));

import { saveEntry, slugify, removeEntry } from "@/lib/cms/collections-service";

beforeEach(() => {
  mockUpsertEntry.mockReset();
  mockListEntries.mockReset();
  mockGetEntryBySlug.mockReset();
  mockDeleteEntry.mockReset();
  mockLogActivity.mockReset();
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
    const arg = mockUpsertEntry.mock.calls[0][0];
    expect(arg).toMatchObject({ tenant_id: "gldf", type: "blog", slug: "hello-world", status: "draft" });
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
  });

  it("honors an explicit slug", async () => {
    await saveEntry({ tenant: "gldf", type: "blog", slug: "custom", data: { title: "X" } });
    expect(mockUpsertEntry.mock.calls[0][0].slug).toBe("custom");
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

describe("removeEntry", () => {
  it("deletes and logs", async () => {
    mockDeleteEntry.mockResolvedValue(undefined);
    await removeEntry("gldf", "blog", "hello-world");
    expect(mockDeleteEntry).toHaveBeenCalledWith("gldf", "blog", "hello-world");
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
  });
});

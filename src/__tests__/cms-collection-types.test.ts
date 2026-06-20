import { describe, expect, it } from "vitest";
import {
  COLLECTION_TYPES,
  isCollectionType,
  validateEntryData,
  entryTitle,
} from "@/lib/cms/collection-types";

describe("isCollectionType", () => {
  it("accepts known types and rejects others", () => {
    expect(isCollectionType("blog")).toBe(true);
    expect(isCollectionType("video")).toBe(true);
    expect(isCollectionType("product")).toBe(true);
    expect(isCollectionType("reviews")).toBe(false);
    expect(isCollectionType("__proto__")).toBe(false);
  });
});

describe("validateEntryData", () => {
  it("accepts a valid blog entry and applies defaults", () => {
    const r = validateEntryData("blog", { title: "Hello" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toMatchObject({ title: "Hello", excerpt: "", tags: [] });
    }
  });

  it("rejects a blog entry with no title", () => {
    expect(validateEntryData("blog", { excerpt: "x" }).success).toBe(false);
  });

  it("requires a videoUrl for video and a numeric price for product", () => {
    expect(validateEntryData("video", { title: "v" }).success).toBe(false);
    expect(validateEntryData("video", { title: "v", videoUrl: "https://x.com/v" }).success).toBe(true);
    expect(validateEntryData("product", { name: "p", priceCents: -1 }).success).toBe(false);
    expect(validateEntryData("product", { name: "p", priceCents: 100 }).success).toBe(true);
  });
});

describe("entryTitle", () => {
  it("uses the type's titleField and falls back to the slug", () => {
    expect(entryTitle("blog", { title: "T" }, "s")).toBe("T");
    expect(entryTitle("product", { name: "N" }, "s")).toBe("N");
    expect(entryTitle("blog", {}, "my-slug")).toBe("my-slug");
  });
});

describe("registry wiring", () => {
  it("maps each type to its capability feature", () => {
    expect(COLLECTION_TYPES.blog.feature).toBe("blog");
    expect(COLLECTION_TYPES.video.feature).toBe("video");
    expect(COLLECTION_TYPES.product.feature).toBe("products");
  });
});

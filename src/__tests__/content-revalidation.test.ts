import { describe, expect, it } from "vitest";
import { clientRevalidationTargetForCollection, clientRevalidationTargetForSections } from "@/lib/content-revalidation";

describe("content revalidation targeting", () => {
  it("revalidates only the homepage for ordinary section edits", () => {
    expect(clientRevalidationTargetForSections(["hero"])).toEqual(["/"]);
  });

  it("revalidates the homepage plus the section's own page for sections with a dedicated route", () => {
    // services → /services, story → /about
    expect(clientRevalidationTargetForSections(["services", "story"])).toEqual([
      "/",
      "/services",
      "/about",
    ]);
  });

  it("revalidates the full site for settings and other site-wide sections", () => {
    expect(clientRevalidationTargetForSections(["settings"])).toBe("all");
    expect(clientRevalidationTargetForSections(["theme"])).toBe("all");
    expect(clientRevalidationTargetForSections(["navigation"])).toBe("all");
    expect(clientRevalidationTargetForSections(["footer"])).toBe("all");
  });

  it("revalidates the full site when page structure changes", () => {
    expect(clientRevalidationTargetForSections(["hero"], { pageConfigChanged: true })).toBe("all");
  });
});

describe("collection revalidation targeting", () => {
  it("refreshes the blog index and entry page with collection tags", () => {
    expect(clientRevalidationTargetForCollection("blog", "hello")).toEqual({
      paths: ["/", "/blog", "/blog/hello"],
      tags: ["collections", "collection:blog", "collection:blog:hello"],
    });
  });
  it("relies on tags for types without a conventional route", () => {
    expect(clientRevalidationTargetForCollection("product", "mug")).toEqual({
      paths: ["/"],
      tags: ["collections", "collection:product", "collection:product:mug"],
    });
  });
});

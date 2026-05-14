import { describe, expect, it } from "vitest";
import { clientRevalidationTargetForSections } from "@/lib/content-revalidation";

describe("content revalidation targeting", () => {
  it("revalidates only the homepage for ordinary section edits", () => {
    expect(clientRevalidationTargetForSections(["hero"])).toEqual(["/"]);
    expect(clientRevalidationTargetForSections(["services", "story"])).toEqual(["/"]);
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

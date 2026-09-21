import { describe, expect, it } from "vitest";
import { resolveHomeFinderPreviewHref } from "@/products/home-finder/preview";

describe("Home Finder preview destination", () => {
  it("uses the controlled synthetic worker only outside production", () => {
    expect(resolveHomeFinderPreviewHref({}, "development")).toBe("http://127.0.0.1:3213/embed/agency-preview");
    expect(resolveHomeFinderPreviewHref({}, "production")).toBeUndefined();
  });

  it("normalizes an origin-only configured base to the synthetic path", () => {
    expect(resolveHomeFinderPreviewHref({ HOME_FINDER_PUBLIC_BASE_URL: "https://idx.example.test/" }, "production")).toBe("https://idx.example.test/embed/agency-preview");
    expect(resolveHomeFinderPreviewHref({ HOME_FINDER_PUBLIC_BASE_URL: "http://127.0.0.1:3212" }, "development")).toBe("http://127.0.0.1:3212/embed/agency-preview");
  });

  it("rejects credentials, query/hash, path and insecure production settings", () => {
    for (const value of [
      "https://user:pass@idx.example.test",
      "https://idx.example.test/?installation=live",
      "https://idx.example.test/#preview",
      "https://idx.example.test/base",
      "http://idx.example.test",
    ]) {
      expect(resolveHomeFinderPreviewHref({ HOME_FINDER_PUBLIC_BASE_URL: value }, "production")).toBeUndefined();
    }
  });
});

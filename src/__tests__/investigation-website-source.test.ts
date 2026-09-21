import { describe, expect, it, vi } from "vitest";
import { createPublicWebsiteSourceAdapter } from "@/products/investigations/public-website-source";

describe("public website investigation source", () => {
  it("records the authorized URL, freshness, and a stable read fingerprint", async () => {
    const adapter = createPublicWebsiteSourceAdapter({
      validateUrl: vi.fn().mockResolvedValue({ address: "203.0.113.10" }),
      auditSnapshot: vi.fn().mockResolvedValue({
        categories: [{ name: "SEO", slug: "seo", weight: 1, score: 90, checks: [] }],
        visibleText: "A public page with a price of $100.",
        fetchedUrl: "https://example.test/",
      }),
      now: () => new Date("2026-09-20T12:00:00.000Z"),
    });
    const result = await adapter.read({ url: "https://example.test" });
    expect(result).toMatchObject({
      sourceUrl: "https://example.test",
      observedAt: "2026-09-20T12:00:00.000Z",
      freshness: "fresh",
      status: "available",
      retryable: false,
    });
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.contentLength).toBeGreaterThan(0);
    expect(result.contentExcerpt).toBe("A public page with a price of $100.");
    expect(result.contentVisibility).toBe("server_visible");
    expect(result.fetchedUrl).toBe("https://example.test/");
    expect(result.categories).toHaveLength(1);
  });

  it("keeps a rate-limited read unavailable and retryable without treating it as agreement", async () => {
    const adapter = createPublicWebsiteSourceAdapter({
      validateUrl: vi.fn().mockResolvedValue({ address: "203.0.113.10" }),
      audit: vi.fn().mockRejectedValue(Object.assign(new Error("slow down"), { status: 429 })),
      now: () => new Date("2026-09-20T12:00:00.000Z"),
    });
    await expect(adapter.read({ url: "https://example.test" })).resolves.toMatchObject({
      sourceUrl: "https://example.test",
      status: "rate_limited",
      retryable: true,
      reason: "source_rate_limited",
    });
  });

  it("reports a public access denial without inventing credential state", async () => {
    const adapter = createPublicWebsiteSourceAdapter({
      validateUrl: vi.fn().mockResolvedValue({ address: "203.0.113.10" }),
      auditSnapshot: vi.fn().mockResolvedValue({ categories: [], visibleText: "forbidden", httpStatus: 403, fetchOk: false }),
    });
    await expect(adapter.read({ url: "https://example.test" })).resolves.toMatchObject({
      status: "access_denied",
      retryable: true,
      reason: "source_access_denied",
    });
  });

  it("records when a page has no server-visible text for client-rendering review", async () => {
    const adapter = createPublicWebsiteSourceAdapter({
      validateUrl: vi.fn().mockResolvedValue({ address: "203.0.113.10" }),
      auditSnapshot: vi.fn().mockResolvedValue({ categories: [], visibleText: "" }),
    });
    await expect(adapter.read({ url: "https://example.test" })).resolves.toMatchObject({
      status: "available",
      contentLength: 0,
      contentExcerpt: "",
      contentVisibility: "no_server_visible_text",
    });
  });
});

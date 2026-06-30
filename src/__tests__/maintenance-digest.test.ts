import { describe, expect, it, vi, beforeEach } from "vitest";

const mockTs = vi.hoisted(() => vi.fn());
const mockScan = vi.hoisted(() => vi.fn());

vi.mock("@/lib/storage", () => ({ getSectionTimestamps: mockTs }));
vi.mock("@/lib/scan-store", () => ({ getScanSummary: mockScan }));
vi.mock("@/lib/suggestions", () => ({ addSuggestion: vi.fn() }));
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));

import { buildMaintenanceDigest } from "@/lib/maintenance-digest";

const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
const fresh = new Date().toISOString();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildMaintenanceDigest", () => {
  it("proposes refreshes for stale sections and fixes for weak health", async () => {
    mockTs.mockResolvedValue({ hero: old, services: old });
    mockScan.mockResolvedValue({
      url: "x",
      scannedAt: fresh,
      overallScore: 55,
      grade: "D",
      categories: [
        { name: "Speed", slug: "speed", score: 40 },
        { name: "SEO", slug: "seo", score: 90 },
      ],
    });

    const d = await buildMaintenanceDigest("acme", "Acme");
    expect(d.tenant).toBe("acme");
    expect(d.status).toBe("pending");
    const types = d.items.map((i) => i.type);
    expect(types).toContain("content");
    expect(types).toContain("health");
    // Weak category surfaces; strong one doesn't.
    expect(d.items.some((i) => i.title.includes("Speed"))).toBe(true);
    expect(d.items.some((i) => i.title.includes("SEO"))).toBe(false);
    // Items carry a runnable chat prompt for the AI.
    expect(d.items.every((i) => i.action.startsWith("prompt:"))).toBe(true);
  });

  it("returns no items for a fresh, healthy site", async () => {
    mockTs.mockResolvedValue({ hero: fresh });
    mockScan.mockResolvedValue({
      url: "x",
      scannedAt: fresh,
      overallScore: 95,
      grade: "A",
      categories: [{ name: "Speed", slug: "speed", score: 95 }],
    });
    const d = await buildMaintenanceDigest("acme", "Acme");
    expect(d.items).toHaveLength(0);
  });

  it("caps stale-content items so the digest stays scannable", async () => {
    mockTs.mockResolvedValue({ hero: old, services: old, story: old, contact: old, faq: old });
    mockScan.mockResolvedValue(null);
    const d = await buildMaintenanceDigest("acme", "Acme");
    expect(d.items.filter((i) => i.type === "content").length).toBeLessThanOrEqual(2);
  });
});

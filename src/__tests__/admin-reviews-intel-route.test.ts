import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewItem } from "@/lib/types";

const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockGetReviews = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ isSuperAdmin: mockIsSuperAdmin }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mockGetTenantConfig }));
vi.mock("@/lib/reviews", () => ({ getReviews: mockGetReviews }));

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const REVIEWS: ReviewItem[] = [
  { id: "a", source: "google", author: "Sam", rating: 5, text: "great staff", date: "2026-06-28T00:00:00Z", reply: "thanks" },
  { id: "b", source: "google", author: "Lee", rating: 1, text: "rude staff and dirty tables", date: "2026-06-27T00:00:00Z" },
  { id: "c", source: "google", author: "Kai", rating: 1, text: "I got food poisoning", date: "2026-06-29T00:00:00Z" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSuperAdmin.mockResolvedValue(true);
  mockGetTenantConfig.mockResolvedValue({ id: "demo", siteName: "Demo" });
  mockGetReviews.mockResolvedValue(REVIEWS);
});

describe("GET /api/admin/tenants/[id]/reviews-intel", () => {
  it("403s a non-super-admin", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const { GET } = await import("@/app/api/admin/tenants/[id]/reviews-intel/route");
    const res = await GET(new Request("http://x"), params("demo"));
    expect(res.status).toBe(403);
    expect(mockGetReviews).not.toHaveBeenCalled();
  });

  it("404s an unknown tenant", async () => {
    mockGetTenantConfig.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/tenants/[id]/reviews-intel/route");
    const res = await GET(new Request("http://x"), params("nope"));
    expect(res.status).toBe(404);
  });

  it("returns the admin intelligence with the urgent-first queue", async () => {
    const { GET } = await import("@/app/api/admin/tenants/[id]/reviews-intel/route");
    const res = await GET(new Request("http://x"), params("demo"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalReviews).toBe(3);
    expect(body.needsResponse[0].reviewId).toBe("c"); // high urgency first
    expect(body.needsResponse.map((f: { reviewId: string }) => f.reviewId)).not.toContain("a"); // replied
    expect(body.unansweredNegative).toBe(2);
    expect(body.atRisk).toBe(true);
  });

  it("degrades to empty intelligence when reviews fail to load", async () => {
    mockGetReviews.mockRejectedValue(new Error("db down"));
    const { GET } = await import("@/app/api/admin/tenants/[id]/reviews-intel/route");
    const res = await GET(new Request("http://x"), params("demo"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalReviews).toBe(0);
    expect(body.needsResponse).toEqual([]);
  });
});

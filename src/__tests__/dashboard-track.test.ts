import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTrackClick = vi.fn((..._args: unknown[]) => Promise.resolve());
const mockIsRateLimited = vi.fn((..._args: unknown[]) => Promise.resolve(false));

vi.mock("@/lib/storage", () => ({
  trackClick: (...args: unknown[]) => mockTrackClick(...args),
}));

vi.mock("@/lib/tenant", () => ({
  getTenantFromHeaders: () => Promise.resolve("gldf"),
}));

vi.mock("@/lib/rate-limit", () => ({
  isRateLimitedAsync: (...args: unknown[]) => mockIsRateLimited(...args),
  rateLimitKey: vi.fn((_request: Request, scope: string) => `${scope}:test`),
}));

function post(body: string | object) {
  return new Request("http://localhost/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("dashboard engagement beacon — POST /api/track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRateLimited.mockResolvedValue(false);
  });

  // These are the surfaces (Store / Google Business / Health / Brand kit) that were
  // 400ing and silently undercounting the churn/at-risk engagement signal.
  it.each(["store-view", "gbp-view", "health-view", "brand-kit-view"])(
    "accepts the %s engagement event",
    async (event) => {
      const { POST } = await import("@/app/api/track/route");
      const response = await POST(post({ event }));
      expect(response.status).toBe(200);
      expect(mockTrackClick).toHaveBeenCalledWith(event, "gldf");
    },
  );

  it("still rejects an unknown event", async () => {
    const { POST } = await import("@/app/api/track/route");
    const response = await POST(post({ event: "definitely-not-an-event" }));
    expect(response.status).toBe(400);
    expect(mockTrackClick).not.toHaveBeenCalled();
  });
});

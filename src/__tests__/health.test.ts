import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));
vi.mock("@/lib/sanity", () => ({ getSanityClient: vi.fn() }));

import { getServiceHealth } from "@/lib/health";

// Env vars that drive the external checks — cleared so they read "not configured"
// (and never make a real network call) in tests.
const ENV_KEYS = [
  "NEXT_PUBLIC_SANITY_PROJECT_ID",
  "SANITY_API_TOKEN",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getServiceHealth", () => {
  it("reports healthy when nothing is configured / erroring", async () => {
    mockGetRedis.mockReturnValue(null);
    const report = await getServiceHealth();
    expect(report.status).toBe("healthy");
    expect(report.checks.redis.status).toBe("not configured");
    expect(report.checks.sanity.status).toBe("not configured");
  });

  it("marks redis ok when ping succeeds", async () => {
    mockGetRedis.mockReturnValue({ ping: vi.fn().mockResolvedValue("PONG") });
    const report = await getServiceHealth();
    expect(report.checks.redis.status).toBe("ok");
    expect(report.status).toBe("healthy");
  });

  it("goes down when a core service (redis) errors", async () => {
    mockGetRedis.mockReturnValue({ ping: vi.fn().mockRejectedValue(new Error("connection refused")) });
    const report = await getServiceHealth();
    expect(report.checks.redis.status).toBe("error");
    expect(report.status).toBe("down");
  });
});

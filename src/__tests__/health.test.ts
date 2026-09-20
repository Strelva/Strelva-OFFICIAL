import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));

import { getServiceHealth } from "@/lib/health";
import packageJson from "../../package.json";

// Env vars that drive the external checks — cleared so they read "not configured"
// (and never make a real network call) in tests.
const ENV_KEYS = [
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
  vi.unstubAllEnvs();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getServiceHealth", () => {
  it("reports the checked-in product version when no deployment override is set", async () => {
    vi.stubEnv("APP_VERSION", "");
    mockGetRedis.mockReturnValue(null);
    const report = await getServiceHealth();
    expect(report.version).toBe(packageJson.version);
  });
  it("reports healthy when nothing is configured / erroring", async () => {
    mockGetRedis.mockReturnValue(null);
    const report = await getServiceHealth();
    expect(report.status).toBe("healthy");
    expect(report.checks.redis.status).toBe("not configured");
    expect(report.checks.supabase.status).toBe("not configured");
  });

  it("fails production health when the core data services are not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockGetRedis.mockReturnValue(null);
    const report = await getServiceHealth();
    expect(report.status).toBe("down");
    expect(report.checks.redis.status).toBe("not configured");
    expect(report.checks.supabase.status).toBe("not configured");
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

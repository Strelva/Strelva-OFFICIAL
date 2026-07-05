import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantConfig } from "@/lib/types";
import type { VisibilitySnapshot } from "@/lib/visibility/snapshots";

// --- Mocks. Keep the pure helpers real (query building, cost, windowing,
// mapPool) so the test exercises the actual gating + derivation logic; only the
// side-effecting edges are stubbed.
const getAllTenantsMock = vi.fn(async (): Promise<TenantConfig[]> => []);
vi.mock("@/lib/tenants", () => ({
  getAllTenants: () => getAllTenantsMock(),
}));

const saveSnapshotMock = vi.fn(async (_s: VisibilitySnapshot) => ({ id: "evt" }));
vi.mock("@/lib/visibility/snapshots", () => ({
  saveVisibilitySnapshot: (s: VisibilitySnapshot) => saveSnapshotMock(s),
}));

const alertOnceMock = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/monitoring", () => ({
  alertOnce: (...a: unknown[]) => alertOnceMock(...a),
}));

const recordHeartbeatMock = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/heartbeat", () => ({
  recordHeartbeat: (...a: unknown[]) => recordHeartbeatMock(...a),
}));

// No SERP key → SERP checks are honestly skipped; keep computeMonthlyCost real.
vi.mock("@/lib/visibility/serp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/visibility/serp")>();
  return { ...actual, buildSerpProvider: () => null };
});

// AI probe stubbed to a probed:false result (no key) — the gating test doesn't
// care about the AI answer content, only which tenants get a snapshot at all.
vi.mock("@/lib/visibility/ai-answers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/visibility/ai-answers")>();
  return {
    ...actual,
    probeAiAnswer: vi.fn(async (query: string) => ({
      query,
      model: "gemini-2.5-flash",
      probed: false,
      tenantMentioned: false,
      competitors: [],
      checkedAt: new Date().toISOString(),
      methodologyNote: "test",
    })),
  };
});

function tenant(overrides: Partial<TenantConfig>): TenantConfig {
  return {
    id: "t",
    subdomain: "t",
    siteName: "Test Site",
    ownerName: "Owner",
    industry: "wellness",
    active: true,
    createdAt: new Date().toISOString(),
    template: "wellness" as TenantConfig["template"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SLACK_WEBHOOK_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/cron/visibility — gating + derivation", () => {
  it("derives trade from industry, flags real gaps, never invents towns", async () => {
    getAllTenantsMock.mockResolvedValue([
      // Full config → probes with its own trade.
      tenant({ id: "full", industry: "plumber", visibility: { trade: "plumber", towns: ["Rochester, NY"], competitors: [] } }),
      // Towns set but NO trade → derives trade from industry ("HVAC"). Under the
      // OLD gating this was silently skipped as "missing_trade_or_towns".
      tenant({ id: "derive", industry: "HVAC", visibility: { trade: "", towns: ["Buffalo, NY"], competitors: [] } }),
      // No towns anywhere → flagged (we never invent a service area).
      tenant({ id: "no-towns", industry: "electrician", visibility: { trade: "electrician", towns: [], competitors: [] } }),
      // No visibility block + no industry → nothing to derive → flagged.
      tenant({ id: "bare", industry: "", visibility: undefined }),
      // Explicit opt-out is honored.
      tenant({ id: "off", industry: "plumber", visibility: { enabled: false, trade: "plumber", towns: ["Buffalo, NY"], competitors: [] } }),
      // Inactive tenants never reach the pool.
      tenant({ id: "inactive", active: false, industry: "plumber", visibility: { trade: "plumber", towns: ["Buffalo, NY"], competitors: [] } }),
    ]);

    const { GET } = await import("@/app/api/cron/visibility/route");
    const res = await GET();
    const body = await res.json();

    // Probed: full + derive.
    expect(body.ok).toBe(2);
    // Skipped: off (disabled) + no-towns + bare.
    expect(body.skipped).toBe(3);
    // Operator-visible config gaps (missing trade/towns): no-towns + bare.
    expect(body.unconfigured).toBe(2);
    expect(body.errors).toBe(0);

    // Derivation proof: the "derive" tenant got a snapshot with trade from industry.
    const snaps = saveSnapshotMock.mock.calls.map((c) => c[0] as VisibilitySnapshot);
    expect(snaps.map((s) => s.tenantId).sort()).toEqual(["derive", "full"]);
    const derived = snaps.find((s) => s.tenantId === "derive")!;
    expect(derived.trade).toBe("HVAC");
    expect(derived.towns).toEqual(["Buffalo, NY"]);

    // The gaps are surfaced to an operator, not a silent no-op.
    expect(alertOnceMock).toHaveBeenCalledWith(
      "visibility_tenants_unconfigured",
      "medium",
      expect.objectContaining({ count: 2 }),
      expect.any(Number)
    );
    const alertCtx = alertOnceMock.mock.calls[0][2] as { tenantIds: string };
    expect(alertCtx.tenantIds.split(",").sort()).toEqual(["bare", "no-towns"]);

    // Reasons are specific, not a single opaque skip.
    const reasonsById = Object.fromEntries(
      body.results.map((r: { tenantId: string; reason?: string }) => [r.tenantId, r.reason])
    );
    expect(reasonsById["off"]).toBe("disabled_in_config");
    expect(reasonsById["no-towns"]).toBe("missing_towns");
    expect(reasonsById["bare"]).toBe("missing_trade+towns");
  });

  it("does not alert an operator when every tenant is probeable", async () => {
    getAllTenantsMock.mockResolvedValue([
      tenant({ id: "a", industry: "plumber", visibility: { trade: "plumber", towns: ["Buffalo, NY"], competitors: [] } }),
    ]);
    const { GET } = await import("@/app/api/cron/visibility/route");
    const res = await GET();
    const body = await res.json();
    expect(body.ok).toBe(1);
    expect(body.unconfigured).toBe(0);
    expect(alertOnceMock).not.toHaveBeenCalled();
  });
});

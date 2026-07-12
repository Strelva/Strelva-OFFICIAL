import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantConfig } from "@/lib/types";
import type { AiGovernanceDecision } from "@/lib/ai-governance";

// Control the approval streak that getApprovalStreak reads from Redis.
const mockGet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ get: mockGet, incr: vi.fn(), expire: vi.fn(), set: vi.fn() }),
}));

import { maybeAutoApprove } from "@/lib/ai-auto-approve";

const trusted = { id: "gldf", autoApproveThreshold: 3 } as unknown as TenantConfig;
const review = (reasonCode: AiGovernanceDecision["reasonCode"]): AiGovernanceDecision => ({
  action: "review",
  reason: "needs review",
  reasonCode,
});

// Key-aware: the content-autonomy read and the streak read hit different Redis keys.
// Default: autonomy off ("approve" → null), streak well past the threshold.
beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockImplementation((k: string) => (k.includes("content-autonomy") ? null : 10));
});

describe("maybeAutoApprove — earned-trust streak", () => {
  it("NEVER upgrades a high_risk_facts review, even for a trusted tenant past its streak", async () => {
    const out = await maybeAutoApprove(trusted, "contact", review("high_risk_facts"));
    expect(out.action).toBe("review"); // booking/payment/hours stay human-gated
  });

  it("upgrades a non-high-risk review to publish once the streak meets the threshold", async () => {
    const out = await maybeAutoApprove(trusted, "contact", review("factual_auto"));
    expect(out).toMatchObject({ action: "publish", reasonCode: "auto_approved" });
  });

  it("leaves a review alone when the tenant has no auto-approve threshold", async () => {
    const untrusted = { id: "x", autoApproveThreshold: 0 } as unknown as TenantConfig;
    const out = await maybeAutoApprove(untrusted, "contact", review("factual_auto"));
    expect(out.action).toBe("review");
  });

  it("never upgrades a non-low-risk section", async () => {
    const out = await maybeAutoApprove(trusted, "hero", review("marketing_copy"));
    expect(out.action).toBe("review");
  });
});

describe("maybeAutoApprove — owner content autonomy 'auto'", () => {
  // Autonomy on, but NO streak/threshold: the owner opted into hands-off routine updates.
  const optedIn = { id: "gldf", autoApproveThreshold: 0 } as unknown as TenantConfig;
  beforeEach(() => {
    mockGet.mockImplementation((k: string) => (k.includes("content-autonomy") ? "auto" : 0));
  });

  it("publishes a low-risk copy edit with no streak needed", async () => {
    const out = await maybeAutoApprove(optedIn, "contact", review("factual_auto"));
    expect(out).toMatchObject({ action: "publish", reasonCode: "auto_approved" });
  });

  it("STILL never publishes a high_risk_facts change on auto (hours/prices/booking stay gated)", async () => {
    const out = await maybeAutoApprove(optedIn, "contact", review("high_risk_facts"));
    expect(out.action).toBe("review");
  });

  it("STILL never publishes a non-low-risk section on auto", async () => {
    const out = await maybeAutoApprove(optedIn, "hero", review("marketing_copy"));
    expect(out.action).toBe("review");
  });
});

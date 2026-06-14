import { describe, expect, it } from "vitest";
import { buildAttentionFromSnapshot } from "@/lib/attention";
import type { PortfolioSnapshot } from "@/lib/portfolio";

function snapshot(overrides: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  return {
    snapshotAt: "2026-06-14T00:00:00Z",
    tenantCount: 0,
    activeTenantCount: 0,
    archivedTenantCount: 0,
    mrr: 0,
    launchReadyCount: 0,
    launchWatchCount: 0,
    launchBlockedCount: 0,
    totalDrafts: 0,
    ops: {
      timestamp: "t",
      activeTenants: 0,
      metrics: {
        webhookFailures: 0,
        revalidationFailures: 0,
        staleSmsApprovals: 0,
        pendingEvents: {},
        totalPendingEvents: 0,
        failedAiWrites: 0,
        tenantDomainDrift: [],
      },
      revalidationFailures: [],
    },
    tenants: [],
    ...overrides,
  };
}

function tenant(over: Partial<PortfolioSnapshot["tenants"][number]>) {
  return {
    id: "t",
    siteName: "T",
    ownerName: "o",
    active: true,
    deliveryModel: "custom_repo" as const,
    launchStatus: "ready" as const,
    launchScore: 100,
    launchCompleted: 8,
    launchTotal: 8,
    subscriptionStatus: "none",
    draftCount: 0,
    threadCount: 0,
    hasOwnerMessage: false,
    hasWeeklyBrief: false,
    lastActivity: null,
    ...over,
  };
}

describe("buildAttentionFromSnapshot", () => {
  it("returns nothing for a clean portfolio", () => {
    const b = buildAttentionFromSnapshot(snapshot());
    expect(b.items).toHaveLength(0);
    expect(b.counts).toEqual({ high: 0, medium: 0, low: 0 });
  });

  it("flags launch-blocked tenants as high", () => {
    const b = buildAttentionFromSnapshot(
      snapshot({ tenants: [tenant({ id: "acme", siteName: "Acme", launchStatus: "blocked", launchScore: 40 })] })
    );
    expect(b.counts.high).toBe(1);
    expect(b.items[0]).toMatchObject({ severity: "high", kind: "launch", tenant: "acme" });
  });

  it("ranks ops breakage by severity and sorts high first", () => {
    const b = buildAttentionFromSnapshot(
      snapshot({
        ops: {
          timestamp: "t",
          activeTenants: 1,
          metrics: {
            webhookFailures: 2,
            revalidationFailures: 1,
            staleSmsApprovals: 0,
            pendingEvents: {},
            totalPendingEvents: 0,
            failedAiWrites: 3,
            tenantDomainDrift: ["x.com: drift"],
          },
          revalidationFailures: [],
        },
      })
    );
    // high: webhook + revalidation = 2; medium: failedAiWrites + domainDrift = 2
    expect(b.counts.high).toBe(2);
    expect(b.counts.medium).toBe(2);
    expect(b.items[0].severity).toBe("high");
    expect(b.items[b.items.length - 1].severity).toBe("medium");
  });

  it("rates draft backlogs by size (>=3 medium, else low)", () => {
    const b = buildAttentionFromSnapshot(
      snapshot({
        tenants: [
          tenant({ id: "a", draftCount: 4 }),
          tenant({ id: "b", draftCount: 1 }),
        ],
      })
    );
    const drafts = b.items.filter((i) => i.kind === "drafts");
    expect(drafts.find((d) => d.tenant === "a")?.severity).toBe("medium");
    expect(drafts.find((d) => d.tenant === "b")?.severity).toBe("low");
  });
});

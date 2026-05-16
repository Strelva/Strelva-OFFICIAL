import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetActivity = vi.hoisted(() => vi.fn());
const mockGetClickCounts = vi.hoisted(() => vi.fn());
const mockGetLastClickDate = vi.hoisted(() => vi.fn());
const mockAddEvent = vi.hoisted(() => vi.fn());
const mockGetEvents = vi.hoisted(() => vi.fn());

const clickCounts = vi.hoisted(() => new Map<string, {
  total: number;
  today: number;
  thisWeek: number;
  lastWeek: number;
}>());

vi.mock("@/lib/storage", () => ({
  getActivity: (...args: unknown[]) => mockGetActivity(...args),
  getClickCounts: (...args: unknown[]) => mockGetClickCounts(...args),
  getLastClickDate: (...args: unknown[]) => mockGetLastClickDate(...args),
}));

vi.mock("@/lib/events", () => ({
  addEvent: (...args: unknown[]) => mockAddEvent(...args),
  getEvents: (...args: unknown[]) => mockGetEvents(...args),
}));

function setCount(event: string, thisWeek: number, total = thisWeek) {
  clickCounts.set(event, {
    total,
    today: thisWeek,
    thisWeek,
    lastWeek: 0,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-16T12:00:00.000Z"));
  vi.clearAllMocks();
  clickCounts.clear();
  for (const event of [
    "page-view",
    "dashboard-open",
    "ai-chat-open",
    "report-view",
    "referral-click",
  ]) {
    setCount(event, 0);
  }
  mockGetClickCounts.mockImplementation((event: string) =>
    Promise.resolve(clickCounts.get(event) ?? { total: 0, today: 0, thisWeek: 0, lastWeek: 0 }),
  );
  mockGetActivity.mockResolvedValue([]);
  mockGetLastClickDate.mockResolvedValue(null);
  mockGetEvents.mockResolvedValue([]);
  mockAddEvent.mockImplementation((event) =>
    Promise.resolve({
      ...event,
      id: "evt_123",
      createdAt: new Date().toISOString(),
    }),
  );
});

describe("owner retention signals", () => {
  it("combines AI activity, traffic, and engagement signals for a healthy owner", async () => {
    setCount("page-view", 18, 80);
    setCount("dashboard-open", 3, 9);
    setCount("ai-chat-open", 2, 5);
    setCount("report-view", 1, 3);
    setCount("referral-click", 1, 1);
    mockGetActivity.mockResolvedValue([
      {
        text: "AI updated services",
        time: "2026-05-16T09:00:00.000Z",
        type: "ai",
        actor: "ai",
      },
    ]);
    mockGetLastClickDate.mockResolvedValue("2026-05-16");

    const { getOwnerRetentionSignals } = await import("@/lib/retention");
    const signals = await getOwnerRetentionSignals("gldf");

    expect(signals).toMatchObject({
      aiChangesThisWeek: 1,
      trafficAfterAiUpdates: 18,
      dashboardOpensThisWeek: 3,
      aiChatOpensThisWeek: 2,
      reportViewsThisWeek: 1,
      referralsThisWeek: 1,
      engagementSignalsThisWeek: 7,
      noAiUsageDays: 0,
      noDashboardOpenDays: 0,
      churnRisk: "healthy",
    });
  });

  it("flags re-engagement when AI usage has been quiet for 14 days", async () => {
    setCount("dashboard-open", 2, 5);
    setCount("report-view", 1, 2);
    mockGetActivity.mockResolvedValue([
      {
        text: "AI updated hours",
        time: "2026-05-02T10:00:00.000Z",
        type: "ai",
        actor: "ai",
      },
    ]);
    mockGetLastClickDate.mockResolvedValue("2026-05-16");

    const { getOwnerRetentionSignals } = await import("@/lib/retention");
    const signals = await getOwnerRetentionSignals("gldf");

    expect(signals.churnRisk).toBe("reengage");
    expect(signals.riskReason).toBe("No AI changes in 14 days");
    expect(signals.nextAction).toContain("plain-English prompt");
    expect(signals.ownerNextAction).toContain("Ask the AI");
  });

  it("queues and dedupes retention re-engagement suggestions", async () => {
    mockGetActivity.mockResolvedValue([
      {
        text: "AI refreshed homepage copy",
        time: "2026-05-01T09:00:00.000Z",
        type: "ai",
        actor: "ai",
      },
    ]);
    mockGetLastClickDate.mockResolvedValue("2026-05-01");

    const { queueRetentionReengagement } = await import("@/lib/retention");
    await expect(queueRetentionReengagement("gldf")).resolves.toMatchObject({
      queued: true,
      risk: "reengage",
      reason: "No AI changes in 15 days",
    });
    expect(mockAddEvent).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "gldf",
      source: "ai",
      type: "suggestion",
      title: "Make one quick site update this week",
      metadata: expect.objectContaining({
        kind: "retention_reengagement",
        risk: "reengage",
      }),
    }));

    mockAddEvent.mockClear();
    mockGetEvents.mockResolvedValue([
      {
        id: "evt_existing",
        tenantId: "gldf",
        source: "ai",
        type: "suggestion",
        title: "Make one quick site update this week",
        body: "Already queued",
        status: "pending",
        createdAt: "2026-05-15T12:00:00.000Z",
        metadata: { kind: "retention_reengagement" },
      },
    ]);

    await expect(queueRetentionReengagement("gldf")).resolves.toMatchObject({
      queued: false,
      risk: "reengage",
      reason: "Recent re-engagement suggestion already exists",
    });
    expect(mockAddEvent).not.toHaveBeenCalled();
  });
});

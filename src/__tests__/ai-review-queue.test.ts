import { afterEach, describe, expect, it, vi } from "vitest";

const mockRedis = {
  zadd: vi.fn(),
  set: vi.fn(),
};
let redisClient: typeof mockRedis | null = mockRedis;

vi.mock("../lib/redis", () => ({
  getRedis: () => redisClient,
}));

import { queueAiContentReview } from "../lib/ai-review-queue";
import { addEvent, EventPersistenceError } from "../lib/events";

describe("AI review queue persistence", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    redisClient = mockRedis;
  });

  it("creates a durable pending event for high-risk AI content and does not publish", async () => {
    mockRedis.zadd.mockResolvedValue(1);
    mockRedis.set.mockResolvedValue("OK");

    const event = await queueAiContentReview({
      tenantId: "tenant-a",
      section: "services",
      currentData: {
        services: [{ id: "svc_1", name: "Consult", price: "100" }],
      },
      proposedData: {
        services: [{ id: "svc_1", name: "Consult", price: "1" }],
      },
      diffs: [
        {
          field: "services.0.price",
          before: "100",
          after: "1",
          type: "changed",
        },
      ],
      risk: {
        level: "high",
        reason: "Price changed.",
        requiresPreview: true,
        autoApply: false,
      },
      governance: {
        action: "review",
        reason: "High-risk business details require review.",
        reasonCode: "high_risk_facts",
      },
    });

    expect(event.status).toBe("pending");
    expect(event.type).toBe("content_update");
    expect(event.metadata?.kind).toBe("agent_preview");
    expect(event.metadata?.proposedData).toEqual({
      services: [{ id: "svc_1", name: "Consult", price: "1" }],
    });
    expect(mockRedis.zadd).toHaveBeenCalledOnce();
    expect(mockRedis.set).toHaveBeenCalledOnce();
  });

  it("fails closed for pending AI events in production when Redis is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    redisClient = null;

    await expect(
      addEvent({
        tenantId: "tenant-a",
        source: "ai",
        type: "newsletter_draft",
        title: "Newsletter draft",
        body: "Review this before sending.",
        status: "pending",
      })
    ).rejects.toBeInstanceOf(EventPersistenceError);
  });

  it("still allows non-critical best-effort events outside production", async () => {
    redisClient = null;

    await expect(
      addEvent({
        tenantId: "tenant-a",
        source: "website",
        type: "message",
        title: "Contact form",
        body: "Hello",
        status: "auto_approved",
      })
    ).resolves.toMatchObject({ title: "Contact form" });
  });
});

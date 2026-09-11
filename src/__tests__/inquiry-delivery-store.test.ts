import { describe, expect, it, vi } from "vitest";
import { createRedisInquiryDeliveryStore } from "@/products/inquiries/delivery-store";
import type { InquiryDeliveryCheckpoint } from "@/products/inquiries/delivery-types";

const accepted: InquiryDeliveryCheckpoint = {
  tenantId: "tenant-a",
  inquiryId: "inquiry-a",
  action: "reply",
  status: "accepted",
  attemptId: "attempt-a",
  attempts: 1,
  startedAt: "2026-09-11T12:00:00.000Z",
  acceptedAt: "2026-09-11T12:00:01.000Z",
  providerMessageId: "provider-a",
};

function checkpointRedis(outcome?: "bounced" | "suppressed") {
  let state: InquiryDeliveryCheckpoint = structuredClone(accepted);
  let firstRead = true;
  const providerWinner: InquiryDeliveryCheckpoint | null = outcome ? {
    ...accepted,
    status: outcome,
    providerOutcome: outcome,
    providerEventId: `event-${outcome}`,
    providerEventAt: "2026-09-11T12:00:02.000Z",
    failureReason: `provider_${outcome}`,
    retryable: false,
  } : null;
  const redis = {
    get: vi.fn(async () => {
      const result = structuredClone(state);
      if (firstRead && providerWinner) {
        firstRead = false;
        state = structuredClone(providerWinner);
      }
      return result;
    }),
    set: vi.fn(async (_key: string, value: unknown) => { state = structuredClone(value as InquiryDeliveryCheckpoint); return "OK"; }),
    del: vi.fn(async () => 1),
    zadd: vi.fn(async () => 1),
    zrange: vi.fn(async () => []),
    eval: vi.fn(async (_script: string, _keys: string[], args: string[]) => {
      if (state.attemptId !== args[1] || !["accepted", "accepted_unverified"].includes(state.status)) return JSON.stringify(state);
      state = JSON.parse(args[0]!) as InquiryDeliveryCheckpoint;
      return JSON.stringify(state);
    }),
  };
  return { redis, getState: () => structuredClone(state) };
}

describe("inquiry delivery checkpoint transitions", () => {
  it("commits verified and accepted-unverified states when the accepted attempt is unchanged", async () => {
    const verifiedState = checkpointRedis();
    const verifiedStore = createRedisInquiryDeliveryStore(verifiedState.redis as never);
    await expect(verifiedStore.markVerified({
      tenantId: accepted.tenantId,
      inquiryId: accepted.inquiryId,
      action: accepted.action,
      attemptId: accepted.attemptId,
      evidence: ["readback verified"],
    })).resolves.toMatchObject({ status: "verified", verificationEvidence: ["readback verified"] });

    const unverifiedState = checkpointRedis();
    const unverifiedStore = createRedisInquiryDeliveryStore(unverifiedState.redis as never);
    await expect(unverifiedStore.markAcceptedUnverified({
      tenantId: accepted.tenantId,
      inquiryId: accepted.inquiryId,
      action: accepted.action,
      attemptId: accepted.attemptId,
      reason: "readback unavailable",
    })).resolves.toMatchObject({ status: "accepted_unverified", verificationReason: "readback unavailable" });
  });

  it("does not let verification overwrite a bounce from the same accepted attempt", async () => {
    const race = checkpointRedis("bounced");
    const store = createRedisInquiryDeliveryStore(race.redis as never);

    await expect(store.markVerified({
      tenantId: accepted.tenantId,
      inquiryId: accepted.inquiryId,
      action: accepted.action,
      attemptId: accepted.attemptId,
      evidence: ["readback verified"],
    })).rejects.toThrow("inquiry_delivery_attempt_mismatch");

    expect(race.getState()).toMatchObject({ status: "bounced", providerEventId: "event-bounced" });
    expect(race.redis.set).not.toHaveBeenCalled();
  });

  it("does not let an unverified marker overwrite provider suppression", async () => {
    const race = checkpointRedis("suppressed");
    const store = createRedisInquiryDeliveryStore(race.redis as never);

    await expect(store.markAcceptedUnverified({
      tenantId: accepted.tenantId,
      inquiryId: accepted.inquiryId,
      action: accepted.action,
      attemptId: accepted.attemptId,
      reason: "readback unavailable",
    })).rejects.toThrow("inquiry_delivery_attempt_mismatch");

    expect(race.getState()).toMatchObject({ status: "suppressed", providerEventId: "event-suppressed" });
    expect(race.redis.set).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import {
  APP_EVENT_LABELS,
  APP_EVENT_SCOPE,
  APP_EVENT_TYPES,
  appEventDataSchemas,
  appEventsCommandSchema,
  appEventSchema,
  appEventSubscriptionSchema,
  appSubscriberKey,
  backoffSeconds,
  parseAppEventData,
  parseSubscriberKey,
  webhookSubscriberKey,
} from "@/platform/app-events";

const UUID = "28100000-0000-4000-8000-000000000010";

const SAMPLES: Record<(typeof APP_EVENT_TYPES)[number], Record<string, unknown>> = {
  "inquiry.received": { inquiryId: "lead_a", channel: "dual_write", source: "contact", capabilityId: null, capabilityVersion: null, capturedAt: "2026-10-15T10:00:00Z", released: false },
  "booking.made": { bookingId: UUID, systemId: null, origin: "site", fromStatus: null, toStatus: "requested", actor: "visitor", rescheduled: false, startAt: "2026-10-17T10:00:00Z", endAt: "2026-10-17T10:30:00Z", timeZone: "America/New_York", serviceName: "Consultation" },
  "booking.changed": { bookingId: UUID, systemId: UUID, origin: "site", fromStatus: "requested", toStatus: "confirmed", actor: "owner", rescheduled: false, startAt: "2026-10-17T10:00:00Z", endAt: "2026-10-17T10:30:00Z", timeZone: "America/New_York", serviceName: "Consultation" },
  "fact.changed": { entity: "fact", key: "phone", change: "updated", source: "owner", verified: true, pendingOwner: true },
  "fact.confirmed": { entity: "service", entityId: UUID, confirmedByKind: "owner_write", decisionId: null, confirmedAt: "2026-10-15T10:00:00Z" },
  "release.recorded": { systemId: UUID, systemKind: "website", number: 2, summary: null, implementationKind: "website", current: false },
  "change.verified": { source: "website_code", systemId: UUID, requestId: null, receiptId: null, releaseId: UUID, commitSha: "abcdef1", readBack: "confirmed" },
  "review.posted": { reviewId: UUID, source: "google", rating: 5, hasReply: false },
  "connection.changed": { provider: "google", bindingId: UUID, change: "needs_reconnect", status: "needs_reauth" },
  "owner.decided": { decisionId: UUID, changeKind: "system.go_live", state: "approved", route: "owner_decides", decidedByKind: "owner_session", systemId: UUID, sourceLifecycle: "system_release" },
};

describe("Event contracts", () => {
  it("names ten types, each with a scope and a label", () => {
    expect(APP_EVENT_TYPES).toHaveLength(10);
    for (const type of APP_EVENT_TYPES) {
      expect(APP_EVENT_SCOPE[type], type).toBeTruthy();
      expect(APP_EVENT_LABELS[type], type).toBeTruthy();
    }
    expect(APP_EVENT_SCOPE["booking.made"]).toBe("bookings");
    expect(APP_EVENT_SCOPE["fact.confirmed"]).toBe("business_record");
  });

  it("accepts each documented payload and rejects an extra key such as email", () => {
    for (const type of APP_EVENT_TYPES) {
      const sample = SAMPLES[type];
      expect(appEventDataSchemas[type].safeParse(sample).success, type).toBe(true);
      expect(appEventDataSchemas[type].safeParse({ ...sample, email: "a@b.test" }).success, `${type} + email`).toBe(false);
    }
    expect(parseAppEventData({ type: "review.posted", data: SAMPLES["review.posted"] }).rating).toBe(5);
    expect(() => parseAppEventData({ type: "review.posted", data: { reviewId: "x" } })).toThrow();
  });

  it("parses the event envelope strictly", () => {
    const event = { id: UUID, workspaceId: UUID, sequence: 1, type: "booking.made", schemaVersion: 1, subject: { kind: "booking", id: UUID }, area: "bookings", occurredAt: "2026-10-15T10:00:00+00:00", recordedAt: "2026-10-15T10:00:00+00:00", data: SAMPLES["booking.made"] };
    expect(appEventSchema.safeParse(event).success).toBe(true);
    expect(appEventSchema.safeParse({ ...event, sequence: 0 }).success).toBe(false);
    expect(appEventSchema.safeParse({ ...event, type: "booking.deleted" }).success).toBe(false);
    expect(appEventSchema.safeParse({ ...event, extra: 1 }).success).toBe(false);
  });

  it("backs off 1, 5, 15 minutes and so on, held at twelve hours", () => {
    expect(backoffSeconds(1)).toBe(60);
    expect(backoffSeconds(2)).toBe(300);
    expect(backoffSeconds(7)).toBe(43200);
    expect(backoffSeconds(20)).toBe(43200);
    expect(backoffSeconds(0)).toBe(60);
  });

  it("round-trips subscriber keys and refuses malformed ones", () => {
    expect(parseSubscriberKey(appSubscriberKey("internal_tools", "digest_week"))).toEqual({ kind: "app", appId: "internal_tools", handler: "digest_week" });
    expect(parseSubscriberKey(webhookSubscriberKey(UUID))).toEqual({ kind: "webhook", endpointId: UUID });
    for (const bad of ["", "app:", "app:bookings", "app:Bookings:x", "app:bookings:9x", "webhook:nope", "webhook:ABCDEF00-0000-4000-8000-000000000010", "other:bookings:x"]) {
      expect(parseSubscriberKey(bad), bad).toBeNull();
    }
  });

  it("limits subscription handler keys and attempts", () => {
    const ok = { event: "booking.made", handler: "stop_follow_ups", scope: "bookings" };
    expect(appEventSubscriptionSchema.safeParse(ok).success).toBe(true);
    expect(appEventSubscriptionSchema.safeParse({ ...ok, handler: "Bad-Key" }).success).toBe(false);
    expect(appEventSubscriptionSchema.safeParse({ ...ok, maxAttempts: 13 }).success).toBe(false);
    expect(appEventSubscriptionSchema.safeParse({ ...ok, extra: true }).success).toBe(false);
  });

  it("accepts https webhook commands only and a known event type", () => {
    const base = { action: "create_webhook", workspaceId: UUID, url: "https://maker.example.test/events", eventTypes: ["booking.made"] };
    expect(appEventsCommandSchema.safeParse(base).success).toBe(true);
    expect(appEventsCommandSchema.safeParse({ ...base, agencyWorkspaceId: UUID }).success).toBe(true);
    expect(appEventsCommandSchema.safeParse({ ...base, url: "http://maker.example.test/events" }).success).toBe(false);
    expect(appEventsCommandSchema.safeParse({ ...base, eventTypes: ["booking.deleted"] }).success).toBe(false);
    expect(appEventsCommandSchema.safeParse({ ...base, eventTypes: [] }).success).toBe(false);
    expect(appEventsCommandSchema.safeParse({ action: "retry", workspaceId: UUID, deadLetterId: UUID }).success).toBe(true);
    expect(appEventsCommandSchema.safeParse({ action: "set_webhook", workspaceId: UUID, endpointId: UUID, status: "deleted" }).success).toBe(false);
    expect(appEventsCommandSchema.safeParse({ action: "rotate_webhook_secret", workspaceId: UUID, endpointId: UUID }).success).toBe(true);
  });
});

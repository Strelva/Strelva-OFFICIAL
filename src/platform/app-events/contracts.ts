import { z } from "zod";

/**
 * Events Apps receive. Browser-safe: imports only zod, and never app-releases
 * (app-releases imports this file for the subscription type).
 * An Event is something that happened at a business, recorded in order with ids
 * and states only. It carries no customer details.
 */

export const APP_EVENT_TYPES = [
  "inquiry.received",
  "booking.made",
  "booking.changed",
  "fact.changed",
  "fact.confirmed",
  "release.recorded",
  "change.verified",
  "review.posted",
  "connection.changed",
  "owner.decided",
] as const;
export type AppEventType = (typeof APP_EVENT_TYPES)[number];
export const appEventTypeSchema = z.enum(APP_EVENT_TYPES);

/** The data area an Event belongs to. A subscription must name the scope of the Event it handles. */
export const APP_EVENT_SCOPES = ["inquiries", "bookings", "business_record", "systems", "reviews", "connections", "decisions"] as const;
export type AppEventScope = (typeof APP_EVENT_SCOPES)[number];
export const appEventScopeSchema = z.enum(APP_EVENT_SCOPES);

export const APP_EVENT_SCOPE: Record<AppEventType, AppEventScope> = {
  "inquiry.received": "inquiries",
  "booking.made": "bookings",
  "booking.changed": "bookings",
  "fact.changed": "business_record",
  "fact.confirmed": "business_record",
  "release.recorded": "systems",
  "change.verified": "systems",
  "review.posted": "reviews",
  "connection.changed": "connections",
  "owner.decided": "decisions",
};

export const APP_EVENT_LABELS: Record<AppEventType, string> = {
  "inquiry.received": "Inquiry received",
  "booking.made": "Booking made",
  "booking.changed": "Booking changed",
  "fact.changed": "Business detail changed",
  "fact.confirmed": "Business detail confirmed",
  "release.recorded": "Release recorded",
  "change.verified": "Change checked on the live site",
  "review.posted": "Review posted",
  "connection.changed": "Connection changed",
  "owner.decided": "Owner decided",
};

export const APP_EVENT_SUBJECT_KINDS = ["inquiry", "booking", "fact", "service", "system", "review", "connection", "decision"] as const;
export const APP_EVENT_AREAS = ["website", "inquiries", "bookings", "google", "internal_tools"] as const;

export const appEventSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sequence: z.number().int().positive(),
  type: appEventTypeSchema,
  schemaVersion: z.literal(1),
  subject: z.object({ kind: z.enum(APP_EVENT_SUBJECT_KINDS), id: z.string().min(1).max(300) }).strict(),
  area: z.enum(APP_EVENT_AREAS).nullable(),
  occurredAt: z.string(),
  recordedAt: z.string(),
  data: z.record(z.string(), z.unknown()),
}).strict();
export type AppEvent = z.infer<typeof appEventSchema>;

const str = z.string();
const strNull = z.string().nullable();

/** One strict object per type, with exactly the payload keys the database writes (20261028100100). */
export const appEventDataSchemas = {
  "inquiry.received": z.object({
    inquiryId: str, channel: str, source: strNull, capabilityId: strNull, capabilityVersion: z.number().int().nullable(),
    capturedAt: str, released: z.boolean(),
  }).strict(),
  "booking.made": z.object({
    bookingId: str, systemId: strNull, origin: str, fromStatus: strNull, toStatus: str, actor: str, rescheduled: z.boolean(),
    startAt: str, endAt: str, timeZone: str, serviceName: str,
  }).strict(),
  "booking.changed": z.object({
    bookingId: str, systemId: strNull, origin: str, fromStatus: strNull, toStatus: str, actor: str, rescheduled: z.boolean(),
    startAt: str, endAt: str, timeZone: str, serviceName: str,
  }).strict(),
  "fact.changed": z.union([
    z.object({
      entity: z.literal("fact"), key: str, change: z.enum(["added", "updated", "removed"]), source: str, verified: z.boolean(), pendingOwner: z.literal(true),
    }).strict(),
    z.object({
      entity: z.literal("service"), serviceId: str, change: z.enum(["added", "updated", "removed"]), source: str, verified: z.boolean(), active: z.boolean(),
    }).strict(),
  ]),
  "fact.confirmed": z.object({
    entity: z.enum(["fact", "service"]), entityId: str, confirmedByKind: str, decisionId: strNull, confirmedAt: str,
  }).strict(),
  "release.recorded": z.object({
    systemId: str, systemKind: str, number: z.number().int(), summary: strNull, implementationKind: strNull, current: z.boolean().nullable(),
  }).strict(),
  "change.verified": z.object({
    source: z.enum(["website_change", "website_code"]), systemId: str, requestId: strNull, receiptId: strNull, releaseId: strNull,
    commitSha: strNull, readBack: z.enum(["confirmed", "not_confirmed"]),
  }).strict(),
  "review.posted": z.object({ reviewId: str, source: str, rating: z.number().int().nullable(), hasReply: z.boolean() }).strict(),
  "connection.changed": z.union([
    z.object({ provider: z.literal("google"), bindingId: str, change: z.enum(["connected", "needs_reconnect", "disconnected", "error"]), status: str }).strict(),
    z.object({
      provider: z.literal("connected_site"), connectedSiteId: str, siteHost: str, change: z.enum(["connected", "verified", "disconnected"]), status: str,
    }).strict(),
    z.object({
      provider: str, ref: str, change: z.literal("holder_recorded"), accountHolderKind: strNull, accessThroughKind: strNull,
    }).strict(),
  ]),
  "owner.decided": z.object({
    decisionId: str, changeKind: str, state: z.enum(["approved", "declined"]), route: str, decidedByKind: strNull, systemId: strNull, sourceLifecycle: str,
  }).strict(),
} as const satisfies Record<AppEventType, z.ZodTypeAny>;

export type AppEventData<T extends AppEventType = AppEventType> = z.infer<(typeof appEventDataSchemas)[T]>;

/** Parse an Event's data by its type. Throws when the payload is not the shape the database writes. */
export function parseAppEventData<T extends AppEventType>(event: { type: T; data: unknown }): AppEventData<T> {
  return appEventDataSchemas[event.type].parse(event.data) as AppEventData<T>;
}

export interface AppEventSubscription {
  event: AppEventType;
  /** The handler key an App registers at src/server/app-events/handlers.ts. */
  handler: string;
  /** Must equal APP_EVENT_SCOPE[event]. */
  scope: AppEventScope;
  /** Failed deliveries to try before the Event is set aside. Default APP_EVENT_MAX_ATTEMPTS. */
  maxAttempts?: number;
}
export const appEventSubscriptionSchema = z.object({
  event: appEventTypeSchema,
  handler: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
  scope: appEventScopeSchema,
  maxAttempts: z.number().int().min(1).max(12).optional(),
}).strict();

export const APP_EVENT_MAX_ATTEMPTS = 8;
export const APP_EVENT_BACKOFF_SECONDS = [60, 300, 900, 3600, 10800, 21600, 43200] as const;
/** Seconds to wait after the nth failed attempt (1-based), held at the last step. */
export function backoffSeconds(attempt: number): number {
  const index = Math.min(Math.max(Math.trunc(attempt), 1) - 1, APP_EVENT_BACKOFF_SECONDS.length - 1);
  return APP_EVENT_BACKOFF_SECONDS[index]!;
}

export function appSubscriberKey(appId: string, handler: string): string {
  return `app:${appId}:${handler}`;
}
export function webhookSubscriberKey(endpointId: string): string {
  return `webhook:${endpointId}`;
}
export type ParsedSubscriberKey = { kind: "app"; appId: string; handler: string } | { kind: "webhook"; endpointId: string };
export function parseSubscriberKey(key: string): ParsedSubscriberKey | null {
  const app = /^app:([a-z_]{2,40}):([a-z][a-z0-9_]{1,39})$/.exec(key);
  if (app) return { kind: "app", appId: app[1]!, handler: app[2]! };
  const hook = /^webhook:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(key);
  if (hook) return { kind: "webhook", endpointId: hook[1]! };
  return null;
}

// Views: what the database returns to a person (20261028100000, read_app_event_deliveries).

export const appEventLaneViewSchema = z.object({
  subscriber: str,
  deliveredThrough: z.number().int(),
  behind: z.number().int(),
  attempts: z.number().int(),
  nextAttemptAt: str,
  lastError: strNull,
}).strict();
export type AppEventLaneView = z.infer<typeof appEventLaneViewSchema>;

export const appEventDeadLetterViewSchema = z.object({
  id: z.string().uuid(),
  subscriber: str,
  eventId: z.string().uuid().nullable(),
  type: appEventTypeSchema,
  sequence: z.number().int(),
  subjectKind: str,
  occurredAt: str,
  attempts: z.number().int(),
  lastError: strNull,
  deadAt: str,
  replayRequestedAt: strNull,
  replayedAt: strNull,
  replayOutcome: z.enum(["delivered", "failed"]).nullable(),
}).strict();
export type AppEventDeadLetterView = z.infer<typeof appEventDeadLetterViewSchema>;

export const APP_EVENT_ENDPOINT_STATUSES = ["active", "paused", "disabled"] as const;
export const appEventEndpointViewSchema = z.object({
  id: z.string().uuid(),
  url: str,
  eventTypes: z.array(appEventTypeSchema),
  status: z.enum(APP_EVENT_ENDPOINT_STATUSES),
  disabledReason: z.enum(["gone", "authority_removed", "by_person"]).nullable(),
  secretHint: str,
  createdByKind: z.enum(["business", "agency"]),
  agencyName: strNull,
  createdAt: str,
}).strict();
export type AppEventEndpointView = z.infer<typeof appEventEndpointViewSchema>;

export const appEventDeliveriesViewSchema = z.object({
  workspaceId: z.string().uuid(),
  viewer: z.object({ kind: z.enum(["business", "agency", "operator"]), canChange: z.boolean() }).strict(),
  captureOn: z.boolean(),
  stream: z.object({ lastSequence: z.number().int(), lastEventAt: strNull }).strict(),
  counts: z.array(z.object({ type: appEventTypeSchema, count: z.number().int() }).strict()),
  lanes: z.array(appEventLaneViewSchema),
  deadLetters: z.array(appEventDeadLetterViewSchema),
  endpoints: z.array(appEventEndpointViewSchema),
}).strict();
export type AppEventDeliveriesView = z.infer<typeof appEventDeliveriesViewSchema>;

export const appEventAgentReadSchema = z.object({
  events: z.array(appEventSchema),
  nextAfter: z.number().int().min(0),
  lastSequence: z.number().int().min(0),
  captureOn: z.boolean(),
}).strict();
export type AppEventAgentRead = z.infer<typeof appEventAgentReadSchema>;

export const appEventHealthSchema = z.object({
  captureOn: z.boolean(),
  lanesBehind: z.number().int(),
  lanesRetrying: z.number().int(),
  deadLast24h: z.number().int(),
  emitFailuresLast24h: z.number().int(),
  oldestUndeliveredAt: strNull,
}).strict();
export type AppEventHealth = z.infer<typeof appEventHealthSchema>;

export const appEventCaptureSchema = z.object({ capture: z.boolean(), changedAt: strNull, reason: strNull }).strict();
export type AppEventCapture = z.infer<typeof appEventCaptureSchema>;

// Commands a person sends from the agency or business screen.

const commandScope = {
  workspaceId: z.string().uuid(),
  agencyWorkspaceId: z.string().uuid().nullish(),
};
const httpsUrl = z.string().trim().max(500).refine((value) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "Use an https address.");

export const appEventsCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry"), deadLetterId: z.string().uuid(), ...commandScope }).strict(),
  z.object({ action: z.literal("create_webhook"), url: httpsUrl, eventTypes: z.array(appEventTypeSchema).min(1).max(10), ...commandScope }).strict(),
  z.object({ action: z.literal("set_webhook"), endpointId: z.string().uuid(), status: z.enum(APP_EVENT_ENDPOINT_STATUSES), ...commandScope }).strict(),
  z.object({ action: z.literal("rotate_webhook_secret"), endpointId: z.string().uuid(), ...commandScope }).strict(),
]);
export type AppEventsCommand = z.infer<typeof appEventsCommandSchema>;

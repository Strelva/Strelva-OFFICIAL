import { z } from "zod";

export const calendarProviderSchema = z.enum(["outlook", "google"]);
export type CalendarProvider = z.infer<typeof calendarProviderSchema>;

export const calendarReminderPolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("off") }).strict(),
  z.object({ mode: z.literal("provider_default") }).strict(),
  z.object({ mode: z.literal("provider_minutes"), minutes: z.number().int().min(0).max(40320) }).strict(),
]);
export type CalendarReminderPolicy = z.infer<typeof calendarReminderPolicySchema>;

export const calendarConnectionStatusSchema = z.enum(["authorized", "connected", "revoked", "error"]);
export type CalendarConnectionStatus = z.infer<typeof calendarConnectionStatusSchema>;

export const calendarConnectionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  provider: calendarProviderSchema,
  calendarId: z.string().min(1).max(512),
  calendarName: z.string().min(1).max(200),
  timeZone: z.string().min(1).max(128),
  status: calendarConnectionStatusSchema,
  scopes: z.array(z.string().min(1).max(256)).max(40),
  reminderPolicy: calendarReminderPolicySchema,
  tokenExpiresAt: z.string().datetime({ offset: true }).nullable(),
  lastCheckedAt: z.string().datetime({ offset: true }).nullable(),
  lastError: z.string().max(1000).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();
export type CalendarConnection = z.infer<typeof calendarConnectionSchema>;

export const calendarConnectionInputSchema = z.object({
  provider: calendarProviderSchema,
  calendarId: z.string().trim().min(1).max(512),
  calendarName: z.string().trim().min(1).max(200),
  timeZone: z.string().trim().min(1).max(128),
  reminderPolicy: calendarReminderPolicySchema.default({ mode: "off" }),
}).strict();
export type CalendarConnectionInput = z.infer<typeof calendarConnectionInputSchema>;

export const calendarIntervalSchema = z.object({
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
}).refine(value => Date.parse(value.end) > Date.parse(value.start), "End must follow start");
export type CalendarInterval = z.infer<typeof calendarIntervalSchema>;

export const calendarBusyIntervalSchema = calendarIntervalSchema.extend({
  sourceId: z.string().min(1).max(512).optional(),
});
export type CalendarBusyInterval = z.infer<typeof calendarBusyIntervalSchema>;

export const calendarEventInputSchema = calendarIntervalSchema.extend({
  title: z.string().trim().min(1).max(160),
  calendarId: z.string().min(1).max(512),
  timeZone: z.string().min(1).max(128),
  idempotencyKey: z.string().trim().min(8).max(256),
  eventId: z.string().min(1).max(1024).optional(),
  versionTag: z.string().min(1).max(1024).optional(),
  reminderPolicy: calendarReminderPolicySchema,
}).strict();
export type CalendarEventInput = z.infer<typeof calendarEventInputSchema>;

export const calendarEventLookupSchema = z.object({
  calendarId: z.string().min(1).max(512),
  eventId: z.string().min(1).max(1024).optional(),
  versionTag: z.string().min(1).max(1024).optional(),
}).strict();

export const calendarIdempotencyLookupSchema = z.object({
  calendarId: z.string().min(1).max(512),
  idempotencyKey: z.string().trim().min(8).max(256),
  timeZone: z.string().min(1).max(128),
}).strict();

export const calendarEventSchema = calendarIntervalSchema.extend({
  id: z.string().min(1).max(1024),
  title: z.string().min(1).max(160),
  calendarId: z.string().min(1).max(512),
  timeZone: z.string().min(1).max(128),
  versionTag: z.string().min(1).max(1024).optional(),
  observedAt: z.string().datetime({ offset: true }),
}).strict();
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const calendarAvailabilityQuerySchema = calendarIntervalSchema.extend({
  calendarId: z.string().min(1).max(512),
  timeZone: z.string().min(1).max(128),
  ignoredEventId: z.string().min(1).max(1024).optional(),
}).strict();

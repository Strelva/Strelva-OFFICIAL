import { z } from "zod";

const interval = z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) }).strict();
/** Proposed service terms, not claims about a provider's live availability. */
export const askBookingServiceSchema = z.object({
  kind: z.literal("new-booking-service"),
  serviceName: z.string().trim().min(1).max(120),
  durationMinutes: z.number().int().min(5).max(480),
  timeZone: z.string().trim().min(1).max(128).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Use an IANA time zone."),
  provider: z.enum(["google", "outlook"]),
  inquiryCapabilityId: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  tenantId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/).optional(),
  availability: z.array(interval).min(1).max(20),
}).strict().superRefine((value, ctx) => {
  value.availability.forEach((slot, index) => {
    if (Date.parse(slot.end) - Date.parse(slot.start) !== value.durationMinutes * 60_000) ctx.addIssue({ code: "custom", path: ["availability", index], message: "Each proposed time must match the service duration." });
    if (value.availability.some((other, otherIndex) => otherIndex < index && Date.parse(other.start) < Date.parse(slot.end) && Date.parse(other.end) > Date.parse(slot.start))) ctx.addIssue({ code: "custom", path: ["availability", index], message: "Proposed times must not overlap." });
  });
});
export type AskBookingService = z.infer<typeof askBookingServiceSchema>;

/** Private exact inputs bound to the owner's Make real plan fingerprint. */
export const askBookingPublicationPinSchema = z.object({
  proposal: askBookingServiceSchema,
  expectedSchedule: z.record(z.string(), z.unknown()),
  calendarConnectionId: z.string().uuid(),
  calendarUpdatedAt: z.string().datetime({ offset: true }),
}).strict();
export type AskBookingPublicationPin = z.infer<typeof askBookingPublicationPinSchema>;

export const askBookingBindingSchema = z.object({
  workspaceId: z.string().uuid(), tenantId: z.string(), tenantStableId: z.string().uuid(),
  inquiryCapabilityId: z.string(), inquiryVersion: z.number().int().positive(),
  provider: z.enum(["google", "outlook"]), timeZone: z.string(), calendarConnectionId: z.string().uuid(), calendarUpdatedAt: z.string(),
}).strict();
export type AskBookingBinding = z.infer<typeof askBookingBindingSchema>;

import { z } from "zod";
import { baseSchema } from "@/platform/bounded-work/contracts";
import { calendarProviderSchema } from "./calendar/contracts";
const intervalSchema = z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) }).refine(value => Date.parse(value.end) > Date.parse(value.start), "End must follow start");
export const reservationSchema = intervalSchema.extend({ requestId: z.string().min(1).max(100), title: z.string().min(1).max(160), status: z.enum(["reserved", "cancelled", "writing", "unknown", "accepted"]), providerId: z.string().optional(), provider: calendarProviderSchema.optional(), verification: z.enum(["pending", "verified", "failed"]).optional(), syncOperation: z.enum(["create", "update", "delete"]).optional(), pendingStart: z.string().datetime({ offset: true }).optional(), pendingEnd: z.string().datetime({ offset: true }).optional(), syncError: z.string().max(1000).optional() });
/**
 * Lifecycle Paused for a workspace schedule. Present means Paused; absent
 * means Live. Kept apart from reservation verification and provider health,
 * like InquiryCapabilityStatus keeps "paused" apart from "live_unverified":
 * pausing stops new reservations and new times, never existing ones.
 */
export const schedulePauseSchema = z.object({
  pausedAt: z.string().datetime({ offset: true }),
  pausedBy: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
}).strict();
export const scheduleSchema = baseSchema.extend({ availability: z.array(intervalSchema).max(100), reservations: z.array(reservationSchema).max(1000), pause: schedulePauseSchema.optional() });
export type ScheduleLifecycle = "live" | "paused";
export const scheduleLifecycleCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pause"), expectedRevision: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(500) }).strict(),
  z.object({ kind: z.literal("resume"), expectedRevision: z.number().int().nonnegative() }).strict(),
]);
export const createScheduleSchema = z.object({ title: z.string().trim().min(1).max(160), availability: z.array(intervalSchema).min(1).max(100) }).strict();
export const scheduleCommandSchema = z.discriminatedUnion("kind", [
  intervalSchema.extend({ kind: z.literal("reserve"), expectedRevision: z.number().int().nonnegative(), requestId: z.string().min(1).max(100), title: z.string().min(1).max(160) }),
  intervalSchema.extend({ kind: z.literal("reschedule"), expectedRevision: z.number().int().nonnegative(), requestId: z.string().min(1).max(100) }),
  z.object({ kind: z.literal("cancel"), expectedRevision: z.number().int().nonnegative(), requestId: z.string().min(1) }),
]);

// Public product boundary for workspace routes and dedicated scheduling
// controls. Provider internals remain inside this product's calendar folder.
export * from "./calendar/contracts";

/** Outlook disconnect removes Strelva's tokens, not Microsoft account consent. */
export const calendarProviderConsentActionSchema = z.object({
  href: z.literal("https://myapps.microsoft.com"),
  label: z.string().min(1).max(160),
  message: z.string().min(1).max(600),
}).strict();
export type CalendarProviderConsentAction = z.infer<typeof calendarProviderConsentActionSchema>;
export const outlookCalendarConsentAction: CalendarProviderConsentAction = {
  href: "https://myapps.microsoft.com",
  label: "Remove Strelva consent in Microsoft My Apps",
  message: "Strelva is disconnected. Microsoft calendar consent has not been removed. Remove Strelva's permissions in Microsoft My Apps. If your organization granted consent, ask its administrator to remove it.",
};

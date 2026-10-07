import { z } from "zod";
import { calendarProviderSchema } from "./calendar/contracts";

/** Browser-safe visitor projection: no private work ids, grants, visitors or credentials. */
export const publicBookingSlotSchema = z.object({
  id: z.string().trim().min(8).max(2048).regex(/^[A-Za-z0-9._~-]+$/),
  start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }),
}).strict().refine(value => Date.parse(value.end) > Date.parse(value.start), "The booking slot must end after it starts.");
export const publicBookingScheduleSchema = z.object({
  schemaVersion: z.literal(1), capabilityId: z.string().trim().min(1).max(200),
  version: z.number().int().positive(), name: z.string().trim().min(1).max(160),
  provider: calendarProviderSchema, timeZone: z.string().trim().min(1).max(128),
  slots: z.array(publicBookingSlotSchema).max(500),
}).strict();

export type PublicBookingSchedule = z.infer<typeof publicBookingScheduleSchema>;

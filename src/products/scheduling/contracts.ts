import { z } from "zod";
import { baseSchema } from "@/platform/bounded-work/contracts";
const intervalSchema = z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) }).refine(value => Date.parse(value.end) > Date.parse(value.start), "End must follow start");
export const reservationSchema = intervalSchema.extend({ requestId: z.string().min(1).max(100), title: z.string().min(1).max(160), status: z.enum(["reserved", "cancelled", "writing", "unknown", "accepted"]), providerId: z.string().optional(), verification: z.enum(["pending", "verified", "failed"]).optional() });
export const scheduleSchema = baseSchema.extend({ availability: z.array(intervalSchema).max(100), reservations: z.array(reservationSchema).max(1000) });
export const createScheduleSchema = z.object({ title: z.string().trim().min(1).max(160), availability: z.array(intervalSchema).min(1).max(100) }).strict();
export const scheduleCommandSchema = z.discriminatedUnion("kind", [
  intervalSchema.extend({ kind: z.literal("reserve"), expectedRevision: z.number().int().nonnegative(), requestId: z.string().min(1).max(100), title: z.string().min(1).max(160) }),
  intervalSchema.extend({ kind: z.literal("reschedule"), expectedRevision: z.number().int().nonnegative(), requestId: z.string().min(1).max(100) }),
  z.object({ kind: z.literal("cancel"), expectedRevision: z.number().int().nonnegative(), requestId: z.string().min(1) }),
]);

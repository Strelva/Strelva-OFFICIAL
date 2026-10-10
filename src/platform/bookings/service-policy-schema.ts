import { z } from "zod";
export const intakeQuestionSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), label: z.string().trim().min(1).max(200),
  type: z.enum(["text", "textarea"]).default("text"), required: z.boolean() }).strict();
export const bookingServicePolicySchema = z.object({ businessServiceId: z.string().uuid(), mode: z.enum(["request", "instant"]),
  bufferMinutes: z.number().int().min(0).max(120), bookable: z.boolean(), intake: z.array(intakeQuestionSchema).max(8)
    .refine(rows => new Set(rows.map(row => row.id)).size === rows.length, "Question identifiers must be unique.") }).strict();
export type BookingServicePolicy = z.infer<typeof bookingServicePolicySchema>;
export function bookingServicePoliciesEnabled() { return process.env.STRELVA_BOOKING_SETTINGS === "1" && process.env.STRELVA_BOOKING_STORE_WRITE === "1" && process.env.DUAL_WRITE_PG !== "0" && process.env.DUAL_WRITE_PG !== "false"; }

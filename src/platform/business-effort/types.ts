import { z } from "zod";

/** Kinds of human work counted toward the ADR 0009 factory measure. */
export const BUSINESS_EFFORT_CATEGORIES = ["delivery", "change", "review", "support", "recovery", "sales", "other"] as const;
export type BusinessEffortCategory = (typeof BUSINESS_EFFORT_CATEGORIES)[number];

export const BUSINESS_EFFORT_CATEGORY_LABELS: Record<BusinessEffortCategory, string> = {
  delivery: "Delivery",
  change: "Requested change",
  review: "Review and approval",
  support: "Support",
  recovery: "Recovery",
  sales: "Sales",
  other: "Other",
};

export const MAX_EFFORT_MINUTES = 1440;
export const MAX_EFFORT_TEXT = 280;
export const EARLIEST_EFFORT_DATE = "2020-01-01";

export interface BusinessEffortActor { userId: string; verifiedEmail: string }

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a real calendar date.");

export const businessEffortEntrySchema = z.object({
  id: z.string().uuid(),
  businessId: z.string().uuid(),
  minutes: z.number().int().min(0).max(MAX_EFFORT_MINUTES),
  category: z.enum(BUSINESS_EFFORT_CATEGORIES),
  occurredOn: calendarDate,
  note: z.string().nullable(),
  recordedBy: z.string().uuid(),
  recordedAt: z.string(),
  void: z.object({ reason: z.string(), voidedBy: z.string().uuid(), voidedAt: z.string() }).strict().nullable(),
}).strict();
export type BusinessEffortEntry = z.infer<typeof businessEffortEntrySchema>;

export const effortBusinessSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  tenantIds: z.array(z.string()),
  firstEffortOn: calendarDate.nullable(),
}).strict();
export type EffortBusiness = z.infer<typeof effortBusinessSchema>;

export const recordBusinessEffortSchema = z.object({
  entryId: z.string().uuid(),
  businessId: z.string().uuid(),
  minutes: z.number().int().min(0).max(MAX_EFFORT_MINUTES),
  category: z.enum(BUSINESS_EFFORT_CATEGORIES),
  occurredOn: calendarDate,
  note: z.string().trim().max(MAX_EFFORT_TEXT).optional().transform((value) => value || undefined),
}).strict();
export type RecordBusinessEffortInput = z.input<typeof recordBusinessEffortSchema>;
export type RecordBusinessEffortCommand = z.output<typeof recordBusinessEffortSchema>;

export const voidBusinessEffortSchema = z.object({
  entryId: z.string().uuid(),
  reason: z.string().trim().min(1).max(MAX_EFFORT_TEXT),
}).strict();
export type VoidBusinessEffortInput = z.infer<typeof voidBusinessEffortSchema>;

export class BusinessEffortValidationError extends Error {
  constructor(message = "Check the minutes, category, date and note.") { super(message); this.name = "BusinessEffortValidationError"; }
}
export class BusinessEffortAccessError extends Error {
  constructor(message = "Only a verified super admin can record human minutes.") { super(message); this.name = "BusinessEffortAccessError"; }
}
export class BusinessEffortNotFoundError extends Error {
  constructor(message = "That business or entry was not found.") { super(message); this.name = "BusinessEffortNotFoundError"; }
}
export class BusinessEffortConflictError extends Error {
  constructor(message = "This entry was already saved differently. Reload before continuing.") { super(message); this.name = "BusinessEffortConflictError"; }
}
export class BusinessEffortUnavailableError extends Error {
  constructor(message = "Human-minute storage is unavailable.") { super(message); this.name = "BusinessEffortUnavailableError"; }
}

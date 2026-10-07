import { z } from "zod";

/**
 * The business record: one shared set of facts, services, people and contacts
 * per customer workspace. These schemas mirror the SQL validators in
 * supabase/migrations/20261002120000_business_record.sql exactly; the database
 * remains the authority and rejects anything these let through.
 */

export const BUSINESS_RECORD_SOURCES = [
  "owner", "operator", "agency", "tenant_import", "website_rebuild", "bookings", "inquiries", "agent",
  // Written only by an internal tool submit (resolve_internal_tool_links).
  "internal_app",
] as const;
export const businessRecordSourceSchema = z.enum(BUSINESS_RECORD_SOURCES);
export type BusinessRecordSource = z.infer<typeof businessRecordSourceSchema>;

/** Sources a caller may write with; `tenant_import` belongs to conversion
 * only and `internal_app` to internal tool submits. */
export const businessRecordWriteSourceSchema = businessRecordSourceSchema.exclude(["tenant_import", "internal_app"]);
export type BusinessRecordWriteSource = z.infer<typeof businessRecordWriteSourceSchema>;

export const CONTACT_SOURCES = [
  "inquiry", "booking", "tenant_import", "owner", "operator", "agency", "website", "agent",
  // 20261007192100_internal_tool_links.sql
  "internal_app", "newsletter",
] as const;
export const contactSourceSchema = z.enum(CONTACT_SOURCES);
export type ContactSource = z.infer<typeof contactSourceSchema>;

/** Same rule as public.business_contact_phone_key. */
export function phoneKey(phone: string): string | null {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length === 10) return `1${digits}`;
  if (digits.length >= 7 && digits.length <= 15) return digits;
  return null;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const trimmed = (min: number, max: number) =>
  z.string().min(min).max(max).refine((value) => value === value.trim() && value.trim().length >= min, "Must be trimmed");
const emailSchema = z.string().min(3).max(254)
  .refine((value) => EMAIL_PATTERN.test(value) && value === value.trim().toLowerCase(), "Must be a lowercase email");
const phoneSchema = trimmed(3, 40).refine((value) => phoneKey(value) !== null, "Needs 7 to 15 digits");
const time = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Must be a real calendar date");

export const LINK_KINDS = [
  "website", "booking", "google_maps", "google_business", "instagram", "facebook", "linkedin", "yelp", "tiktok", "x", "youtube", "other",
] as const;

export const weeklyHoursSchema = z.object({
  day: z.number().int().min(0).max(6),
  opens: time,
  closes: time,
}).strict().refine((item) => item.opens < item.closes, "Opens before it closes");

export const hoursOverrideSchema = z.object({
  date: isoDate,
  closed: z.boolean(),
  opens: time.optional(),
  closes: time.optional(),
  label: trimmed(1, 120).optional(),
}).strict().refine((item) => item.closed
  ? item.opens === undefined && item.closes === undefined
  : item.opens !== undefined && item.closes !== undefined && item.opens < item.closes,
"A closed day has no times; an open day opens before it closes");

export const factValueSchemas = {
  legal_name: trimmed(1, 160),
  display_name: trimmed(1, 160),
  phone: phoneSchema,
  email: emailSchema,
  description: trimmed(1, 2000),
  address: z.object({
    formatted: trimmed(1, 200).optional(),
    line1: trimmed(1, 200).optional(),
    line2: trimmed(1, 200).optional(),
    city: trimmed(1, 200).optional(),
    region: trimmed(1, 200).optional(),
    postalCode: trimmed(1, 200).optional(),
    country: trimmed(1, 200).optional(),
  }).strict().refine((value) => value.formatted !== undefined || value.line1 !== undefined, "Needs a formatted address or line1"),
  service_area: z.array(trimmed(1, 120)).min(1).max(100),
  links: z.array(z.object({
    kind: z.enum(LINK_KINDS),
    url: z.string().min(8).max(2048).regex(/^https?:\/\/\S+$/),
    label: trimmed(1, 80).optional(),
  }).strict()).min(1).max(30),
  hours: z.object({
    timezone: trimmed(1, 64),
    weekly: z.array(weeklyHoursSchema).max(70),
    overrides: z.array(hoursOverrideSchema).max(366).optional(),
  }).strict(),
  owner_recipient: z.object({ email: emailSchema, name: trimmed(1, 160).optional() }).strict(),
} as const;

export type FactKey = keyof typeof factValueSchemas;
export const FACT_KEYS = Object.keys(factValueSchemas) as FactKey[];
export const factKeySchema = z.enum(FACT_KEYS as [FactKey, ...FactKey[]]);
export type FactValues = { [K in FactKey]: z.infer<(typeof factValueSchemas)[K]> };

/** Validate one fact value against its key's schema. */
export function parseFactValue<K extends FactKey>(key: K, value: unknown): FactValues[K] {
  return factValueSchemas[key].parse(value) as FactValues[K];
}

const factPatchEntry = z.object({ value: z.unknown(), verified: z.boolean().optional() }).strict();

export const factPatchSchema = z.record(z.string(), factPatchEntry.nullable()).superRefine((facts, context) => {
  for (const [key, entry] of Object.entries(facts)) {
    if (!(FACT_KEYS as string[]).includes(key)) {
      context.addIssue({ code: "custom", path: [key], message: "Unknown fact" });
      continue;
    }
    if (entry === null) continue;
    const result = factValueSchemas[key as FactKey].safeParse(entry.value);
    if (!result.success) context.addIssue({ code: "custom", path: [key, "value"], message: result.error.issues[0]?.message ?? "Invalid fact" });
  }
});

const uuid = z.string().uuid();
const nullableText = (max: number) => z.string().min(1).max(max).nullable().optional();

export const serviceOperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("upsert"),
    id: uuid.optional(),
    name: trimmed(1, 160),
    description: nullableText(2000),
    durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    priceText: nullableText(80),
    active: z.boolean().optional(),
    position: z.number().int().min(0).max(10000).optional(),
    externalRef: nullableText(200),
    verified: z.boolean().optional(),
  }).strict(),
  z.object({ op: z.literal("remove"), id: uuid }).strict(),
]);

export const personOperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("upsert"),
    id: uuid.optional(),
    name: trimmed(1, 160),
    roleTitle: nullableText(120),
    email: emailSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    userId: uuid.nullable().optional(),
    active: z.boolean().optional(),
    verified: z.boolean().optional(),
  }).strict(),
  z.object({ op: z.literal("remove"), id: uuid }).strict(),
]);

export const businessRecordPatchSchema = z.object({
  facts: factPatchSchema.optional(),
  services: z.array(serviceOperationSchema).max(200).optional(),
  people: z.array(personOperationSchema).max(200).optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, "A patch changes something");
export type BusinessRecordPatch = z.infer<typeof businessRecordPatchSchema>;

const VERIFYING_SOURCES: readonly BusinessRecordSource[] = ["owner", "operator"];

/** Only an owner or Strelva operator may mark something verified. */
export function patchVerificationAllowed(patch: BusinessRecordPatch, source: BusinessRecordSource): boolean {
  if (VERIFYING_SOURCES.includes(source)) return true;
  const facts = Object.values(patch.facts ?? {}).some((entry) => entry?.verified === true);
  const rows = [...(patch.services ?? []), ...(patch.people ?? [])].some((item) => item.op === "upsert" && item.verified === true);
  return !facts && !rows;
}

export const contactInputSchema = z.object({
  name: z.string().trim().min(1).max(160).nullable().optional(),
  email: z.string().trim().toLowerCase().max(254).refine((value) => EMAIL_PATTERN.test(value), "Invalid email").nullable().optional(),
  phone: z.string().trim().min(3).max(40).refine((value) => phoneKey(value) !== null, "Needs 7 to 15 digits").nullable().optional(),
  source: contactSourceSchema,
  seenAt: z.string().datetime({ offset: true }).nullable().optional(),
}).strict().refine((contact) => Boolean(contact.email || contact.phone), "A contact needs an email or phone");
export type ContactInput = z.infer<typeof contactInputSchema>;
export const contactBatchSchema = z.array(contactInputSchema).min(1).max(1000);

const timestamp = z.string().min(1);
const nullableString = z.string().nullable();

export const factEntrySchema = z.object({
  value: z.unknown(),
  source: businessRecordSourceSchema,
  verified: z.boolean(),
  updatedAt: timestamp,
  updatedBy: uuid,
});

export const businessRecordSchema = z.object({
  workspaceId: uuid,
  access: z.enum(["owner", "admin", "member", "agency"]),
  revision: z.number().int().min(0),
  lastSequence: z.number().int().min(0),
  updatedAt: timestamp.nullable(),
  facts: z.partialRecord(factKeySchema, factEntrySchema),
  services: z.array(z.object({
    id: uuid, name: z.string(), description: nullableString, durationMinutes: z.number().int().nullable(),
    priceText: nullableString, active: z.boolean(), position: z.number().int(), externalRef: nullableString,
    source: businessRecordSourceSchema, verified: z.boolean(), updatedAt: timestamp,
  })),
  people: z.array(z.object({
    id: uuid, name: z.string(), roleTitle: nullableString, email: nullableString, phone: nullableString,
    userId: uuid.nullable(), active: z.boolean(), source: businessRecordSourceSchema, verified: z.boolean(), updatedAt: timestamp,
  })),
  /** Null for an agency: contacts stay with direct members of the business. */
  contactCount: z.number().int().min(0).nullable(),
});
export type BusinessRecord = z.infer<typeof businessRecordSchema>;

/** The copy client sites read: only what the owner wrote or decided (#509).
 * Values are as stored; callers parse each with factValueSchemas. */
export const confirmedBusinessFactsSchema = z.object({
  revision: z.number().int().min(0),
  facts: z.partialRecord(factKeySchema, z.unknown()),
  services: z.array(z.object({ name: z.string(), description: nullableString, priceText: nullableString }).strict()).max(40),
}).strict();
export type ConfirmedBusinessFacts = z.infer<typeof confirmedBusinessFactsSchema>;

export const businessContactSchema = z.object({
  id: uuid, name: nullableString, email: nullableString, phone: nullableString,
  sources: z.array(contactSourceSchema).min(1), firstSeenAt: timestamp, lastSeenAt: timestamp,
});
export type BusinessContact = z.infer<typeof businessContactSchema>;

export const revisionChangeSchema = z.object({
  entity: z.enum(["fact", "service", "person", "contact"]),
  id: z.string().min(1),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
});

export const businessRecordRevisionSchema = z.object({
  sequence: z.number().int().positive(),
  revision: z.number().int().min(0),
  actorId: uuid,
  actorKind: z.enum(["member", "agency", "operator"]),
  source: businessRecordSourceSchema,
  undoOf: z.number().int().positive().nullable(),
  undoneBy: z.number().int().positive().nullable(),
  changes: z.array(revisionChangeSchema),
  createdAt: timestamp,
});
export type BusinessRecordRevision = z.infer<typeof businessRecordRevisionSchema>;

export const businessRecordWriteResultSchema = z.object({
  workspaceId: uuid,
  sequence: z.number().int().positive(),
  revision: z.number().int().min(0),
  changeCount: z.number().int().min(0),
  undoOf: z.number().int().positive().nullable(),
  contacts: z.object({ created: z.number().int().min(0), merged: z.number().int().min(0), unchanged: z.number().int().min(0) }),
  replayed: z.boolean(),
});
export type BusinessRecordWriteResult = z.infer<typeof businessRecordWriteResultSchema>;

export const ownerRecipientSchema = z.object({
  email: z.string(),
  name: nullableString,
  from: z.enum(["record", "tenant_fallback"]),
  source: businessRecordSourceSchema.nullable(),
  verified: z.boolean(),
  tenantId: nullableString,
});
export type OwnerRecipient = z.infer<typeof ownerRecipientSchema>;

/** The one owner-recipient rule keyed by tenant (resolve_tenant_owner_recipient):
 * the linked record's owner contact, else this tenant's owner_email, else the
 * business's earliest linked tenant's owner_email. */
export const tenantOwnerRecipientSchema = z.object({
  email: z.string().email(),
  name: nullableString,
  from: z.enum(["record", "tenant", "linked_tenant"]),
  workspaceId: uuid.nullable(),
  tenantId: nullableString,
});
export type TenantOwnerRecipient = z.infer<typeof tenantOwnerRecipientSchema>;

/** Billing as observed on the tenant at conversion time. Recorded, never acted on. */
export const conversionBillingSchema = z.object({
  billingType: z.enum(["tier", "custom", "case_study", "none"]),
  subscriptionStatus: z.string().max(40).nullable(),
  subscriptionPlan: z.string().max(40).nullable(),
  monthlyCents: z.number().int().min(0),
  hasStripeSubscription: z.boolean(),
  grandfathered: z.boolean(),
}).strict();
export type ConversionBilling = z.infer<typeof conversionBillingSchema>;

export const conversionAccountSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  tenantIds: z.array(z.string().min(1).max(120)).max(100),
  multiSite: z.boolean(),
  /** The bundled subscription's per-site line items (Redis `account:{id}`),
   *  so the billing home records what Stripe actually charges per site. */
  subscription: z.object({
    status: z.string().max(40).nullable(),
    amountCents: z.number().int().min(0).nullable(),
    currentPeriodEnd: z.string().max(40).nullable(),
    items: z.array(z.object({
      tenantId: z.string().min(1).max(120),
      label: z.string().max(120),
      amountCents: z.number().int().min(0),
    }).strict()).max(100),
  }).strict().optional(),
}).strict();
export type ConversionAccount = z.infer<typeof conversionAccountSchema>;

export const tenantImportPayloadSchema = z.object({
  tenantId: z.string().min(1).max(120),
  tenantStableId: uuid,
  workspaceName: trimmed(1, 120),
  targetWorkspaceId: uuid.optional(),
  /** Convert a site of a multi-site account into its own business instead of
   *  joining a sibling's (Twin Trees as two businesses). Present only when
   *  true, so default payloads and their digests are unchanged. Needs
   *  20261008160000_convert_separate_business; older databases refuse it. */
  separateBusiness: z.literal(true).optional(),
  billing: conversionBillingSchema.nullable(),
  account: conversionAccountSchema.nullable(),
  patch: z.object({
    facts: factPatchSchema.optional(),
    services: z.array(serviceOperationSchema).max(200).optional(),
    people: z.array(personOperationSchema).max(200).optional(),
  }).strict(),
  contacts: z.array(contactInputSchema).max(1000),
}).strict();
export type TenantImportPayload = z.infer<typeof tenantImportPayloadSchema>;

export const conversionReceiptSchema = z.object({
  kind: z.literal("tenant_conversion"),
  version: z.literal(1),
  tenantId: z.string(),
  tenantStableId: uuid,
  tenantActive: z.boolean(),
  workspaceId: uuid,
  workspaceName: z.string(),
  joinedExistingWorkspace: z.boolean(),
  /** Absent on receipts written before 20261008160000. */
  separateBusiness: z.boolean().optional(),
  operatorId: uuid,
  operatorRole: z.literal("admin"),
  billing: conversionBillingSchema.nullable(),
  account: conversionAccountSchema.nullable(),
  sequence: z.number().int().positive(),
  revision: z.number().int().min(0),
  changeCount: z.number().int().min(0),
  counts: z.object({
    facts: z.number().int(), services: z.number().int(), people: z.number().int(), contacts: z.number().int(),
    contactsCreated: z.number().int(), contactsMerged: z.number().int(), contactsUnchanged: z.number().int(),
  }),
  convertedAt: timestamp,
  replayed: z.boolean(),
  alreadyConverted: z.boolean(),
});
export type ConversionReceipt = z.infer<typeof conversionReceiptSchema>;

export const tenantLinkStateSchema = z.object({
  tenantId: z.string(),
  tenantStableId: uuid,
  siteName: z.string(),
  link: z.object({ workspaceId: uuid, linkedBy: uuid, linkedAt: timestamp, receipt: z.record(z.string(), z.unknown()) }).nullable(),
});
export type TenantLinkState = z.infer<typeof tenantLinkStateSchema>;

/** Why an unlink kept the business workspace instead of deleting it. */
export const UNLINK_KEEP_REASONS = [
  "joined_existing_workspace",
  "workspace_not_created_by_conversion",
  "other_sites_linked",
  "other_members",
  "record_has_other_data",
  "record_history_after_import",
] as const;
/** A reason from UNLINK_KEEP_REASONS, or `workspace_in_use:<table>`. */
const unlinkKeepReason = z.union([z.enum(UNLINK_KEEP_REASONS), z.string().regex(/^workspace_in_use:[a-z0-9_.]+$/)]);

const unlinkEntityCounts = z.object({
  removed: z.number().int().min(0),
  restored: z.number().int().min(0),
  kept: z.number().int().min(0),
  alreadyReverted: z.number().int().min(0),
});
const unlinkKeptEntity = z.object({
  entity: z.enum(["fact", "service", "person", "contact"]),
  id: z.string(),
  reason: z.enum(["changed_after_import", "deleted_after_import"]),
});

/** What unlinking would do, computed by public.tenant_unlink_plan. */
export const tenantUnlinkPlanSchema = z.object({
  linkId: uuid,
  tenantStableId: uuid,
  workspaceId: uuid,
  workspaceName: z.string(),
  linkedAt: timestamp,
  importSequence: z.number().int().positive(),
  deleteWorkspace: z.boolean(),
  workspaceKeptBecause: z.array(unlinkKeepReason),
  entities: unlinkEntityCounts,
  kept: z.array(unlinkKeptEntity),
  leadsDetached: z.number().int().min(0),
  systemsAdoptedFromTenant: z.number().int().min(0),
});
export type TenantUnlinkPlan = z.infer<typeof tenantUnlinkPlanSchema>;

export const tenantUnlinkReceiptSchema = z.object({
  kind: z.literal("tenant_unlink"),
  version: z.literal(1),
  tenantId: z.string(),
  tenantStableId: uuid,
  workspaceId: uuid,
  workspaceName: z.string(),
  linkId: uuid,
  linkedAt: timestamp,
  importSequence: z.number().int().positive(),
  operatorId: uuid,
  workspaceDeleted: z.boolean(),
  workspaceKeptBecause: z.array(unlinkKeepReason),
  entities: unlinkEntityCounts,
  kept: z.array(unlinkKeptEntity),
  leadsDetached: z.number().int().min(0),
  systemsAdoptedFromTenant: z.number().int().min(0),
  /** History row written in a kept business; null when the business was deleted or nothing changed. */
  sequence: z.number().int().positive().nullable(),
  revision: z.number().int().min(0).nullable(),
  conversionReceipt: z.record(z.string(), z.unknown()),
  unlinkedAt: timestamp,
  replayed: z.boolean(),
  alreadyUnlinked: z.boolean(),
});
export type TenantUnlinkReceipt = z.infer<typeof tenantUnlinkReceiptSchema>;

export const tenantUnlinkPreviewSchema = z.object({
  tenantId: z.string(),
  tenantStableId: uuid,
  /** Null when the tenant is not linked to a business. */
  plan: tenantUnlinkPlanSchema.nullable(),
  lastUnlink: tenantUnlinkReceiptSchema.nullable(),
});
export type TenantUnlinkPreview = z.infer<typeof tenantUnlinkPreviewSchema>;

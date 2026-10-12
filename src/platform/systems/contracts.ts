import { z } from "zod";

/**
 * Systems and Connections: the customer-facing spine of the Systems model.
 *
 * A System is the enduring business-owned thing made in Strelva (a website, a
 * proposal, a booking flow, an internal app). Its identity is the pair
 * { businessId, systemId } and never changes. What it is built from changes
 * through immutable SystemRevisions; its kind stays fixed for life.
 *
 * A SystemConnection is a typed, directional relation from one System to
 * another System or to a business resource, audience, external account
 * binding, domain or API. The existing external-account binding (calendar
 * connections, OAuth) sits underneath as the `account_binding` target.
 *
 * These schemas mirror supabase/migrations/20261004120000_systems.sql. The
 * database remains the authority and rejects anything these let through.
 */

const uuid = z.string().uuid();
const trimmed = (min: number, max: number) =>
  z.string().min(min).max(max).refine((value) => value === value.trim() && value.trim().length >= min, "Must be trimmed");

/** What other lanes import to point at a System. Both ids are required: a
 * System id alone never crosses a business boundary. */
export const systemRefSchema = z.object({ businessId: uuid, systemId: uuid }).strict();
export type SystemRef = z.infer<typeof systemRefSchema>;

/** One immutable implementation snapshot of a System. */
export const systemRevisionRefSchema = z.object({
  businessId: uuid,
  systemId: uuid,
  revisionId: uuid,
  number: z.number().int().positive(),
}).strict();
export type SystemRevisionRef = z.infer<typeof systemRevisionRefSchema>;

export const SYSTEM_LIFECYCLES = ["draft", "live", "paused"] as const;
export const systemLifecycleSchema = z.enum(SYSTEM_LIFECYCLES);
export type SystemLifecycle = z.infer<typeof systemLifecycleSchema>;

/** Known lifetime kinds. Creation accepts any valid slug; these let the UI
 * label the common ones without defining a closed registry. */
export const KNOWN_SYSTEM_KINDS = [
  "website", "booking", "inquiry", "proposal", "pricing", "portal", "onboarding",
  "internal_app", "document", "report", "tracker", "listing", "newsletter", "other",
] as const;
export const systemKindSchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "A lowercase slug");
export type SystemKind = string;

/** Where an existing thing came from when it was adopted as a System. Lets the
 * read-only adapter and a stored System agree on one identity. */
export const SYSTEM_ORIGIN_KINDS = [
  /** saved_product_work.id: nearly every made thing already has one. */
  "saved_work",
  /** tenants.stable_id: a managed website with no native work row. */
  "tenant",
  /** inquiry_workspaces.id: a managed tenant's inquiry handling. */
  "inquiry_workspace",
  /** `{workspace_account_bindings.id}:{google location id}`: a Google listing. */
  "google_location",
  /** tenants.stable_id: the newsletter a managed tenant sends to its subscribers. */
  "tenant_newsletter",
  /** connected_sites.id: a website the business already runs elsewhere, connected by script. */
  "connected_site",
] as const;
export const systemOriginSchema = z.object({
  kind: z.enum(SYSTEM_ORIGIN_KINDS),
  ref: trimmed(1, 200),
}).strict();
export type SystemOrigin = z.infer<typeof systemOriginSchema>;

export const systemSchema = z.object({
  id: uuid,
  businessId: uuid,
  name: trimmed(1, 160),
  purpose: z.string().max(1000).nullable(),
  kind: systemKindSchema,
  lifecycle: systemLifecycleSchema,
  currentRevision: systemRevisionRefSchema.nullable(),
  origin: systemOriginSchema.nullable(),
  /** Optimistic-concurrency token for the System row. Not a SystemRevision. */
  changeNumber: z.number().int().positive(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type System = z.infer<typeof systemSchema>;

/** What a revision is built from. `ref` names the native artifact (a website
 * document revision, an application release, a saved work id); the System
 * layer never copies it. */
export const systemImplementationSchema = z.object({
  kind: trimmed(1, 80),
  ref: trimmed(1, 400),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
}).strict();
export type SystemImplementation = z.infer<typeof systemImplementationSchema>;

export const systemRevisionSchema = z.object({
  id: uuid,
  businessId: uuid,
  systemId: uuid,
  number: z.number().int().positive(),
  implementation: systemImplementationSchema,
  summary: z.string().max(500).nullable(),
  createdAt: z.string().min(1),
  createdBy: uuid,
});
export type SystemRevision = z.infer<typeof systemRevisionSchema>;

export const SYSTEM_OUTPUT_STATUSES = ["issued", "accepted"] as const;
/** An issued or accepted result (a sent proposal, a published report). It
 * pins the revision that produced it; later System changes never rewrite it. */
export const systemOutputSchema = z.object({
  id: uuid,
  businessId: uuid,
  systemId: uuid,
  revision: systemRevisionRefSchema,
  kind: trimmed(1, 80),
  title: trimmed(1, 200),
  status: z.enum(SYSTEM_OUTPUT_STATUSES),
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
  issuedAt: z.string().min(1),
  acceptedAt: z.string().nullable(),
});
export type SystemOutput = z.infer<typeof systemOutputSchema>;

export const CONNECTION_KINDS = ["read", "act", "appear", "share", "depend", "trigger"] as const;
export const connectionKindSchema = z.enum(CONNECTION_KINDS);
export type ConnectionKind = z.infer<typeof connectionKindSchema>;

export const CONNECTION_STATES = ["connected", "disconnected", "stale"] as const;
export const connectionStateSchema = z.enum(CONNECTION_STATES);
export type ConnectionState = z.infer<typeof connectionStateSchema>;

/**
 * How a change at the target reaches the source.
 * - follow_current: new work uses the target's current revision.
 * - pin_on_issue: same, and an issued/accepted output keeps the revision it
 *   was issued against (always true for outputs; this makes it explicit).
 * - manual_review: a target change marks the connection stale until reviewed.
 */
export const PROPAGATION_POLICIES = ["follow_current", "pin_on_issue", "manual_review"] as const;
export const propagationPolicySchema = z.enum(PROPAGATION_POLICIES);
export type PropagationPolicy = z.infer<typeof propagationPolicySchema>;

const slugRef = trimmed(1, 200);
export const connectionTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("system"), system: systemRefSchema }).strict(),
  /** A slice of the business record, e.g. `business_record:services`. */
  z.object({ type: z.literal("business_resource"), resource: slugRef }).strict(),
  z.object({ type: z.literal("audience"), audience: slugRef }).strict(),
  /** The existing external account binding (calendar connection, OAuth). */
  z.object({ type: z.literal("account_binding"), bindingId: slugRef }).strict(),
  z.object({ type: z.literal("domain"), domain: z.string().min(3).max(253).regex(/^[a-z0-9.-]+$/) }).strict(),
  z.object({ type: z.literal("api"), api: slugRef }).strict(),
]);
export type ConnectionTarget = z.infer<typeof connectionTargetSchema>;
export type ConnectionTargetType = ConnectionTarget["type"];

export const systemConnectionSchema = z.object({
  id: uuid,
  businessId: uuid,
  source: systemRefSchema,
  kind: connectionKindSchema,
  target: connectionTargetSchema,
  state: connectionStateSchema,
  propagation: propagationPolicySchema,
  contractVersion: z.number().int().positive(),
  purpose: z.string().max(500).nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type SystemConnection = z.infer<typeof systemConnectionSchema>;

export const systemGraphSchema = z.object({
  businessId: uuid,
  systems: z.array(systemSchema),
  connections: z.array(systemConnectionSchema),
});
export type SystemGraph = z.infer<typeof systemGraphSchema>;

export const systemDetailSchema = z.object({
  system: systemSchema,
  revisions: z.array(systemRevisionSchema),
  outputs: z.array(systemOutputSchema),
});
export type SystemDetail = z.infer<typeof systemDetailSchema>;

// ---- command inputs ----

export const createSystemInputSchema = z.object({
  name: trimmed(1, 160),
  purpose: z.string().max(1000).nullable().optional(),
  kind: systemKindSchema,
  origin: systemOriginSchema.nullable().optional(),
}).strict();
export type CreateSystemInput = z.infer<typeof createSystemInputSchema>;

export const updateSystemInputSchema = z.object({
  name: trimmed(1, 160).optional(),
  purpose: z.string().max(1000).nullable().optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, "An update changes something");
export type UpdateSystemInput = z.infer<typeof updateSystemInputSchema>;

export const recordRevisionInputSchema = z.object({
  implementation: systemImplementationSchema,
  summary: z.string().max(500).nullable().optional(),
}).strict();
export type RecordRevisionInput = z.infer<typeof recordRevisionInputSchema>;

export const issueOutputInputSchema = z.object({
  kind: trimmed(1, 80),
  title: trimmed(1, 200),
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type IssueOutputInput = z.infer<typeof issueOutputInputSchema>;

export const connectInputSchema = z.object({
  source: systemRefSchema,
  kind: connectionKindSchema,
  target: connectionTargetSchema,
  propagation: propagationPolicySchema.optional(),
  purpose: z.string().max(500).nullable().optional(),
}).strict();
export type ConnectInput = z.infer<typeof connectInputSchema>;

/** Where a System and its connections come from when read for display. */
export type SystemProvenance = "stored" | "existing";

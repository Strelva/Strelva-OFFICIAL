import { z } from "zod";
import { REVISION_ID, SYSTEM_ID, systemRefSchema, systemRevisionRefSchema } from "./refs";

/**
 * A Possibility is a business-owned, experiential alternative to the current
 * Systems. It pins the baseline revision of every System it changes, carries a
 * candidate change set, and stays isolated from live state and real outside
 * effects until Make real (RULE_POSSIBILITY_ISOLATION).
 *
 * The customer lifecycle is Exploring -> Ready. `made_real` and `withdrawn`
 * are terminal record states, not extra customer-facing stages.
 */

const DATE = z.string().datetime();
const KEY = z.string().regex(/^[a-z][a-z0-9-]{0,59}$/);
const content = z.record(z.string(), z.unknown());

export const possibilityStatusSchema = z.enum(["exploring", "ready", "made_real", "withdrawn"]);
export type PossibilityStatus = z.infer<typeof possibilityStatusSchema>;

export const effectKindSchema = z.enum(["calendar", "message", "payment", "publish"]);
export type EffectKind = z.infer<typeof effectKindSchema>;

/** How an accepted outside effect can be undone. Payments that capture money
 * and delivered messages are irreversible; a provider object that can be
 * archived or cancelled is compensable. Nothing outside Strelva is "reversible". */
export const reversibilitySchema = z.enum(["reversible", "compensable", "irreversible"]);
export type Reversibility = z.infer<typeof reversibilitySchema>;

export const authorityScopeSchema = z.enum([
  "system.activate",
  "calendar.write",
  "message.send",
  "payment.create",
  "site.publish",
]);
export type AuthorityScope = z.infer<typeof authorityScopeSchema>;

export const EFFECT_SCOPE: Record<EffectKind, AuthorityScope> = {
  calendar: "calendar.write",
  message: "message.send",
  payment: "payment.create",
  publish: "site.publish",
};

/** A target is an existing System or one this Possibility introduces. */
export const systemTargetSchema = z.union([
  z.object({ systemId: SYSTEM_ID }).strict(),
  z.object({ introducedKey: KEY }).strict(),
]);
export type SystemTarget = z.infer<typeof systemTargetSchema>;

export const candidateSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  content,
}).strict();

export const systemChangeSchema = z.object({
  /** The live revision this candidate was built against. */
  baseline: systemRevisionRefSchema,
  candidate: candidateSchema,
}).strict();
export type SystemChange = z.infer<typeof systemChangeSchema>;

export const extractionConflictSchema = z.object({
  /** Dotted path into the introduced candidate content. */
  path: z.string().regex(/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/),
  values: z.array(z.object({ systemId: SYSTEM_ID, value: z.unknown() }).strict()).min(2).max(10),
  resolved: z.object({ value: z.unknown(), chosenBy: z.string().min(1), at: DATE, fromSystemId: SYSTEM_ID.optional() }).strict().optional(),
}).strict();
export type ExtractionConflict = z.infer<typeof extractionConflictSchema>;

/** COMP_SYSTEM_EXTRACTION: a new reusable System built from duplicated facts or
 * behavior in existing Systems. Preparing it is not permission to migrate
 * consumers or overwrite disputed facts; conflicts need an owner choice. */
export const systemIntroductionSchema = z.object({
  key: KEY,
  name: z.string().trim().min(1).max(120),
  purpose: z.string().trim().min(1).max(500),
  candidate: candidateSchema,
  extractedFrom: z.array(systemRefSchema).max(10).default([]),
  conflicts: z.array(extractionConflictSchema).max(50).default([]),
}).strict();
export type SystemIntroduction = z.infer<typeof systemIntroductionSchema>;

export const connectionKindSchema = z.enum(["read", "act", "appear", "share", "depend", "trigger"]);
export const proposedConnectionSchema = z.object({
  id: KEY,
  from: systemTargetSchema,
  to: systemTargetSchema,
  kind: connectionKindSchema,
  purpose: z.string().trim().min(1).max(300),
}).strict();
export type ProposedConnection = z.infer<typeof proposedConnectionSchema>;

export const declaredEffectSchema = z.object({
  id: KEY,
  kind: effectKindSchema,
  system: systemTargetSchema,
  description: z.string().trim().min(1).max(300),
  /** Provider-neutral request; adapters translate it. Never secrets or grants. */
  request: content,
  /** Effects that must be accepted before this one runs. */
  after: z.array(KEY).max(10).default([]),
  /** Publish effects are content changes and pass through ai-governance. */
  publish: z.object({ section: z.string().min(1).max(40), data: z.unknown() }).strict().optional(),
}).strict();
export type DeclaredEffect = z.infer<typeof declaredEffectSchema>;

export const operatingCheckSchema = z.object({
  id: KEY,
  description: z.string().trim().min(1).max(300),
}).strict();
export type OperatingCheck = z.infer<typeof operatingCheckSchema>;

export const rehearsalSchema = z.object({
  candidateRevision: z.number().int().positive(),
  at: DATE,
  /** Baselines observed when rehearsing; a later live change makes it stale. */
  observedBaselines: z.record(SYSTEM_ID, REVISION_ID),
  effects: z.array(z.object({ effectId: KEY, mode: z.literal("isolated"), ok: z.boolean(), detail: z.string().max(1000) }).strict()),
  ok: z.boolean(),
  limitations: z.array(z.string().max(300)).max(20),
}).strict();
export type Rehearsal = z.infer<typeof rehearsalSchema>;

export const possibilityInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  intent: z.string().trim().min(1).max(2000),
  changes: z.array(systemChangeSchema).max(20).default([]),
  introduces: z.array(systemIntroductionSchema).max(5).default([]),
  connections: z.array(proposedConnectionSchema).max(20).default([]),
  effects: z.array(declaredEffectSchema).max(20).default([]),
  checks: z.array(operatingCheckSchema).min(1).max(20),
}).strict();
export type PossibilityInput = z.input<typeof possibilityInputSchema>;

export const possibilitySchema = possibilityInputSchema.extend({
  version: z.literal(1),
  id: z.string().min(1).max(120),
  businessId: z.string().min(1).max(120),
  status: possibilityStatusSchema,
  revision: z.number().int().nonnegative(),
  /** Increments whenever the candidate changes; rehearsals pin it. */
  candidateRevision: z.number().int().positive(),
  /** Issued/accepted outputs keep their pinned terms; only new outputs follow. */
  propagation: z.literal("new_outputs_only"),
  rehearsal: rehearsalSchema.optional(),
  activationId: z.string().optional(),
  createdBy: z.string().min(1),
  createdAt: DATE,
  updatedAt: DATE,
  history: z.array(z.object({ revision: z.number().int().positive(), kind: z.string().min(1).max(40), actorId: z.string().min(1), at: DATE, detail: z.string().max(1000).optional() }).strict()).max(1000),
}).strict();
export type Possibility = z.infer<typeof possibilitySchema>;

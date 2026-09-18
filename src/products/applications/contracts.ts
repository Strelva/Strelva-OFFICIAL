import { z } from "zod";
import { baseSchema } from "@/platform/bounded-work/contracts";

/** Bounded-work compatibility keeps a clear failure at these finite limits. */
export const APPLICATION_RECORD_LIMIT = 1_000;
export const APPLICATION_VERSION_HISTORY_LIMIT = 100;

const fieldId = z.string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/)
  .refine((value) => !["constructor", "prototype"].includes(value), "Choose a different field name");

const fieldSchema = z.object({
  id: fieldId,
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "number", "boolean"]),
  required: z.boolean().default(false),
}).strict();

const componentSchema = z.object({
  kind: z.enum(["form", "list", "detail", "document"]),
  fields: z.array(z.string()).min(1).max(30),
}).strict();

/** The fixed, data-only definition that a native application can execute. */
export const applicationSpecSchema = z.object({
  title: z.string().trim().min(1).max(160),
  maintenanceOwner: z.string().min(1).max(100),
  fields: z.array(fieldSchema).min(1).max(30),
  components: z.array(componentSchema).min(1).max(12),
}).strict().superRefine((spec, ctx) => {
  const ids = new Set(spec.fields.map((field) => field.id));
  if (ids.size !== spec.fields.length) {
    ctx.addIssue({ code: "custom", message: "Field names must be unique", path: ["fields"] });
  }
  if (spec.components.some((component) => component.fields.some((id) => !ids.has(id)))) {
    ctx.addIssue({ code: "custom", message: "Components may only reference declared fields", path: ["components"] });
  }
});

export const recordSchema = z.object({
  id: z.string().trim().min(1).max(100),
  values: z.record(z.string(), z.union([
    z.string().max(10_000),
    z.number().finite(),
    z.boolean(),
  ])),
}).strict();

export const applicationRehearsalCheckSchema = z.object({
  name: z.string().trim().min(1).max(160),
  passed: z.boolean(),
}).strict();

export const applicationRehearsalSchema = z.object({
  specVersion: z.number().int().positive(),
  checks: z.array(applicationRehearsalCheckSchema).min(1).max(12),
}).strict();

/** Candidate edits have their own optimistic clock and never replace a release. */
export const applicationCandidateSchema = z.object({
  designRevision: z.number().int().nonnegative(),
  specVersion: z.number().int().positive(),
  spec: applicationSpecSchema,
  rehearsal: applicationRehearsalSchema.nullable(),
}).strict();

/** A release is immutable after publication. Rollback changes the active pointer. */
export const applicationReleaseSchema = z.object({
  version: z.number().int().positive(),
  spec: applicationSpecSchema,
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  publishedBy: z.string().min(1).max(100).nullable(),
  /** Legacy rows are retained as data, but their historical approval is unknown. */
  provenance: z.enum(["published", "legacy_migrated"]).default("published"),
}).strict();

export const applicationRuntimeSchema = z.object({
  workId: z.string().min(1),
  workspaceId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  release: applicationReleaseSchema,
  recordsRevision: z.number().int().nonnegative(),
  records: z.array(recordSchema).max(1_000),
}).strict();

const applicationHistoryEntrySchema = z.object({
  revision: z.number().int().positive(),
  kind: z.string().min(1),
  actorId: z.string().min(1),
  // Postgres emits offset timestamps while browser-created payloads use Z.
  // Both are valid ISO instants and must survive the compatibility projection.
  at: z.string().datetime({ offset: true }),
});

/**
 * Compatibility projection for the existing bounded-work dashboard. The
 * candidate and active release are included beside the frozen legacy fields so
 * old links keep parsing while new consumers can choose the right lifecycle.
 */
export const applicationSchema = baseSchema.extend({
  createdAt: z.string().datetime({ offset: true }),
  history: z.array(applicationHistoryEntrySchema).max(500),
  spec: applicationSpecSchema,
  specVersion: z.number().int().positive(),
  status: z.enum(["draft", "installed", "retired"]),
  versions: z.array(z.object({ version: z.number().int().positive(), spec: applicationSpecSchema }).strict()).max(APPLICATION_VERSION_HISTORY_LIMIT),
  rehearsal: applicationRehearsalSchema.nullable(),
  records: z.array(recordSchema).max(APPLICATION_RECORD_LIMIT),
  installation: z.object({
    sourceWorkId: z.string().uuid(),
    sourceVersion: z.number().int().positive(),
    baseSpec: applicationSpecSchema,
  }).strict().optional(),
  designRevision: z.number().int().nonnegative().optional(),
  recordsRevision: z.number().int().nonnegative().optional(),
  candidate: applicationCandidateSchema.optional(),
  release: applicationReleaseSchema.nullable().optional(),
  releases: z.array(applicationReleaseSchema).max(APPLICATION_VERSION_HISTORY_LIMIT).optional(),
}).strict();

export type ApplicationSpec = z.infer<typeof applicationSpecSchema>;
export type ApplicationRecord = z.infer<typeof recordSchema>;
export type ApplicationCandidate = z.infer<typeof applicationCandidateSchema>;
export type ApplicationRelease = z.infer<typeof applicationReleaseSchema>;
export type ApplicationRuntime = z.infer<typeof applicationRuntimeSchema>;

const expectedRevision = z.number().int().nonnegative();
const expectedReleaseVersion = z.number().int().nonnegative().nullable();

export const applicationReviseInputSchema = z.object({
  expectedDesignRevision: expectedRevision,
  spec: applicationSpecSchema,
}).strict();

export const applicationRehearseInputSchema = z.object({
  expectedDesignRevision: expectedRevision,
}).strict();

export const applicationPublishInputSchema = z.object({
  expectedCandidateRevision: expectedRevision,
  expectedReleaseVersion,
}).strict();

export const applicationRollbackInputSchema = z.object({
  expectedDesignRevision: expectedRevision,
  expectedReleaseVersion,
  version: z.number().int().positive(),
}).strict();

export const applicationSubmitInputSchema = z.object({
  expectedReleaseVersion: z.number().int().positive(),
  expectedRecordsRevision: expectedRevision,
  record: recordSchema,
}).strict();

/**
 * The command route keeps the old aggregate revision for compatibility. New
 * callers should use the explicit lifecycle commands or the service methods.
 */
export const applicationCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("adopt_update"),
    expectedRevision,
    sourceVersion: z.number().int().positive(),
  }).strict(),
  z.object({
    kind: z.literal("revise"),
    expectedRevision: expectedRevision.optional(),
    expectedDesignRevision: expectedRevision.optional(),
    spec: applicationSpecSchema,
  }).strict().refine((value) => value.expectedRevision !== undefined || value.expectedDesignRevision !== undefined, "A candidate revision is required"),
  z.object({
    kind: z.enum(["rehearse", "install", "retire"]),
    expectedRevision: expectedRevision.optional(),
    expectedDesignRevision: expectedRevision.optional(),
  }).strict().refine((value) => value.expectedRevision !== undefined || value.expectedDesignRevision !== undefined, "A candidate revision is required"),
  z.object({
    kind: z.literal("rollback"),
    expectedRevision: expectedRevision,
    version: z.number().int().positive(),
  }).strict(),
  z.object({
    kind: z.literal("publish"),
    expectedCandidateRevision: expectedRevision,
    expectedReleaseVersion,
  }).strict(),
  z.object({
    kind: z.literal("rollback_release"),
    expectedDesignRevision: expectedRevision,
    expectedReleaseVersion,
    version: z.number().int().positive(),
  }).strict(),
  z.object({
    kind: z.literal("submit"),
    expectedRevision: expectedRevision.optional(),
    expectedReleaseVersion: z.number().int().positive().optional(),
    expectedRecordsRevision: expectedRevision.optional(),
    record: recordSchema,
  }).strict().refine((value) => (
    value.expectedRevision !== undefined ||
    (value.expectedReleaseVersion !== undefined && value.expectedRecordsRevision !== undefined)
  ), "A legacy or released record revision is required"),
]);

export type ApplicationCommand = z.infer<typeof applicationCommandSchema>;

import { z } from "zod";

export const CUSTOM_APPLICATION_PRODUCT = "custom-applications" as const;
export const CUSTOM_APPLICATION_RESOURCE_KIND = "custom-application" as const;

export const CUSTOM_APPLICATION_SOURCE_BYTES = 512_000;
export const CUSTOM_APPLICATION_FILE_LIMIT = 30;
export const CUSTOM_APPLICATION_VERSION_LIMIT = 100;
export const CUSTOM_APPLICATION_GRANT_LIMIT = 100;

const filePath = z.string()
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/)
  .refine(path => path.split("/").every(part => part !== "." && part !== ".." && part !== ""), "Choose a valid source path");

export const customApplicationFilesSchema = z.record(filePath, z.string())
  .refine(files => Object.keys(files).length > 0 && Object.keys(files).length <= CUSTOM_APPLICATION_FILE_LIMIT, "Add between one and thirty source files")
  .refine(files => typeof files["build.mjs"] === "string", "A build.mjs entry is required")
  .refine(files => Object.values(files).reduce((sum, value) => sum + new TextEncoder().encode(value).byteLength, 0) <= CUSTOM_APPLICATION_SOURCE_BYTES, "Source exceeds the build limit");

export const customApplicationBudgetSchema = z.object({
  maxAuthorizedCents: z.number().int().min(0).max(1_000_000),
  estimateCents: z.number().int().min(0).max(1_000_000).nullable().default(null),
  payerId: z.string().uuid().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.estimateCents !== null && value.estimateCents > value.maxAuthorizedCents) {
    ctx.addIssue({ code: "custom", path: ["estimateCents"], message: "The estimate cannot exceed the authorized maximum." });
  }
});
export type CustomApplicationBudget = z.infer<typeof customApplicationBudgetSchema>;

export const customApplicationCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  maintenanceOwner: z.string().uuid().optional(),
  files: customApplicationFilesSchema,
  budget: customApplicationBudgetSchema,
}).strict();
export type CustomApplicationCreateInput = z.infer<typeof customApplicationCreateInputSchema>;

export const customApplicationReviseInputSchema = z.object({
  expectedCandidateRevision: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(160),
  files: customApplicationFilesSchema,
}).strict();
export type CustomApplicationReviseInput = z.infer<typeof customApplicationReviseInputSchema>;

export const customApplicationBuildInputSchema = z.object({
  expectedCandidateRevision: z.number().int().nonnegative(),
}).strict();
export type CustomApplicationBuildInput = z.infer<typeof customApplicationBuildInputSchema>;

const reviewCheckSchema = z.object({
  id: z.enum(["build", "desktop", "mobile", "keyboard"]),
  passed: z.literal(true),
  evidence: z.string().trim().min(1).max(500),
}).strict();

export const customApplicationReviewInputSchema = z.object({
  expectedCandidateRevision: z.number().int().nonnegative(),
  artifactDigest: z.string().regex(/^[a-f0-9]{64}$/),
  checks: z.array(reviewCheckSchema).length(4),
}).strict().superRefine((value, ctx) => {
  const ids = value.checks.map(check => check.id);
  if (new Set(ids).size !== ids.length || !["build", "desktop", "mobile", "keyboard"].every(id => ids.includes(id as typeof ids[number]))) {
    ctx.addIssue({ code: "custom", path: ["checks"], message: "Review must cover build, desktop, mobile, and keyboard checks." });
  }
});
export type CustomApplicationReviewInput = z.infer<typeof customApplicationReviewInputSchema>;

export const customApplicationReleaseInputSchema = z.object({
  expectedCandidateRevision: z.number().int().nonnegative(),
  expectedReleaseVersion: z.number().int().positive().nullable(),
}).strict();
export type CustomApplicationReleaseInput = z.infer<typeof customApplicationReleaseInputSchema>;

export const customApplicationRollbackInputSchema = z.object({
  expectedReleaseVersion: z.number().int().positive().nullable(),
  version: z.number().int().positive(),
}).strict();
export type CustomApplicationRollbackInput = z.infer<typeof customApplicationRollbackInputSchema>;

export const customApplicationGrantInputSchema = z.object({
  recipientEmail: z.string().trim().toLowerCase().email().max(254),
  releaseVersion: z.number().int().positive().optional(),
  purpose: z.string().trim().min(1).max(500),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();
export type CustomApplicationGrantInput = z.infer<typeof customApplicationGrantInputSchema>;

export const customApplicationGrantSchema = customApplicationGrantInputSchema.extend({
  id: z.string().uuid(),
  workId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  releaseVersion: z.number().int().positive(),
  status: z.enum(["active", "revoked"]),
  grantedBy: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();
export type CustomApplicationGrant = z.infer<typeof customApplicationGrantSchema>;

export const customApplicationReviewSchema = z.object({
  artifactDigest: z.string().regex(/^[a-f0-9]{64}$/),
  checks: z.array(reviewCheckSchema).length(4),
  reviewedBy: z.string().uuid(),
  reviewedAt: z.string().datetime({ offset: true }),
}).strict();
export type CustomApplicationReview = z.infer<typeof customApplicationReviewSchema>;

export const customApplicationArtifactSummarySchema = z.object({
  applicationVersion: z.number().int().positive(),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  artifactDigest: z.string().regex(/^[a-f0-9]{64}$/),
  image: z.string().min(1).max(256),
  builtAt: z.string().datetime({ offset: true }),
  durationMs: z.number().int().nonnegative(),
  state: z.literal("built"),
  limits: z.object({
    network: z.literal("none"), memoryMb: z.number().int().positive(), cpuCount: z.number().positive(), timeoutSeconds: z.number().positive(),
  }).strict(),
  review: customApplicationReviewSchema.nullable(),
}).strict();
export type CustomApplicationArtifactSummary = z.infer<typeof customApplicationArtifactSummarySchema>;

export const customApplicationReleaseSchema = z.object({
  version: z.number().int().positive(),
  artifactDigest: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.string().datetime({ offset: true }),
  publishedBy: z.string().uuid(),
  review: customApplicationReviewSchema,
}).strict();
export type CustomApplicationRelease = z.infer<typeof customApplicationReleaseSchema>;

export const customApplicationBudgetBindingSchema = z.object({
  jobId: z.string().uuid(),
  maxAuthorizedCents: z.number().int().min(0).max(1_000_000),
  estimateCents: z.number().int().min(0).max(1_000_000).nullable(),
  status: z.enum(["accepted", "unavailable"]),
}).strict();
export type CustomApplicationBudgetBinding = z.infer<typeof customApplicationBudgetBindingSchema>;

export const customApplicationCandidateSchema = z.object({
  revision: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  files: customApplicationFilesSchema,
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  artifact: customApplicationArtifactSummarySchema.nullable(),
}).strict();
export type CustomApplicationCandidate = z.infer<typeof customApplicationCandidateSchema>;

export const customApplicationSchema = z.object({
  version: z.literal(1),
  workId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  maintenanceOwner: z.string().uuid(),
  status: z.enum(["draft", "released", "retired"]),
  candidate: customApplicationCandidateSchema,
  currentReleaseVersion: z.number().int().positive().nullable(),
  releases: z.array(customApplicationReleaseSchema).max(CUSTOM_APPLICATION_VERSION_LIMIT),
  budget: customApplicationBudgetBindingSchema.nullable(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();
export type CustomApplication = z.infer<typeof customApplicationSchema>;

export const customApplicationUseSchema = z.object({
  workId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  releaseVersion: z.number().int().positive(),
  artifactDigest: z.string().regex(/^[a-f0-9]{64}$/),
  html: z.string().min(1),
  grant: customApplicationGrantSchema,
}).strict();
export type CustomApplicationUse = z.infer<typeof customApplicationUseSchema>;

// Preview bytes are returned only through the manager preview endpoint. They
// stay out of the workspace projection and the lifecycle summary so a large
// immutable artifact is not copied into ordinary workspace reads.
export const customApplicationPreviewSchema = z.object({
  applicationVersion: z.number().int().positive(),
  artifactDigest: z.string().regex(/^[a-f0-9]{64}$/),
  html: z.string().min(1),
}).strict();
export type CustomApplicationPreview = z.infer<typeof customApplicationPreviewSchema>;

export interface CustomApplicationArtifact {
  version: 1; workspaceId: string; resourceId: string; applicationVersion: number;
  sourceDigest: string; artifactDigest: string; image: string; html: string;
  builtAt: string; durationMs: number; state: "built";
  limits: { network: "none"; memoryMb: 256; cpuCount: 1; timeoutSeconds: 30 };
}

export type CustomBuildArtifact = CustomApplicationArtifact;

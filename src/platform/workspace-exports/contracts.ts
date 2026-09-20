import { z } from "zod";
import { workspaceExitStateSchema } from "@/platform/workspace-exit/contracts";

const instant = z.string().datetime({ offset: true });
const cents = z.number().int().nonnegative().nullable();

export const workspaceExportSchema = z.object({
  schemaVersion: z.literal(2),
  exportId: z.string().uuid(),
  exportedAt: instant,
  workspace: z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120),
    kind: z.enum(["personal", "agency", "customer"]),
    createdAt: instant,
    updatedAt: instant,
  }).strict(),
  manifest: z.object({
    scope: z.literal("current_workspace_portability_snapshot"),
    included: z.tuple([
      z.literal("workspace_identity"), z.literal("saved_results"),
      z.literal("native_application_releases"), z.literal("native_application_records"),
      z.literal("economics_authorizations"), z.literal("economics_reservations"),
      z.literal("economics_usage_receipts"), z.literal("economics_execution_outcomes"),
      z.literal("onboarding_cases"), z.literal("onboarding_attachment_references"),
      z.literal("workspace_exit_state"),
    ]),
    omitted: z.tuple([
      z.literal("credentials"), z.literal("provider_connection_data"),
      z.literal("invitation_tokens"), z.literal("agent_tokens"),
      z.literal("idempotency_keys"), z.literal("command_digests"),
      z.literal("internal_product_learning"), z.literal("operator_notes"),
      z.literal("onboarding_raw_attachment_bytes"), z.literal("deletion_and_retention_policy"),
    ]),
    unavailable: z.array(z.object({ category: z.string().min(1), reason: z.string().min(1) }).strict()).length(9),
    maximumBytes: z.literal(2_000_000),
    attachmentMaximumBytes: z.literal(2_000_000),
    maxAttachmentReferences: z.literal(500),
  }).strict(),
  savedResults: z.array(z.object({
    id: z.string().uuid(), productId: z.string(), resourceKind: z.string(), title: z.string().nullable(),
    payload: z.unknown(), sourceWorkId: z.string().uuid().nullable(), createdAt: instant, updatedAt: instant,
  }).strict()),
  nativeApplications: z.object({
    releases: z.array(z.object({ workId: z.string().uuid(), version: z.number().int().positive(), spec: z.unknown(), publishedAt: instant.nullable(), publicationSource: z.enum(["published", "legacy_migrated"]) }).strict()),
    records: z.array(z.object({ workId: z.string().uuid(), recordId: z.string(), values: z.unknown(), recordSource: z.enum(["submitted", "legacy_migrated"]), createdAt: instant, updatedAt: instant }).strict()),
  }).strict(),
  onboarding: z.object({
    cases: z.array(z.object({
      workId: z.string().uuid(), title: z.string().min(1).max(160), case: z.unknown(), createdAt: instant, updatedAt: instant,
    }).strict()),
    attachments: z.array(z.object({
      workId: z.string().uuid(), caseWorkId: z.string().uuid(), requirementId: z.string().uuid(),
      title: z.string().min(1).max(160), originalName: z.string().min(1).max(180),
      contentType: z.string().min(1).max(120), size: z.number().int().nonnegative().max(2_000_000),
      sha256: z.string().regex(/^[a-f0-9]{64}$/), uploadedAt: instant,
      downloadReference: z.string().regex(/^\/api\/onboarding\/file\?workId=[0-9a-f-]{36}$/),
      extraction: z.object({
        status: z.enum(["available", "unavailable"]), provider: z.enum(["local-text", "existing-document", "none"]),
        message: z.string().min(1).max(500), truncated: z.boolean(),
      }).strict(),
    }).strict()),
  }).strict(),
  lifecycle: z.object({ exit: workspaceExitStateSchema.nullable() }).strict(),
  economics: z.object({
    jobs: z.array(z.object({
      id: z.string().uuid(), workId: z.string().uuid(), productId: z.string(), resourceKind: z.string(),
      payerId: z.string().uuid(), acceptedBy: z.string().uuid().nullable(), currency: z.literal("usd"),
      estimateCents: cents, maximumAuthorizedCents: z.number().int().nonnegative(), reservedCents: z.number().int().nonnegative(),
      usedCents: z.number().int().nonnegative(), strelvaRetryCents: z.number().int().nonnegative(), actualCents: cents,
      actualKnown: z.boolean(), status: z.enum(["draft", "accepted", "reserved", "settled", "cancelled"]),
      acceptedAt: instant.nullable(), createdAt: instant, updatedAt: instant,
    }).strict()),
    reservations: z.array(z.object({ jobId: z.string().uuid(), amountCents: z.number().int().nonnegative(), createdAt: instant }).strict()),
    usageReceipts: z.array(z.object({ jobId: z.string().uuid(), kind: z.enum(["provider", "model", "tool", "human"]), attribution: z.enum(["normal", "strelva_retry"]), amountCents: cents, source: z.enum(["operator_reported", "runtime_reported"]), createdAt: instant }).strict()),
    executionOutcomes: z.array(z.object({ jobId: z.string().uuid(), maximumCents: z.number().int().nonnegative(), kind: z.enum(["provider", "model", "tool", "human"]), attribution: z.enum(["normal", "strelva_retry"]), status: z.enum(["reserved", "running", "finished"]), effect: z.enum(["accepted", "none", "unknown"]).nullable(), amountCents: cents, billableCents: cents, createdAt: instant, startedAt: instant.nullable(), finishedAt: instant.nullable(), reconciliationReference: z.string().nullable() }).strict()),
  }).strict(),
}).strict();

export type WorkspaceExportSnapshot = z.infer<typeof workspaceExportSchema>;

import { z } from "zod";

const instant = z.string().datetime({ offset: true });
const cents = z.number().int().nonnegative().nullable();

export const workspaceExportSchema = z.object({
  schemaVersion: z.literal(1),
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
    ]),
    omitted: z.tuple([
      z.literal("credentials"), z.literal("provider_connection_data"),
      z.literal("invitation_tokens"), z.literal("agent_tokens"),
      z.literal("idempotency_keys"), z.literal("command_digests"),
      z.literal("internal_product_learning"), z.literal("operator_notes"),
    ]),
    unavailable: z.array(z.object({ category: z.string().min(1), reason: z.string().min(1) }).strict()).length(5),
    maximumBytes: z.literal(2_000_000),
  }).strict(),
  savedResults: z.array(z.object({
    id: z.string().uuid(), productId: z.string(), resourceKind: z.string(), title: z.string().nullable(),
    payload: z.unknown(), sourceWorkId: z.string().uuid().nullable(), createdAt: instant, updatedAt: instant,
  }).strict()),
  nativeApplications: z.object({
    releases: z.array(z.object({ workId: z.string().uuid(), version: z.number().int().positive(), spec: z.unknown(), publishedAt: instant.nullable(), publicationSource: z.enum(["published", "legacy_migrated"]) }).strict()),
    records: z.array(z.object({ workId: z.string().uuid(), recordId: z.string(), values: z.unknown(), recordSource: z.enum(["submitted", "legacy_migrated"]), createdAt: instant, updatedAt: instant }).strict()),
  }).strict(),
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

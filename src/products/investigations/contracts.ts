import { z } from "zod";
import { baseSchema } from "@/platform/bounded-work/contracts";
const savedInvestigationSourceSchema = z.object({ workId: z.string().uuid(), keyField: z.string().max(100).optional(), valueField: z.string().max(100).optional() }).strict();
const publicWebsiteInvestigationSourceSchema = z.object({ kind: z.literal("public_website"), url: z.string().trim().url().max(2_048) }).strict();
export const investigationSourceSchema = z.union([savedInvestigationSourceSchema, publicWebsiteInvestigationSourceSchema]);
const investigationModeSchema = z.enum(["comparison", "public_website"]);
const investigationSourcesSchema = z.array(investigationSourceSchema).min(1).max(2);
export const investigationInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  intervalMinutes: z.number().int().min(15).max(43200),
  mode: investigationModeSchema.default("comparison"),
  sources: investigationSourcesSchema,
}).strict().superRefine((value, context) => {
  if (value.mode === "public_website") {
    const source = value.sources[0];
    if (value.sources.length !== 1 || !source || !("kind" in source) || source.kind !== "public_website") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["sources"], message: "A public website check monitors one public page." });
    }
    return;
  }
  if (value.sources.length !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sources"], message: "A source comparison needs two sources." });
    return;
  }
  const [first, second] = value.sources;
  if (!first || !second) return;
  const identity = (source: z.infer<typeof investigationSourceSchema>) => "kind" in source ? `${source.kind}:${source.url}` : `work:${source.workId}`;
  if (identity(first) === identity(second)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["sources"], message: "Select two different sources" });
});
const differenceSchema = z.object({ key: z.string(), left: z.string().nullable(), right: z.string().nullable() });
const sourceStateSchema = z.object({
  workId: z.string(),
  kind: z.enum(["saved_work", "public_website"]).optional(),
  sourceUrl: z.string().url().max(2_048).optional(),
  status: z.enum(["available", "unknown", "missing", "inaccessible", "changed", "unavailable", "rate_limited", "access_denied"]),
  freshness: z.enum(["fresh", "unavailable"]).optional(),
  revision: z.number().int().nullable(),
  updatedAt: z.string().nullable(),
});
const sourceReferenceSchema = z.object({
  workId: z.string().max(2_048),
  kind: z.enum(["saved_work", "public_website"]).optional(),
  sourceUrl: z.string().url().max(2_048).optional(),
  observedAt: z.string().datetime().optional(),
  freshness: z.enum(["fresh", "unavailable"]).optional(),
  status: z.enum(["available", "unknown", "missing", "inaccessible", "changed", "unavailable", "rate_limited", "access_denied"]).optional(),
  contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  auditFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  contentLength: z.number().int().nonnegative().optional(),
  contentExcerpt: z.string().max(4_000).optional(),
  contentVisibility: z.enum(["server_visible", "server_visible_truncated", "no_server_visible_text"]).optional(),
  fetchedUrl: z.string().url().max(2_048).optional(),
  revision: z.number().int(),
  updatedAt: z.string().datetime(),
}).strict();
export const investigationSchema = baseSchema.extend({
  mode: investigationModeSchema.default("comparison"), sources: investigationSourcesSchema, intervalMinutes: z.number().int().min(15).max(43200), status: z.enum(["active", "paused"]), nextRunAt: z.string().datetime(),
  runs: z.array(z.object({
    requestId: z.string(),
    at: z.string().datetime(),
    result: z.enum(["baseline", "agreement", "discrepancy", "changed", "no_change", "unavailable"]),
    fingerprint: z.string(),
    sources: z.array(sourceReferenceSchema).min(1).max(2),
    differences: z.array(differenceSchema).max(1000),
    unavailableReason: z.enum(["missing_source", "inaccessible_source", "source_changed", "limited_evidence"]).optional(),
    retryable: z.boolean().optional(),
    sourceStates: z.array(sourceStateSchema).min(1).max(2).optional(),
  })).max(200),
}).superRefine((value, context) => {
  const source = value.sources[0];
  if (value.mode === "public_website" && (value.sources.length !== 1 || !source || !("kind" in source) || source.kind !== "public_website")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sources"], message: "A public website check monitors one public page." });
  }
  if (value.mode === "comparison" && value.sources.length !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sources"], message: "A source comparison needs two sources." });
  }
});

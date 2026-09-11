import { z } from "zod";
import { presentAssessmentWork, assessmentKindForResource, type AssessmentResult } from "@/products/assessment";
import { documentSchema, type WorkspaceDocument } from "@/products/documents/engine";
import { getWork, type SavedWork, type WorkspaceActor } from "@/platform/workspaces";
import { parseTrackerWorkPayload } from "@/products/tracker/presentation";
import {
  workPlanContextSourceReferenceSchema,
  workPlanEvidenceSchema,
  type WorkPlanContextSourceReference,
  type WorkPlanEvidence,
} from "./contracts";

/**
 * The context handoff is deliberately small. A selected work item is a
 * reference to private saved work, not permission for the planner to search
 * the workspace or read another product's storage format.
 */
export const WORK_PLAN_CONTEXT_VERSION = 1 as const;
export const WORK_PLAN_CONTEXT_LIMITS = Object.freeze({
  maxSources: 6,
  maxEvidenceItems: 12,
  maxEvidenceValueCharacters: 2_000,
  maxDocumentTextCharacters: 4_000,
  maxTrackerColumns: 24,
  maxTrackerRows: 8,
  maxTrackerCellCharacters: 240,
  maxAssessmentFindings: 8,
});

const sourceIdSchema = z.string().uuid();

export const workPlanContextRequestSchema = z.object({
  workspaceId: sourceIdSchema,
  sourceWorkIds: z.array(sourceIdSchema)
    .min(1)
    .max(WORK_PLAN_CONTEXT_LIMITS.maxSources)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose each source only once." });
      }
    }),
}).strict();

export type WorkPlanContextRequest = z.infer<typeof workPlanContextRequestSchema>;

export type WorkPlanContextSourceKind = "document" | "tracker" | "assessment";

// Keep the historical context-module export stable while the source reference
// schema is shared with the saved-plan response contract.
export { workPlanContextSourceReferenceSchema };
export type { WorkPlanContextSourceReference } from "./contracts";

export const preparedWorkPlanContextSchema = z.object({
  version: z.literal(WORK_PLAN_CONTEXT_VERSION),
  sources: z.array(workPlanContextSourceReferenceSchema).min(1).max(WORK_PLAN_CONTEXT_LIMITS.maxSources),
  evidence: z.array(workPlanEvidenceSchema).max(WORK_PLAN_CONTEXT_LIMITS.maxEvidenceItems),
}).strict();

export type PreparedWorkPlanContext = z.infer<typeof preparedWorkPlanContextSchema>;
/** Short alias for callers that describe the prepared object as context. */
export type WorkPlanContext = PreparedWorkPlanContext;

export type WorkPlanContextSourceErrorCode =
  | "not_found"
  | "wrong_workspace"
  | "unsupported"
  | "malformed";

/** A selected source must be readable and understood in full. */
export class WorkPlanContextSourceError extends Error {
  readonly sourceWorkId: string;
  readonly code: WorkPlanContextSourceErrorCode;

  constructor(sourceWorkId: string, code: WorkPlanContextSourceErrorCode, message: string) {
    super(message);
    this.name = "WorkPlanContextSourceError";
    this.sourceWorkId = sourceWorkId;
    this.code = code;
  }
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\u0000/g, "").trim();
  if (clean.length <= max) return clean;
  const suffix = "… [truncated]";
  return `${clean.slice(0, Math.max(1, max - suffix.length)).trimEnd()}${suffix}`.slice(0, max);
}

function titleFor(work: SavedWork, fallback: string): string {
  return clip(work.title?.trim() || fallback, 160) || fallback;
}

const sensitiveNamePattern = /(?:api[\s_-]*key|access[\s_-]*key|client[\s_-]*secret|secret|password|passcode|token|credential|authorization|cookie|private[\s_-]*key|ssh[\s_-]*key|social[\s_-]*security|ssn|credit[\s_-]*card|card[\s_-]*number)/i;
const sensitiveValuePattern = /(?:^|\s)(?:sk|pk|ghp|github_pat|xox[baprs])[_-][a-z0-9_-]{8,}|(?:api[\s_-]*key|access[\s_-]*key|secret|password|token)\s*[:=]\s*\S+/i;

function sensitiveField(value: string): boolean {
  return sensitiveNamePattern.test(value);
}

function safeCell(value: string, sensitive: boolean): string {
  if (sensitive || sensitiveValuePattern.test(value)) return "[redacted]";
  return clip(value, WORK_PLAN_CONTEXT_LIMITS.maxTrackerCellCharacters) || "(empty)";
}

function documentContext(work: SavedWork): {
  source: WorkPlanContextSourceReference;
  evidence: WorkPlanEvidence;
} {
  const parsed = documentSchema.safeParse(work.payload);
  if (!parsed.success) {
    throw new WorkPlanContextSourceError(work.id, "malformed", "The selected document cannot be used as planning context.");
  }
  const document = parsed.data as WorkspaceDocument;
  const title = titleFor(work, document.title);
  return {
    source: workPlanContextSourceReferenceSchema.parse({
      workId: work.id,
      productId: work.productId,
      resourceKind: work.resourceKind,
      kind: "document",
      title,
      version: document.version,
      revision: document.revision,
      updatedAt: work.updatedAt,
    }),
    // Keep the document value as plaintext. Metadata and revision receipts
    // remain in the source reference and never enter the model evidence.
    evidence: workPlanEvidenceSchema.parse({
      label: `Document: ${clip(title, 100)} (revision ${document.revision})`,
      value: clip(document.text, Math.min(
        WORK_PLAN_CONTEXT_LIMITS.maxDocumentTextCharacters,
        WORK_PLAN_CONTEXT_LIMITS.maxEvidenceValueCharacters,
      )) || "(The document has no text.)",
    }),
  };
}

function trackerContext(work: SavedWork): {
  source: WorkPlanContextSourceReference;
  evidence: WorkPlanEvidence;
} {
  const tracker = parseTrackerWorkPayload(work.payload);
  if (!tracker) {
    throw new WorkPlanContextSourceError(work.id, "malformed", "The selected tracker cannot be used as planning context.");
  }
  const title = titleFor(work, tracker.title);
  const columns = tracker.columns.slice(0, WORK_PLAN_CONTEXT_LIMITS.maxTrackerColumns).map((column, index) => ({
    index: index + 1,
    label: sensitiveField(column.label) || sensitiveField(column.sourceHeader)
      ? "[redacted field]"
      : clip(column.label, 80) || `Field ${index + 1}`,
    kind: column.kind,
    sensitive: sensitiveField(column.label) || sensitiveField(column.sourceHeader),
  }));
  const activeRows = tracker.rows.filter((row) => row.state === "active");
  const sampleRows = activeRows.slice(0, WORK_PLAN_CONTEXT_LIMITS.maxTrackerRows).map((row) =>
    Object.fromEntries(columns.map((column) => [
      `field_${column.index}`,
      safeCell(row.cells[tracker.columns[column.index - 1]?.id || ""]?.value || "", column.sensitive),
    ])));
  const summary = [
    `Tracker: ${title}`,
    `Revision: ${tracker.revision}`,
    `Active rows: ${activeRows.length}`,
    `Columns: ${columns.map((column) => `${column.label} (${column.kind})`).join(", ") || "(none)"}`,
    "Current sample rows:",
    JSON.stringify(sampleRows),
  ].join("\n");
  return {
    source: workPlanContextSourceReferenceSchema.parse({
      workId: work.id,
      productId: work.productId,
      resourceKind: work.resourceKind,
      kind: "tracker",
      title,
      version: 1,
      revision: tracker.revision,
      updatedAt: work.updatedAt,
    }),
    evidence: workPlanEvidenceSchema.parse({
      label: `Tracker: ${clip(title, 100)} (revision ${tracker.revision})`,
      value: clip(summary, WORK_PLAN_CONTEXT_LIMITS.maxEvidenceValueCharacters),
    }),
  };
}

function assessmentContext(work: SavedWork): {
  source: WorkPlanContextSourceReference;
  evidence: WorkPlanEvidence;
} {
  const assessment = presentAssessmentWork({
    id: work.id,
    workspaceId: work.workspaceId,
    productId: work.productId,
    resourceKind: work.resourceKind,
    title: work.title,
    payload: work.payload,
    createdAt: work.createdAt,
  });
  if (!assessment || !assessment.payload) {
    throw new WorkPlanContextSourceError(work.id, "malformed", "The selected assessment cannot be used as planning context.");
  }
  const title = titleFor(work, assessment.subject.name);
  return {
    source: workPlanContextSourceReferenceSchema.parse({
      workId: work.id,
      productId: work.productId,
      resourceKind: work.resourceKind,
      kind: "assessment",
      title,
      version: assessment.method.version ?? assessment.presentationVersion,
      revision: null,
      updatedAt: work.updatedAt,
    }),
    evidence: workPlanEvidenceSchema.parse({
      label: `Assessment: ${clip(title, 104)}`,
      value: clip(assessmentSummary(assessment), WORK_PLAN_CONTEXT_LIMITS.maxEvidenceValueCharacters),
    }),
  };
}

function assessmentSummary(assessment: AssessmentResult): string {
  if (!assessment.payload) return "The assessment has no usable result payload.";
  if (assessment.kind === "ai_visibility") {
    const payload = assessment.payload;
    return [
      `Method: ${assessment.method.label}`,
      `Business: ${clip(payload.business, 180)}`,
      payload.url ? `URL: ${clip(payload.url, 300)}` : "",
      `Score: ${payload.score} (${payload.grade})`,
      `Measurement: ${payload.measurementStatus || "legacy result"}`,
      `Verdict: ${clip(payload.verdict, 560)}`,
      `Top fix: ${clip(payload.topFix, 560)}`,
      "Signals:",
      ...payload.signals.slice(0, WORK_PLAN_CONTEXT_LIMITS.maxAssessmentFindings).map((signal) =>
        `- ${clip(signal.label, 100)}: ${signal.pass ? "pass" : "needs attention"} (${clip(signal.detail, 240)})`),
    ].filter(Boolean).join("\n");
  }

  const payload = assessment.payload;
  const findings = payload.categories.flatMap((category) => category.checks
    .filter((check) => check.status !== "pass")
    .map((check) => `${clip(category.name, 80)}: ${clip(check.name, 100)} - ${clip(check.message, 260)}`))
    .slice(0, WORK_PLAN_CONTEXT_LIMITS.maxAssessmentFindings);
  return [
    `Method: ${assessment.method.label}`,
    `URL: ${clip(payload.url, 300)}`,
    `Overall score: ${payload.overallScore} (${payload.grade})`,
    "Findings:",
    ...(findings.length ? findings.map((finding) => `- ${finding}`) : ["- No failing or warning checks were recorded."]),
  ].join("\n");
}

function sourceContext(work: SavedWork): { source: WorkPlanContextSourceReference; evidence: WorkPlanEvidence } {
  if (work.productId === "documents" && work.resourceKind === "document") return documentContext(work);
  if (work.productId === "tracker" && work.resourceKind === "tracker") return trackerContext(work);
  if (assessmentKindForResource(work.productId, work.resourceKind)) return assessmentContext(work);
  throw new WorkPlanContextSourceError(work.id, "unsupported", "The selected saved work type is not supported as planning context.");
}

/**
 * Resolve only explicitly selected saved work into bounded, untrusted model
 * evidence. `getWork` performs the current membership/delegation check for
 * every source, so an inaccessible item fails the whole preparation step.
 */
export async function prepareWorkPlanContext(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  sourceWorkIds: readonly string[];
}): Promise<PreparedWorkPlanContext> {
  const request = workPlanContextRequestSchema.parse({
    workspaceId: input.workspaceId,
    sourceWorkIds: [...input.sourceWorkIds],
  });
  const sources: WorkPlanContextSourceReference[] = [];
  const evidence: WorkPlanEvidence[] = [];

  for (const sourceWorkId of request.sourceWorkIds) {
    const work = await getWork(input.actor, sourceWorkId);
    if (!work) {
      throw new WorkPlanContextSourceError(sourceWorkId, "not_found", "A selected planning source is unavailable.");
    }
    if (work.workspaceId !== request.workspaceId) {
      throw new WorkPlanContextSourceError(sourceWorkId, "wrong_workspace", "A selected planning source belongs to another workspace.");
    }
    const prepared = sourceContext(work);
    sources.push(prepared.source);
    evidence.push(prepared.evidence);
  }

  return preparedWorkPlanContextSchema.parse({
    version: WORK_PLAN_CONTEXT_VERSION,
    sources,
    evidence,
  });
}

export type { WorkPlanEvidence } from "./contracts";

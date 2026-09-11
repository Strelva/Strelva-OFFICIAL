import { z } from "zod";
import {
  trackerExperimentEvidenceKindSchema,
  trackerExperimentMinutesSchema,
  trackerExperimentResultSchema,
  type TrackerExperimentEvidenceKind,
  type TrackerExperimentResult,
} from "./experiment";

/**
 * Candidate comparisons are intentionally small. They are a durable record of
 * a bounded R&D exercise, rather than a general experiment runner or offering
 * catalog. Keeping the cap in the contract prevents an accidental matrix UI
 * from becoming a second execution system.
 */
export const TRACKER_EXPERIMENT_COMPARISON_VERSION = 2 as const;
export const TRACKER_EXPERIMENT_MAX_CANDIDATES = 5 as const;
export const TRACKER_EXPERIMENT_MAX_FAILURES = 20 as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();
const money = z.number().finite().min(0).max(100_000).nullable();
const identifier = text(160);
const failure = z.string().trim().min(1).max(500);

export const trackerExperimentDecisionSchema = text(500);
export type TrackerExperimentDecision = z.infer<typeof trackerExperimentDecisionSchema>;

/**
 * The option contract is shared by the explicit baseline and each candidate.
 * Every option carries the same effort and cost dimensions so a comparison
 * cannot silently omit support or maintenance work.
 */
export const trackerExperimentOptionSchema = z.object({
  id: identifier,
  label: text(160),
  version: text(160),
  workload: optionalText(1_000),
  workloadKey: optionalText(160),
  setupMinutes: trackerExperimentMinutesSchema,
  reviewMinutes: trackerExperimentMinutesSchema,
  correctionMinutes: trackerExperimentMinutesSchema,
  supportMinutes: trackerExperimentMinutesSchema,
  maintenanceMinutes: trackerExperimentMinutesSchema,
  providerCostUsd: money,
  result: trackerExperimentResultSchema,
  evidenceKind: trackerExperimentEvidenceKindSchema.optional(),
  evidence: z.string().trim().max(2_000).optional(),
  testFailures: z.array(failure).max(TRACKER_EXPERIMENT_MAX_FAILURES).optional(),
});
export type TrackerExperimentOption = z.infer<typeof trackerExperimentOptionSchema>;

/** Input aliases make the migration tolerant of callers that use candidateId,
 * candidateVersion, costUsd, or evidenceSource while the stored shape stays
 * one predictable contract. */
function normalizeOption(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  return {
    ...source,
    id: source.id ?? source.candidateId,
    label: source.label ?? source.name,
    version: source.version ?? source.candidateVersion,
    providerCostUsd: source.providerCostUsd ?? source.costUsd ?? null,
  };
}

const rawComparisonSchema = z.object({
  hypothesis: text(1_000),
  /** Human-readable workload description. All options are checked against it. */
  workload: text(1_000),
  /** Optional stable key for the exact fixture or input set under test. */
  workloadKey: optionalText(160),
  inputScope: text(1_000),
  baseline: z.preprocess(normalizeOption, trackerExperimentOptionSchema),
  candidates: z.array(z.preprocess(normalizeOption, trackerExperimentOptionSchema))
    .min(1)
    .max(TRACKER_EXPERIMENT_MAX_CANDIDATES),
  evidenceKind: trackerExperimentEvidenceKindSchema,
  evidence: text(2_000),
  testFailures: z.array(failure).max(TRACKER_EXPERIMENT_MAX_FAILURES),
  decision: trackerExperimentDecisionSchema,
  /** Clients cannot opt themselves into promotion. The server may only add a
   * separate, explicit decision record in a later workflow. */
  promoted: z.literal(false).optional(),
});

function normalizeComparison(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  return {
    ...source,
    workloadKey: source.workloadKey ?? source.workloadId,
    inputScope: source.inputScope ?? source.scope,
    evidenceKind: source.evidenceKind ?? source.evidenceSource ?? source.evidenceMode,
    testFailures: source.testFailures ?? source.failures ?? [],
    decision: source.decision ?? source.promotionDecision,
    baseline: source.baseline,
    candidates: source.candidates,
  };
}

/**
 * Input accepted by the tracker server for a new comparison. The super-refine
 * checks the cross-option invariants that a field-only schema cannot express.
 */
export const trackerExperimentComparisonInputSchema = z.preprocess(
  normalizeComparison,
  rawComparisonSchema.superRefine((value, context) => {
    const options = [value.baseline, ...value.candidates];
    const ids = new Set<string>();
    for (const option of options) {
      if (ids.has(option.id)) {
        context.addIssue({ code: "custom", path: ["candidates"], message: "Baseline and candidates must have unique IDs." });
      }
      ids.add(option.id);
    }

    const declaredKey = value.workloadKey;
    const optionKeys = options.map((option) => option.workloadKey).filter((key): key is string => Boolean(key));
    const comparisonKey = declaredKey ?? optionKeys[0];
    if (declaredKey && optionKeys.some((key) => key !== declaredKey)) {
      context.addIssue({ code: "custom", path: ["workloadKey"], message: "Every option must use the same workload key." });
    }
    if (!declaredKey && optionKeys.some((key) => key !== comparisonKey)) {
      context.addIssue({ code: "custom", path: ["candidates"], message: "Every option must use the same workload key." });
    }

    const description = value.workload.trim();
    for (const [index, option] of options.entries()) {
      if (option.workload && option.workload.trim() !== description) {
        context.addIssue({
          code: "custom",
          path: index === 0 ? ["baseline", "workload"] : ["candidates", index - 1, "workload"],
          message: "Every option must describe the same workload.",
        });
      }
    }
  }),
);
export type TrackerExperimentComparisonInput = z.infer<typeof trackerExperimentComparisonInputSchema>;

export interface TrackerExperimentOptionSummary extends TrackerExperimentOption {
  evidenceKind: TrackerExperimentEvidenceKind;
  providerCostStatus: "known" | "unknown";
  totalHumanMinutes: number;
  /** Compatibility-friendly name used by the original experiment result. */
  observedMinutes: number;
}

export interface TrackerExperimentCandidateComparison {
  candidateId: string;
  candidateLabel: string;
  candidateVersion: string;
  result: TrackerExperimentResult;
  evidenceKind: TrackerExperimentEvidenceKind;
  totalHumanMinutes: number;
  observedMinutes: number;
  humanMinutesDifference: number;
  providerCostUsd: number | null;
  providerCostStatus: "known" | "unknown";
  providerCostDifferenceUsd: number | null;
}

export interface TrackerExperimentComparison {
  version: typeof TRACKER_EXPERIMENT_COMPARISON_VERSION;
  kind: "candidate_comparison";
  /** Added by the server when this summary is persisted as saved work. */
  targetWorkId?: string;
  targetRevision?: number;
  recordedBy?: string;
  recordedAt?: string;
  hypothesis: string;
  workload: string;
  workloadKey?: string;
  inputScope: string;
  baseline: TrackerExperimentOptionSummary;
  candidates: TrackerExperimentOptionSummary[];
  comparisons: TrackerExperimentCandidateComparison[];
  /** Alias for consumers that call the rows candidate results. */
  candidateResults: TrackerExperimentCandidateComparison[];
  evidenceKind: TrackerExperimentEvidenceKind;
  /** Alias retained for clients that use evidenceMode as the UI label. */
  evidenceMode: TrackerExperimentEvidenceKind;
  evidence: string;
  testFailures: string[];
  decision: TrackerExperimentDecision;
  /** Always false in this module. Promotion is a separate explicit action. */
  promoted: false;
  status: "experimental";
}

function optionMinutes(option: TrackerExperimentOption): number {
  return option.setupMinutes + option.reviewMinutes + option.correctionMinutes + option.supportMinutes + option.maintenanceMinutes;
}

function summarizeOption(option: TrackerExperimentOption, fallback: TrackerExperimentEvidenceKind): TrackerExperimentOptionSummary {
  const totalHumanMinutes = optionMinutes(option);
  const providerCostStatus = option.providerCostUsd === null ? "unknown" : "known";
  return {
    ...option,
    evidenceKind: option.evidenceKind ?? fallback,
    providerCostStatus,
    totalHumanMinutes,
    observedMinutes: totalHumanMinutes,
  };
}

/**
 * Validate and calculate a comparison without making a recommendation from a
 * single number. Unknown provider cost remains null through every derived row.
 */
export function summarizeTrackerComparison(input: TrackerExperimentComparisonInput): TrackerExperimentComparison {
  const checked = trackerExperimentComparisonInputSchema.parse(input);
  const baseline = summarizeOption(checked.baseline, checked.evidenceKind);
  const candidates = checked.candidates.map((option) => summarizeOption(option, checked.evidenceKind));
  const comparisons = candidates.map((candidate) => {
    const providerCostKnown = baseline.providerCostUsd !== null && candidate.providerCostUsd !== null;
    return {
      candidateId: candidate.id,
      candidateLabel: candidate.label,
      candidateVersion: candidate.version,
      result: candidate.result,
      evidenceKind: candidate.evidenceKind,
      totalHumanMinutes: candidate.totalHumanMinutes,
      observedMinutes: candidate.observedMinutes,
      humanMinutesDifference: baseline.totalHumanMinutes - candidate.totalHumanMinutes,
      providerCostUsd: candidate.providerCostUsd,
      providerCostStatus: candidate.providerCostStatus,
      providerCostDifferenceUsd: providerCostKnown ? baseline.providerCostUsd! - candidate.providerCostUsd! : null,
    } satisfies TrackerExperimentCandidateComparison;
  });
  const comparisonKey = checked.workloadKey ?? checked.baseline.workloadKey ?? checked.candidates.find((candidate) => candidate.workloadKey)?.workloadKey;
  return {
    version: TRACKER_EXPERIMENT_COMPARISON_VERSION,
    kind: "candidate_comparison",
    hypothesis: checked.hypothesis,
    workload: checked.workload,
    ...(comparisonKey ? { workloadKey: comparisonKey } : {}),
    inputScope: checked.inputScope,
    baseline,
    candidates,
    comparisons,
    candidateResults: comparisons,
    evidenceKind: checked.evidenceKind,
    evidenceMode: checked.evidenceKind,
    evidence: checked.evidence,
    testFailures: checked.testFailures ?? [],
    decision: checked.decision,
    promoted: false,
    status: "experimental",
  };
}

/** A safe parser for persisted v2 comparison payloads. */
export function parseTrackerExperimentComparison(value: unknown): TrackerExperimentComparison | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const source = value as Record<string, unknown>;
    if (source.kind !== "candidate_comparison" || source.version !== TRACKER_EXPERIMENT_COMPARISON_VERSION) return null;
    const parsed = trackerExperimentComparisonPayloadSchema.safeParse(source);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A full stored payload extends the calculated comparison with server binding. */
export const trackerExperimentComparisonPayloadSchema = z.object({
  version: z.literal(TRACKER_EXPERIMENT_COMPARISON_VERSION),
  kind: z.literal("candidate_comparison"),
  targetWorkId: text(200),
  targetRevision: z.number().int().nonnegative(),
  recordedBy: text(200),
  recordedAt: z.string().datetime(),
  hypothesis: text(1_000),
  workload: text(1_000),
  workloadKey: optionalText(160),
  inputScope: text(1_000),
  baseline: trackerExperimentOptionSchema.extend({
    providerCostStatus: z.enum(["known", "unknown"]),
    totalHumanMinutes: trackerExperimentMinutesSchema,
    observedMinutes: trackerExperimentMinutesSchema,
    evidenceKind: trackerExperimentEvidenceKindSchema,
  }),
  candidates: z.array(trackerExperimentOptionSchema.extend({
    providerCostStatus: z.enum(["known", "unknown"]),
    totalHumanMinutes: trackerExperimentMinutesSchema,
    observedMinutes: trackerExperimentMinutesSchema,
    evidenceKind: trackerExperimentEvidenceKindSchema,
  })).min(1).max(TRACKER_EXPERIMENT_MAX_CANDIDATES),
  comparisons: z.array(z.object({
    candidateId: text(160),
    candidateLabel: text(160),
    candidateVersion: text(160),
    result: trackerExperimentResultSchema,
    evidenceKind: trackerExperimentEvidenceKindSchema,
    totalHumanMinutes: trackerExperimentMinutesSchema,
    observedMinutes: trackerExperimentMinutesSchema,
    humanMinutesDifference: z.number().finite().min(-100_000).max(100_000),
    providerCostUsd: money,
    providerCostStatus: z.enum(["known", "unknown"]),
    providerCostDifferenceUsd: z.number().finite().min(-100_000).max(100_000).nullable(),
  })).min(1).max(TRACKER_EXPERIMENT_MAX_CANDIDATES),
  candidateResults: z.array(z.object({
    candidateId: text(160),
    candidateLabel: text(160),
    candidateVersion: text(160),
    result: trackerExperimentResultSchema,
    evidenceKind: trackerExperimentEvidenceKindSchema,
    totalHumanMinutes: trackerExperimentMinutesSchema,
    observedMinutes: trackerExperimentMinutesSchema,
    humanMinutesDifference: z.number().finite().min(-100_000).max(100_000),
    providerCostUsd: money,
    providerCostStatus: z.enum(["known", "unknown"]),
    providerCostDifferenceUsd: z.number().finite().min(-100_000).max(100_000).nullable(),
  })).min(1).max(TRACKER_EXPERIMENT_MAX_CANDIDATES),
  evidenceKind: trackerExperimentEvidenceKindSchema,
  evidenceMode: trackerExperimentEvidenceKindSchema,
  evidence: text(2_000),
  testFailures: z.array(failure).max(TRACKER_EXPERIMENT_MAX_FAILURES),
  decision: trackerExperimentDecisionSchema,
  promoted: z.literal(false),
  status: z.literal("experimental"),
});

/**
 * Alias used by the server-facing code. It describes the input, while the
 * payload schema above describes the server-bound durable record.
 */
export const trackerComparisonSchema = trackerExperimentComparisonInputSchema;
export const trackerComparisonInputSchema = trackerExperimentComparisonInputSchema;
export type TrackerComparison = TrackerExperimentComparison;
export type TrackerComparisonInput = TrackerExperimentComparisonInput;
export type { TrackerExperimentEvidenceKind, TrackerExperimentResult } from "./experiment";
export const summarizeTrackerExperimentComparison = summarizeTrackerComparison;

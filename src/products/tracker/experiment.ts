import { z } from "zod";

const minutes = z.number().finite().min(0).max(100_000);
export const trackerExperimentMinutesSchema = minutes;

/**
 * Evidence is deliberately a small, closed vocabulary. A simulation can help
 * choose what to test, an operator report records a person's observation, and
 * measured evidence has a repeatable source or instrument behind it. None of
 * these labels grant promotion or turn an estimate into a customer result.
 */
export const trackerExperimentEvidenceKindSchema = z.enum([
  "simulated",
  "operator_reported",
  "measured",
]);
export type TrackerExperimentEvidenceKind = z.infer<typeof trackerExperimentEvidenceKindSchema>;

export const trackerExperimentResultSchema = z.enum(["passed", "failed", "inconclusive"]);
export type TrackerExperimentResult = z.infer<typeof trackerExperimentResultSchema>;

export const trackerExperimentSchema = z.object({
  hypothesis: z.string().trim().min(1).max(1_000),
  workload: z.string().trim().min(1).max(1_000),
  baselineMinutes: minutes,
  setupMinutes: minutes,
  reviewMinutes: minutes,
  correctionMinutes: minutes,
  providerCostUsd: z.number().finite().min(0).max(100_000).nullable(),
  result: trackerExperimentResultSchema,
  evidence: z.string().trim().min(1).max(2_000),
});
export type TrackerExperiment = z.infer<typeof trackerExperimentSchema>;

/**
 * The form records which tracker revision the operator actually reviewed.
 * Keeping this beside the request schema prevents evidence from silently
 * attaching to a newer snapshot when the tracker changes between render and
 * submit.
 */
export const trackerExperimentInputSchema = trackerExperimentSchema.extend({
  expectedRevision: z.number().int().nonnegative(),
});
export type TrackerExperimentInput = z.infer<typeof trackerExperimentInputSchema>;

/** Reported effort is evidence for an experiment, not proven customer savings. */
export function summarizeTrackerExperiment(input: TrackerExperiment) {
  const checked = trackerExperimentSchema.parse(input);
  const observedMinutes = checked.setupMinutes + checked.reviewMinutes + checked.correctionMinutes;
  return { ...checked, observedMinutes, differenceMinutes: checked.baselineMinutes - observedMinutes,
    evidenceKind: "operator_reported" as const, promoted: false as const };
}

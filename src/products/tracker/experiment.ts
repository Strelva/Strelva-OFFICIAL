import { z } from "zod";

const minutes = z.number().finite().min(0).max(100_000);
export const trackerExperimentSchema = z.object({
  hypothesis: z.string().trim().min(1).max(1_000),
  workload: z.string().trim().min(1).max(1_000),
  baselineMinutes: minutes,
  setupMinutes: minutes,
  reviewMinutes: minutes,
  correctionMinutes: minutes,
  providerCostUsd: z.number().finite().min(0).max(100_000).nullable(),
  result: z.enum(["passed", "failed", "inconclusive"]),
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

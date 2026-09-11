/** Browser-safe tracker import, preview, and immutable command contracts. */

export * from "./contracts";
export { parseTrackerCsv } from "./csv";
export type { ParsedTrackerCsvRecord, TrackerCsvParseResult } from "./csv";
export {
  applyTrackerMapping,
  createTrackerImportPreview,
  inferTrackerColumnType,
  previewTrackerImport,
  validateTrackerMappingSelection,
} from "./import";
export type { TrackerImportOptions, TrackerTypeInference } from "./import";
export {
  applyTrackerCommand,
  createTracker,
  createTrackerFromImport,
  filterTrackerHistory,
  filterTrackerRows,
  parseTrackerSnapshot,
  trackerWorkPayload,
} from "./engine";
export { isTrackerWorkPayload, parseTrackerWorkPayload, presentTrackerHandoffPreview } from "./presentation";
export {
  TRACKER_EXPERIMENT_COMPARISON_VERSION,
  TRACKER_EXPERIMENT_MAX_CANDIDATES,
  TRACKER_EXPERIMENT_MAX_FAILURES,
  parseTrackerExperimentComparison,
  summarizeTrackerComparison,
  summarizeTrackerExperimentComparison,
  trackerComparisonInputSchema,
  trackerComparisonSchema,
  trackerExperimentComparisonInputSchema,
  trackerExperimentComparisonPayloadSchema,
  trackerExperimentDecisionSchema,
  trackerExperimentOptionSchema,
} from "./comparison";
export type {
  TrackerComparison,
  TrackerComparisonInput,
  TrackerExperimentCandidateComparison,
  TrackerExperimentComparison,
  TrackerExperimentComparisonInput,
  TrackerExperimentEvidenceKind,
  TrackerExperimentOption,
  TrackerExperimentOptionSummary,
} from "./comparison";

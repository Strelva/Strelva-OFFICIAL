import { z } from "zod";

/**
 * The first tracker slice deliberately supports one import format. Keeping the
 * format and limits in the product contract makes the UI honest about what it
 * can accept and gives a host a single place to display the boundary.
 */
export const TRACKER_PRODUCT_ID = "tracker" as const;
export const TRACKER_IMPORT_VERSION = 1 as const;
export const TRACKER_SUPPORTED_FORMATS = Object.freeze(["text/csv"] as const);

export const TRACKER_IMPORT_LIMITS = Object.freeze({
  maxBytes: 1 * 1024 * 1024,
  maxRows: 1_000,
  maxColumns: 50,
  maxCellCharacters: 10_000,
  maxHeaderCharacters: 200,
});

export type TrackerImportLimits = {
  maxBytes: number;
  maxRows: number;
  maxColumns: number;
  maxCellCharacters: number;
  maxHeaderCharacters: number;
};

export type TrackerFieldKind = "text" | "number" | "date" | "boolean" | "email" | "url";
export type TrackerRowState = "active" | "deleted";
export type TrackerMappingStatus = "accepted" | "proposed" | "ambiguous" | "unmapped";
export type TrackerMappingConfidence = "high" | "medium" | "low" | "none";

export type TrackerWarningCode =
  | "duplicate_header"
  | "empty_header"
  | "ambiguous_type"
  | "unsupported_formula"
  | "invalid_value"
  | "row_width"
  | "malformed_csv"
  | "limit_exceeded"
  | "unmapped_column"
  | "unsupported_format";

export type TrackerWarningSeverity = "warning" | "error";

export interface TrackerWarning {
  code: TrackerWarningCode;
  severity: TrackerWarningSeverity;
  message: string;
  sourceId: string;
  sourceRow?: number;
  sourceLineStart?: number;
  sourceLineEnd?: number;
  sourceColumn?: number;
  sourceHeader?: string;
}

export interface TrackerImportSource {
  /** Stable identity supplied by the host for the uploaded source. */
  sourceId: string;
  originalFileName: string;
  format: "csv";
  mediaType: "text/csv";
  sizeBytes: number;
}

export interface TrackerImportInput {
  sourceId?: string;
  fileName: string;
  content: string;
  mimeType?: string;
}

export interface TrackerSourceColumn {
  id: string;
  /** Human-facing, one-based CSV column number. */
  sourceColumn: number;
  /** Zero-based index used by code and persisted as a stable source reference. */
  sourceColumnIndex: number;
  header: string;
  normalizedHeader: string;
  duplicateOf?: string;
}

export interface TrackerColumnMapping {
  sourceColumnId: string;
  sourceColumn: number;
  sourceHeader: string;
  targetFieldKey: string;
  targetLabel: string;
  targetKind: TrackerFieldKind;
  confidence: TrackerMappingConfidence;
  status: TrackerMappingStatus;
  reason: string;
}

export interface TrackerMappingSelection {
  sourceColumnId: string;
  targetFieldKey: string;
  targetLabel?: string;
  targetKind?: TrackerFieldKind;
}

export interface TrackerRowLineage {
  sourceId: string;
  sourceName: string;
  /** One-based CSV record number. Header is record 1, first data row is 2. */
  sourceRow: number;
  sourceLineStart: number;
  sourceLineEnd: number;
}

export interface TrackerCellLineage {
  sourceId: string;
  sourceName: string;
  sourceRow: number;
  sourceColumn: number;
  sourceColumnIndex: number;
  sourceHeader: string;
}

export interface TrackerImportedRow {
  id: string;
  sourceRow: number;
  sourceDataRow: number;
  sourceLineStart: number;
  sourceLineEnd: number;
  values: Record<string, string>;
  /** Full parsed record, retained when a row-width error prevents creation. */
  rawValues: string[];
  lineage: TrackerRowLineage;
}

export interface TrackerImportValidation {
  status: "ready" | "needs_attention" | "invalid";
  valid: boolean;
  canCreate: boolean;
  rowCount: number;
  columnCount: number;
  sizeBytes: number;
  errors: TrackerWarning[];
  warnings: TrackerWarning[];
}

export interface TrackerImportPreview {
  version: typeof TRACKER_IMPORT_VERSION;
  /** Deterministic preview identity. Durable hosts may use it as a lookup key. */
  previewId: string;
  source: TrackerImportSource;
  /** Original UTF-8 CSV text retained for provenance and a later re-parse. */
  originalSource: string;
  headers: TrackerSourceColumn[];
  rows: TrackerImportedRow[];
  mapping: TrackerColumnMapping[];
  warnings: TrackerWarning[];
  validation: TrackerImportValidation;
}

export interface TrackerColumn {
  id: string;
  sourceColumn: number;
  sourceColumnIndex: number;
  sourceHeader: string;
  fieldKey: string;
  label: string;
  kind: TrackerFieldKind;
}

export interface TrackerCell {
  value: string;
  originalValue: string;
  lineage: TrackerCellLineage | null;
}

export interface TrackerRow {
  id: string;
  cells: Record<string, TrackerCell>;
  lineage: TrackerRowLineage | null;
  state: TrackerRowState;
  createdAt: string;
  updatedAt: string;
}

export interface TrackerSnapshot {
  id: string;
  title: string;
  source: TrackerImportSource;
  /** Original UTF-8 CSV text. Hosts should persist this beside the snapshot. */
  originalSource: string;
  columns: TrackerColumn[];
  rows: TrackerRow[];
  history: TrackerHistoryEntry[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrackerWorkPayload {
  tracker: TrackerSnapshot;
}

/**
 * Browser-safe tracker data used only for an addressed handoff preview.
 *
 * The persisted snapshot also contains the original CSV and cell lineage.
 * Those fields stay server-side until the recipient accepts the handoff; the
 * preview exposes only enough typed data to inspect the current revision.
 */
export interface TrackerHandoffPreview {
  id: string;
  title: string;
  source: {
    fileName: string;
    sizeBytes: number;
  };
  revision: number;
  rowCount: number;
  historyCount: number;
  columns: Array<Pick<TrackerColumn, "id" | "sourceColumn" | "label" | "kind">>;
  rows: Array<{
    id: string;
    sourceRow: number | null;
    state: TrackerRowState;
    cells: Record<string, string>;
  }>;
  updatedAt: string;
}

export type TrackerCommandKind = "update_cell" | "add_row" | "delete_row" | "bulk_update" | "undo_change";

export interface TrackerCommandBase {
  commandId: string;
  trackerId: string;
  baseRevision: number;
  actorId: string;
  at: string;
}

export interface TrackerUpdateCellCommand extends TrackerCommandBase {
  kind: "update_cell";
  rowId: string;
  columnId: string;
  value: string;
}

export interface TrackerAddRowCommand extends TrackerCommandBase {
  kind: "add_row";
  rowId: string;
  values?: Record<string, string>;
}

export interface TrackerDeleteRowCommand extends TrackerCommandBase {
  kind: "delete_row";
  rowId: string;
}

export interface TrackerBulkUpdateCommand extends TrackerCommandBase {
  kind: "bulk_update";
  rowIds: string[];
  columnId: string;
  value: string;
}

export interface TrackerUndoCommand extends TrackerCommandBase {
  kind: "undo_change";
  targetCommandId: string;
}

export interface TrackerCellChange {
  rowId: string;
  columnId: string;
  before: string;
  after: string;
}

export type TrackerCommand =
  | TrackerUpdateCellCommand
  | TrackerAddRowCommand
  | TrackerDeleteRowCommand
  | TrackerBulkUpdateCommand
  | TrackerUndoCommand;

export interface TrackerHistoryEntry {
  commandId: string;
  trackerId: string;
  revision: number;
  kind: TrackerCommandKind;
  actorId: string;
  at: string;
  rowId: string;
  columnId?: string;
  before: string | null;
  after: string | null;
  sourceLineage: TrackerRowLineage | null;
  changes?: TrackerCellChange[];
  undoesCommandId?: string;
}

export interface TrackerCreateOptions {
  trackerId: string;
  actorId: string;
  title?: string;
  at?: string;
  mapping?: TrackerMappingSelection[];
}

export interface TrackerFilter {
  query?: string;
  columnId?: string;
  value?: string;
  exact?: boolean;
  includeDeleted?: boolean;
}

export class TrackerValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TrackerValidationError";
    this.code = code;
  }
}

export class TrackerConflictError extends TrackerValidationError {
  constructor(message = "The tracker changed before this command was applied.") {
    super("tracker_conflict", message);
    this.name = "TrackerConflictError";
  }
}

export class TrackerImportError extends TrackerValidationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "TrackerImportError";
  }
}

const identifier = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime();
const cellValue = z.string().max(TRACKER_IMPORT_LIMITS.maxCellCharacters);

export const trackerImportInputSchema = z.object({
  sourceId: identifier.optional(),
  fileName: z.string().trim().min(1).max(255),
  content: z.string(),
  mimeType: z.string().trim().max(100).optional(),
});

export const trackerMappingSelectionSchema = z.object({
  sourceColumnId: identifier,
  targetFieldKey: z.string().trim().min(1).max(100),
  targetLabel: z.string().trim().min(1).max(200).optional(),
  targetKind: z.enum(["text", "number", "date", "boolean", "email", "url"]).optional(),
});

const trackerCommandBaseSchema = z.object({
  commandId: identifier,
  trackerId: identifier,
  baseRevision: z.number().int().nonnegative(),
  actorId: identifier,
  at: timestamp,
});

export const trackerCommandSchema = z.discriminatedUnion("kind", [
  trackerCommandBaseSchema.extend({
    kind: z.literal("update_cell"),
    rowId: identifier,
    columnId: identifier,
    value: cellValue,
  }),
  trackerCommandBaseSchema.extend({
    kind: z.literal("add_row"),
    rowId: identifier,
    values: z.record(z.string(), cellValue).optional(),
  }),
  trackerCommandBaseSchema.extend({
    kind: z.literal("delete_row"),
    rowId: identifier,
  }),
  trackerCommandBaseSchema.extend({
    kind: z.literal("bulk_update"),
    rowIds: z.array(identifier).min(1).max(1000),
    columnId: identifier,
    value: cellValue,
  }),
  trackerCommandBaseSchema.extend({
    kind: z.literal("undo_change"),
    targetCommandId: identifier,
  }),
]);

const trackerSourceSchema = z.object({
  sourceId: identifier,
  originalFileName: z.string().trim().min(1).max(255),
  format: z.literal("csv"),
  mediaType: z.literal("text/csv"),
  sizeBytes: z.number().int().nonnegative(),
});

const trackerLineageSchema = z.object({
  sourceId: identifier,
  sourceName: z.string().trim().min(1).max(255),
  sourceRow: z.number().int().positive(),
  sourceLineStart: z.number().int().positive(),
  sourceLineEnd: z.number().int().positive(),
});

const trackerCellLineageSchema = z.object({
  sourceId: identifier,
  sourceName: z.string().trim().min(1).max(255),
  sourceRow: z.number().int().positive(),
  sourceColumn: z.number().int().positive(),
  sourceColumnIndex: z.number().int().nonnegative(),
  sourceHeader: z.string().max(TRACKER_IMPORT_LIMITS.maxHeaderCharacters),
});

const trackerColumnSchema = z.object({
  id: identifier,
  sourceColumn: z.number().int().positive(),
  sourceColumnIndex: z.number().int().nonnegative(),
  sourceHeader: z.string().max(TRACKER_IMPORT_LIMITS.maxHeaderCharacters),
  fieldKey: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  kind: z.enum(["text", "number", "date", "boolean", "email", "url"]),
});

const trackerCellSchema = z.object({
  value: cellValue,
  originalValue: cellValue,
  lineage: trackerCellLineageSchema.nullable(),
});

const trackerRowSchema = z.object({
  id: identifier,
  cells: z.record(z.string(), trackerCellSchema),
  lineage: trackerLineageSchema.nullable(),
  state: z.enum(["active", "deleted"]),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const trackerHistoryEntrySchema = z.object({
  commandId: identifier,
  trackerId: identifier,
  revision: z.number().int().positive(),
  kind: z.enum(["update_cell", "add_row", "delete_row", "bulk_update", "undo_change"]),
  actorId: identifier,
  at: timestamp,
  rowId: identifier,
  columnId: identifier.optional(),
  before: cellValue.nullable(),
  after: cellValue.nullable(),
  sourceLineage: trackerLineageSchema.nullable(),
  changes: z.array(z.object({ rowId: identifier, columnId: identifier, before: cellValue, after: cellValue })).min(1).max(1000).optional(),
  undoesCommandId: identifier.optional(),
});

export const trackerSnapshotSchema = z.object({
  id: identifier,
  title: z.string().trim().min(1).max(200),
  source: trackerSourceSchema,
  originalSource: z.string(),
  columns: z.array(trackerColumnSchema).max(TRACKER_IMPORT_LIMITS.maxColumns),
  rows: z.array(trackerRowSchema).max(TRACKER_IMPORT_LIMITS.maxRows),
  history: z.array(trackerHistoryEntrySchema).max(100_000),
  revision: z.number().int().nonnegative(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export type ParsedTrackerCommand = z.infer<typeof trackerCommandSchema>;

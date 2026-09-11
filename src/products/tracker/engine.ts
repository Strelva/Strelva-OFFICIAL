import {
  trackerCommandSchema,
  trackerSnapshotSchema,
  TrackerConflictError,
  TrackerImportError,
  TrackerValidationError,
  type TrackerAddRowCommand,
  type TrackerColumn,
  type TrackerCommand,
  type TrackerCreateOptions,
  type TrackerDeleteRowCommand,
  type TrackerFilter,
  type TrackerHistoryEntry,
  type TrackerImportPreview,
  type TrackerRow,
  type TrackerSnapshot,
  type TrackerUpdateCellCommand,
  type TrackerWorkPayload,
} from "./contracts";
import { applyTrackerMapping, previewTrackerImport, type TrackerImportOptions } from "./import";
import { applyTrackerCellChange } from "./changes";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function checkedText(value: string | undefined, field: string, max: number): string {
  const result = value?.trim() || "";
  if (!result) throw new TrackerValidationError("invalid_input", `Add a ${field}.`);
  if (result.length > max) throw new TrackerValidationError("invalid_input", `Keep ${field} within ${max} characters.`);
  return result;
}

function checkedTime(value: string | undefined): string {
  const result = value || new Date().toISOString();
  if (!Number.isFinite(Date.parse(result))) throw new TrackerValidationError("invalid_time", "Use a valid tracker timestamp.");
  return result;
}

function rowFor(snapshot: TrackerSnapshot, rowId: string): { row: TrackerRow; index: number } {
  const index = snapshot.rows.findIndex((row) => row.id === rowId);
  if (index < 0) throw new TrackerValidationError("row_not_found", `The tracker row ${rowId} does not exist.`);
  return { row: snapshot.rows[index]!, index };
}

function ensureColumn(snapshot: TrackerSnapshot, columnId: string): TrackerColumn {
  const column = snapshot.columns.find((candidate) => candidate.id === columnId);
  if (!column) throw new TrackerValidationError("column_not_found", `The tracker column ${columnId} does not exist.`);
  return column;
}

function historyEntryFor(
  command: TrackerUpdateCellCommand | TrackerAddRowCommand | TrackerDeleteRowCommand,
  revision: number,
  row: TrackerRow,
  before: string | null,
  after: string | null,
): TrackerHistoryEntry {
  return {
    commandId: command.commandId,
    trackerId: command.trackerId,
    revision,
    kind: command.kind,
    actorId: command.actorId,
    at: command.at,
    rowId: command.rowId,
    ...(command.kind === "update_cell" ? { columnId: command.columnId } : {}),
    before,
    after,
    sourceLineage: row.lineage ? clone(row.lineage) : null,
  };
}

function applyUpdateCell(snapshot: TrackerSnapshot, command: TrackerUpdateCellCommand): TrackerSnapshot {
  const column = ensureColumn(snapshot, command.columnId);
  const { row, index } = rowFor(snapshot, command.rowId);
  if (row.state === "deleted") throw new TrackerValidationError("row_deleted", "Deleted rows cannot be edited.");
  const currentCell = row.cells[column.id];
  if (!currentCell) throw new TrackerValidationError("cell_not_found", `The tracker row has no cell for ${column.label}.`);
  if (currentCell.value === command.value) throw new TrackerValidationError("no_op", "The cell already contains that value.");

  const next = clone(snapshot);
  const nextRow = next.rows[index]!;
  const nextCell = nextRow.cells[column.id]!;
  const before = nextCell.value;
  nextCell.value = command.value;
  nextRow.updatedAt = command.at;
  next.revision += 1;
  next.updatedAt = command.at;
  next.history.push(historyEntryFor(command, next.revision, nextRow, before, command.value));
  return next;
}

function applyAddRow(snapshot: TrackerSnapshot, command: TrackerAddRowCommand): TrackerSnapshot {
  if (snapshot.rows.some((row) => row.id === command.rowId)) {
    throw new TrackerConflictError(`The tracker row ${command.rowId} already exists.`);
  }
  const supplied = command.values || {};
  for (const key of Object.keys(supplied)) ensureColumn(snapshot, key);
  const values = Object.fromEntries(snapshot.columns.map((column) => [column.id, supplied[column.id] || ""]));
  const row: TrackerRow = {
    id: command.rowId,
    cells: Object.fromEntries(snapshot.columns.map((column) => [column.id, {
      value: values[column.id]!,
      originalValue: values[column.id]!,
      lineage: null,
    }])),
    lineage: null,
    state: "active",
    createdAt: command.at,
    updatedAt: command.at,
  };
  const next = clone(snapshot);
  next.rows.push(row);
  next.revision += 1;
  next.updatedAt = command.at;
  next.history.push(historyEntryFor(command, next.revision, row, null, null));
  return next;
}

function applyDeleteRow(snapshot: TrackerSnapshot, command: TrackerDeleteRowCommand): TrackerSnapshot {
  const { row, index } = rowFor(snapshot, command.rowId);
  if (row.state === "deleted") throw new TrackerValidationError("row_deleted", "The tracker row is already deleted.");
  const next = clone(snapshot);
  const nextRow = next.rows[index]!;
  nextRow.state = "deleted";
  nextRow.updatedAt = command.at;
  next.revision += 1;
  next.updatedAt = command.at;
  next.history.push(historyEntryFor(command, next.revision, nextRow, "active", "deleted"));
  return next;
}

/**
 * Apply one append-only command to a snapshot. Hosts should persist the
 * resulting snapshot or command atomically against `baseRevision`.
 */
export function applyTrackerCommand(snapshot: TrackerSnapshot, command: TrackerCommand): TrackerSnapshot {
  const parsed = trackerCommandSchema.safeParse(command);
  if (!parsed.success) throw new TrackerValidationError("invalid_command", "The tracker command is invalid.");
  const checked = parsed.data as TrackerCommand;
  if (checked.trackerId !== snapshot.id) throw new TrackerValidationError("tracker_mismatch", "This command belongs to a different tracker.");
  if (checked.baseRevision !== snapshot.revision) throw new TrackerConflictError();
  if (snapshot.history.some((entry) => entry.commandId === checked.commandId)) {
    throw new TrackerConflictError("This tracker command was already applied.");
  }
  if (checked.kind === "bulk_update" || checked.kind === "undo_change") return applyTrackerCellChange(snapshot, checked);
  if (checked.kind === "update_cell") return applyUpdateCell(snapshot, checked);
  if (checked.kind === "add_row") return applyAddRow(snapshot, checked);
  return applyDeleteRow(snapshot, checked);
}

function columnsFromPreview(preview: TrackerImportPreview): TrackerColumn[] {
  return preview.mapping.map((mapping) => ({
    id: mapping.sourceColumnId,
    sourceColumn: mapping.sourceColumn,
    sourceColumnIndex: mapping.sourceColumn - 1,
    sourceHeader: mapping.sourceHeader,
    fieldKey: mapping.targetFieldKey,
    label: mapping.targetLabel,
    kind: mapping.targetKind,
  }));
}

function rowsFromPreview(preview: TrackerImportPreview, columns: readonly TrackerColumn[], at: string): TrackerRow[] {
  return preview.rows.map((row) => ({
    id: row.id,
    cells: Object.fromEntries(columns.map((column) => {
      const value = row.values[column.id] || "";
      return [column.id, {
        value,
        originalValue: value,
        lineage: {
          sourceId: preview.source.sourceId,
          sourceName: preview.source.originalFileName,
          sourceRow: row.sourceRow,
          sourceColumn: column.sourceColumn,
          sourceColumnIndex: column.sourceColumnIndex,
          sourceHeader: column.sourceHeader,
        },
      }];
    })),
    lineage: clone(row.lineage),
    state: "active",
    createdAt: at,
    updatedAt: at,
  }));
}

/** Create a revision-zero tracker from a reviewed import preview. */
export function createTracker(
  inputPreview: TrackerImportPreview,
  options: TrackerCreateOptions,
): TrackerSnapshot {
  const preview = options.mapping ? applyTrackerMapping(inputPreview, options.mapping) : inputPreview;
  if (!preview.validation.canCreate) {
    if (preview.validation.errors.length > 0) {
      throw new TrackerImportError("invalid_import", "Resolve the CSV import errors before creating the tracker.");
    }
    throw new TrackerImportError("mapping_required", "Choose a field name for every unmapped column before creating the tracker.");
  }
  const id = checkedText(options.trackerId, "tracker id", 200);
  const actorId = checkedText(options.actorId, "actor", 200);
  void actorId;
  const at = checkedTime(options.at);
  const title = options.title?.trim() || inputPreview.source.originalFileName.replace(/\.csv$/i, "") || "Imported tracker";
  if (title.length > 200) throw new TrackerValidationError("invalid_input", "Keep the tracker title within 200 characters.");
  const columns = columnsFromPreview(preview);
  return {
    id,
    title,
    source: clone(preview.source),
    originalSource: preview.originalSource,
    columns,
    rows: rowsFromPreview(preview, columns, at),
    history: [],
    revision: 0,
    createdAt: at,
    updatedAt: at,
  };
}

/** Parse and create in one call. Hosts can use this to re-parse on acceptance. */
export function createTrackerFromImport(
  input: Parameters<typeof previewTrackerImport>[0],
  options: TrackerCreateOptions,
  importOptions?: TrackerImportOptions,
): TrackerSnapshot {
  return createTracker(previewTrackerImport(input, importOptions), options);
}

/** Return a cloned, schema-checked persisted snapshot or null when malformed. */
export function parseTrackerSnapshot(value: unknown): TrackerSnapshot | null {
  const parsed = trackerSnapshotSchema.safeParse(value);
  if (!parsed.success) return null;
  const snapshot = parsed.data as TrackerSnapshot;
  const columnIds = new Set(snapshot.columns.map((column) => column.id));
  const rowIds = new Set<string>();
  if (columnIds.size !== snapshot.columns.length) return null;
  for (const row of snapshot.rows) {
    if (rowIds.has(row.id)) return null;
    rowIds.add(row.id);
    for (const cellId of Object.keys(row.cells)) {
      if (!columnIds.has(cellId)) return null;
    }
  }
  const commandIds = new Set<string>();
  for (const entry of snapshot.history) {
    if (commandIds.has(entry.commandId) || entry.trackerId !== snapshot.id || entry.revision > snapshot.revision) return null;
    if ((entry.kind === "bulk_update" || entry.kind === "undo_change") && !entry.changes?.length) return null;
    if (entry.kind === "undo_change" && !entry.undoesCommandId) return null;
    const changedCells = new Set<string>();
    for (const change of entry.changes ?? []) {
      const key = JSON.stringify([change.rowId, change.columnId]);
      if (!rowIds.has(change.rowId) || !columnIds.has(change.columnId) || changedCells.has(key)) return null;
      changedCells.add(key);
    }
    commandIds.add(entry.commandId);
  }
  return clone(snapshot);
}

/** Export the payload shape a workspace host can place in saved_product_work. */
export function trackerWorkPayload(tracker: TrackerSnapshot): TrackerWorkPayload {
  const parsed = parseTrackerSnapshot(tracker);
  if (!parsed) throw new TrackerValidationError("invalid_tracker", "The tracker snapshot is invalid.");
  return { tracker: parsed };
}

function textMatches(value: string, expected: string, exact: boolean): boolean {
  const left = value.trim().toLocaleLowerCase();
  const right = expected.trim().toLocaleLowerCase();
  return exact ? left === right : left.includes(right);
}

/** Filter rows without changing their source lineage or edit history. */
export function filterTrackerRows(
  snapshot: TrackerSnapshot,
  filter: TrackerFilter = {},
): TrackerRow[] {
  const query = filter.query?.trim() || "";
  const hasValue = filter.value !== undefined;
  const value = filter.value?.trim() || "";
  const exact = filter.exact === true;
  if (filter.columnId) ensureColumn(snapshot, filter.columnId);
  return snapshot.rows
    .filter((row) => filter.includeDeleted === true || row.state === "active")
    .filter((row) => {
      const queryValues = Object.values(row.cells).map((cell) => cell.value);
      if (query && !queryValues.some((candidate) => textMatches(candidate, query, exact))) return false;
      if (!hasValue) return true;
      const values = filter.columnId
        ? [row.cells[filter.columnId]?.value || ""]
        : Object.values(row.cells).map((cell) => cell.value);
      return values.some((candidate) => textMatches(candidate, value, exact));
    })
    .map(clone);
}

/** History is already append-only; this helper provides the same row filter as the UI. */
export function filterTrackerHistory(
  snapshot: TrackerSnapshot,
  filter: { rowId?: string; actorId?: string; limit?: number } = {},
): TrackerHistoryEntry[] {
  const limit = filter.limit === undefined ? 100 : Math.max(1, Math.min(1000, Math.floor(filter.limit)));
  return snapshot.history
    .filter((entry) => !filter.rowId || entry.rowId === filter.rowId)
    .filter((entry) => !filter.actorId || entry.actorId === filter.actorId)
    .slice(-limit)
    .map(clone);
}

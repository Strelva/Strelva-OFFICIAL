import { TrackerConflictError, TrackerValidationError, type TrackerBulkUpdateCommand, type TrackerCellChange, type TrackerHistoryEntry, type TrackerSnapshot, type TrackerUndoCommand } from "./contracts";

import { trackerCoordinationUndoBlock, undoTrackerCoordination } from "./coordination";

export function trackerReceiptChanges(entry: TrackerHistoryEntry): TrackerCellChange[] {
  if (entry.kind === "update_cell" && entry.columnId && entry.before !== null && entry.after !== null) {
    return [{ rowId: entry.rowId, columnId: entry.columnId, before: entry.before, after: entry.after }];
  }
  return entry.changes ?? [];
}

/** Undo compensates only the recorded cells. Later records and unrelated edits survive. */
export function trackerUndoBlock(snapshot: TrackerSnapshot, entry: TrackerHistoryEntry): string | null {
  if (entry.coordinationChanges) return trackerCoordinationUndoBlock(snapshot, entry);
  const changes = trackerReceiptChanges(entry);
  if (!changes.length || entry.kind === "undo_change") return "This change cannot be undone here.";
  if (snapshot.history.some(item => item.undoesCommandId === entry.commandId)) return "This change has already been undone.";
  for (const change of changes) {
    const row = snapshot.rows.find(item => item.id === change.rowId);
    if (!row || row.state !== "active" || row.cells[change.columnId]?.value !== change.after) return "A changed row is unavailable or has a newer edit. Review it before undoing.";
    if (snapshot.history.some(item => item.revision > entry.revision && (
      (item.kind === "delete_row" && item.rowId === change.rowId) ||
      trackerReceiptChanges(item).some(later => later.rowId === change.rowId && later.columnId === change.columnId)
    ))) return "A newer change touched the same field. Undo that change first.";
  }
  return null;
}

/** Validates the entire proposal before making any changes. One revision, one receipt. */
export function applyTrackerCellChange(snapshot: TrackerSnapshot, command: TrackerBulkUpdateCommand | TrackerUndoCommand): TrackerSnapshot {
  if (command.kind === "undo_change" && snapshot.history.find(entry => entry.commandId === command.targetCommandId)?.coordinationChanges) return undoTrackerCoordination(snapshot, command);
  let changes: TrackerCellChange[];
  if (command.kind === "bulk_update") {
    if (new Set(command.rowIds).size !== command.rowIds.length) throw new TrackerValidationError("duplicate_rows", "Select each row once.");
    if (!snapshot.columns.some(item => item.id === command.columnId)) throw new TrackerValidationError("column_not_found", "Choose an existing field.");
    changes = command.rowIds.flatMap(rowId => {
      const row = snapshot.rows.find(item => item.id === rowId);
      if (!row || row.state !== "active" || !row.cells[command.columnId]) throw new TrackerValidationError("row_not_found", "One of the selected rows is no longer available.");
      const before = row.cells[command.columnId]!.value;
      return before === command.value ? [] : [{ rowId, columnId: command.columnId, before, after: command.value }];
    });
    if (!changes.length) throw new TrackerValidationError("no_op", "The selected fields already contain that value.");
  } else {
    const entry = snapshot.history.find(item => item.commandId === command.targetCommandId);
    if (!entry) throw new TrackerValidationError("change_not_found", "This change could not be found.");
    const blocked = trackerUndoBlock(snapshot, entry);
    if (blocked) throw new TrackerConflictError(blocked);
    changes = trackerReceiptChanges(entry).map(item => ({ ...item, before: item.after, after: item.before }));
  }
  const next = structuredClone(snapshot);
  const rows = new Map(next.rows.map(row => [row.id, row]));
  for (const change of changes) {
    const row = rows.get(change.rowId)!;
    row.cells[change.columnId]!.value = change.after;
    row.updatedAt = command.at;
  }
  next.revision += 1;
  next.updatedAt = command.at;
  next.history.push({ commandId: command.commandId, trackerId: snapshot.id, revision: next.revision,
    kind: command.kind, actorId: command.actorId, at: command.at, rowId: changes[0]!.rowId,
    before: null, after: null, sourceLineage: null, changes,
    ...(command.kind === "undo_change" ? { undoesCommandId: command.targetCommandId } : {}),
  });
  return next;
}

import { TrackerConflictError, TrackerValidationError, trackerRecordCoordinationSchema, type TrackerRecordCoordination, type TrackerCoordinationChange, type TrackerCoordinateRecordsCommand, type TrackerHistoryEntry, type TrackerSnapshot, type TrackerUndoCommand } from "./contracts";
export function recordCoordination(value?: TrackerRecordCoordination): TrackerRecordCoordination { return value ?? { assigneeId: null, links: [] }; }
function same(left: TrackerRecordCoordination, right: TrackerRecordCoordination) { return JSON.stringify(left) === JSON.stringify(right); }
function commit(snapshot: TrackerSnapshot, command: TrackerCoordinateRecordsCommand | TrackerUndoCommand, changes: TrackerCoordinationChange[]) {
  if (!changes.length) throw new TrackerValidationError("no_op", "These records already have that assignment and relationship.");
  const next = structuredClone(snapshot);
  for (const change of changes) {
    const row = next.rows.find(value => value.id === change.rowId)!;
    row.coordination = trackerRecordCoordinationSchema.parse(change.after); row.updatedAt = command.at;
  }
  next.revision += 1; next.updatedAt = command.at;
  next.history.push({ commandId: command.commandId, trackerId: snapshot.id, revision: next.revision, kind: command.kind, actorId: command.actorId, at: command.at, rowId: changes[0]!.rowId, before: null, after: null, sourceLineage: null, coordinationChanges: changes, ...(command.kind === "undo_change" ? { undoesCommandId: command.targetCommandId } : {}) });
  return next;
}
export function applyTrackerCoordination(snapshot: TrackerSnapshot, command: TrackerCoordinateRecordsCommand): TrackerSnapshot {
  if (new Set(command.rowIds).size !== command.rowIds.length) throw new TrackerValidationError("duplicate_rows", "Select each record once.");
  const changes = command.rowIds.flatMap(rowId => {
    const row = snapshot.rows.find(value => value.id === rowId);
    if (!row || row.state !== "active") throw new TrackerValidationError("row_not_found", "A selected record is no longer available.");
    const before = structuredClone(recordCoordination(row.coordination));
    const after = structuredClone(before);
    if (command.assigneeId !== undefined) after.assigneeId = command.assigneeId;
    if (command.link) {
      const link = command.link;
      const prior = after.links.find(value => value.workId === link.workId && value.rowId === link.rowId);
      if (!prior) after.links.push(link);
    }
    if (command.unlink) after.links = after.links.filter(value => value.workId !== command.unlink!.workId || value.rowId !== command.unlink!.rowId);
    trackerRecordCoordinationSchema.parse(after);
    return same(before, after) ? [] : [{ rowId, before, after }];
  });
  return commit(snapshot, command, changes);
}
export function trackerCoordinationUndoBlock(snapshot: TrackerSnapshot, entry: TrackerHistoryEntry): string | null {
  if (!entry.coordinationChanges?.length || entry.kind === "undo_change") return "This coordination change cannot be undone here.";
  if (snapshot.history.some(value => value.undoesCommandId === entry.commandId)) return "This change has already been undone.";
  for (const change of entry.coordinationChanges) {
    const row = snapshot.rows.find(value => value.id === change.rowId);
    if (!row || row.state !== "active" || !same(recordCoordination(row.coordination), change.after)) return "A record's assignment or relationship changed. Review the newer change before undoing.";
    if (snapshot.history.some(value => value.revision > entry.revision && (value.coordinationChanges?.some(later => later.rowId === change.rowId) || (value.kind === "delete_row" && value.rowId === change.rowId)))) return "A later coordination change must be undone first.";
  }
  return null;
}
export function undoTrackerCoordination(snapshot: TrackerSnapshot, command: TrackerUndoCommand): TrackerSnapshot {
  const entry = snapshot.history.find(value => value.commandId === command.targetCommandId);
  if (!entry) throw new TrackerValidationError("change_not_found", "This change is unavailable.");
  const blocked = trackerCoordinationUndoBlock(snapshot, entry);
  if (blocked) throw new TrackerConflictError(blocked);
  return commit(snapshot, command, entry.coordinationChanges!.map(value => ({ rowId: value.rowId, before: value.after, after: value.before })));
}

import { describe, expect, it } from "vitest";
import {
  TrackerConflictError,
  applyTrackerCommand,
  createTracker,
  filterTrackerHistory,
  filterTrackerRows,
  parseTrackerSnapshot,
  previewTrackerImport,
} from "@/products/tracker";

function tracker() {
  return createTracker(
    previewTrackerImport({
      sourceId: "engine-source",
      fileName: "contacts.csv",
      content: "Name,Status\nAda,Open\nLin,Closed",
    }),
    { trackerId: "tracker-engine", actorId: "owner", at: "2026-09-11T12:00:00Z" },
  );
}

describe("tracker immutable commands", () => {
  it("updates a cell by revision, retains original lineage, and appends attributable history", () => {
    const initial = tracker();
    const rowId = initial.rows[0]!.id;
    const next = applyTrackerCommand(initial, {
      kind: "update_cell",
      commandId: "edit-1",
      trackerId: initial.id,
      baseRevision: 0,
      actorId: "reviewer",
      at: "2026-09-11T12:01:00Z",
      rowId,
      columnId: "column_2",
      value: "Qualified",
    });

    expect(initial.revision).toBe(0);
    expect(initial.rows[0]?.cells.column_2?.value).toBe("Open");
    expect(next.revision).toBe(1);
    expect(next.rows[0]?.cells.column_2).toMatchObject({ value: "Qualified", originalValue: "Open" });
    expect(next.rows[0]?.cells.column_2?.lineage).toMatchObject({ sourceRow: 2, sourceColumn: 2 });
    expect(next.history[0]).toMatchObject({ commandId: "edit-1", actorId: "reviewer", before: "Open", after: "Qualified", revision: 1 });
  });

  it("rejects stale and replayed commands, then preserves deleted rows as history", () => {
    const initial = tracker();
    const rowId = initial.rows[0]!.id;
    const command = {
      kind: "update_cell" as const,
      commandId: "edit-stale",
      trackerId: initial.id,
      baseRevision: 0,
      actorId: "reviewer",
      at: "2026-09-11T12:02:00Z",
      rowId,
      columnId: "column_1",
      value: "Ada Lovelace",
    };
    const changed = applyTrackerCommand(initial, command);
    expect(() => applyTrackerCommand(changed, command)).toThrow(TrackerConflictError);
    expect(() => applyTrackerCommand(changed, { ...command, commandId: "another", value: "Other" })).toThrow(TrackerConflictError);

    const deleted = applyTrackerCommand(changed, {
      kind: "delete_row",
      commandId: "delete-1",
      trackerId: initial.id,
      baseRevision: 1,
      actorId: "reviewer",
      at: "2026-09-11T12:03:00Z",
      rowId,
    });
    expect(deleted.rows[0]?.state).toBe("deleted");
    expect(filterTrackerRows(deleted, {})).toHaveLength(1);
    expect(filterTrackerRows(deleted, { includeDeleted: true })).toHaveLength(2);
    expect(filterTrackerHistory(deleted, { rowId })).toHaveLength(2);
  });

  it("adds rows with empty defaults and supports exact and contains filtering", () => {
    const initial = tracker();
    const added = applyTrackerCommand(initial, {
      kind: "add_row",
      commandId: "add-1",
      trackerId: initial.id,
      baseRevision: 0,
      actorId: "owner",
      at: "2026-09-11T12:04:00Z",
      rowId: "new-row",
      values: { column_1: "Ada", column_2: "Waiting" },
    });

    expect(added.rows[2]).toMatchObject({ id: "new-row", lineage: null, state: "active" });
    expect(added.rows[2]?.cells.column_2).toMatchObject({ value: "Waiting", originalValue: "Waiting", lineage: null });
    expect(filterTrackerRows(added, { query: "ait" })).toHaveLength(1);
    expect(filterTrackerRows(added, { columnId: "column_2", value: "waiting", exact: true })).toHaveLength(1);
    expect(filterTrackerHistory(added, { actorId: "owner", limit: 1 })[0]?.commandId).toBe("add-1");
  });

  it("rejects malformed commands and unknown filter columns", () => {
    const initial = tracker();
    expect(() => applyTrackerCommand(initial, {
      kind: "update_cell",
      commandId: "bad",
      trackerId: initial.id,
      baseRevision: 0,
      actorId: "owner",
      at: "not-a-time",
      rowId: initial.rows[0]!.id,
      columnId: "column_1",
      value: "x",
    })).toThrow(/invalid/);
    expect(() => filterTrackerRows(initial, { columnId: "missing" })).toThrow(/does not exist/);
  });

  it("validates persisted snapshots before a host presents them", () => {
    const initial = tracker();
    expect(parseTrackerSnapshot(initial)?.id).toBe(initial.id);
    expect(parseTrackerSnapshot({ ...initial, rows: [{ ...initial.rows[0], id: initial.rows[1]!.id }, ...initial.rows.slice(1)] })).toBeNull();
    expect(parseTrackerSnapshot({ ...initial, rows: [{ ...initial.rows[0], cells: { missing: initial.rows[0]!.cells.column_1 } }, ...initial.rows.slice(1)] })).toBeNull();
  });
});

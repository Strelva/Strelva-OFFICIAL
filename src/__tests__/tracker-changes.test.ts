import { describe, expect, it } from "vitest";
import { applyTrackerCommand, createTrackerFromImport, parseTrackerSnapshot } from "@/products/tracker/engine";
import { trackerUndoBlock } from "@/products/tracker/changes";

const at = "2026-09-11T12:00:00.000Z";
function fixture() {
  return createTrackerFromImport({ fileName: "requests.csv", content: "Name,Status\nAvery,New\nMaria,Waiting" }, { trackerId: "tracker", actorId: "owner", at });
}
function base(revision: number, commandId: string) { return { trackerId: "tracker", actorId: "owner", at, baseRevision: revision, commandId }; }

describe("grouped tracker changes", () => {
  it("applies a reviewed batch as one revision and one reversible receipt", () => {
    const initial = fixture();
    const columnId = initial.columns[1]!.id;
    const changed = applyTrackerCommand(initial, { ...base(0, "batch"), kind: "bulk_update", rowIds: initial.rows.map(row => row.id), columnId, value: "Assigned" });
    expect(changed.revision).toBe(1);
    expect(changed.history).toHaveLength(1);
    expect(changed.history[0]!.changes).toHaveLength(2);
    expect(parseTrackerSnapshot(changed)).not.toBeNull();
    expect(initial.rows[0]!.cells[columnId]!.value).toBe("New");
    const undone = applyTrackerCommand(changed, { ...base(1, "undo"), kind: "undo_change", targetCommandId: "batch" });
    expect(undone.rows.map(row => row.cells[columnId]!.value)).toEqual(["New", "Waiting"]);
    expect(undone.originalSource).toBe(initial.originalSource);
    expect(undone.history[1]!.undoesCommandId).toBe("batch");
    expect(parseTrackerSnapshot(undone)).not.toBeNull();
  });

  it("keeps later rows and unrelated edits while undoing an older change", () => {
    const initial = fixture();
    const [name, status] = initial.columns;
    const changed = applyTrackerCommand(initial, { ...base(0, "edit"), kind: "update_cell", rowId: initial.rows[0]!.id, columnId: status!.id, value: "Assigned" });
    const added = applyTrackerCommand(changed, { ...base(1, "add"), kind: "add_row", rowId: "new-inquiry", values: { [name!.id]: "New customer" } });
    const renamed = applyTrackerCommand(added, { ...base(2, "rename"), kind: "update_cell", rowId: initial.rows[0]!.id, columnId: name!.id, value: "Avery Buyer" });
    const undone = applyTrackerCommand(renamed, { ...base(3, "undo"), kind: "undo_change", targetCommandId: "edit" });
    expect(undone.rows).toHaveLength(3);
    expect(undone.rows[0]!.cells[name!.id]!.value).toBe("Avery Buyer");
    expect(undone.rows[0]!.cells[status!.id]!.value).toBe("New");
  });

  it("rejects stale, duplicate, malformed and all-unchanged batches atomically", () => {
    const initial = fixture();
    const rowId = initial.rows[0]!.id;
    const columnId = initial.columns[1]!.id;
    const command = { ...base(0, "batch"), kind: "bulk_update" as const, rowIds: [rowId], columnId, value: "Assigned" };
    expect(() => applyTrackerCommand(initial, { ...command, baseRevision: 1 })).toThrow();
    expect(() => applyTrackerCommand(initial, { ...command, rowIds: [rowId, rowId] })).toThrow();
    expect(() => applyTrackerCommand(initial, { ...command, rowIds: [rowId, "missing"] })).toThrow();
    expect(() => applyTrackerCommand(initial, { ...command, value: "New" })).toThrow();
    expect(initial.revision).toBe(0);
    expect(initial.history).toEqual([]);
  });

  it("blocks undo after a newer edit even if the cell later returns to the same value", () => {
    const initial = fixture();
    const cell = { rowId: initial.rows[0]!.id, columnId: initial.columns[1]!.id };
    let current = applyTrackerCommand(initial, { ...base(0, "first"), kind: "update_cell", ...cell, value: "Assigned" });
    current = applyTrackerCommand(current, { ...base(1, "second"), kind: "update_cell", ...cell, value: "Waiting" });
    current = applyTrackerCommand(current, { ...base(2, "third"), kind: "update_cell", ...cell, value: "Assigned" });
    expect(trackerUndoBlock(current, current.history[0]!)).toContain("newer change");
    expect(() => applyTrackerCommand(current, { ...base(3, "undo"), kind: "undo_change", targetCommandId: "first" })).toThrow();
  });

  it("blocks repeated undo and keeps a whole batch unchanged when one row conflicts", () => {
    const initial = fixture();
    const columnId = initial.columns[1]!.id;
    const changed = applyTrackerCommand(initial, { ...base(0, "batch"), kind: "bulk_update", rowIds: initial.rows.map(row => row.id), columnId, value: "Assigned" });
    const later = applyTrackerCommand(changed, { ...base(1, "later"), kind: "update_cell", rowId: initial.rows[1]!.id, columnId, value: "Handled" });
    expect(() => applyTrackerCommand(later, { ...base(2, "undo"), kind: "undo_change", targetCommandId: "batch" })).toThrow();
    expect(later.rows[0]!.cells[columnId]!.value).toBe("Assigned");
    const undone = applyTrackerCommand(changed, { ...base(1, "undo"), kind: "undo_change", targetCommandId: "batch" });
    expect(() => applyTrackerCommand(undone, { ...base(2, "undo-again"), kind: "undo_change", targetCommandId: "batch" })).toThrow();
  });
});

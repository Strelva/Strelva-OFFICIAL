import { describe, expect, it } from "vitest";
import { TRACKER_TEMPLATES, trackerTemplateSource } from "@/products/tracker/templates";
import { applyTrackerCommand, createTrackerFromImport, parseTrackerSnapshot } from "@/products/tracker/engine";

describe("empty business tracker templates", () => {
  it.each(TRACKER_TEMPLATES)("creates $name without importing fictional customer records", template => {
    const tracker = createTrackerFromImport(trackerTemplateSource(template.id), { trackerId: template.id, actorId: "owner" });
    expect(tracker.rows).toEqual([]);
    expect(tracker.columns.map(column => column.label)).toEqual([...template.fields]);
    expect(parseTrackerSnapshot(tracker)).not.toBeNull();
    const filled = applyTrackerCommand(tracker, { kind: "add_row", commandId: "add", trackerId: tracker.id, actorId: "owner", baseRevision: 0, at: new Date().toISOString(), rowId: "new", values: { [tracker.columns[0]!.id]: "Customer work" } });
    expect(filled.rows[0]!.lineage).toBeNull();
    expect(filled.rows[0]!.cells[tracker.columns[0]!.id]!.value).toBe("Customer work");
    expect(filled.history[0]!.kind).toBe("add_row");
  });
});

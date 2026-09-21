import { describe, expect, it } from "vitest";
import {
  TrackerImportError,
  applyTrackerMapping,
  createTracker,
  parseTrackerCsv,
  previewTrackerImport,
} from "@/products/tracker";

const contactCsv = [
  "Full Name,Email,Amount,Notes",
  '"Doe, Jane",jane@example.com,125.50,"Asked for a quote, then follow-up"',
  '"Smith, John",john@example.com,"=SUM(10,20)","Needs review"',
].join("\r\n");

const pipelineCsv = [
  "ID,Status,Status,Start Date,Owner,Notes",
  'p-1,Open,Qualified,2026-09-01,Ada,"First contact"',
  'p-2,Closed,Closed,2026-09-02,Lin,"Line one',
  'Line two"',
].join("\n");

describe("tracker CSV import", () => {
  it("parses quoted fields and exposes a mapping preview with source lineage", () => {
    const preview = previewTrackerImport({
      sourceId: "upload-contacts-1",
      fileName: "contacts.csv",
      mimeType: "text/csv",
      content: contactCsv,
    });

    expect(preview.originalSource).toBe(contactCsv);
    expect(preview.source.originalFileName).toBe("contacts.csv");
    expect(preview.mapping.find((item) => item.sourceHeader === "Full Name")?.targetFieldKey).toBe("name");
    expect(preview.rows[0]?.values.column_1).toBe("Doe, Jane");
    expect(preview.rows[0]?.lineage).toMatchObject({
      sourceId: "upload-contacts-1",
      sourceName: "contacts.csv",
      sourceRow: 2,
      sourceLineStart: 2,
      sourceLineEnd: 2,
    });
    expect(preview.warnings.some((item) => item.code === "unsupported_formula")).toBe(true);
    expect(preview.warnings.some((item) => item.code === "ambiguous_type")).toBe(true);
    expect(preview.validation.valid).toBe(true);
    expect(preview.validation.canCreate).toBe(true);
  });

  it("handles a structurally different pipeline sheet, including duplicate headers and multiline quotes", () => {
    const preview = previewTrackerImport({
      sourceId: "upload-pipeline-1",
      fileName: "pipeline.csv",
      content: pipelineCsv,
    });

    expect(preview.headers).toHaveLength(6);
    expect(preview.mapping.filter((item) => item.sourceHeader === "Status").map((item) => item.targetFieldKey)).toEqual(["status", "status_2"]);
    expect(preview.warnings.some((item) => item.code === "duplicate_header")).toBe(true);
    expect(preview.rows[1]?.lineage).toMatchObject({ sourceRow: 3, sourceLineStart: 3, sourceLineEnd: 4 });
    expect(preview.rows[1]?.values.column_6).toBe("Line one\nLine two");
    expect(preview.mapping.find((item) => item.sourceHeader === "Start Date")?.targetKind).toBe("date");
    expect(preview.validation.canCreate).toBe(true);
  });

  it("keeps malformed CSV visible and refuses tracker creation", () => {
    const preview = previewTrackerImport({
      sourceId: "bad-upload",
      fileName: "bad.csv",
      content: 'Name,Email\n"Jane,jane@example.com\n',
    });

    expect(preview.warnings.some((item) => item.code === "malformed_csv" && item.severity === "error")).toBe(true);
    expect(preview.validation.valid).toBe(false);
    expect(() => createTracker(preview, { trackerId: "tracker-1", actorId: "person" })).toThrow(TrackerImportError);
  });

  it("reports unsupported formats and bounded input failures", () => {
    expect(() => previewTrackerImport({ fileName: "workbook.xlsx", content: "Name\nJane" })).toThrowError(/Only CSV/);

    const tooManyRows = previewTrackerImport(
      { fileName: "rows.csv", content: "Name\nA\nB" },
      { limits: { maxRows: 1 } },
    );
    expect(tooManyRows.validation.valid).toBe(false);
    expect(tooManyRows.warnings.some((item) => item.code === "limit_exceeded")).toBe(true);
    expect(tooManyRows.rows).toHaveLength(1);

    const wrongWidth = previewTrackerImport({ fileName: "width.csv", content: "Name,Email\nJane,jane@example.com,extra" });
    expect(wrongWidth.validation.valid).toBe(false);
    expect(wrongWidth.rows[0]?.rawValues).toEqual(["Jane", "jane@example.com", "extra"]);
    expect(wrongWidth.warnings.some((item) => item.code === "row_width")).toBe(true);
  });

  it("requires a choice for an empty header and accepts the explicit mapping", () => {
    const preview = previewTrackerImport({ fileName: "unnamed.csv", content: "Name,\nJane,42" });
    expect(preview.validation.canCreate).toBe(false);

    const mapped = applyTrackerMapping(preview, [{
      sourceColumnId: "column_2",
      targetFieldKey: "score",
      targetKind: "number",
      targetLabel: "Score",
    }]);
    expect(mapped.validation.canCreate).toBe(true);
    expect(mapped.warnings.some((item) => item.code === "unmapped_column")).toBe(false);
    const tracker = createTracker(mapped, { trackerId: "tracker-unnamed", actorId: "person", at: "2026-09-11T12:00:00Z" });
    expect(tracker.columns[1]).toMatchObject({ fieldKey: "score", label: "Score", kind: "number" });
    expect(tracker.originalSource).toBe("Name,\nJane,42");
  });

  it("parses CSV records directly for hosts that need lower-level diagnostics", () => {
    const result = parseTrackerCsv('Name,Notes\nJane,"He said ""hi""\nline 2"\n', { sourceId: "source" });
    expect(result.warnings).toEqual([]);
    expect(result.records[1]).toMatchObject({ sourceRow: 2, sourceLineStart: 2, sourceLineEnd: 3 });
    expect(result.records[1]?.values).toEqual(["Jane", 'He said "hi"\nline 2']);
  });
});

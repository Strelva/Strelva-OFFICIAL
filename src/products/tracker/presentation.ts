import { parseTrackerSnapshot } from "./engine";
import type { TrackerHandoffPreview, TrackerSnapshot, TrackerWorkPayload } from "./contracts";

/** Parse one persisted tracker payload without exposing the raw source. */
export function parseTrackerWorkPayload(value: unknown): TrackerSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return parseTrackerSnapshot((value as { tracker?: unknown }).tracker);
}

/**
 * Produce the bounded browser contract used by addressed handoff previews.
 * The original CSV, cell lineage, actor ids, and edit history details never
 * cross this boundary.
 */
export function presentTrackerHandoffPreview(value: unknown): TrackerHandoffPreview | null {
  const tracker = parseTrackerWorkPayload(value);
  if (!tracker) return null;
  return {
    id: tracker.id,
    title: tracker.title,
    source: { fileName: tracker.source.originalFileName, sizeBytes: tracker.source.sizeBytes },
    revision: tracker.revision,
    rowCount: tracker.rows.length,
    historyCount: tracker.history.length,
    columns: tracker.columns.map(({ id, sourceColumn, label, kind }) => ({ id, sourceColumn, label, kind })),
    rows: tracker.rows.slice(0, 8).map((row) => ({
      id: row.id,
      sourceRow: row.lineage?.sourceRow ?? null,
      state: row.state,
      cells: Object.fromEntries(tracker.columns.map((column) => [column.id, row.cells[column.id]?.value ?? ""])),
    })),
    updatedAt: tracker.updatedAt,
  };
}

export function isTrackerWorkPayload(value: unknown): value is TrackerWorkPayload {
  return parseTrackerWorkPayload(value) !== null;
}

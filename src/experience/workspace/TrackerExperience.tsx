"use client";

import { useEffect, useRef, useState } from "react";
import { StHead, StMono, StPage, StPill, StRow, StRows, StSection, StSkeleton } from "@/components/ui/strelva/Kit";
import styles from "./tracker-experience.module.css";
import { TextInput } from "@/components/ui/TextInput";
import { filterTrackerRows } from "@/products/tracker";
import type { TrackerHistoryEntry, TrackerImportPreview, TrackerMappingSelection, TrackerSnapshot } from "@/products/tracker/contracts";
import { workspaceHistoryState } from "@/platform/workspaces/location";
import { TrackerCoordinationEditor, TrackerRecordCoordination, useTrackerCoordinationOptions } from "./TrackerCoordination";
import { TrackerExperimentForm } from "./TrackerExperimentForm";
import { trackerReceiptChanges, trackerUndoBlock } from "@/products/tracker/client";
import { TRACKER_TEMPLATES, trackerTemplateSource, type TrackerTemplateId } from "@/products/tracker/client";

type Props = { workspaceId: string; workId?: string; readOnly?: boolean; onSaved?: (id: string) => void; transport?: TrackerTransport; templateId?: TrackerTemplateId };
type TrackerSourceInput = { fileName: string; mimeType: "text/csv"; content: string };
export type TrackerSavedResult = { workId: string; workspaceId: string; tracker: TrackerSnapshot; canRecordExperiment?: boolean };

type Saved = TrackerSavedResult;
export type TrackerTransport = {
  mode: "server" | "local-preview";
  read(workId: string, signal: AbortSignal): Promise<Saved>;
  write(body: Record<string, unknown>): Promise<unknown>;
};
const serverTransport: TrackerTransport = {
  mode: "server",
  async read(workId, signal) {
    const response = await fetch(`/api/tracker?workId=${encodeURIComponent(workId)}`, { signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "The internal tool could not be loaded.");
    return result;
  },
  write: request,
};
const ROWS_PER_PAGE = 50;
const PREVIEW_ROW_LIMIT = 8;

async function request(body: Record<string, unknown>) {
  const response = await fetch("/api/tracker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
  return result;
}

function sourceRowLabel(entry: TrackerHistoryEntry): string {
  if (entry.coordinationChanges) return `${entry.coordinationChanges.length} records`;
  if (entry.changes) return `${new Set(entry.changes.map(change => change.rowId)).size} rows`;
  return entry.sourceLineage ? `Source row ${entry.sourceLineage.sourceRow}` : "Added row";
}

function historyDescription(entry: TrackerHistoryEntry, tracker: TrackerSnapshot): string {
  if (entry.kind === "update_cell") {
    const column = entry.columnId ? tracker.columns.find((item) => item.id === entry.columnId) : undefined;
    return `Changed ${column?.label ?? "a field"} from “${entry.before ?? ""}” to “${entry.after ?? ""}”`;
  }
  if (entry.kind === "add_row") return "Added a row";
  if (entry.kind === "coordinate_records") return `Updated assignment or links for ${entry.coordinationChanges?.length ?? 0} records`;
  if (entry.kind === "undo_change") return "Undid a recorded change";
  if (entry.kind === "bulk_update") return `Changed ${entry.changes?.length ?? 0} fields together`;
  return "Removed a row from the active view";
}

export function TrackerExperience(props: Props) {
  return <TrackerSession key={`${props.workspaceId}:${props.workId ?? "new"}`} {...props} />;
}

function TrackerSession({ workspaceId, workId, readOnly = false, onSaved, transport = serverTransport, templateId }: Props) {
  const [source, setSource] = useState<TrackerSourceInput | null>(null);
  const [preview, setPreview] = useState<TrackerImportPreview | null>(null);
  const [mapping, setMapping] = useState<TrackerMappingSelection[]>([]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [title, setTitle] = useState("My internal tool");
  const [query, setQuery] = useState("");
  const [linkedRowId, setLinkedRowId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("row"));
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<{ rowId: string; columnId: string; value: string } | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [bulk, setBulk] = useState<{ columnId: string; value: string; reviewed: boolean }>({ columnId: "", value: "", reviewed: false });
  const [newRow, setNewRow] = useState<Record<string, string> | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!workId) return;
    const controller = new AbortController();
    transport.read(workId, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setSaved(result); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The internal tool could not be loaded."); });
    return () => controller.abort();
  }, [workId, transport]);

  useEffect(() => {
    setPage(0);
  }, [query]);

  useEffect(() => {
    if (readOnly) setEditing(null);
  }, [readOnly]);

  useEffect(() => {
    if (editing) editInputRef.current?.focus();
  }, [editing]);

  async function inspect(file: File) {
    if (readOnly) return;
    setBusy(true); setError(""); setNotice(""); setPreview(null); setSource(null);
    try {
      if (!file.name.toLowerCase().endsWith(".csv") || file.size > 1024 * 1024) throw new Error("Choose a CSV file up to 1 MB. Export other spreadsheet formats as CSV first.");
      const input: TrackerSourceInput = { fileName: file.name, mimeType: "text/csv", content: await file.text() };
      const result = await transport.write({ action: "preview", workspaceId, input }) as { preview: TrackerImportPreview };
      setSource(input); setPreview(result.preview);
      setMapping(result.preview.mapping.map((item) => ({
        sourceColumnId: item.sourceColumnId,
        targetFieldKey: item.targetFieldKey,
        targetLabel: item.status === "unmapped" ? "" : item.targetLabel,
        targetKind: item.targetKind,
      })));
      setTitle(file.name.replace(/\.csv$/i, ""));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The file could not be read."); }
    finally { setBusy(false); }
  }

  async function chooseTemplate(id: TrackerTemplateId) {
    if (readOnly || busy) return;
    const input = trackerTemplateSource(id);
    await inspect(new File([input.content], input.fileName, { type: input.mimeType }));
    setTitle(TRACKER_TEMPLATES.find(template => template.id === id)!.name);
  }

  async function create() {
    if (!source || !preview) return;
    if (readOnly) {
      setError("This internal tool is read only. Its owner controls creation.");
      return;
    }
    if (!preview.validation.valid) {
      setError("Resolve the import errors before creating the internal tool.");
      return;
    }
    if (mapping.some((item) => !item.targetFieldKey.trim() || !item.targetLabel?.trim())) {
      setError("Give every imported column an internal tool label before creating the internal tool.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await transport.write({ action: "create", workspaceId, input: source, title, mapping }) as Saved;
      setSaved(result); setPreview(null); setSource(null); setNotice(transport.mode === "local-preview" ? "Internal tool saved in this preview only. It resets when you leave or reload." : "Internal tool saved. Its original source is preserved."); onSaved?.(result.workId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The internal tool could not be saved."); }
    finally { setBusy(false); }
  }

  async function saveCell() {
    if (!saved || !editing) return;
    if (readOnly) {
      setEditing(null);
      setNotice("This internal tool is read only. Its owner controls edits.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await transport.write({ action: "command", workId: saved.workId, command: { kind: "update_cell", commandId: crypto.randomUUID(), baseRevision: saved.tracker.revision, ...editing } }) as Saved;
      setSaved(result); setEditing(null); setNotice(transport.mode === "local-preview" ? "Edit saved in this preview only, with its history." : "Edit saved with its history.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The edit could not be saved."); }
    finally { setBusy(false); }
  }

  async function changeRows(command: Record<string, unknown>) {
    if (!saved || readOnly || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await transport.write({ action: "command", workId: saved.workId, command: { ...command, commandId: crypto.randomUUID(), baseRevision: saved.tracker.revision } }) as Saved;
      setSaved(result); setSelectedRows([]); setBulk({ columnId: "", value: "", reviewed: false }); setEditing(null); setNewRow(null);
      setNotice(transport.mode === "local-preview" ? "Change recorded in this preview only." : "Change saved with one receipt.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The change could not be saved."); }
    finally { setBusy(false); }
  }

  const tracker = saved?.tracker;
  const coordination = useTrackerCoordinationOptions(saved?.workId, !readOnly && transport.mode === "server");
  const matchingRows = tracker ? filterTrackerRows(tracker, { query }).filter(row => !linkedRowId || row.id === linkedRowId) : [];
  const pageCount = Math.max(1, Math.ceil(matchingRows.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * ROWS_PER_PAGE;
  const visibleRows = matchingRows.slice(pageStart, pageStart + ROWS_PER_PAGE);
  const mappingReady = mapping.length > 0 && mapping.every((item) => item.targetFieldKey.trim() && item.targetLabel?.trim());
  const canCreate = Boolean(preview?.validation.valid && mappingReady);
  const pageStatus = matchingRows.length
    ? `Page ${currentPage + 1} of ${pageCount}. Showing rows ${pageStart + 1} to ${Math.min(pageStart + ROWS_PER_PAGE, matchingRows.length)} of ${matchingRows.length} matching rows.`
    : query ? "No rows match this filter." : "No records yet. Add your first record when you are ready.";

  return <StPage>
    <StHead title={tracker?.title ?? (preview ? `Bring in ${preview.source.originalFileName}` : "Import a spreadsheet into an internal tool")}
      crumb={{ label: tracker?.title ?? "Internal tools" }}
      meta={tracker ? <>Internal tool · revision <StMono>{tracker.revision}</StMono></> : preview ? <><StMono>{preview.validation.rowCount}</StMono> rows · <StMono>{preview.validation.columnCount}</StMono> columns · nothing is saved until you finish</> : "Start with suggested fields or bring in a CSV. Formulas are kept as text."} />
    {error ? <p id="tracker-error" role="alert" aria-live="assertive" className="text-critical">{error} {workId ? <button type="button" className="underline" onClick={() => window.location.reload()}>Reload internal tool</button> : null}</p> : null}
    {busy || notice ? <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-gray-muted">{busy ? "Working…" : notice}</p> : null}
    {readOnly ? <p className="text-sm" role="note">You can review this work. Editing requires workspace membership.</p> : null}
    {workId && !saved && !error ? <div role="status" aria-live="polite">Loading saved internal tool…<StSkeleton width="75%" /><StSkeleton width="55%" /></div> : null}

    {!workId && !saved ? <>
      {!preview ? <>
      <section aria-label="Start from a template" className="space-y-3">
        <h2 className="text-[13px] font-medium leading-[18px] text-[color:var(--st-text-3)]">Start with a useful set of fields</h2>
        <p className="text-sm text-gray-muted">These start empty. Review the fields before creating your list. Quantities stay as entered; no calculations or automatic reminders run.</p>
        <div className="flex flex-wrap gap-2">{TRACKER_TEMPLATES.map(template => <StPill key={template.id} type="button" variant="soft" disabled={busy || readOnly} onClick={() => void chooseTemplate(template.id)}>{template.name}{template.id === templateId ? " · selected" : ""}</StPill>)}</div>
      </section>
      </> : null}
      <div>
        <label htmlFor="tracker-file" className="block text-sm">Choose a CSV file</label>
        <input id="tracker-file" type="file" accept=".csv,text/csv" disabled={busy || readOnly} onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspect(file); }} className="mt-2 max-w-full text-sm" />
        <p className="mt-2 text-sm text-gray-muted">Up to 1 MB, 1,000 rows and 50 columns. Importing another file creates a new internal tool; it does not replace saved edits.</p>
      </div>

      {preview ? <>
        <StSection title="Review columns">
          <div className={styles.mappingHead} aria-hidden="true"><span>Column in your file</span><span>First row</span><span>Becomes</span><span>Filled</span></div>
          <StRows label="Column mapping">{mapping.map((field, index) => {
            const header = preview.headers.find(item => item.id === field.sourceColumnId);
            const filled = preview.rows.filter(row => row.values[field.sourceColumnId]?.trim()).length;
            return <StRow key={field.sourceColumnId} title={<div className={styles.mappingRow}>
              <StMono>{header?.header.trim() || `Column ${index + 1}`}</StMono>
              <span className={styles.sample}>{preview.rows[0]?.values[field.sourceColumnId] || "Empty"}</span>
              <TextInput id={`tracker-mapping-${field.sourceColumnId}`} label={`Internal tool label for column ${header?.sourceColumn ?? index + 1}`} value={field.targetLabel ?? ""} maxLength={200} required disabled={busy || readOnly} onChange={event => setMapping(current => current.map(item => item.sourceColumnId === field.sourceColumnId ? { ...item, targetLabel: event.target.value } : item))} />
              <StMono>{filled} filled</StMono>
            </div>} />;
          })}</StRows>
          <TextInput label="Internal tool name" value={title} maxLength={160} onChange={event => setTitle(event.target.value)} disabled={busy || readOnly} required />
          <p className="text-sm text-gray-muted">Every column is kept. Values stay as imported text; change a column name above.</p>
        </StSection>

        {preview.rows.length ? <section aria-labelledby="tracker-data-preview-title" className="space-y-3">
          <div>
            <h2 id="tracker-data-preview-title" className="text-[13px] font-medium leading-[18px] text-[color:var(--st-text-3)]">Preview imported rows</h2>
            <p id="tracker-data-preview-help" className="text-sm text-gray-muted">Showing the first {Math.min(PREVIEW_ROW_LIMIT, preview.rows.length)} of {preview.rows.length} rows. Source row numbers stay attached to the internal tool.</p>
          </div>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-labelledby="tracker-data-preview-title" aria-describedby="tracker-data-preview-help">
            <table className="w-full min-w-max text-left text-sm">
              <caption className="sr-only">Imported data preview from {preview.source.originalFileName}</caption>
              <thead><tr><th scope="col" className="p-3">Source row</th>{mapping.map((field) => <th scope="col" className="p-3" key={field.sourceColumnId}>{field.targetLabel || "Name this field"}</th>)}</tr></thead>
              <tbody>{preview.rows.slice(0, PREVIEW_ROW_LIMIT).map((row) => <tr key={row.id} className="border-t border-gray-border">
                <th scope="row" className="p-3 font-normal">{row.lineage.sourceRow}</th>
                {mapping.map((field) => <td className="max-w-72 whitespace-pre-wrap break-words p-3" key={field.sourceColumnId}>{row.values[field.sourceColumnId] || <span className="text-gray-muted">Empty</span>}</td>)}
              </tr>)}</tbody>
            </table>
          </div>
        </section> : null}

        {preview.warnings.length ? <section aria-labelledby="tracker-import-issues-title">
          <h2 id="tracker-import-issues-title" className="text-[13px] font-medium leading-[18px] text-[color:var(--st-text-3)]">Import issues to review</h2>
          <ul aria-label="Import issues" className="mt-2 list-disc space-y-1 pl-5 text-sm">{preview.warnings.map((warning, index) => <li key={`${warning.code}-${warning.sourceRow ?? "file"}-${warning.sourceColumn ?? "all"}-${index}`}><span className="font-medium">{warning.severity === "error" ? "Error: " : "Warning: "}</span>{warning.sourceRow ? `Row ${warning.sourceRow}: ` : ""}{warning.message}</li>)}</ul>
        </section> : null}
        <p role="status" aria-live="polite" className="text-sm">{preview.validation.rowCount} rows. {preview.validation.errors.length ? "Resolve the import errors, then upload the file again." : canCreate ? "The import is ready for your review." : "Name every imported field before creating the internal tool."}</p>
        <StPill onClick={() => void create()} disabled={busy || readOnly || !canCreate || !title.trim()}>{transport.mode === "local-preview" ? "Bring in preview records" : "Bring in records"}</StPill>
      </> : null}
    </> : null}

    {tracker ? <>
      {!readOnly && !newRow ? <StPill type="button" variant="soft" disabled={busy || tracker.rows.length >= 1000} onClick={() => setNewRow({})}>Add a record</StPill> : null}
      {newRow && !readOnly ? <form aria-label="New internal tool record" className="space-y-3 border-y border-gray-border py-4" onSubmit={event => { event.preventDefault(); void changeRows({ kind: "add_row", rowId: crypto.randomUUID(), values: newRow }); }}>
        <h2 className="text-[13px] font-medium leading-[18px] text-[color:var(--st-text-3)]">New record</h2>
        <div className="grid gap-3 sm:grid-cols-2">{tracker.columns.map(column => <TextInput key={column.id} label={column.label} value={newRow[column.id] ?? ""} maxLength={10000} disabled={busy} onChange={event => setNewRow(current => ({ ...current, [column.id]: event.target.value }))} />)}</div>
        <StPill type="submit" disabled={busy || !Object.values(newRow).some(value => value.trim())}>Save record</StPill>
        <StPill type="button" variant="soft" disabled={busy} onClick={() => setNewRow(null)}>Cancel new record</StPill>
      </form> : null}
      {linkedRowId ? <div className="flex flex-wrap items-center justify-between gap-3 border-y border-gray-border py-3 text-sm"><p>{tracker.rows.some(row => row.id === linkedRowId && row.state === "active") ? "Showing the linked record." : "This linked record is no longer active or available. Its recorded history remains below."}</p><StPill type="button" variant="soft" onClick={() => { setLinkedRowId(null); const url = new URL(window.location.href); url.searchParams.delete("row"); window.history.replaceState(workspaceHistoryState(window.history.state), "", `${url.pathname}${url.search}${url.hash}`); }}>Show all records</StPill></div> : null}
      <TextInput label="Filter rows" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search any field" />
      {selectedRows.length > 0 && !readOnly ? <form aria-label="Change selected rows" className="space-y-3 border-y border-gray-border py-4" onSubmit={event => { event.preventDefault(); setBulk(current => ({ ...current, reviewed: true })); }}>
        <p>{selectedRows.length} rows selected, including any hidden by your filter.</p>
        <label className="block text-sm">Field to change<select aria-label="Field to change" value={bulk.columnId} required disabled={busy} className="ml-3 rounded border border-gray-border bg-surface-inset p-2" onChange={event => setBulk(current => ({ ...current, columnId: event.target.value, reviewed: false }))}><option value="">Choose a field</option>{tracker.columns.map(column => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label>
        <TextInput label="Value for selected rows" value={bulk.value} disabled={busy} maxLength={10000} onChange={event => setBulk(current => ({ ...current, value: event.target.value, reviewed: false }))} />
        {bulk.reviewed && bulk.columnId ? <section aria-label="Proposed change" className="space-y-2">
          <h2 className="text-[13px] font-medium leading-[18px] text-[color:var(--st-text-3)]">Review this change</h2>
          <ul className="max-h-56 overflow-auto text-sm">{tracker.rows.filter(row => selectedRows.includes(row.id)).map(row => <li key={row.id} className="py-1">Source row {row.lineage?.sourceRow ?? "added"}: {row.cells[bulk.columnId]?.value || "Empty"} → {bulk.value || "Empty"}</li>)}</ul>
          <p className="text-sm text-gray-muted">One change with one Undo. Fields that already match stay unchanged.</p>
          <StPill type="button" disabled={busy} onClick={() => void changeRows({ kind: "bulk_update", rowIds: selectedRows, columnId: bulk.columnId, value: bulk.value })}>Apply selected changes</StPill>
        </section> : <StPill type="submit" disabled={busy || !bulk.columnId}>Review selected changes</StPill>}
        <StPill type="button" variant="soft" disabled={busy} onClick={() => { setSelectedRows([]); setBulk(current => ({ ...current, reviewed: false })); }}>Clear selection</StPill>
      </form> : null}
      {selectedRows.length > 0 && !readOnly && transport.mode === "server" && saved ? <TrackerCoordinationEditor key={selectedRows.join(":")} workId={saved.workId} rowIds={selectedRows} options={coordination.options} error={coordination.error} retry={coordination.retry} disabled={busy} change={changeRows} /> : null}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Internal tool rows, scroll horizontally for more fields">
        <table id="tracker-rows" className="w-full min-w-max text-left text-sm">
          <caption className="p-3 text-left">{pageStatus} Source: {tracker.source.originalFileName}.</caption>
          <thead><tr>{!readOnly ? <th scope="col" className="p-3"><span className="sr-only">Select rows</span></th> : null}<th scope="col" className="p-3">Source row</th>{tracker.columns.map((column) => <th scope="col" className="p-3" key={column.id}>{column.label}</th>)}</tr></thead>
          <tbody>{visibleRows.map((row) => <tr key={row.id} className="border-t border-gray-border">
            {!readOnly ? <td className="p-3"><input type="checkbox" aria-label={`Select source row ${row.lineage?.sourceRow ?? row.id}`} disabled={busy} checked={selectedRows.includes(row.id)} onChange={event => { setSelectedRows(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id)); setBulk(current => ({ ...current, reviewed: false })); }} /></td> : null}
            <th scope="row" className="p-3 text-left font-normal">{row.lineage?.sourceRow ?? "Added"}<TrackerRecordCoordination row={row} workspaceId={workspaceId} options={coordination.options} readOnly={readOnly || transport.mode === "local-preview"} disabled={busy} change={changeRows} /></th>
            {tracker.columns.map((column) => {
              const value = row.cells[column.id]?.value ?? row.cells[column.fieldKey]?.value ?? "";
              const label = `Edit ${column.label}, source row ${row.lineage?.sourceRow ?? "added"}`;
              return <td className="min-w-36 p-3" key={column.id}>{readOnly ? <span>{value || <span className="text-gray-muted">Empty</span>}</span> : <button type="button" disabled={busy} aria-label={label} className="w-full text-left underline decoration-gray-border underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent" onClick={() => setEditing({ rowId: row.id, columnId: column.id, value })}>{value || <span className="text-gray-muted">Empty</span>}</button>}</td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <nav aria-label="Internal tool row pages" className="flex flex-wrap items-center justify-between gap-3">
        <p id="tracker-page-status" role="status" aria-live="polite" aria-atomic="true" className="text-sm text-gray-muted">{pageStatus}</p>
        <div className="flex gap-2">
          <StPill type="button" variant="soft" size="md" onClick={() => setPage((current) => Math.max(0, Math.min(current, pageCount - 1) - 1))} disabled={currentPage === 0}>Previous rows</StPill>
          <StPill type="button" variant="soft" size="md" onClick={() => setPage((current) => Math.min(pageCount - 1, Math.max(current, 0) + 1))} disabled={currentPage >= pageCount - 1}>Next rows</StPill>
        </div>
      </nav>

      {editing && !readOnly ? <form aria-labelledby="tracker-edit-title" className="space-y-3 border-t border-gray-border pt-4" onSubmit={(event) => { event.preventDefault(); void saveCell(); }}>
        <h2 id="tracker-edit-title" className="text-[13px] font-medium leading-[18px] text-[color:var(--st-text-3)]">Edit cell</h2>
        <TextInput ref={editInputRef} label="New cell value" value={editing.value} onChange={(event) => setEditing({ ...editing, value: event.target.value })} disabled={busy} maxLength={10_000} />
        <div className="flex gap-3"><StPill type="submit" disabled={busy}>Save edit</StPill><StPill type="button" variant="soft" onClick={() => setEditing(null)} disabled={busy}>Cancel</StPill></div>
      </form> : null}

      <section aria-labelledby="tracker-history-title">
        <h2 id="tracker-history-title" className="text-[13px] font-medium leading-[18px] text-[color:var(--st-text-3)]">Edit history</h2>
        {tracker.history.length ? <>
          <p className="mt-2 text-sm text-gray-muted">{tracker.history.length} recorded edit{tracker.history.length === 1 ? "" : "s"}. Showing the latest {Math.min(20, tracker.history.length)}.</p>
          <ol className="mt-3 space-y-2 text-sm" aria-label="Internal tool edit history">{tracker.history.slice(-20).reverse().map((entry) => <li key={entry.commandId} className="border-b border-gray-border py-3"><p>{historyDescription(entry, tracker)}</p><p className="mt-1 text-xs text-gray-muted">Revision {entry.revision} · {sourceRowLabel(entry)} · <time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time></p>{entry.changes ? <details className="mt-2"><summary>Before and after</summary><ul>{entry.changes.map(change => <li key={`${change.rowId}:${change.columnId}`}>{tracker.columns.find(column => column.id === change.columnId)?.label}: {change.before || "Empty"} → {change.after || "Empty"}</li>)}</ul></details> : null}{entry.coordinationChanges ? <details className="mt-2"><summary>Assignment and links before and after</summary><ul className="space-y-2">{entry.coordinationChanges.map(change => <li key={change.rowId} className="break-words"><p>Record {tracker.rows.find(row => row.id === change.rowId)?.lineage?.sourceRow ?? "added"}</p><p>{change.before.assigneeId ? coordination.options?.members.find(member => member.userId === change.before.assigneeId)?.email || `Member ${change.before.assigneeId}` : "Unassigned"}, {change.before.links.length} links → {change.after.assigneeId ? coordination.options?.members.find(member => member.userId === change.after.assigneeId)?.email || `Member ${change.after.assigneeId}` : "Unassigned"}, {change.after.links.length} links</p></li>)}</ul></details> : null}{!readOnly && entry.kind !== "undo_change" && (trackerReceiptChanges(entry).length || entry.coordinationChanges?.length) ? <div className="mt-2"><StPill size="md" variant="soft" disabled={busy || Boolean(trackerUndoBlock(tracker, entry))} onClick={() => void changeRows({ kind: "undo_change", targetCommandId: entry.commandId })}>Undo change {entry.revision}</StPill>{trackerUndoBlock(tracker, entry) ? <p className="mt-1 text-xs text-gray-muted">{trackerUndoBlock(tracker, entry)}</p> : null}</div> : null}</li>)}</ol>
        </> : <p className="mt-2 text-sm text-gray-muted">No edits yet. The imported source is preserved.</p>}
      </section>
      {saved?.canRecordExperiment && !readOnly ? <TrackerExperimentForm workId={saved.workId} expectedRevision={saved.tracker.revision} /> : null}
    </> : null}
  </StPage>;
}

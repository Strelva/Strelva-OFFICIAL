"use client";

import { useEffect, useRef, useState } from "react";
import { XaBlock, XaButton, XaDecision, XaEmpty, XaField, XaFileDrop, XaHeadline, XaNote, XaObjectPage, XaSelect, XaStatus, XaSystemTile, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import styles from "./tracker-experience.module.css";
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

function historyDescription(entry: TrackerHistoryEntry, tracker: TrackerSnapshot): string {
  if (entry.kind === "update_cell") {
    const column = entry.columnId ? tracker.columns.find((item) => item.id === entry.columnId) : undefined;
    return `Changed ${column?.label ?? "a field"} from “${entry.before ?? ""}” to “${entry.after ?? ""}”`;
  }
  if (entry.kind === "add_row") return "Added a record";
  if (entry.kind === "coordinate_records") return `Changed who has ${entry.coordinationChanges?.length ?? 0} records, or what they link to`;
  if (entry.kind === "undo_change") return "Undid a change";
  if (entry.kind === "bulk_update") return `Changed ${entry.changes?.length ?? 0} values at once`;
  return "Removed a record";
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
  const [startWith, setStartWith] = useState<TrackerTemplateId | null>(null);
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
      if (!file.name.toLowerCase().endsWith(".csv") || file.size > 1024 * 1024) throw new Error("That file needs to be a spreadsheet saved as CSV, up to 1 MB.");
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
      setError("You can look around. The owner makes new tools.");
      return;
    }
    if (!preview.validation.valid) {
      setError("Fix the file, then choose it again.");
      return;
    }
    if (mapping.some((item) => !item.targetFieldKey.trim() || !item.targetLabel?.trim())) {
      setError("Every column needs a name.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await transport.write({ action: "create", workspaceId, input: source, title, mapping }) as Saved;
      setSaved(result); setPreview(null); setSource(null); setNotice(transport.mode === "local-preview" ? "Made. It stays in this view until you leave." : "Made. The list it came from is kept as it was."); onSaved?.(result.workId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The internal tool could not be saved."); }
    finally { setBusy(false); }
  }

  async function saveCell() {
    if (!saved || !editing) return;
    if (readOnly) {
      setEditing(null);
      setNotice("You can read this. The owner makes changes.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await transport.write({ action: "command", workId: saved.workId, command: { kind: "update_cell", commandId: crypto.randomUUID(), baseRevision: saved.tracker.revision, ...editing } }) as Saved;
      setSaved(result); setEditing(null); setNotice(transport.mode === "local-preview" ? "Saved." : "Saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The edit could not be saved."); }
    finally { setBusy(false); }
  }

  async function changeRows(command: Record<string, unknown>) {
    if (!saved || readOnly || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await transport.write({ action: "command", workId: saved.workId, command: { ...command, commandId: crypto.randomUUID(), baseRevision: saved.tracker.revision } }) as Saved;
      setSaved(result); setSelectedRows([]); setBulk({ columnId: "", value: "", reviewed: false }); setEditing(null); setNewRow(null);
      setNotice(transport.mode === "local-preview" ? "Changed." : "Changed. You can undo it below.");
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

  const status = busy ? <XaNote role="status">Working…</XaNote> : notice ? <XaNote role="status" tone="done">{notice}</XaNote> : null;
  const failure = error ? <XaNote tone="down" role="alert">{error}{workId ? <> <XaTextLink onClick={() => window.location.reload()}>Reload</XaTextLink></> : null}</XaNote> : null;

  // Starting: one suggested start chosen in place on the left, the spreadsheet drop on the right.
  if (!workId && !saved) {
    const head = <XaHeadline quiet={preview ? `${preview.validation.rowCount} ${preview.validation.rowCount === 1 ? "row" : "rows"} from ${preview.source.originalFileName}. Nothing is saved until you bring them in.` : "Bring in a list you already keep."}>{preview ? `Bring in ${title || "your list"}.` : "A new internal tool."}</XaHeadline>;
    const story = <>
      {failure}{status}
      {readOnly ? <XaNote>You can look around. The owner makes new tools.</XaNote> : null}
      {!preview ? (() => {
        // One suggested start, chosen in place; the others are a sentence of text links.
        const suggested = TRACKER_TEMPLATES.find(template => template.id === (startWith ?? templateId)) ?? TRACKER_TEMPLATES[0]!;
        const others = TRACKER_TEMPLATES.filter(template => template.id !== suggested.id);
        return <XaBlock label="Or start from a list">
          <p className={styles.suggest}><span className={styles.suggestName}>{suggested.name}.</span> {suggested.fields.join(", ")}. Starts empty. {readOnly ? null : <XaTextLink onClick={() => { setStartWith(suggested.id); void chooseTemplate(suggested.id); }}>Use it</XaTextLink>}</p>
          {readOnly ? null : <p className={styles.suggestOthers}>Or {others.map((template, index) => <span key={template.id}>{index ? " · " : ""}<XaTextLink onClick={() => { setStartWith(template.id); void chooseTemplate(template.id); }}>{template.name.toLowerCase()}</XaTextLink></span>)}</p>}
        </XaBlock>;
      })()
        : <XaBlock label="Columns" action={<XaTextLink onClick={() => { setPreview(null); setSource(null); setStartWith(null); }}>Start over</XaTextLink>}>
          <ol className={styles.columns} aria-label="Columns to bring in">{mapping.map((field, index) => {
            const header = preview.headers.find(item => item.id === field.sourceColumnId);
            const filled = preview.rows.filter(row => row.values[field.sourceColumnId]?.trim()).length;
            const sample = preview.rows[0]?.values[field.sourceColumnId];
            return <li key={field.sourceColumnId} className={styles.column}>
              <input className={styles.inline} id={`tracker-mapping-${field.sourceColumnId}`} aria-label={`Name for the column ${header?.header.trim() || `column ${index + 1}`}`} value={field.targetLabel ?? ""} maxLength={200} required disabled={busy || readOnly}
                onChange={event => setMapping(current => current.map(item => item.sourceColumnId === field.sourceColumnId ? { ...item, targetLabel: event.target.value } : item))} />
              <span className={styles.sample}>{sample ? `“${sample}”` : "No first value"} · {preview.rows.length ? `${filled} of ${preview.rows.length} filled` : "empty so far"}</span>
            </li>;
          })}</ol>
        </XaBlock>}
    </>;
    const object = preview ? <XaDecision label="Your new internal tool" status={<XaStatus kind={preview.validation.errors.length ? "down" : "draft"}>{preview.validation.errors.length ? "Can't bring this in yet" : "Not saved yet"}</XaStatus>} meta={`${preview.validation.columnCount} columns`}
      yes={<div className={styles.yes}>
        <XaButton variant="primary" size="lg" busy={busy} disabled={readOnly} onClick={() => void create()}>{preview.rows.length ? `Bring in ${preview.rows.length} ${preview.rows.length === 1 ? "record" : "records"}` : "Make it"}</XaButton>
        {!canCreate || !title.trim() ? <span className={styles.reason}>{preview.validation.errors.length ? "Fix the file, then choose it again." : "Every column needs a name."}</span> : null}
      </div>}>
      <XaField label="Name" value={title} maxLength={160} onChange={event => setTitle(event.target.value)} disabled={busy || readOnly} required />
      {preview.rows.length ? <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={`The first ${Math.min(PREVIEW_ROW_LIMIT, preview.rows.length)} rows`}>
        <table className={styles.table}>
          <thead><tr>{mapping.map(field => <th scope="col" key={field.sourceColumnId}>{field.targetLabel || "Needs a name"}</th>)}</tr></thead>
          <tbody>{preview.rows.slice(0, PREVIEW_ROW_LIMIT).map(row => <tr key={row.id}>{mapping.map(field => <td key={field.sourceColumnId}>{row.values[field.sourceColumnId] || <span className={styles.empty}>Empty</span>}</td>)}</tr>)}</tbody>
        </table>
      </div> : <XaNote>It starts empty. Add the first record once it&apos;s made.</XaNote>}
      {preview.warnings.length ? <ul className={styles.warnings} aria-label="Things to check in the file">{preview.warnings.map((warning, index) => <li key={`${warning.code}-${warning.sourceRow ?? "file"}-${warning.sourceColumn ?? "all"}-${index}`} data-error={warning.severity === "error" || undefined}>{warning.sourceRow ? `Row ${warning.sourceRow}: ` : ""}{warning.message}</li>)}</ul> : null}
    </XaDecision> : <XaFileDrop label="Choose a spreadsheet saved as CSV" accept=".csv,text/csv" disabled={busy || readOnly} onFile={file => { if (file) void inspect(file); }}
      title="Drop a spreadsheet here" pose="adds">Save it as CSV first. Up to 1,000 rows and 50 columns. Every column comes along, and you can rename them next.</XaFileDrop>;
    return <XaObjectPage label="A new internal tool" phone="object-first" head={head} story={story} object={object} />;
  }

  return <div className={styles.page} aria-busy={busy}>
    <header className={styles.head}>
      <XaSystemTile kind="form" size={48} label="Internal tool" />
      <XaHeadline quiet={tracker ? `${tracker.rows.filter(row => row.state === "active").length} records.` : undefined}>{tracker?.title ?? "Opening the internal tool"}.</XaHeadline>
      {tracker && !readOnly && !newRow ? <XaButton variant="primary" disabled={busy || tracker.rows.length >= 1000} onClick={() => setNewRow({})}>Add a record</XaButton> : null}
    </header>
    {failure}{status}
    {readOnly ? <XaNote>You can read this. The owner makes changes.</XaNote> : null}
    {workId && !saved && !error ? <XaWorking title="Opening the internal tool" steps={[{ id: "read", label: "Reading its records", state: "active" }]} /> : null}

    {tracker ? <>
      {newRow && !readOnly ? <form aria-label="New record" className={styles.inlineForm} onSubmit={event => { event.preventDefault(); void changeRows({ kind: "add_row", rowId: crypto.randomUUID(), values: newRow }); }}>
        <div className={styles.formFields}>{tracker.columns.map(column => <XaField key={column.id} label={column.label} value={newRow[column.id] ?? ""} maxLength={10000} disabled={busy} onChange={event => setNewRow(current => ({ ...current, [column.id]: event.target.value }))} />)}</div>
        <div className={styles.formActions}><XaButton type="submit" variant="secondary" disabled={busy || !Object.values(newRow).some(value => value.trim())}>Save record</XaButton><XaTextLink onClick={() => setNewRow(null)}>Not now</XaTextLink></div>
      </form> : null}
      {linkedRowId ? <XaNote>{tracker.rows.some(row => row.id === linkedRowId && row.state === "active") ? "Showing the record you were sent." : "The record you were sent is no longer here. What happened to it is in the changes below."} <XaTextLink onClick={() => { setLinkedRowId(null); const url = new URL(window.location.href); url.searchParams.delete("row"); window.history.replaceState(workspaceHistoryState(window.history.state), "", `${url.pathname}${url.search}${url.hash}`); }}>Show every record</XaTextLink></XaNote> : null}
      <div className={styles.filter}><XaField label="Find" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Any word in any column" /></div>
      {selectedRows.length > 0 && !readOnly ? <form aria-label="Change the chosen records" className={styles.inlineForm} onSubmit={event => { event.preventDefault(); setBulk(current => ({ ...current, reviewed: true })); }}>
        <p className={styles.formLead}>{selectedRows.length} chosen{query ? ", including any your search hides" : ""}.</p>
        <div className={styles.formFields}>
          <XaSelect label="Column to change" value={bulk.columnId} required disabled={busy} placeholder="Choose a column" options={tracker.columns.map(column => ({ value: column.id, label: column.label }))} onChange={event => setBulk(current => ({ ...current, columnId: event.target.value, reviewed: false }))} />
          <XaField label="New value" value={bulk.value} disabled={busy} maxLength={10000} onChange={event => setBulk(current => ({ ...current, value: event.target.value, reviewed: false }))} />
        </div>
        {bulk.reviewed && bulk.columnId ? <section aria-label="What changes" className={styles.review}>
          <ul>{tracker.rows.filter(row => selectedRows.includes(row.id)).map(row => <li key={row.id}>{row.cells[bulk.columnId]?.value || "Empty"} becomes {bulk.value || "empty"}</li>)}</ul>
          <div className={styles.formActions}><XaButton variant="secondary" disabled={busy} onClick={() => void changeRows({ kind: "bulk_update", rowIds: selectedRows, columnId: bulk.columnId, value: bulk.value })}>Change {selectedRows.length}</XaButton><XaTextLink onClick={() => { setSelectedRows([]); setBulk(current => ({ ...current, reviewed: false })); }}>Not now</XaTextLink></div>
        </section> : <div className={styles.formActions}><XaButton type="submit" variant="secondary" disabled={busy || !bulk.columnId}>See what changes</XaButton><XaTextLink onClick={() => { setSelectedRows([]); setBulk(current => ({ ...current, reviewed: false })); }}>Clear</XaTextLink></div>}
      </form> : null}
      {selectedRows.length > 0 && !readOnly && transport.mode === "server" && saved ? <TrackerCoordinationEditor key={selectedRows.join(":")} workId={saved.workId} rowIds={selectedRows} options={coordination.options} error={coordination.error} retry={coordination.retry} disabled={busy} change={changeRows} /> : null}
      {matchingRows.length ? <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={`${tracker.title} records`}>
        <table id="tracker-rows" className={styles.table}>
          <caption className="sr-only">{pageStatus}</caption>
          <thead><tr>{!readOnly ? <th scope="col" className={styles.pick}><span className="sr-only">Choose</span></th> : null}{tracker.columns.map((column) => <th scope="col" key={column.id}>{column.label}</th>)}</tr></thead>
          <tbody>{visibleRows.map((row, index) => <tr key={row.id}>
            {!readOnly ? <td className={styles.pick}><input type="checkbox" aria-label={`Choose record ${pageStart + index + 1}`} disabled={busy} checked={selectedRows.includes(row.id)} onChange={event => { setSelectedRows(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id)); setBulk(current => ({ ...current, reviewed: false })); }} /></td> : null}
            {tracker.columns.map((column, columnIndex) => {
              const value = row.cells[column.id]?.value ?? row.cells[column.fieldKey]?.value ?? "";
              const open = editing?.rowId === row.id && editing.columnId === column.id;
              return <td key={column.id}>
                {open && !readOnly ? <form className={styles.cellForm} onSubmit={(event) => { event.preventDefault(); void saveCell(); }}>
                  <input ref={editInputRef} className={styles.cellInput} aria-label={`${column.label}, record ${pageStart + index + 1}`} value={editing.value} onChange={(event) => setEditing({ ...editing, value: event.target.value })} onKeyDown={event => { if (event.key === "Escape") setEditing(null); }} disabled={busy} maxLength={10_000} />
                  <XaTextLink onClick={() => void saveCell()}>Save</XaTextLink>
                </form>
                  : readOnly ? <span>{value || <span className={styles.empty}>Empty</span>}</span>
                    : <button type="button" disabled={busy} aria-label={`Change ${column.label}, record ${pageStart + index + 1}`} className={styles.cell} onClick={() => setEditing({ rowId: row.id, columnId: column.id, value })}>{value || <span className={styles.empty}>Empty</span>}</button>}
                {columnIndex === 0 ? <TrackerRecordCoordination row={row} workspaceId={workspaceId} options={coordination.options} readOnly={readOnly || transport.mode === "local-preview"} disabled={busy} change={changeRows} /> : null}
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div> : <XaEmpty pose="adds" size="sm" title={query ? "Nothing matches that" : "No records yet"} job={query ? "Pebble checked every column." : "Pebble is keeping the first row open."}>{query ? "Try fewer words." : "Add the first one, and it shows here."}</XaEmpty>}
      {pageCount > 1 ? <nav aria-label="More records" className={styles.pages}>
        <span id="tracker-page-status" role="status" aria-live="polite">{pageStart + 1} to {Math.min(pageStart + ROWS_PER_PAGE, matchingRows.length)} of {matchingRows.length}</span>
        <XaTextLink onClick={() => setPage((current) => Math.max(0, Math.min(current, pageCount - 1) - 1))}>Earlier</XaTextLink>
        <XaTextLink onClick={() => setPage((current) => Math.min(pageCount - 1, Math.max(current, 0) + 1))}>Later</XaTextLink>
      </nav> : null}

      <XaBlock label="What changed" id="tracker-history-title">
        {tracker.history.length ? <ol className={styles.history} aria-label="What changed">{tracker.history.slice(-20).reverse().map((entry) => {
          const block = trackerUndoBlock(tracker, entry);
          const undoable = !readOnly && entry.kind !== "undo_change" && (trackerReceiptChanges(entry).length || entry.coordinationChanges?.length);
          return <li key={entry.commandId}>
            <time dateTime={entry.at}>{new Date(entry.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>
            <span>{historyDescription(entry, tracker)}{undoable && !block ? <> · <XaTextLink onClick={() => void changeRows({ kind: "undo_change", targetCommandId: entry.commandId })}>Undo</XaTextLink></> : null}{undoable && block ? <span className={styles.empty}> · {block}</span> : null}</span>
          </li>;
        })}</ol> : <XaNote>Nothing changed yet. The list it came from is kept as it was.</XaNote>}
      </XaBlock>
      {saved?.canRecordExperiment && !readOnly ? <TrackerExperimentForm workId={saved.workId} expectedRevision={saved.tracker.revision} /> : null}
    </> : null}
  </div>;
}

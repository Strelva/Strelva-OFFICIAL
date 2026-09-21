"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { TrackerSnapshot } from "@/products/tracker/contracts";

type Options = { members: Array<{ userId: string; email: string }>; trackers: Array<{ workId: string; title: string; revision: number }> };
const selectClass = "mt-1 block min-h-11 w-full rounded-xl border border-gray-border bg-surface-inset px-3 py-2 text-sm";
export function useTrackerCoordinationOptions(workId: string | undefined, enabled: boolean) {
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!workId || !enabled) return;
    const controller = new AbortController();
    fetch(`/api/tracker?workId=${encodeURIComponent(workId)}&coordination=1`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Assignment choices could not be loaded.");
      const available = body.coordinationOptions ?? body;
      if (!Array.isArray(available.members) || !Array.isArray(available.trackers)) throw new Error("Assignment choices are unavailable for this tracker.");
      if (!controller.signal.aborted) { setOptions(available); setError(""); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Assignment choices could not be loaded."); });
    return () => controller.abort();
  }, [enabled, workId, retry]);
  return { options: enabled ? options : null, error, retry: () => setRetry(value => value + 1) };
}

type Change = (command: Record<string, unknown>) => Promise<void>;
export function TrackerCoordinationEditor({ workId, rowIds, options, error, retry, disabled, change }: { workId: string; rowIds: string[]; options: Options | null; error: string; retry: () => void; disabled: boolean; change: Change }) {
  const [assignee, setAssignee] = useState("keep");
  const [targetId, setTargetId] = useState("");
  const [rowId, setRowId] = useState("");
  const [target, setTarget] = useState<{ workId: string; tracker: TrackerSnapshot } | null>(null);
  const [targetError, setTargetError] = useState("");
  useEffect(() => {
    if (!targetId) return;
    const controller = new AbortController();
    fetch(`/api/tracker?workId=${encodeURIComponent(targetId)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Related records could not be loaded.");
      if (!body.tracker || !Array.isArray(body.tracker.rows)) throw new Error("Related records are unavailable.");
      if (!controller.signal.aborted) { setTarget({ workId: targetId, tracker: body.tracker }); setTargetError(""); }
    }).catch(cause => { if (!controller.signal.aborted) setTargetError(cause instanceof Error ? cause.message : "Related records could not be loaded."); });
    return () => controller.abort();
  }, [targetId]);
  const tracker = target?.workId === targetId ? target.tracker : null;
  const rows = tracker?.rows.filter(row => row.state === "active" && (targetId !== workId || !rowIds.includes(row.id))) || [];
  const canSave = options && (assignee !== "keep" || Boolean(targetId && rowId && tracker)) && (!targetId || Boolean(rowId && tracker));
  return <details className="space-y-4 border-y border-gray-border py-4"><summary className="cursor-pointer text-sm">Assign or link selected records</summary>
    {!options ? <p className="text-sm text-gray-muted" role="status">{error || "Loading workspace members and related trackers…"} {error ? <button type="button" className="underline" onClick={retry}>Try again</button> : null}</p> : <form className="space-y-4" aria-label="Assign or link selected records" onSubmit={event => { event.preventDefault(); if (!canSave) return; void change({ kind: "coordinate_records", rowIds, ...(assignee === "keep" ? {} : { assigneeId: assignee === "none" ? null : assignee }), ...(targetId && rowId && tracker ? { link: { workId: targetId, rowId, linkedRevision: tracker.revision } } : {}) }); }}>
      <p className="text-sm text-gray-muted">Applies to {rowIds.length} selected record{rowIds.length === 1 ? "" : "s"}, including any hidden by your filter. Links add to existing relationships.</p>
      <label className="block text-sm">Assign to<select className={selectClass} value={assignee} disabled={disabled} onChange={event => setAssignee(event.target.value)}><option value="keep">Keep current assignment</option><option value="none">Unassigned</option>{options.members.map(member => <option key={member.userId} value={member.userId}>{member.email}</option>)}</select></label>
      <label className="block text-sm">Link a record from<select className={selectClass} value={targetId} disabled={disabled} onChange={event => { setTargetId(event.target.value); setRowId(""); setTargetError(""); }}><option value="">Keep current links</option>{options.trackers.map(item => <option key={item.workId} value={item.workId}>{item.title}</option>)}</select></label>
      {targetId ? <label className="block text-sm">Related record<select className={selectClass} value={rowId} disabled={disabled || !tracker} required onChange={event => setRowId(event.target.value)}><option value="">{tracker ? "Choose a record" : "Loading records…"}</option>{rows.map(row => <option key={row.id} value={row.id}>{tracker?.columns.map(column => row.cells[column.id]?.value).filter(Boolean).slice(0, 2).join(" · ") || `Source row ${row.lineage?.sourceRow ?? "added"}`}</option>)}</select></label> : null}
      {targetId && tracker && !rows.length ? <p className="text-sm text-gray-muted">No other active records are available in this tracker.</p> : null}
      {targetError ? <p role="alert" className="text-sm text-critical">{targetError}</p> : null}
      <Button type="submit" disabled={disabled || !canSave}>Save assignment and links</Button>
    </form>}
  </details>;
}

export function TrackerRecordCoordination({ row, workspaceId, options, readOnly, disabled, change }: { row: TrackerSnapshot["rows"][number]; workspaceId: string; options: Options | null; readOnly: boolean; disabled: boolean; change: Change }) {
  const coordination = row.coordination;
  if (!coordination?.assigneeId && !coordination?.links.length) return null;
  const assignee = options?.members.find(member => member.userId === coordination.assigneeId)?.email;
  return <details className="mt-2 text-xs text-gray-muted"><summary className="cursor-pointer py-1">{coordination.assigneeId ? assignee || "Assigned member" : "Unassigned"}{coordination.links.length ? ` · ${coordination.links.length} related` : ""}</summary>
    <p className="my-2">{coordination.assigneeId ? assignee ? `Assigned to ${assignee}` : "Assigned to a workspace member. Membership details are unavailable here." : "No member assigned."}</p>
    {coordination.links.length ? <ul className="space-y-3">{coordination.links.map(link => <li key={`${link.workId}:${link.rowId}`}><a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=tracker&work=${encodeURIComponent(link.workId)}&row=${encodeURIComponent(link.rowId)}`}>Open related record in {options?.trackers.find(tracker => tracker.workId === link.workId)?.title || "saved tracker"}</a><p className="mt-1">Linked at revision {link.linkedRevision}. The current record opens when available.</p>{!readOnly ? <button type="button" className="min-h-8 underline" disabled={disabled} onClick={() => void change({ kind: "coordinate_records", rowIds: [row.id], unlink: { workId: link.workId, rowId: link.rowId } })}>Remove this link</button> : null}</li>)}</ul> : null}
  </details>;
}

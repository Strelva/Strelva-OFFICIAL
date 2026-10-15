"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { StField, StNotice, StPill, StRow, StRows, StTextButton, StTextField } from "@/components/ui/strelva/Kit";
import { BUSINESS_EFFORT_CATEGORIES, BUSINESS_EFFORT_CATEGORY_LABELS, type BusinessEffortCategory } from "@/platform/business-effort/types";
import { agencyTimeListSchema, type AgencyTimeList } from "@/platform/care-reports/contracts";
import { careShortDate, careTimeLabel, currentCareMonth } from "@/platform/care-reports/model";

type State = { kind: "loading" } | { kind: "off" } | { kind: "error" } | { kind: "ready"; entries: AgencyTimeList };
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Minutes this agency spent on one client this month. They feed the monthly
 * Care plan report. Renders nothing while the App is off (the route answers 503). Remove shows only on
 * the viewer's own entries, or for agency owners and admins.
 */
export function AgencyClientTime({ agencyWorkspaceId, workspaceId, clientName, viewerEmail = "", canManage = false, request = fetch }: { agencyWorkspaceId: string; workspaceId: string; clientName: string; viewerEmail?: string; canManage?: boolean; request?: typeof fetch }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [minutes, setMinutes] = useState("");
  const [category, setCategory] = useState<BusinessEffortCategory>("delivery");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; reason: string } | null>(null);
  // One id per entry being recorded, so a retried submit is recorded once.
  const entryId = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await request(`/api/workspace/agency-client-time?${new URLSearchParams({ agencyWorkspaceId, workspaceId, month: currentCareMonth() })}`, { credentials: "same-origin" });
        if (!live) return;
        if (response.status === 503) { setState({ kind: "off" }); return; }
        const parsed = response.ok ? agencyTimeListSchema.safeParse(await response.json()) : null;
        setState(parsed?.success ? { kind: "ready", entries: parsed.data } : { kind: "error" });
      } catch { if (live) setState({ kind: "error" }); }
    })();
    return () => { live = false; };
  }, [agencyWorkspaceId, workspaceId, request, attempt]);

  const reload = useCallback(() => setAttempt(count => count + 1), []);

  if (state.kind === "off") return null;
  if (state.kind === "loading") return <p role="status" className="mx-2 mb-4 text-sm text-gray-muted">Checking time…</p>;
  if (state.kind === "error") return <div className="mx-2 mb-4"><StNotice tone="critical" action={<StTextButton onClick={() => { setState({ kind: "loading" }); reload(); }}>Retry</StTextButton>}>Time for {clientName} could not be read. Nothing changed.</StNotice></div>;

  const live = state.entries.filter(entry => !entry.voided);
  const total = live.reduce((sum, entry) => sum + entry.minutes, 0);
  const valid = Number.isInteger(Number(minutes)) && Number(minutes) >= 1 && Number(minutes) <= 1440;

  async function submit() {
    if (!valid || busy) return;
    entryId.current ??= crypto.randomUUID();
    setBusy(true); setError(null);
    try {
      const response = await request("/api/workspace/agency-client-time", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyWorkspaceId, workspaceId, id: entryId.current, minutes: Number(minutes), category, occurredOn: date, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      if (!response.ok) {
        const value = await response.json().catch(() => null);
        setError((value && typeof value.error === "string" && value.error) || "That time was not recorded. Check the details and try again.");
        return;
      }
      entryId.current = null;
      setMinutes(""); setNote("");
      reload();
    } catch { setError("That time was not recorded. Try again."); }
    finally { setBusy(false); }
  }

  async function remove(id: string, reason: string) {
    setError(null);
    try {
      const response = await request("/api/workspace/agency-client-time", {
        method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agencyWorkspaceId, id, reason: reason.trim() }),
      });
      if (!response.ok) {
        setError(response.status === 403 ? "Only the person who recorded this, or an agency owner or admin, can remove it." : "That entry was not removed. Try again.");
        return;
      }
      setRemoving(null);
      reload();
    } catch { setError("That entry was not removed. Try again."); }
  }

  return <section aria-label="Time this month" className="mx-2 mb-4 grid gap-3">
    <h3 className="text-sm font-medium">Time this month{total > 0 ? ` · ${careTimeLabel(total)}` : ""}</h3>
    <p className="text-xs text-gray-muted">Minutes {clientName} cost you in work. They appear in this client&apos;s Care plan report.</p>
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <StTextField label="Minutes" type="number" inputMode="numeric" min={1} max={1440} value={minutes} onChange={event => setMinutes(event.target.value)} />
      <StField label="Kind of work">
        <select value={category} onChange={event => setCategory(event.target.value as BusinessEffortCategory)}>
          {BUSINESS_EFFORT_CATEGORIES.map(item => <option key={item} value={item}>{BUSINESS_EFFORT_CATEGORY_LABELS[item]}</option>)}
        </select>
      </StField>
      <StTextField label="Date" type="date" max={today()} value={date} onChange={event => setDate(event.target.value)} />
      <StTextField label="Note" maxLength={280} value={note} onChange={event => setNote(event.target.value)} />
      <div><StPill type="submit" variant="soft" busy={busy} disabled={!valid}>Record time</StPill></div>
    </form>
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
    {live.length ? <StRows label="Time recorded this month">
      {live.map(entry => <StRow key={entry.id} title={`${careTimeLabel(entry.minutes)} · ${BUSINESS_EFFORT_CATEGORY_LABELS[entry.category]}`}
        detail={`${careShortDate(entry.occurredOn)} · ${entry.recordedBy}${entry.note ? ` · ${entry.note}` : ""}`}
        end={!canManage && !(viewerEmail && entry.recordedBy.toLowerCase() === viewerEmail.toLowerCase()) ? undefined : removing?.id === entry.id
          ? <span className="flex items-center gap-2">
            <StTextField label="Reason" maxLength={280} value={removing.reason} onChange={event => setRemoving({ id: entry.id, reason: event.target.value })} />
            <StTextButton tone="danger" disabled={!removing.reason.trim()} onClick={() => void remove(entry.id, removing.reason)}>Remove</StTextButton>
            <StTextButton onClick={() => setRemoving(null)}>Cancel</StTextButton>
          </span>
          : <StTextButton tone="danger" onClick={() => setRemoving({ id: entry.id, reason: "" })}>Remove</StTextButton>} />)}
    </StRows> : <p className="text-sm text-gray-muted">No time recorded for {clientName} this month.</p>}
  </section>;
}

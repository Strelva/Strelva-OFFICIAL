"use client";
/**
 * XA · R2 One day's hours (and the usual week). The business record is the
 * source of truth: saving writes `hours` (weekly + overrides) through
 * /api/workspace/publishing/record with the exact revision and one command
 * id, and each connected Google listing gets its own result. Beside the form
 * sits the one object on this screen: what this save will change, said
 * before you save. Nothing here sends anything to a client or customer.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  XaChoices, XaField, XaHeadline, XaSays, XaSegmented, XaStatus, XaSystemTile, XaTextLink, XaYes, type XaStatusKind, type XaYesState,
} from "@/components/ui/strelva/Xa";
import type { BusinessRecord, FactValues } from "@/platform/business-record/contracts";
import type { RecordGoogleEffect } from "@/products/publishing/client";
import { clock, GOOGLE_APPROVAL_LINE, longDate, shortDate, upcomingHolidays, weeklySummary } from "@/experience/record/record-words";
import styles from "@/experience/record/record.module.css";
import { XA_YES_LABELS } from "@/platform/presentation/place-labels";

type Hours = FactValues["hours"];
type Override = NonNullable<Hours["overrides"]>[number];
type Mode = "week" | "day";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** What a Google result means, in one plain sentence. */
const GOOGLE_WORDS: Record<RecordGoogleEffect["status"], { kind: XaStatusKind; text: string }> = {
  needs_approval: { kind: "waits", text: "Waits for your yes on Google" },
  posted: { kind: "live", text: "Google shows it" },
  posted_unverified: { kind: "working", text: "Google accepted it; reading it back" },
  write_unconfirmed: { kind: "down", text: "Google's answer was lost. Check the listing before trying again" },
  already_approved: { kind: "live", text: "Already approved on Google" },
  already_on_google: { kind: "live", text: "Google already showed this" },
  failed: { kind: "down", text: "Google didn't take it" },
  withdrawn: { kind: "draft", text: "Withdrawn. Google never got it" },
};

/** What the usual week says about one date, as a one-day override would say it. */
export function usualDay(hours: Hours, date: string): Override | null {
  if (!date) return null;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (Number.isNaN(weekday)) return null;
  const periods = hours.weekly.filter(period => period.day === weekday).sort((a, b) => a.opens.localeCompare(b.opens));
  return periods.length ? { date, closed: false, opens: periods[0]!.opens, closes: periods[periods.length - 1]!.closes } : { date, closed: true };
}

/**
 * The form's fields for a date: its own override, or else (`fallback: "usual"`) what the usual week already
 * says. Picking a holiday with no override starts at Closed all day (`fallback: "closed"`), the change people
 * come here to make (XA · R2); an Undo puts the day back to the usual week.
 */
export function dayFields(hours: Hours, date: string, fallback: "usual" | "closed" = "usual"): { open: "closed" | "open"; opens: string; closes: string; note: string } {
  const own = hours.overrides?.find(item => item.date === date) ?? (fallback === "usual" ? usualDay(hours, date) : null);
  return own && !own.closed ? { open: "open", opens: own.opens ?? "09:00", closes: own.closes ?? "17:00", note: hours.overrides?.find(item => item.date === date)?.label ?? "" }
    : { open: "closed", opens: "09:00", closes: "13:00", note: hours.overrides?.find(item => item.date === date)?.label ?? "" };
}

export function RecordPublishingFields({ record, approvalCopy, readOnly = false, request = fetch, backHref, listingConnected, initialMode = "day", initialDate, now, readers }: {
  record: BusinessRecord; approvalCopy?: string | null; readOnly?: boolean; request?: typeof fetch;
  /** Systems other than Google that read hours from the record (from the System graph). */
  readers?: readonly { kind: string; name: string }[];
  /** Where Cancel and the crumb lead (the business record). */
  backHref?: string;
  /** A Google listing is connected, so Google gets its own result. Defaults to whether approval copy exists. */
  listingConnected?: boolean;
  initialMode?: Mode;
  /** Preview and deep links: open this ISO date in One day. */
  initialDate?: string;
  now?: Date;
}) {
  const router = useRouter();
  const prior = record.facts.hours?.value as Hours | undefined;
  const [hours, setHours] = useState<Hours>(prior ?? { timezone: "America/New_York", weekly: [], overrides: [] });
  const [mode, setMode] = useState<Mode>(initialMode);
  const holidays = useMemo(() => upcomingHolidays(now), [now]);
  const [date, setDate] = useState(initialDate ?? holidays[0]?.date ?? "");
  const existing = hours.overrides?.find(item => item.date === date);
  const initialFields = dayFields(hours, date, "closed");
  const [dayOpen, setDayOpenState] = useState<"closed" | "open">(initialFields.open);
  const [opens, setOpensState] = useState(initialFields.opens);
  const [closes, setClosesState] = useState(initialFields.closes);
  const [note, setNoteState] = useState(initialFields.note);
  const [weekChanged, setWeekChanged] = useState(false);
  const [revision, setRevision] = useState(record.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<{ date?: string; times?: string }>({});
  const [result, setResult] = useState<{ google: RecordGoogleEffect[]; propagationError?: string; record: { revision: number; changeCount: number } }>();
  const commandId = useRef<string | null>(null);
  // The one yes (XaYes): waiting > going > live with Undo, then undone or expired. An edit after a save arms it again.
  const [yes, setYes] = useState<XaYesState>("waiting");
  // Undo after a save: the hours as they were, written back as a new revision through the same route,
  // and the Google drafts that save prepared, withdrawn while Google still waits on them.
  const [undo, setUndo] = useState<{ before: Hours; sentence: string; drafts: string[] } | null>(null);
  const [undone, setUndone] = useState<"done" | "failed" | null>(null);
  // How many of the undone save's Google drafts were still waiting and could not be withdrawn.
  const [leftWaiting, setLeftWaiting] = useState(0);
  const connected = listingConnected ?? Boolean(approvalCopy);
  const disabled = readOnly || busy;

  /** Any edit after a save re-arms the yes; the saved result steps aside for "This will change". */
  function edited() { if (result) setResult(undefined); if (yes !== "waiting") setYes("waiting"); setUndo(null); setUndone(null); commandId.current = null; }
  function fillDay(fields: ReturnType<typeof dayFields>) { setDayOpenState(fields.open); setOpensState(fields.opens); setClosesState(fields.closes); setNoteState(fields.note); }
  const setDayOpen = (value: "closed" | "open") => { setDayOpenState(value); edited(); };
  const setOpens = (value: string) => { setOpensState(value); edited(); };
  const setCloses = (value: string) => { setClosesState(value); edited(); };
  const setNote = (value: string) => { setNoteState(value); edited(); };

  function pickDate(next: string) {
    setDate(next); edited();
    fillDay(dayFields(hours, next, "closed"));
  }
  function changeWeek(next: Hours) { setHours(next); setWeekChanged(true); edited(); }

  const dayOverride: Override | null = date ? (dayOpen === "closed" ? { date, closed: true, ...(note.trim() ? { label: note.trim() } : {}) } : { date, closed: false, opens, closes, ...(note.trim() ? { label: note.trim() } : {}) }) : null;
  const nextHours: Hours = mode === "day" && dayOverride
    ? { ...hours, overrides: [...(hours.overrides ?? []).filter(item => item.date !== date), dayOverride].sort((a, b) => a.date.localeCompare(b.date)) }
    : hours;
  // A day with no override of its own compares against what the usual week already says: showing those hours is not a change.
  const dayChanged = mode === "day" && Boolean(dayOverride) && JSON.stringify(existing ?? usualDay(hours, date)) !== JSON.stringify(dayOverride);
  const changed = mode === "day" ? dayChanged : weekChanged;

  async function save() {
    if (mode === "day") {
      const problems: typeof fieldError = {};
      if (!date) problems.date = "Choose the day.";
      if (dayOpen === "open" && !(opens < closes)) problems.times = "Opening time comes before closing time.";
      setFieldError(problems);
      if (Object.keys(problems).length) return;
    }
    if (!changed) { setError(mode === "week" ? "Change an hour first. Nothing is saved yet." : "Pick a day or change its hours first. Nothing is saved yet."); return; }
    setBusy(true); setError(""); setResult(undefined); setUndo(null); setUndone(null); setYes("going");
    const before = hours;
    try {
      commandId.current ??= crypto.randomUUID();
      const response = await request("/api/workspace/publishing/record", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: record.workspaceId, revision, commandId: commandId.current, patch: { facts: { hours: { value: nextHours } } }, googleApprovalDisclosed: Boolean(approvalCopy) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Your hours could not be confirmed. Reload before trying again.");
      setResult(data.result); setRevision(data.result.record.revision); setHours(nextHours); setWeekChanged(false); commandId.current = null;
      const drafts = (data.result.google as RecordGoogleEffect[]).filter(effect => effect.status === "needs_approval" && effect.eventId).map(effect => effect.eventId!);
      if (data.result.record.changeCount) setUndo({ before, sentence: mode === "day" ? `${date ? shortDate(date) : "That day"} saved: ${dayHours.toLowerCase()}` : "Your usual week is saved", drafts });
      setYes(data.result.record.changeCount ? "live" : "expired");
      router.refresh();
    } catch (cause) { setYes("waiting"); setError(cause instanceof Error ? cause.message : "Your hours could not be saved."); }
    finally { setBusy(false); }
  }

  async function takeBack() {
    if (!undo || busy) return;
    const { before, drafts } = undo;
    setUndo(null); setBusy(true); setError("");
    try {
      const response = await request("/api/workspace/publishing/record", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: record.workspaceId, revision, commandId: crypto.randomUUID(), patch: { facts: { hours: { value: before } } }, googleApprovalDisclosed: Boolean(approvalCopy), ...(drafts.length ? { withdrawGoogleEventIds: drafts } : {}) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "That couldn't be undone. Your saved hours are still there.");
      setResult(data.result); setRevision(data.result.record.revision); setHours(before); setUndone("done"); setYes("undone");
      setLeftWaiting(Math.max(0, drafts.length - (data.result.google as RecordGoogleEffect[]).filter(effect => effect.status === "withdrawn").length));
      // The form shows the day as it now is: its own override if it had one, otherwise the usual week's hours.
      fillDay(dayFields(before, date));
      router.refresh();
    } catch (cause) { setUndone("failed"); setYes("expired"); setError(cause instanceof Error ? cause.message : "That couldn't be undone. Your saved hours are still there."); }
    finally { setBusy(false); }
  }

  const dayText = date ? longDate(date) : "the day you choose";
  const dayHours = dayOpen === "closed" ? "Closed all day" : `Open ${clock(opens)} to ${clock(closes)}`;
  const businessName = String((record.facts.display_name?.value as string | undefined) ?? "Your business");
  const others = (readers ?? []).filter(item => item.kind !== "listing");
  const googleRow = connected ? [{ key: "google", lead: <XaSystemTile kind="listing" size={40} />, title: "Google listing", detail: mode === "day" ? `Special hours for ${date ? shortDate(date) : "that day"}` : "Regular hours", extra: approvalCopy ? GOOGLE_APPROVAL_LINE : null, state: approvalCopy ? null : <XaStatus kind="draft" size="sm">Draft until your yes</XaStatus> }] : [];
  const changes: { key: string; lead: ReactNode; title: string; detail: string; extra?: string | null; state: ReactNode }[] = [
    { key: "record", lead: <XaSystemTile kind="documents" size={40} />, title: `${businessName}'s record`, detail: mode === "day" ? `${dayText}: ${dayHours.toLowerCase()}.${note.trim() ? ` Visitors read “${note.trim()}”` : ""}` : weeklySummary(hours.weekly), state: null },
    ...others.map(item => ({ key: `reader:${item.name}`, lead: <XaSystemTile kind={item.kind} size={40} />, title: item.name, detail: mode === "day" ? `Reads ${dayText} from your record` : "Reads your new week from your record", state: null })),
    ...googleRow,
  ];
  const primaryLabel = approvalCopy ? XA_YES_LABELS.yes : mode === "day" ? "Save this day" : "Save your week";
  const googleHref = `/workspace/google?workspaceId=${encodeURIComponent(record.workspaceId)}`;
  const withdrawnCount = result?.google.filter(effect => effect.status === "withdrawn").length ?? 0;
  // After an Undo, a fresh Google draft waits only when Google had (or may still get) the change being undone.
  const undoWaits = undone === "done" ? result?.google.filter(effect => effect.status === "needs_approval") ?? [] : [];
  const stillWaiting = undoWaits;
  const dateInput = useRef<HTMLInputElement>(null);

  return <div className={styles.hours}>
    <form className={styles.hoursMain} onSubmit={event => { event.preventDefault(); void save(); }} aria-label="Hours from your business record">
      {backHref ? <nav className={styles.crumb} aria-label="Where you are"><a href={backHref}>Business record</a><span aria-hidden="true">/</span><span>Hours</span></nav> : null}
      {mode === "day" ? <XaHeadline quiet="Your usual week stays as it is.">Holiday hours for one day.</XaHeadline> : <XaHeadline quiet="One-off days sit under One day.">Your usual week.</XaHeadline>}
      <XaSegmented label="Which hours" value={mode} onChange={next => { setMode(next); edited(); }} options={[{ value: "week", label: "Usual week" }, { value: "day", label: "One day" }]} />
      {mode === "day" ? <div className={styles.hoursForm}>
        {holidays.length ? <div className={styles.holidays} role="group" aria-label="Coming up">{holidays.map(holiday => <button key={holiday.date} type="button" className={styles.holiday} aria-pressed={date === holiday.date} disabled={disabled} onClick={() => pickDate(holiday.date)}>{holiday.label} · {shortDate(holiday.date)}</button>)}</div> : null}
        <label className={styles.dayField} data-disabled={disabled || undefined} data-invalid={fieldError.date ? true : undefined}
          onClick={() => { try { dateInput.current?.showPicker?.(); } catch { /* the native field still opens on tap */ } }}>
          <span className={styles.dayFieldLabel}>Day</span>
          <span className={styles.dayFieldValue} data-empty={!date || undefined}>{date ? longDate(date) : "Choose a day"}</span>
          <input ref={dateInput} className={styles.dayInput} type="date" required value={date} disabled={disabled} aria-label={`Day, ${date ? longDate(date) : "not chosen"}`} onChange={event => pickDate(event.target.value)} />
        </label>
        {fieldError.date ? <p className={styles.fieldError} role="alert">{fieldError.date}</p> : null}
        <XaChoices label="Hours that day" value={dayOpen} onChange={value => setDayOpen(value)} options={[{ value: "closed", label: "Closed all day" }, { value: "open", label: "Open different hours" }]} />
        {dayOpen === "open" ? <div className={styles.timePair}>
          <XaField label="Opens" type="time" required value={opens} disabled={disabled} onChange={event => setOpens(event.target.value)} error={fieldError.times} />
          <XaField label="Closes" type="time" required value={closes} disabled={disabled} onChange={event => setCloses(event.target.value)} />
        </div> : null}
        <XaField label="Note visitors see" value={note} maxLength={120} disabled={disabled} onChange={event => setNote(event.target.value)} placeholder="Closed for Thanksgiving. Open Friday 8 to 5." hint="Optional. Up to 120 characters." />
        {hours.overrides?.filter(item => item.date !== date).length ? <p className={styles.quietNote}>Also set: {hours.overrides.filter(item => item.date !== date).map(item => <span key={item.date}><XaTextLink onClick={() => pickDate(item.date)}>{shortDate(item.date)}{item.closed ? " closed" : ` ${clock(item.opens ?? "")} to ${clock(item.closes ?? "")}`}</XaTextLink>{" "}</span>)}</p> : null}
      </div> : <div className={styles.hoursForm} role="table" aria-label="Your usual week">
        <div className={styles.weekRow} role="row" data-head><span role="columnheader"><span className={styles.srOnly}>Day</span></span><span role="columnheader">Opens</span><span role="columnheader">Closes</span><span role="columnheader"><span className={styles.srOnly}>Change</span></span></div>
        {WEEK_ORDER.map(day => {
          const periods = hours.weekly.filter(period => period.day === day);
          if (periods.length > 1) return <p key={day} className={styles.quietNote} role="row"><span role="cell">{DAYS[day]}: {periods.map(period => `${clock(period.opens)} to ${clock(period.closes)}`).join(", ")}. Split days keep their hours.</span></p>;
          const period = periods[0];
          const set = (patch: { opens?: string; closes?: string } | null) => changeWeek({ ...hours, weekly: [...hours.weekly.filter(item => item.day !== day), ...(patch === null ? [] : [{ day, opens: patch.opens ?? period?.opens ?? "09:00", closes: patch.closes ?? period?.closes ?? "17:00" }])].sort((a, b) => a.day - b.day) });
          return <div key={day} className={styles.weekRow} role="row" data-closed={period ? undefined : true}>
            <span className={styles.weekDay} role="rowheader">{DAYS[day]}</span>
            {period ? <>
              <span role="cell"><input className={styles.timeInput} type="time" value={period.opens} disabled={disabled} aria-label={`${DAYS[day]} opens`} onChange={event => set({ opens: event.target.value })} /></span>
              <span role="cell"><input className={styles.timeInput} type="time" value={period.closes} disabled={disabled} aria-label={`${DAYS[day]} closes`} onChange={event => set({ closes: event.target.value })} /></span>
              <span role="cell">{disabled ? null : <XaTextLink onClick={() => set(null)} aria-label={`Mark ${DAYS[day]}s closed`}>Mark closed</XaTextLink>}</span>
            </> : <><span role="cell" className={styles.weekClosed}>Closed</span><span role="cell">{disabled ? null : <XaTextLink onClick={() => set({})} aria-label={`Set hours for ${DAYS[day]}s`}>Set hours</XaTextLink>}</span></>}
          </div>;
        })}
      </div>}
      {readOnly ? <p className={styles.quietNote}>Only the owner can change hours. They are shown here as saved.</p> : null}
    </form>

    <aside className={styles.changes} aria-labelledby="hours-changes">
      <div className={styles.changesHead}><h2 id="hours-changes">{result ? "What changed" : "This will change"}</h2><span className={styles.changesWhen}>{result ? "Just now" : "Before you save"}</span></div>
      {result ? <div className={styles.result} role="status">
        <XaSays links={stillWaiting.length ? [<XaTextLink key="google" href={googleHref}>See what Google waits on</XaTextLink>] : undefined}>{undone === "done" ? `Undone. ${mode === "day" ? `${dayText} is back to ${dayHours.toLowerCase()}${existing ? "" : ", as in your usual week"}.` : "Your usual week is back to what it was."}${leftWaiting && undoWaits.length ? ` Google still has the ${mode === "day" && date ? shortDate(date) : "earlier"} change waiting, and Strelva sent it the undo too. Say yes only to the newest one.` : withdrawnCount ? " Google never got the change, so Strelva withdrew it there too." : undoWaits.length ? " Google shows the earlier change; putting it back waits for your yes on Google." : ""}` : result.record.changeCount ? `Saved. ${mode === "day" ? `${dayText} reads ${dayHours.toLowerCase()}.` : "Your usual week is updated."}` : "Nothing changed in your record."}</XaSays>
        {result.propagationError ? <p className={styles.quietNote}>{result.propagationError}</p> : null}
        <ul className={styles.changesList}>{result.google.map((effect, index) => { const words = GOOGLE_WORDS[effect.status]; return <li key={index} className={styles.change}><XaSystemTile kind="listing" size={40} /><span className={styles.changeText}><span className={styles.changeTitle}>Google listing{result.google.length > 1 ? ` ${index + 1}` : ""}</span><span className={styles.changeDetail}>{effect.kind === "hours" ? "Hours" : "Business info"}{effect.reason ? `. ${effect.reason}` : ""}</span></span><XaStatus kind={words.kind} size="sm">{words.text}</XaStatus></li>; })}</ul>
        {result.google.length && !stillWaiting.length ? <XaTextLink href={googleHref}>See each Google change</XaTextLink> : null}
      </div> : <ul className={styles.changesList}>{changes.map(item => <li key={item.key} className={styles.change}>{item.lead}<span className={styles.changeText}><span className={styles.changeTitle}>{item.title}</span><span className={styles.changeDetail}>{item.detail}</span>{item.extra ? <span className={styles.changeDetail}>{item.extra}</span> : null}</span>{item.state ?? <span />}</li>)}</ul>}
      {!result && !connected ? <p className={styles.quietNote}>No Google listing is connected, so nothing outside Strelva changes.</p> : null}
      {error ? <p className={styles.quietNote} role="alert">{error}</p> : null}
      <div className={styles.changesActions}>
        {readOnly ? null : <XaYes state={yes} yesLabel={primaryLabel} onYes={() => void save()} shortcut={false}
          disabledReason={yes === "waiting" && !changed && !busy ? mode === "day" ? `${date ? longDate(date) : "That day"} already reads ${dayHours.toLowerCase()}. Choose what's different first.` : "Your usual week is as saved. Change an hour first." : undefined}
          unblock={mode === "day" ? <XaTextLink onClick={() => setDayOpen(dayOpen === "closed" ? "open" : "closed")}>{dayOpen === "closed" ? "Open different hours" : "Close it all day"}</XaTextLink>
            : <XaTextLink onClick={() => document.querySelector<HTMLInputElement>(`input[aria-label="${DAYS[1]} opens"]`)?.focus()}>Change an hour</XaTextLink>}
          working={yes === "going" ? { title: "Saving your hours", steps: [{ id: "record", label: `Writing ${mode === "day" ? dayText : "your usual week"} to ${businessName}'s record`, state: "active" }, ...(connected ? [{ id: "google", label: "Preparing the Google listing", state: "pending" as const }] : [])] } : undefined}
          liveLabel={undo?.sentence} onUndo={undo ? () => void takeBack() : undefined} onUndoExpired={() => { setUndo(null); setYes("expired"); }}
          settled={null} />}
        {/* After a save, going back is navigation: a text link, never the ink pill. */}
        {backHref ? <XaTextLink href={backHref}>{result ? "Back to your record" : "Cancel"}</XaTextLink> : null}
      </div>
    </aside>
  </div>;
}

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
  XaButton, XaChoices, XaField, XaHeadline, XaSays, XaSegmented, XaStatus, XaSystemTile, XaTextLink, type XaStatusKind,
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
};

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
  const [dayOpen, setDayOpen] = useState<"closed" | "open">(existing && !existing.closed ? "open" : "closed");
  const [opens, setOpens] = useState(existing?.opens ?? "09:00");
  const [closes, setCloses] = useState(existing?.closes ?? "13:00");
  const [note, setNote] = useState(existing?.label ?? "");
  const [weekChanged, setWeekChanged] = useState(false);
  const [revision, setRevision] = useState(record.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<{ date?: string; times?: string }>({});
  const [result, setResult] = useState<{ google: RecordGoogleEffect[]; propagationError?: string; record: { revision: number; changeCount: number } }>();
  const commandId = useRef<string | null>(null);
  const connected = listingConnected ?? Boolean(approvalCopy);
  const disabled = readOnly || busy;

  function pickDate(next: string) {
    setDate(next); setResult(undefined); commandId.current = null;
    const found = hours.overrides?.find(item => item.date === next);
    setDayOpen(found && !found.closed ? "open" : "closed");
    if (found?.opens) setOpens(found.opens);
    if (found?.closes) setCloses(found.closes);
    setNote(found?.label ?? "");
  }
  function changeWeek(next: Hours) { setHours(next); setWeekChanged(true); setResult(undefined); commandId.current = null; }

  const dayOverride: Override | null = date ? (dayOpen === "closed" ? { date, closed: true, ...(note.trim() ? { label: note.trim() } : {}) } : { date, closed: false, opens, closes, ...(note.trim() ? { label: note.trim() } : {}) }) : null;
  const nextHours: Hours = mode === "day" && dayOverride
    ? { ...hours, overrides: [...(hours.overrides ?? []).filter(item => item.date !== date), dayOverride].sort((a, b) => a.date.localeCompare(b.date)) }
    : hours;
  const dayChanged = mode === "day" && Boolean(dayOverride) && JSON.stringify(existing ?? null) !== JSON.stringify(dayOverride);
  const changed = mode === "day" ? dayChanged : weekChanged;

  async function save() {
    if (mode === "day") {
      const problems: typeof fieldError = {};
      if (!date) problems.date = "Choose the day.";
      if (dayOpen === "open" && !(opens < closes)) problems.times = "Opening time comes before closing time.";
      setFieldError(problems);
      if (Object.keys(problems).length) return;
    }
    setBusy(true); setError(""); setResult(undefined);
    try {
      if (!changed) { setError(mode === "week" ? "Change an hour first. Nothing is saved yet." : "Pick a day or change its hours first. Nothing is saved yet."); return; }
      commandId.current ??= crypto.randomUUID();
      const response = await request("/api/workspace/publishing/record", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: record.workspaceId, revision, commandId: commandId.current, patch: { facts: { hours: { value: nextHours } } }, googleApprovalDisclosed: Boolean(approvalCopy) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Your hours could not be confirmed. Reload before trying again.");
      setResult(data.result); setRevision(data.result.record.revision); setHours(nextHours); setWeekChanged(false); commandId.current = null;
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your hours could not be saved."); }
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
  const dateInput = useRef<HTMLInputElement>(null);

  return <div className={styles.hours}>
    <form className={styles.hoursMain} onSubmit={event => { event.preventDefault(); void save(); }} aria-label="Hours from your business record">
      {backHref ? <nav className={styles.crumb} aria-label="Where you are"><a href={backHref}>Business record</a><span aria-hidden="true">/</span><span>Hours</span></nav> : null}
      {mode === "day" ? <XaHeadline quiet="Your usual week stays as it is.">Holiday hours for one day.</XaHeadline> : <XaHeadline quiet="One-off days sit under One day.">Your usual week.</XaHeadline>}
      <XaSegmented label="Which hours" value={mode} onChange={next => { setMode(next); setResult(undefined); }} options={[{ value: "week", label: "Usual week" }, { value: "day", label: "One day" }]} />
      {mode === "day" ? <div className={styles.hoursForm}>
        {holidays.length ? <div className={styles.holidays} role="group" aria-label="Coming up">{holidays.map(holiday => <button key={holiday.date} type="button" className={styles.holiday} aria-pressed={date === holiday.date} disabled={disabled} onClick={() => pickDate(holiday.date)}>{holiday.label} · {shortDate(holiday.date)}</button>)}</div> : null}
        <label className={styles.dayField} data-disabled={disabled || undefined} data-invalid={fieldError.date ? true : undefined}
          onClick={() => { try { dateInput.current?.showPicker?.(); } catch { /* the native field still opens on tap */ } }}>
          <span className={styles.dayFieldLabel}>Day</span>
          <span className={styles.dayFieldValue} data-empty={!date || undefined}>{date ? longDate(date) : "Choose a day"}</span>
          <input ref={dateInput} className={styles.dayInput} type="date" required value={date} disabled={disabled} aria-label={`Day, ${date ? longDate(date) : "not chosen"}`} onChange={event => pickDate(event.target.value)} />
        </label>
        {fieldError.date ? <p className={styles.fieldError} role="alert">{fieldError.date}</p> : null}
        <XaChoices label="Hours that day" value={dayOpen} onChange={value => { setDayOpen(value); setResult(undefined); }} options={[{ value: "closed", label: "Closed all day" }, { value: "open", label: "Open different hours" }]} />
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
        <XaSays>{result.record.changeCount ? `Saved. ${mode === "day" ? `${dayText} reads ${dayHours.toLowerCase()}.` : "Your usual week is updated."}` : "Nothing changed in your record."}</XaSays>
        {result.propagationError ? <p className={styles.quietNote}>{result.propagationError}</p> : null}
        <ul className={styles.changesList}>{result.google.map((effect, index) => { const words = GOOGLE_WORDS[effect.status]; return <li key={index} className={styles.change}><XaSystemTile kind="listing" size={40} /><span className={styles.changeText}><span className={styles.changeTitle}>Google listing{result.google.length > 1 ? ` ${index + 1}` : ""}</span><span className={styles.changeDetail}>{effect.kind === "hours" ? "Hours" : "Business info"}{effect.reason ? `. ${effect.reason}` : ""}</span></span><XaStatus kind={words.kind} size="sm">{words.text}</XaStatus></li>; })}</ul>
        {result.google.length ? <XaTextLink href={`/workspace/google?workspaceId=${encodeURIComponent(record.workspaceId)}`}>See each Google change</XaTextLink> : null}
      </div> : <ul className={styles.changesList}>{changes.map(item => <li key={item.key} className={styles.change}>{item.lead}<span className={styles.changeText}><span className={styles.changeTitle}>{item.title}</span><span className={styles.changeDetail}>{item.detail}</span>{item.extra ? <span className={styles.changeDetail}>{item.extra}</span> : null}</span>{item.state ?? <span />}</li>)}</ul>}
      {!result && !connected ? <p className={styles.quietNote}>No Google listing is connected, so nothing outside Strelva changes.</p> : null}
      {error ? <p className={styles.quietNote} role="alert">{error}</p> : null}
      <div className={styles.changesActions}>
        {readOnly ? null : <XaButton type="button" variant="primary" size="lg" block busy={busy} onClick={() => result ? (backHref ? router.push(backHref) : setResult(undefined)) : void save()}>{result ? "Back to your record" : primaryLabel}</XaButton>}
        {backHref && !result ? <XaTextLink href={backHref}>Cancel</XaTextLink> : null}
      </div>
    </aside>
  </div>;
}

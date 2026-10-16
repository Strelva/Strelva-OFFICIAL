"use client";
/**
 * Running (XA · O6): what Strelva keeps true for the business, named by the
 * condition. The page's one memorable element is the thirty-day strip: one
 * cell a day, moss where checks held, clay where one did not. Below it each
 * condition is a row with its latest value and check time in two columns.
 * Bad news comes first, with Pebble, beside the condition that slipped.
 *
 * The proof comes from /api/operations?view=responsibility_proof
 * (ResponsibilityProof owns the read, the refresh and the two writes); this
 * view only presents it and never adds a fact the cards do not carry.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { XaButton, XaEmpty, XaHeadline, XaLabel, XaLede, XaPebbleScene, XaRow, XaRows, XaSays, XaSegmented, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import type { ResponsibilityProofData } from "@/experience/operations/ResponsibilityProof";
import { clockTime, countWord, shortDay } from "./today-model";
import styles from "./today.module.css";

type Mandate = ResponsibilityProofData["state"]["mandates"][number];
type Card = ResponsibilityProofData["proof"]["cards"][number];

export interface RunningChecksViewProps {
  data: ResponsibilityProofData | null;
  error: string;
  busy: boolean;
  notice: string;
  readOnly: boolean;
  /** Changes wait for a fresh read (after an error, or in a fixed preview). */
  locked: boolean;
  onReload: () => void;
  onCadence: (cadence: "weekly" | "monthly") => void;
  onKeepMeFound: (mandate: Mandate) => void;
  /** More of the Running place, below the checks in the same column. */
  children?: ReactNode;
  /** Fixed clock for previews and tests (decides "today" vs a day). */
  now?: number;
}

const EXCEPTION = {
  partial: { kind: "waits", word: "Partly checked" },
  failed: { kind: "down", word: "Needs a look" },
  unverified: { kind: "draft", word: "Not checked yet" },
} as const;

const DAY = 86_400_000;
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);
const valid = (value: string | null | undefined): value is string => Boolean(value) && Number.isFinite(Date.parse(value!));
const latest = (values: readonly (string | null | undefined)[]) => values.filter(valid).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
const earliest = (values: readonly (string | null | undefined)[]) => values.filter(valid).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

/** "7:02" today, "Oct 3" before. Without a clock (server render) the time alone. */
function when(value: string, now: number | null): string {
  return now === null || new Date(value).toDateString() === new Date(now).toDateString() ? clockTime(value) : shortDay(value);
}

function subscribeMinute(onChange: () => void) { const timer = window.setInterval(onChange, 60_000); return () => window.clearInterval(timer); }
const minuteNow = () => Math.floor(Date.now() / 60_000);
const noClock = () => null;

/** One cell per day of the window: held, slipped, or no check recorded. Only from the cards' own history. */
export function checkStrip(cards: readonly Card[]): { days: { date: string; state: "held" | "slipped" | "none" }[]; slips: number; lastSlip: { card: Card; at: string } | null } | null {
  if (!cards.some(card => card.checkDays?.length)) return null;
  const to = Date.parse(latest(cards.map(card => card.to)) ?? "");
  const from = Date.parse(earliest(cards.map(card => card.from)) ?? "");
  if (!Number.isFinite(to) || !Number.isFinite(from)) return null;
  const checked = new Set(cards.flatMap(card => card.checkDays ?? []));
  const slipped = new Set(cards.flatMap(card => card.slipDays ?? []));
  const days: { date: string; state: "held" | "slipped" | "none" }[] = [];
  for (let time = Math.max(from, to - 29 * DAY); time <= to; time += DAY) {
    const date = isoDay(time);
    days.push({ date, state: slipped.has(date) ? "slipped" : checked.has(date) ? "held" : "none" });
  }
  const slipCards = cards.filter(card => valid(card.lastSlipAt)).sort((a, b) => Date.parse(b.lastSlipAt!) - Date.parse(a.lastSlipAt!));
  return { days, slips: days.filter(day => day.state === "slipped").length, lastSlip: slipCards[0] ? { card: slipCards[0], at: slipCards[0].lastSlipAt! } : null };
}

function stripSentence(strip: NonNullable<ReturnType<typeof checkStrip>>): string {
  const span = `${strip.days.length} ${strip.days.length === 1 ? "day" : "days"}`;
  if (!strip.slips || !strip.lastSlip) return `No slips in ${span}.`;
  const what = `${shortDay(strip.lastSlip.at)}: ${strip.lastSlip.card.title.charAt(0).toLowerCase()}${strip.lastSlip.card.title.slice(1)}`;
  return strip.slips === 1 ? `One slip in ${span}. ${what}.` : `${countWord(strip.slips)} slips in ${span}. The latest, ${what}.`;
}

export function RunningChecksView({ data, error, busy, notice, readOnly, locked, onReload, onCadence, onKeepMeFound, children, now: fixedNow }: RunningChecksViewProps) {
  const clock = useSyncExternalStore(subscribeMinute, minuteNow, noClock);
  const now = fixedNow ?? (clock === null ? null : clock * 60_000);
  const cards = data?.proof.cards ?? [];
  const off = cards.filter(card => card.status !== "verified");
  const failed = cards.filter(card => card.status === "failed");
  const count = cards.length;
  const headline = data && count ? `${countWord(count)} ${count === 1 ? "thing" : "things"} Strelva keeps true.` : "What Strelva keeps true.";
  const quiet = !data || !count ? undefined : off.length ? `${countWord(off.length)} ${off.length === 1 ? "needs" : "need"} a look.` : count === 1 ? "It is holding." : `All ${countWord(count, true)} are holding.`;
  const checkedAt = latest(cards.map(card => card.checkedAt));
  const nextAt = earliest(cards.map(card => card.nextAt).filter(value => valid(value) && (now === null || Date.parse(value!) > now)));
  const strip = checkStrip(cards);
  const undoable = cards.filter(card => card.undoHref);
  const changesLocked = readOnly || busy || Boolean(error) || locked;
  const slip = failed[0];
  const slipAt = slip ? slip.lastSlipAt ?? slip.checkedAt ?? null : null;

  return <div className={styles.running}>
    <section className={styles.runningMain} aria-label="What Strelva keeps true" aria-busy={busy || undefined}>
      <XaHeadline quiet={quiet} id="running-title">{headline}</XaHeadline>
      {checkedAt ? <XaLede>Last checked at {when(checkedAt, now)}.{nextAt ? ` Next check at ${when(nextAt, now)}.` : ""}</XaLede> : null}
      {error ? <XaSays links={[<XaTextLink key="again" onClick={onReload}>Check again</XaTextLink>]}><span role="alert">{error}</span> Nothing changes until it is checked again.</XaSays> : null}
      {!data && !error ? <div role="status" aria-label="Checking what Strelva keeps true" className={styles.group}><StSkeleton width="92%" /><StSkeleton width="80%" /><StSkeleton width="86%" /></div> : null}
      {strip ? <figure className={styles.strip} aria-label={`The last ${strip.days.length} days of checks`}>
        <ol className={styles.stripDays} style={{ gridTemplateColumns: `repeat(${strip.days.length}, minmax(0, 1fr))` }}>
          {strip.days.map(day => <li key={day.date} data-state={day.state} title={`${shortDay(`${day.date}T12:00:00Z`)}: ${day.state === "held" ? "checks held" : day.state === "slipped" ? "a check did not hold" : "no check recorded"}`}>
            <span className={styles.srOnly}>{shortDay(`${day.date}T12:00:00Z`)}: {day.state === "held" ? "checks held" : day.state === "slipped" ? "a check did not hold" : "no check recorded"}</span>
          </li>)}
        </ol>
        <div className={styles.stripEnds} aria-hidden="true"><span>{shortDay(`${strip.days[0]!.date}T12:00:00Z`)}</span><span>{shortDay(`${strip.days.at(-1)!.date}T12:00:00Z`)}</span></div>
        <figcaption>{stripSentence(strip)}</figcaption>
      </figure> : null}
      {slip ? <XaSays links={[<XaTextLink key="see" href={slip.openHref}>See it</XaTextLink>]}>
        {slip.title} did not hold{slipAt ? ` at ${when(slipAt, now)}` : ""}{slip.value ? `: ${slip.value.charAt(0).toLowerCase()}${slip.value.slice(1).replace(/[.!?]$/, "")}` : ""}.
        {failed.length > 1 ? ` ${countWord(failed.length - 1)} more ${failed.length === 2 ? "check" : "checks"} did too.` : ""}
      </XaSays> : null}
      {notice ? <XaSays><span role="status">{notice}</span></XaSays> : null}
      {data ? count ? <XaRows label="What Strelva keeps true">
        {[...failed, ...cards.filter(card => card.status !== "failed")].map(card => {
          const exception = card.status === "verified" ? null : EXCEPTION[card.status];
          const value = card.value ?? (exception ? null : "Held");
          return <XaRow key={card.responsibilityId} title={card.title} tone={card.status === "failed" ? "waits" : undefined} href={card.openHref} wrapOnPhone={false}
            meta={<span className={styles.checkCols}>
              <span className={styles.checkValue} data-tone={card.status === "failed" ? "waits" : undefined}>{value ?? <XaStatus kind={exception!.kind} size="sm">{exception!.word}</XaStatus>}</span>
              {card.checkedAt && valid(card.checkedAt) ? <time className={styles.checkTime} dateTime={card.checkedAt}>{when(card.checkedAt, now)}</time> : <span className={styles.checkTime} aria-hidden="true" />}
            </span>} />;
        })}
      </XaRows> : <XaEmpty pose="resting" size="sm" job="Pebble starts checking once your agency agrees what to keep true" title="Nothing is kept true yet.">
        An agency agreement with its sources and how often to check makes Keep me found available.
      </XaEmpty> : null}
      {undoable.length ? <XaSays links={undoable.map(card => <XaTextLink key={card.responsibilityId} href={card.undoHref!}>{card.title}</XaTextLink>)}>These made a change you can review and undo:</XaSays> : null}
      {data?.state.mandates.map((mandate, index) => <XaSays key={mandate.serviceRequestId}>
        Your agency accepted Google reply checks, business hours checks, website health, inquiry reply time and weekly proof. Outside changes still ask for your yes.{" "}
        {/* One ink pill per screen: only the first offer is primary. */}
        <XaButton variant={index === 0 ? "primary" : "secondary"} size="sm" disabled={changesLocked} onClick={() => onKeepMeFound(mandate)}>Turn on Keep me found</XaButton>
      </XaSays>)}
      {data ? <div className={styles.controls}>
        {data.state.canSetCadence ? <><XaLabel>Your report comes</XaLabel><XaSegmented label="How often your report comes" value={data.state.cadence} onChange={value => { if (!changesLocked && value !== data.state.cadence) onCadence(value); }}
          options={[{ value: "weekly", label: "Weekly", disabled: changesLocked }, { value: "monthly", label: "Monthly", disabled: changesLocked }]} /></> : <p>Your agency sets how often your report comes.</p>}
        {/* The page refreshes itself; this reads it again now. */}
        <XaTextLink onClick={onReload}>Check again</XaTextLink>
      </div> : null}
      {children}
    </section>
    {data || error ? <aside className={styles.runningSide} aria-label="What Pebble is doing">
      <XaPebbleScene pose={slip || error ? "fixing" : "lineup"} size={320} label={slip ? `Pebble on ${slip.title}` : error ? "Pebble checking the connection" : "Pebble watching every System"} />
      {slip || nextAt || error ? <div className={styles.runningCaption}>
        <h2>{slip ? "Pebble is on it" : error ? "Pebble could not read the checks" : `Next check at ${when(nextAt!, now)}`}</h2>
        <p>{slip ? `${slip.title}: ${nextAt ? `checked again at ${when(nextAt, now)}` : "it shows here again when it holds"}.` : error ? "Nothing changed while they were unavailable." : "Every change is read back before it counts as done."}</p>
      </div> : null}
    </aside> : null}
  </div>;
}

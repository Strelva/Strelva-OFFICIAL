"use client";
/**
 * Running (XA · O6): what Strelva keeps true for the business, named by the
 * condition, each with its latest evidence. The proof comes from
 * /api/operations?view=responsibility_proof (ResponsibilityProof owns the
 * read and the two writes); this view only presents it. Exceptions carry a
 * dot and a word; a holding check shows its evidence and nothing else.
 */
import type { ReactNode } from "react";
import { XaButton, XaEmpty, XaHeadline, XaLabel, XaLede, XaPebbleScene, XaRow, XaRows, XaSays, XaSegmented, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import type { ResponsibilityProofData } from "@/experience/operations/ResponsibilityProof";
import { clockTime, countWord, shortDay } from "./today-model";
import styles from "./today.module.css";

type Mandate = ResponsibilityProofData["state"]["mandates"][number];

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
}

const EXCEPTION = {
  partial: { kind: "waits", word: "Partly checked" },
  failed: { kind: "down", word: "Needs a look" },
  unverified: { kind: "draft", word: "Not checked yet" },
} as const;

export function RunningChecksView({ data, error, busy, notice, readOnly, locked, onReload, onCadence, onKeepMeFound, children }: RunningChecksViewProps) {
  const cards = data?.proof.cards ?? [];
  const off = cards.filter(card => card.status !== "verified");
  const count = cards.length;
  const headline = data && count ? `${countWord(count)} ${count === 1 ? "thing" : "things"} Strelva keeps true.` : "What Strelva keeps true.";
  const quiet = !data || !count ? undefined : off.length ? `${countWord(off.length)} ${off.length === 1 ? "needs" : "need"} a look.` : count === 1 ? "It is holding." : `All ${countWord(count, true)} are holding.`;
  const next = data?.state.mandates.map(mandate => mandate.nextAt).filter(value => Number.isFinite(Date.parse(value))).sort()[0];
  const undoable = cards.filter(card => card.undoHref);
  const changesLocked = readOnly || busy || Boolean(error) || locked;

  return <div className={styles.running}>
    <section className={styles.runningMain} aria-label="What Strelva keeps true" aria-busy={busy || undefined}>
      <XaHeadline quiet={quiet} id="running-title">{headline}</XaHeadline>
      {data ? off.length ? <XaSays>{data.proof.verdict}</XaSays> : <XaLede>{data.proof.verdict}</XaLede> : null}
      {error ? <XaSays><span role="alert">{error}</span> Reload to confirm the current state before another change.</XaSays> : null}
      {!data && !error ? <div role="status" aria-label="Checking what Strelva keeps true" className={styles.group}><StSkeleton width="92%" /><StSkeleton width="80%" /><StSkeleton width="86%" /></div> : null}
      {notice ? <XaSays><span role="status">{notice}</span></XaSays> : null}
      {data ? count ? <XaRows label="What Strelva keeps true">
        {cards.map(card => {
          const exception = card.status === "verified" ? null : EXCEPTION[card.status];
          return <XaRow key={card.responsibilityId} title={card.title} detail={card.verified || card.did} tone={card.status === "failed" ? "waits" : undefined} href={card.openHref}
            meta={exception ? <XaStatus kind={exception.kind} size="sm">{exception.word}</XaStatus> : undefined} />;
        })}
      </XaRows> : <XaEmpty pose="resting" size="sm" job="Pebble starts checking once your agency agrees what to keep true" title="Nothing is kept true yet.">
        An agency agreement with its sources and how often to check makes Keep me found available.
      </XaEmpty> : null}
      {undoable.length ? <XaSays links={undoable.map(card => <XaTextLink key={card.responsibilityId} href={card.undoHref!}>{card.title}</XaTextLink>)}>These made a change you can review and undo:</XaSays> : null}
      {data?.state.mandates.map(mandate => <XaSays key={mandate.serviceRequestId}>
        Your agency accepted Google reply checks, business hours checks, website health, inquiry reply time and weekly proof. Outside changes still ask for your yes.{" "}
        <XaButton variant="primary" size="sm" disabled={changesLocked} onClick={() => onKeepMeFound(mandate)}>Turn on Keep me found</XaButton>
      </XaSays>)}
      {data ? <div className={styles.controls}>
        {data.state.canSetCadence ? <><XaLabel>Your report comes</XaLabel><XaSegmented label="How often your report comes" value={data.state.cadence} onChange={value => { if (!changesLocked && value !== data.state.cadence) onCadence(value); }}
          options={[{ value: "weekly", label: "Weekly", disabled: changesLocked }, { value: "monthly", label: "Monthly", disabled: changesLocked }]} /></> : <p>Your agency sets how often your report comes.</p>}
        <XaTextLink onClick={onReload}>Reload proof</XaTextLink>
      </div> : error ? <span><XaTextLink onClick={onReload}>Reload proof</XaTextLink></span> : null}
      {children}
    </section>
    <aside className={styles.runningSide} aria-label="What Pebble is doing">
      <XaPebbleScene pose={off.length || error ? "fixing" : "resting"} size={320} label={off.length || error ? "Pebble fixing what needs a look" : "Pebble keeping things running"} />
      <div className={styles.runningCaption}>
        <h2>{next ? `Next check ${shortDay(next)} at ${clockTime(next)}` : "Checks run on your agency's schedule"}</h2>
        <p>Every change Strelva makes is read back before it counts as done.</p>
      </div>
    </aside>
  </div>;
}

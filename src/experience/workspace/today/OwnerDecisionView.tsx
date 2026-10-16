"use client";
/**
 * The prepared change (XA · O3) and right after the yes (XA · O4).
 *
 * The brief on the left says who did what and what each choice does, in the
 * decision's own words. The decision on the right is the page's one object:
 * the changed thing the way its audience will see it (OwnerDecision.preview;
 * the review lines when there is none), then the one yes (XaYes). After the
 * yes the same panel says what is true now and settles to Live with the Undo
 * pill; Undo is the real reversal of the recorded receipt (`decision:<id>`),
 * offered only while that receipt says it can be undone. Authority stays with
 * the caller (useNeedsYou).
 */
import { useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import {
  XaAnswers, XaButton, XaComposer, XaDecision, XaEmpty, XaHeadline, XaLabel, XaPebbleScene, XaSays, XaStatus, XaSystemTile, XaTextLink, XaYes,
} from "@/components/ui/strelva/Xa";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XA_YES_LABELS } from "@/platform/presentation/place-labels";
import { actorCopy, actorShortName } from "@/platform/presentation/actor";
import type { HandledReceipt, OwnerDecision } from "@/platform/needs-you/contracts";
import type { SystemView } from "@/experience/systems/model";
import type { ItemNotice, NeedsYouState } from "../useNeedsYou";
import { decisionPresentation } from "../needs-you-presentation";
import { DecisionPreviewView } from "./DecisionPreview";
import { actedBy, afterYesQuiet, clockTime, decisionAnswers, decisionHeadline, decisionReceipt, liveHeadline, nowTrue, previewLabel, relativeWhen, yesConsequence, yesLabel, yesPhase } from "./today-model";
import styles from "./today.module.css";

export interface OwnerDecisionViewProps {
  businessName: string;
  needs: NeedsYouState;
  pending: string | null;
  notices: Record<string, ItemNotice>;
  /** The decision the address names. Absent: the oldest waiting one. */
  selectedId?: string;
  systems?: readonly SystemView[];
  appBase?: string;
  onDecide: (item: OwnerDecision, decision: "approve" | "not_yet") => void;
  onUndo: (receipt: HandledReceipt) => void;
  onRetry: () => void;
  /** Back to Today, after Not yet or from the empty state. */
  onToday: () => void;
  onWhatChanged: () => void;
  onOpenDecision: (id: string) => void;
  onAsk?: (request: string) => void;
  /** A decision already said yes to in this session (it has left the open list). */
  initialDecided?: OwnerDecision;
  /** Fixed clock for previews and tests. */
  now?: number;
}

/** The minute, on the client only; the server renders without a clock. */
function subscribeMinute(onChange: () => void) { const timer = window.setInterval(onChange, 30_000); return () => window.clearInterval(timer); }
const minuteNow = () => Math.floor(Date.now() / 60_000);
const noClock = () => null;

const SOURCE_KIND: Record<string, string> = { Bookings: "bookings", Website: "website", Google: "listing", "Your listings": "listing", Inquiries: "inbox", Billing: "payments", "Business record": "documents" };

function decides(state: NeedsYouState): boolean {
  return state.status === "ready" && (state.authority === "agency" ? state.canDecide === true : state.canDecide !== false && state.role !== "member");
}

function firstSentence(text: string): string {
  return (text.split(/(?<=[.!?])\s+/)[0] ?? text).trim();
}

export function OwnerDecisionView({ businessName, needs, pending, notices, selectedId, systems = [], appBase = "", onDecide, onUndo, onRetry, onToday, onWhatChanged, onOpenDecision, onAsk, initialDecided, now: fixedNow }: OwnerDecisionViewProps) {
  const [decided, setDecided] = useState<OwnerDecision | null>(initialDecided ?? null);
  const [expired, setExpired] = useState(false);
  const [undoneHere, setUndoneHere] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const ready = needs.status === "ready" ? needs : null;
  const items = ready?.items ?? [];
  const open = items.find(item => item.id === (selectedId ?? decided?.id)) ?? (selectedId ? undefined : items[0]);
  const item = open ?? (decided && (!selectedId || decided.id === selectedId) ? decided : undefined);
  const clock = useSyncExternalStore(subscribeMinute, minuteNow, noClock);
  const now = fixedNow ?? (clock === null ? null : clock * 60_000);

  if (needs.status === "loading") return <div className={styles.decisionLayout} aria-busy="true">
    <div className={styles.briefHead}><StSkeleton width="40%" label="Loading what waits for you" /><StSkeleton width="90%" /><StSkeleton width="70%" /></div>
  </div>;

  if (needs.status === "error") return <div className={styles.decisionLayout}>
    <section className={styles.briefHead} aria-labelledby="decision-error-title">
      <XaPebbleScene pose="fixing" size={180} label="Pebble checking the connection" />
      <XaHeadline as="h1" size="sm" id="decision-error-title" quiet="Nothing was decided while it was unavailable.">Strelva could not load what waits for you.</XaHeadline>
      <span><XaButton onClick={onRetry}>Check again</XaButton></span>
    </section>
  </div>;

  if (!item) return <div className={styles.decisionLayout}>
    <div className={styles.briefHead}>
      <XaEmpty pose="resting" job={selectedId ? "Pebble keeps the record in What changed" : "Pebble is keeping everything else running"}
        title={selectedId ? "This no longer waits for you." : "Nothing waits for you."}
        action={<XaButton onClick={selectedId ? onWhatChanged : onToday}>{selectedId ? "What changed" : "Back to Home"}</XaButton>}>
        {selectedId ? "It was decided, withdrawn or lapsed. What changed has its record." : "When Strelva or your agency needs your yes, it shows here first, with what happens either way."}
      </XaEmpty>
    </div>
  </div>;

  const canDecide = decides(needs);
  const receipt = ready ? decisionReceipt(ready.handled, item.id) : undefined;
  const phase = yesPhase({ itemId: item.id, open: Boolean(open), pending, notice: notices[item.id], receipt, saidYes: decided?.id === item.id, expired });
  const look = decisionPresentation(item);
  const system = systems.find(entry => entry.id === item.systemId);
  const tileKind = system?.kind ?? SOURCE_KIND[look.source] ?? "form";
  const by = actedBy(item.actor);
  const byShort = actorShortName(item.actor);
  const label = yesLabel(item);
  const live = label === XA_YES_LABELS.yes;
  const after = phase === "live" || phase === "expired";
  const preview = item.preview ?? null;
  const headline = after ? { headline: liveHeadline(item, system?.name ?? null, live), quiet: afterYesQuiet(receipt, preview ? "page" : "change") }
    : phase === "undone" ? { headline: undoneHere === item.id ? "You took it back." : "It was taken back.", quiet: "Strelva recorded the undo in What changed." }
      : { headline: decisionHeadline(item), quiet: yesConsequence(item) };
  const canUndo = canDecide && ready?.authority !== "agency" && receipt?.undo.state === "undo";
  const undoReason = receipt && "reason" in receipt.undo ? receipt.undo.reason : null;
  const answers: [string, string][] = after
    ? [
      ...(by ? [["Prepared by", by] as [string, string]] : []),
      ...(canUndo ? [["Take it back", "Undo here, or any time from What changed."] as [string, string]] : undoReason ? [["Take it back", undoReason] as [string, string]] : []),
    ]
    : phase === "undone"
      ? [...(by ? [["Prepared by", by] as [string, string]] : []), ...(undoneHere === item.id ? [["Undone by", "You"] as [string, string]] : [])]
      : decisionAnswers(item);
  const truths = after ? nowTrue(receipt) : [];
  const others = items.filter(entry => entry.id !== item.id);
  const status = phase === "waiting" ? <XaStatus kind="waits">{canDecide ? "Waits for you" : "Waits for the owner"}</XaStatus>
    : phase === "going" ? <XaStatus kind="working">Going ahead</XaStatus>
      : phase === "failed" ? <XaStatus kind="down">Did not go through</XaStatus>
        : phase === "undone" ? <XaStatus kind="draft">Undone</XaStatus>
          : <XaStatus kind="live" breathe>{live ? "Live" : "Done"}</XaStatus>;
  const meta = after ? receipt?.evidence?.readBack === "verified" ? `Read back at ${clockTime(receipt.at)}` : undefined
    : phase === "undone" ? undefined
      : [byShort ? `Prepared by ${byShort}` : null, now === null ? "" : relativeWhen(item.openedAt, now)].filter(Boolean).join(", ") || undefined;
  const disabledReason = item.review === null ? <>This changed or could not be loaded. <XaTextLink onClick={onRetry}>Check again</XaTextLink> to see the latest before deciding.</> : undefined;
  const audience = preview?.audience;
  const where = preview?.address ?? system?.name ?? null;
  const panelLabel = audience ? previewLabel(phase, audience)
    : after ? "What changed" : phase === "undone" ? "Back to how it was" : "What your yes changes";
  const lines = item.review?.length ? item.review : item.detail && look.shape !== "message" ? [item.detail] : !item.detail ? [actorCopy(item.approveEffect, item.actor)] : [];

  const body = phase === "undone"
    ? <p className={styles.changeLine}>{firstSentence(actorCopy(item.notYetEffect, item.actor))}</p>
    : preview ? <>
      <DecisionPreviewView preview={preview} changed={!after} />
      {!after && lines.length ? <ul className={styles.changeLines} data-quiet aria-label="Every change you approve">{lines.map((line, index) => <li key={index}>{line}</li>)}</ul> : null}
    </>
      : <>
        {look.amount && !item.review?.length ? <p className={styles.amount}>{look.amount}</p> : null}
        {item.detail && look.shape === "message" && !item.review?.length ? <blockquote className={styles.quote}>{item.detail}</blockquote> : null}
        {lines.length ? <ul className={styles.changeLines} aria-label="Every change you approve">{lines.map((line, index) => <li key={index}>{line}</li>)}</ul> : null}
      </>;

  return <div className={styles.decisionLayout} data-phase={phase}>
    <div className={styles.briefHead}>
      <span className={styles.briefTile}><XaSystemTile kind={tileKind} size={64} label={system?.name ?? look.source} /></span>
      <XaHeadline quiet={headline.quiet}>{headline.headline}</XaHeadline>
    </div>
    <div className={styles.panel}>
      <XaDecision label={`Decision for ${businessName}: ${item.title}`} status={status} meta={meta}
        yes={!canDecide && phase === "waiting" ? <p className={styles.recordNote}>Only the owner can decide this. You can see what waits and what each choice does.</p> : <XaYes state={phase} yesLabel={label} disabledReason={disabledReason}
          onYes={() => { setDecided(item); setExpired(false); onDecide(item, "approve"); }}
          onNotYet={canDecide && item.review !== null ? () => { onDecide(item, "not_yet"); onToday(); } : undefined}
          onUndo={canUndo && receipt ? () => { setUndoneHere(item.id); onUndo(receipt); } : undefined}
          onUndoExpired={() => setExpired(true)}
          working={phase === "going" ? { title: "Going ahead", steps: [] } : undefined}
          liveLabel={where ? `${live ? "Live" : "Done"} on ${where}` : `${live ? "Live" : "Done"}: ${item.title}`}
          failure={notices[item.id]?.text ?? "It did not go through. Nothing changed."}
          settled={phase === "undone" ? "Undone. Nothing else changed." : canUndo ? "Take it back any time from What changed." : "Its record is in What changed."} />}>
        <div className={styles.decisionBody}>
          <XaLabel>{panelLabel}</XaLabel>
          {body}
          {item.openHref ? <span><XaTextLink href={`${appBase}${item.openHref}`}>Open it in full</XaTextLink></span> : null}
        </div>
      </XaDecision>
    </div>
    <div className={styles.briefBody}>
      {truths.length ? <div className={styles.truths}>
        <XaStatus kind="live">{where ? `${live ? "Live" : "Done"} on ${where}` : live ? "Live" : "Done"}</XaStatus>
        <ul aria-label="What is true now">{truths.map(line => <li key={line}><Check size={15} strokeWidth={2.2} aria-hidden="true" />{line}</li>)}</ul>
      </div> : null}
      {answers.length ? <XaAnswers rows={answers} labelWidth={156} /> : null}
      {phase === "waiting" && others.length ? <XaSays links={others.slice(0, 2).map(other => <XaTextLink key={other.id} onClick={() => onOpenDecision(other.id)}>{other.title}</XaTextLink>)}>
        {others.length === 1 ? "One more waits after this:" : `${others.length} more wait after this:`}
      </XaSays> : null}
      {after || phase === "undone" ? <XaSays links={[<XaTextLink key="today" onClick={onToday}>Back to Home</XaTextLink>, <XaTextLink key="changed" onClick={onWhatChanged}>What changed</XaTextLink>]}>
        {phase === "undone" ? "It is back the way it was before your yes." : others.length ? `${others.length === 1 ? "One more waits" : `${others.length} more wait`} for you on Home.` : "Nothing else waits for you."}
      </XaSays> : null}
    </div>
    {onAsk && phase === "waiting" && canDecide ? <div className={styles.briefDock}>
      <XaComposer value={ask} onChange={setAsk} onSubmit={() => { const text = ask.trim(); if (text) { onAsk(text); setAsk(""); } }} placeholder="Ask for a different change" inputLabel={`Ask Strelva for a different change to ${item.title}`} />
    </div> : null}
  </div>;
}

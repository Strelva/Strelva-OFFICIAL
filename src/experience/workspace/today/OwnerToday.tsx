"use client";
/**
 * Today, for an owner (XA · O1 normal morning, XA · O2 one thing waits,
 * XA · E6 on the phone).
 *
 * One dominant element: the composer, with the same chrome in every state
 * (the business chip and the mic stay; a waiting item is a line above the
 * field). On a normal morning it sits beside what changed lately, with
 * Pebble there only while Pebble is doing something. When something waits, the waiting item
 * docks on the composer and the page centers on it: the one deliberate
 * centered composition in the product. Data comes from the caller
 * (BusinessHome reads Needs you, What changed, saved work and the Systems
 * projection); this component never decides authority and never calls a
 * server.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  XaButton, XaComposer, XaHeadline, XaLabel, XaLede, XaLines, XaMark, XaPebbleScene, XaRow, XaRows, XaSays, XaStatus, XaSystemTile, XaTextLink, XaWorking, type XaWaitingItem,
} from "@/components/ui/strelva/Xa";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import type { OwnerDecision } from "@/platform/needs-you/contracts";
import type { SystemView } from "@/experience/systems/model";
import type { ItemNotice, NeedsYouState } from "../useNeedsYou";
import { readRequestDraft, writeRequestDraft } from "../request-draft";
import { actorShortName } from "@/platform/presentation/actor";
import { useDictation } from "./useDictation";
import { clockTime, countWord, ownerSystemRank, sinceLabel, sinceLines, systemsCheck, todayGreeting, todayLede, waitingKicker } from "./today-model";
import styles from "./today.module.css";

/** Saved work that needs the owner (a finite job waiting on a decision). */
export interface TodayAttention { id: string; title: string; reason: string; onOpen: () => void }

/** A Make real that is running or partly live, with its real progress lines. */
export interface TodayMaking { id: string; title: string; headline: string; partlyLive: boolean; done: number; total: number; lines: readonly { label: string; state: "done" | "active" | "failed" }[] }

export interface OwnerTodayProps {
  businessName: string;
  /** The owner's recorded display name. Absent: the greeting has no name (never the email). */
  ownerName?: string | null;
  /** Current minute on the client; null on the server so hydration matches. */
  minute: number | null;
  needs: NeedsYouState;
  notices: Record<string, ItemNotice>;
  systems: readonly SystemView[];
  systemsLoading?: boolean;
  systemsUnavailable?: boolean;
  attention?: readonly TodayAttention[];
  making?: readonly TodayMaking[];
  /** Recorded changes from the Systems projection, used while Needs you is off. */
  receipts?: readonly { at: string; sentence: string }[];
  /** Shared read access: no composer, the reason said in place. */
  readOnly?: boolean;
  readOnlyNote?: string;
  busy?: boolean;
  draftKey?: string;
  onAsk: (request: string) => void;
  onDraftChange?: (request: string) => void;
  onReview: (item: OwnerDecision) => void;
  onAllWaiting: () => void;
  onRetry: () => void;
  onWhatChanged: () => void;
  onRequests?: () => void;
  /** Opens Running, where each check and its latest result live. */
  onRunning?: () => void;
  onBringAgency?: () => void;
  systemHref: (id: string) => string;
  onOpenSystem?: (id: string) => void;
  gettingStartedHref?: string | null;
  /** Bring the business's own website in (connected sites or website options), when on for this business. */
  connectSite?: { href: string; words: "first" | "another" | "rebuild" } | null;
  /** Fixed clock for previews and tests. */
  now?: number;
}

function canDecide(state: NeedsYouState): boolean {
  return state.status === "ready" && (state.authority === "agency" ? state.canDecide === true : state.canDecide !== false && state.role !== "member");
}

export function OwnerToday(props: OwnerTodayProps) {
  const { businessName, ownerName, minute, needs, notices, systems: givenSystems, systemsLoading = false, systemsUnavailable = false, attention = [], making = [], receipts = [], readOnly = false, readOnlyNote, busy = false, draftKey,
    onAsk, onDraftChange, onReview, onAllWaiting, onRetry, onWhatChanged, onRequests, onRunning, onBringAgency, systemHref, onOpenSystem, gettingStartedHref, connectSite, now: fixedNow } = props;
  const [ask, setAsk] = useState("");
  useEffect(() => {
    if (!draftKey) return;
    // Restore the unsent draft from browser storage only after hydration, so server and client markup match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { const saved = readRequestDraft(window.sessionStorage, draftKey); if (saved) setAsk(saved); } catch { /* Works without browser storage. */ }
  }, [draftKey]);
  const change = (value: string) => {
    setAsk(value);
    onDraftChange?.(value);
    if (draftKey) try { writeRequestDraft(window.sessionStorage, draftKey, value); } catch { /* Works without browser storage. */ }
  };
  const submit = () => {
    const text = ask.trim();
    if (!text || busy || readOnly) return;
    onAsk(text);
    change("");
  };

  const dictation = useDictation(text => change(ask.trim() ? `${ask.trim()} ${text}` : text));
  const now = fixedNow ?? (minute === null ? null : minute * 60_000);
  const systems = [...givenSystems].sort((a, b) => ownerSystemRank(a) - ownerSystemRank(b) || a.name.localeCompare(b.name));
  const ready = needs.status === "ready" ? needs : null;
  const decide = canDecide(needs);
  const items = ready?.items ?? [];
  const waitingCount = items.length + attention.length;
  const first = items[0];
  const firstAttention = first ? undefined : attention[0];
  const unchecked = needs.status === "error" || (ready !== null && !ready.complete);
  const { down, checkedAt } = systemsCheck(systems);
  const empty = !systemsLoading && !systemsUnavailable && systems.length === 0 && !waitingCount && !making.length;
  const greeting = readOnly ? businessName : todayGreeting(minute, ownerName);
  const lede = readOnly ? readOnlyNote ?? `${businessName} shared this with you to review.`
    : empty ? "Nothing is running yet. Say what your business needs, and Strelva makes it with you."
      : todayLede({ waiting: waitingCount, canDecide: decide || !first, systems, unchecked, decisionsKnown: needs.status !== "disabled" || attention.length > 0 });
  const recorded = ready?.handledAvailable ? ready.handled : needs.status === "disabled" ? receipts : [];
  const lines = sinceLines(recorded, now);
  const outcome = Object.entries(notices).filter(([id]) => !items.some(item => item.id === id)).at(-1)?.[1];

  const waiting: XaWaitingItem | undefined = first ? {
    kicker: waitingKicker(first, decide),
    title: first.title,
    from: first.actor && first.actor.kind !== "platform" ? { name: first.actor.kind === "operator" ? "Support" : actorShortName(first.actor) ?? first.actor.displayName ?? "Support" } : { pebble: true },
    action: <XaButton size="sm" onClick={() => onReview(first)} aria-label={`Review: ${first.title}`}>Review</XaButton>,
  } : firstAttention ? {
    kicker: `Waits for you · ${firstAttention.reason}`,
    title: firstAttention.title,
    from: { pebble: true },
    action: <XaButton size="sm" onClick={firstAttention.onOpen} aria-label={`Open ${firstAttention.title}`}>Review</XaButton>,
  } : undefined;

  const composer = readOnly ? null : <XaComposer value={ask} onChange={change} onSubmit={submit} busy={busy} placeholder="Ask Strelva for anything" inputLabel={`Ask Strelva about ${businessName}`}
    scope={{ label: businessName, state: systems.some(system => system.lifecycle === "live") ? "live" : undefined }} waiting={waiting}
    onVoice={dictation.supported ? dictation.start : undefined} />;

  // Strelva speaks once, about the most important thing; set-up offers follow in plain sentences.
  const says: ReactNode = needs.status === "error"
    ? <XaSays links={[<XaTextLink key="retry" onClick={onRetry}>Check again</XaTextLink>]}>Strelva could not check what waits for you. Nothing was decided while it was unavailable.</XaSays>
    : ready && !ready.complete ? <XaSays links={[<XaTextLink key="retry" onClick={onRetry}>Check again</XaTextLink>]}>Some decisions could not be checked, so there may be more than this.</XaSays>
      : outcome ? <XaSays links={[<XaTextLink key="changed" onClick={onWhatChanged}>What changed</XaTextLink>]}>{outcome.text}</XaSays>
        : waitingCount > 1 ? <XaSays links={[<XaTextLink key="all" onClick={onAllWaiting}>See all {waitingCount}</XaTextLink>]}>{waitingCount - 1} more {waitingCount === 2 ? "waits" : "wait"} after this one.</XaSays>
          : waiting && lines.length && !down.length ? <XaSays>Everything else is holding. {lines[0]!.text}</XaSays>
            : systemsUnavailable ? <XaSays>Your Systems could not be loaded just now. Nothing about them changed.</XaSays> : null;
  // Set-up offers are one sentence from Pebble with a link each, never a stack of blocks.
  type Offer = { key: string; sentence: string; link: ReactNode };
  const offers = readOnly ? [] : ([
    gettingStartedHref ? { key: "start", sentence: "Read your website or add business details. Nothing has to move.", link: <XaTextLink key="start" href={gettingStartedHref}>Getting started</XaTextLink> } : null,
    connectSite && !systemsLoading ? { key: "site", sentence: connectSite.words === "rebuild" ? "Your next website starts from your options." : connectSite.words === "another" ? "Have another website? It stays where it is." : "Already have a website? It stays where it is, and Strelva takes its inquiries.",
      link: <XaTextLink key="site" href={connectSite.href}>{connectSite.words === "rebuild" ? "Open website options" : connectSite.words === "another" ? "Connect it" : "Bring it into Strelva"}</XaTextLink> } : null,
    empty && onBringAgency ? { key: "agency", sentence: "Or bring in an agency to make it for you.", link: <XaTextLink key="agency" onClick={onBringAgency}>Bring in an agency</XaTextLink> } : null,
  ] as (Offer | null)[]).filter((offer): offer is Offer => offer !== null);
  const setup: ReactNode[] = offers.length ? [<XaSays key="setup" links={offers.map(offer => offer.link)}>{offers.map(offer => offer.sentence).join(" ")}</XaSays>] : [];

  const greetingBlock = <div className={styles.greeting}>
    <XaHeadline size="lg" id="business-start-title">{greeting}</XaHeadline>
    {needs.status === "loading" && !readOnly ? <div className={styles.skeletonLine}><StSkeleton width="80%" label="Checking what waits for you" /></div> : <XaLede>{lede}</XaLede>}
  </div>;

  const lead = making[0];
  const progress = lead ? <XaWorking state="working" title={lead.partlyLive ? `${lead.title}: Partly live` : lead.headline}
    steps={lead.lines.length ? lead.lines.map((line, index) => ({ id: `${lead.id}-${index}`, label: line.label, state: line.state })) : [{ id: `${lead.id}-count`, label: `${lead.done} of ${lead.total} done`, state: "active" }]} /> : null;
  const moreMaking = making.length > 1 ? <XaSays links={onRequests ? [<XaTextLink key="requests" onClick={onRequests}>Requests</XaTextLink>] : undefined}>
    Also going: {making.slice(1).map(entry => entry.partlyLive ? `${entry.title}: Partly live` : entry.headline).join("; ")}.
  </XaSays> : null;

  // Phone (E6): one check time above the list; a row speaks only when it is not fine.
  const phoneSystems = systems.length ? <section className={styles.phoneSystems} aria-labelledby="today-running-label">
    <XaLabel id="today-running-label">{checkedAt && !down.length ? `Running for you, checked at ${clockTime(checkedAt)}` : "Running for you"}</XaLabel>
    <XaRows label="Your Systems">
      {systems.map(system => {
        const off = system.health.state === "blocked" || system.health.state === "degraded";
        return <XaRow key={system.id} lead={<XaSystemTile kind={system.kind} size={36} />} title={system.name} href={systemHref(system.id)} onClick={onOpenSystem ? () => onOpenSystem(system.id) : undefined}
          detail={off ? system.health.summary : system.detail || undefined} tone={off ? "waits" : undefined}
          meta={off ? <XaStatus kind="down" size="sm">Not working</XaStatus> : system.lifecycle === "draft" ? <XaStatus kind="draft" size="sm">Draft</XaStatus> : system.lifecycle === "paused" ? <XaStatus kind="draft" size="sm">Paused</XaStatus> : undefined} />;
      })}
    </XaRows>
  </section> : null;

  // O2: one thing waits. The waiting item docks on the composer and the page centers on it.
  if (waiting && !readOnly) return <div className={styles.centered} aria-busy={busy || undefined}>
    <span className={styles.mark}><XaMark size={44} /></span>
    {greetingBlock}
    <div className={styles.centeredComposer}>{composer}</div>
    {says ? <div className={styles.says}>{says}</div> : null}
    {progress ? <div className={styles.says}>{progress}</div> : null}
    {setup.map((line, index) => <div key={index} className={styles.says}>{line}</div>)}
    {phoneSystems}
  </div>;

  // O1: a normal morning. Pebble appears only while doing a job (fixing, adding, waiting for the first ask); resting is not a job.
  const pose = down.length || needs.status === "error" ? "fixing" : empty ? "waving" : lead ? "adds" : "resting";
  const broken = down[0];
  const poseLabel = pose === "fixing" ? broken ? `Pebble fixing ${broken.name}` : "Pebble checking the connection" : pose === "waving" ? "Pebble ready to make the first System" : pose === "adds" ? "Pebble adding a System" : "Pebble resting beside the bookings calendar";
  const label = sinceLabel(lines);
  return <div className={styles.split} aria-busy={busy || undefined}>
    <div className={styles.lead}>
      <span className={styles.mark}><XaMark size={44} /></span>
      {greetingBlock}
      {composer}
      {says}
      {progress}
      {moreMaking}
      {setup}
      {phoneSystems}
    </div>
    <aside className={styles.side} aria-label={empty ? "What Pebble is doing" : label}>
      {pose === "resting" ? null : <XaPebbleScene pose={pose} size={320} label={poseLabel} />}
      <div className={styles.since}>
        {broken ? <div className={styles.badNews} role="status">
          <XaLabel as="h2">{down.length === 1 ? `Pebble is on ${broken.name}` : `Pebble is on ${countWord(down.length, true)} Systems`}</XaLabel>
          <p>{broken.health.summary.trim().replace(/([^.!?])$/, "$1.")}</p>
          <p className={styles.badNewsLinks}>
            {onOpenSystem ? <XaTextLink onClick={() => onOpenSystem(broken.id)}>See it</XaTextLink> : <XaTextLink href={systemHref(broken.id)}>See it</XaTextLink>}
            {onRunning ? <><span aria-hidden="true"> · </span><XaTextLink onClick={onRunning}>Running</XaTextLink></> : null}
          </p>
        </div> : null}
        {empty ? <>
          <XaLabel>What Pebble is doing</XaLabel>
          <XaLede>Waiting for your first ask. A website, bookings, an inbox or a form each becomes a System you can see here.</XaLede>
        </> : <>
          <XaLabel as="h2" id="today-since-label">{label}</XaLabel>
          {needs.status === "loading" ? <StSkeleton width="90%" label="Checking what changed" />
            : needs.status === "error" || (ready && !ready.handledAvailable) ? <XaLede>What changed could not be checked just now.</XaLede>
              : lines.length ? <XaLines label={label} lines={lines.map(line => ({ time: line.time, dateTime: line.dateTime, text: line.text }))} />
                : <XaLede>Nothing changed this week. When something does, it shows here with who did it.</XaLede>}
          {ready?.handledAvailable ? <span><XaTextLink onClick={onWhatChanged}>Everything that changed this week</XaTextLink></span> : null}
        </>}
      </div>
    </aside>
  </div>;
}

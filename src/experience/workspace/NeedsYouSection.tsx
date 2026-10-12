"use client";

import { STRELVA_HANDLED_LABEL } from "@/platform/presentation/place-labels";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { actorLabel, actorCopy, actorPresentation } from "@/platform/presentation/actor";
import { beginFocusRecovery, type FocusRecovery } from "@/experience/websites/focus-recovery";
import { Check } from "lucide-react";
import { StBeacon, StEmpty, StHold, StMono, StNotice, StRow, StRows, StSection, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import type { HandledReceipt, OwnerDecision } from "@/platform/needs-you/contracts";
import type { ItemNotice, NeedsYouState } from "./useNeedsYou";
import { decisionCount, decisionPresentation } from "./needs-you-presentation";
import styles from "./needs-you-section.module.css";

const TIME = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

function when(value: string): string {
  const at = Date.parse(value);
  return Number.isFinite(at) ? TIME.format(new Date(at)) : "";
}

interface NeedsYouProps {
  selectedId?: string;
  state: NeedsYouState;
  pending: string | null;
  notices: Record<string, ItemNotice>;
  onDecide: (item: OwnerDecision, decision: "approve" | "not_yet") => void;
  onRetry: () => void;
  /** Other asks Home already knows about (saved work that needs a decision). */
  extra?: ReactNode;
  extraCount?: number;
  appBase?: string;
  /**
   * `rows` (Home): open decision rows with a section heading.
   * `deck` (the Needs you place): open decision rows under the page heading.
   */
  variant?: "rows" | "deck";
  /** Shown instead of disappearing when nothing needs the owner. Without it the section is gone. */
  empty?: ReactNode;
  /** Mounted caller heading when the section heading is hidden or the complete empty section disappears. */
  retryFocusTarget?: RefObject<HTMLElement | null>;
}

/**
 * Needs you: only the owner's decisions, oldest first, with the same Approve
 * and Not yet the email carries. Gone after a complete empty read. A member sees the asks but
 * can't decide them; asks that need editing open their own page.
 */
export function NeedsYouSection({ state, pending, notices, onDecide, onRetry, extra, extraCount = 0, appBase = "", variant = "rows", empty, retryFocusTarget, selectedId }: NeedsYouProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const selectedItem = useRef<HTMLSpanElement>(null);
  const focusedId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (variant !== "deck" || state.status !== "ready") return;
    const id = selectedId ?? (window.location.hash.startsWith("#decision-") ? window.location.hash.slice(10) : undefined);
    if (!id || id === focusedId.current || !state.items.some(item => item.id === id)) return;
    const target = selectedId ? selectedItem.current : document.getElementById(`decision-${id}`);
    if (!target) return;
    focusedId.current = id;
    target.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId, variant, state]);
  const retryButton = useRef<HTMLButtonElement>(null);
  const recovery = useRef<FocusRecovery | null>(null);
  useEffect(() => {
    const pending = recovery.current;
    if (!pending) return;
    recovery.current = null;
    if (state.status === "ready" || state.status === "error") pending.recover(retryButton.current ?? retryFocusTarget?.current ?? heading.current);
    else pending.cancel();
  }, [state, retryFocusTarget]);
  useEffect(() => () => recovery.current?.cancel(), []);
  const retry = () => {
    recovery.current?.cancel();
    recovery.current = beginFocusRecovery(retryButton.current);
    onRetry();
  };
  const outcomes = Object.entries(notices).filter(([id]) => state.status !== "ready" || !state.items.some(item => item.id === id));
  if (state.status === "disabled") return null;
  const nothing = state.status === "ready" && state.complete && state.items.length === 0 && extraCount === 0;
  if (nothing && outcomes.length === 0 && !empty) return null;
  const count = (state.status === "ready" ? state.items.length : 0) + extraCount;
  const canDecide = state.status === "ready" && state.role !== "member";
  const deck = variant === "deck";
  return <section className={styles.section} aria-labelledby="home-attention">
    <header className={deck ? styles.srOnly : styles.header}>
      <h2 ref={heading} tabIndex={-1} id="home-attention"><StBeacon kind="need" />Needs you{state.status === "ready" && count > 0 ? <StMono>{count}</StMono> : null}</h2>
      {!deck && state.status === "ready" && state.complete && count > 0 ? <p>{decisionCount(count)} waiting on {state.role === "member" ? "the owner" : "you"}.</p> : null}
    </header>
    {state.status === "loading" ? <div className={styles.loading}><p role="status">Checking what needs you…</p><StSkeleton width="78%" /><StSkeleton width="55%" /></div> : null}
    {state.status === "error" ? <StNotice tone="critical">{state.message} <StTextButton ref={retryButton} onClick={retry}>Check again</StTextButton></StNotice> : null}
    {state.status === "ready" && !state.complete ? <StNotice tone="need"><span role="status">Some decisions could not be checked. <StTextButton ref={retryButton} onClick={retry}>Check again</StTextButton></span></StNotice> : null}
    {nothing && empty ? empty : null}
    {state.status === "ready" && state.role === "member" && state.items.length ? <StNotice>Only the owner can decide these. You can see what is waiting.</StNotice> : null}
    {state.status === "ready" && (state.items.length || extra) ? <StRows label="Decisions waiting on you">
      {state.items.map(item => {
        const busy = pending === item.id;
        const notice = notices[item.id];
        const openHref = item.openHref ? `${appBase}${item.openHref}` : null;
        const look = decisionPresentation(item);
        const actor = actorPresentation(item.actor);
        const noteActor = actorPresentation(item.noteActor?.kind === "operator" ? item.noteActor : { kind: "operator" });
        const decidable = canDecide && item.review !== null;
        const actions = <div className={styles.actions}>
          {decidable ? <StTextButton disabled={Boolean(pending)} onClick={() => onDecide(item, "not_yet")} aria-label={`Not yet: ${item.title}`}>Not yet</StTextButton> : null}
          {openHref ? <StTextButton href={openHref}>Open</StTextButton> : null}
          {decidable ? <StHold label={busy ? "Working…" : look.verb} aria-label={`${look.verb}: ${item.title}`} disabled={Boolean(pending)} onAccept={() => onDecide(item, "approve")} /> : null}
        </div>;
        return <StRow key={item.id} align="start" lead={<StBeacon kind="need" />} kind={<>{look.source} · <StMono>{when(item.openedAt)}</StMono>{item.urgent ? " · Someone is waiting" : ""}</>} selected={item.id === selectedId} title={<span id={`decision-${item.id}`} ref={item.id === selectedId ? selectedItem : undefined} tabIndex={-1}>{item.title}</span>} end={actions}>
          <div className={styles.review} data-shape={look.shape}>
            {deck && look.amount && !item.review?.length ? <p>{look.amount}</p> : null}
            {item.review?.length ? <ul className={styles.reviewLines} aria-label="Every change you approve">{item.review.map((line, row) => <li key={row}>{line}</li>)}</ul>
              : item.detail ? <p className={look.shape === "message" ? styles.quote : undefined}>{item.detail}</p> : null}
            {actor.name ? <p className={styles.attribution}>{actor.name}{actor.credit ? ` · ${actor.credit}` : ""}</p> : null}
            <p className={styles.effects}>Approve: {actorCopy(item.approveEffect, item.actor)} Not yet: {actorCopy(item.notYetEffect, item.actor)}{item.operatorNote ? ` ${noteActor.name ?? "Support"}: ${item.operatorNote}` : ""}</p>
            {canDecide && item.review === null ? <p role="status">This changed or couldn&apos;t be loaded. Refresh to see the latest before deciding.</p> : null}
            {notice ? <p role="status" data-error={notice.tone === "error" || undefined}>{notice.text}</p> : null}
          </div>
        </StRow>;
      })}
      {extra}
    </StRows> : null}
    {outcomes.length ? <ul className={styles.outcomes} aria-live="polite">{outcomes.map(([id, notice]) => <li key={id} data-error={notice.tone === "error" || undefined}>{notice.tone === "error" ? null : <Check size={14} aria-hidden="true" />}{notice.text}</li>)}</ul> : null}
  </section>;
}

interface HandledProps {
  state: NeedsYouState;
  pending: string | null;
  notices: Record<string, ItemNotice>;
  onUndo: (receipt: HandledReceipt) => void;
  /** Optional source heading supplied only when the caller knows the source. */
  title?: ReactNode;
  headingId?: string;
  /** Finished requests, shown when there are no receipts this week. */
  fallback?: ReactNode;
}

/** What changed: the last 7 days of recorded changes, with honest undo. */
export function StrelvaHandledSection({ state, pending, notices, onUndo, fallback, title = STRELVA_HANDLED_LABEL, headingId = "home-handled" }: HandledProps) {
  if (state.status === "disabled") return null;
  const canUndo = state.status === "ready" && state.role !== "member";
  const undoUnconfirmed = Object.values(notices).some(notice => notice.text.includes("Outcome not confirmed"));
  return <StSection title={title} meta="Last 7 days" id={headingId}>
    {state.status === "loading" ? <div className={styles.loading}><p role="status">Checking recent changes…</p><StSkeleton width="72%" /></div>
      : state.status === "error" ? <StNotice tone="critical">{undoUnconfirmed ? "Outcome not confirmed. This week’s changes could not be loaded. Check again before trying Undo." : "This week’s changes could not be loaded."}</StNotice>
      : !state.handledAvailable ? <StNotice tone="critical">{undoUnconfirmed ? "Outcome not confirmed. This week’s changes could not be loaded. Check again before trying Undo." : "This week’s changes could not be loaded. Check again before trying Undo."}</StNotice>
      : state.handled.length ? <StRows label="Recorded changes in the last 7 days">{state.handled.map(receipt => {
        const notice = notices[receipt.id];
        const actor = actorPresentation(receipt.actor);
        const attribution = actor.name && receipt.sentence.startsWith(`${actor.name} `) ? actor.credit : actorLabel(receipt.actor);
        return <StRow key={receipt.id} title={receipt.sentence} lead={<Check size={16} aria-hidden="true" />} kind={<StMono>{when(receipt.at)}</StMono>}
          detail={<>{[attribution, receipt.changed].filter(Boolean).join(" · ")}{receipt.evidence ? receipt.evidence.readBack === "verified" ? " · Confirmed live" : receipt.evidence.readBack === "not_verified" ? " · Done, not yet confirmed" : " · Accepted" : ""}</>}
          end={receipt.undo.state === "undo" && canUndo ? <StTextButton disabled={Boolean(pending)} onClick={() => onUndo(receipt)} aria-label={`Undo: ${receipt.sentence}`}>{pending === receipt.id ? "Undoing…" : "Undo"}</StTextButton> : undefined}>
          {receipt.undo.state === "undo_needs_review" || receipt.undo.state === "not_undoable" ? <span className={styles.effects}>{receipt.undo.reason}</span> : receipt.undo.state === "undone" ? <span className={styles.effects}>Undone.</span> : null}
          {notice && receipt.undo.state !== "undone" ? <span className={styles.effects} role="status" data-error={notice.tone === "error" || undefined}>{notice.text}</span> : null}
        </StRow>;
      })}</StRows>
      : fallback ?? <StEmpty>Nothing this week. When something changes for you, it shows here with what changed.</StEmpty>}
  </StSection>;
}

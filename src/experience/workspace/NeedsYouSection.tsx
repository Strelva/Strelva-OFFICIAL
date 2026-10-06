"use client";

import type { ReactNode } from "react";
import { ArrowRight, Bell, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { HandledReceipt, OwnerDecision } from "@/platform/needs-you/contracts";
import type { ItemNotice, NeedsYouState } from "./useNeedsYou";
import styles from "./business-home.module.css";

const TIME = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

function when(value: string): string {
  const at = Date.parse(value);
  return Number.isFinite(at) ? TIME.format(new Date(at)) : "";
}

interface NeedsYouProps {
  state: NeedsYouState;
  pending: string | null;
  notices: Record<string, ItemNotice>;
  onDecide: (item: OwnerDecision, decision: "approve" | "not_yet") => void;
  onRetry: () => void;
  /** Other asks Home already knows about (saved work that needs a decision). */
  extra?: ReactNode;
  extraCount?: number;
  appBase?: string;
}

/**
 * Needs you: only the owner's decisions, oldest first, with the same Approve
 * and Not yet the email carries. Gone when empty. A member sees the asks but
 * can't decide them; asks that need editing open their own page.
 */
export function NeedsYouSection({ state, pending, notices, onDecide, onRetry, extra, extraCount = 0, appBase = "" }: NeedsYouProps) {
  const outcomes = Object.entries(notices).filter(([id]) => state.status !== "ready" || !state.items.some(item => item.id === id));
  if (state.status === "disabled") return null;
  if (state.status === "ready" && state.items.length === 0 && extraCount === 0 && outcomes.length === 0) return null;
  const count = (state.status === "ready" ? state.items.length : 0) + extraCount;
  const canDecide = state.status === "ready" && state.role !== "member";
  return <section className={styles.section} aria-labelledby="home-attention">
    <header className={styles.sectionHeader}><h2 id="home-attention"><Bell size={18} aria-hidden="true" />Needs you</h2>{state.status === "ready" && count > 0 ? <span className={styles.count}>{count}</span> : null}</header>
    {state.status === "loading" ? <p role="status" className={styles.muted}>Checking what needs you…</p> : null}
    {state.status === "error" ? <p role="status" className={styles.notice}>{state.message} <button type="button" onClick={onRetry}>Check again</button></p> : null}
    {state.status === "ready" && state.role === "member" && state.items.length ? <p className={styles.muted}>Only the owner can decide these. You can see what is waiting.</p> : null}
    {state.status === "ready" && (state.items.length || extra) ? <ul className={styles.list}>
      {state.items.map(item => {
        const busy = pending === item.id;
        const notice = notices[item.id];
        const openHref = item.openHref ? `${appBase}${item.openHref}` : null;
        return <li key={item.id} className={styles.decision}>
          <div className={styles.decisionBody}>
            <strong>{item.title}</strong>
            {item.detail ? <p>{item.detail}</p> : null}
            <small>Approve: {item.approveEffect} Not yet: {item.notYetEffect}{item.operatorNote ? ` Strelva's note: ${item.operatorNote}` : ""}</small>
            {notice ? <small role="status" className={notice.tone === "error" ? styles.decisionError : undefined}>{notice.text}</small> : null}
          </div>
          {canDecide ? <div className={styles.decisionActions}>
            <Button size="sm" loading={busy} disabled={Boolean(pending)} onClick={() => onDecide(item, "approve")} aria-label={`Approve: ${item.title}`}>Approve</Button>
            <Button size="sm" variant="ghost" disabled={Boolean(pending)} onClick={() => onDecide(item, "not_yet")} aria-label={`Not yet: ${item.title}`}>Not yet</Button>
            {openHref ? <a className={styles.decisionLink} href={openHref}>Open<ArrowRight size={14} aria-hidden="true" /></a> : null}
          </div> : openHref ? <div className={styles.decisionActions}><a className={styles.decisionLink} href={openHref}>Open<ArrowRight size={14} aria-hidden="true" /></a></div> : null}
        </li>;
      })}
      {extra}
    </ul> : null}
    {outcomes.length ? <ul className={styles.outcomes} aria-live="polite">{outcomes.map(([id, notice]) => <li key={id} className={notice.tone === "error" ? styles.decisionError : undefined}>{notice.text}</li>)}</ul> : null}
  </section>;
}

interface HandledProps {
  state: NeedsYouState;
  pending: string | null;
  notices: Record<string, ItemNotice>;
  onUndo: (receipt: HandledReceipt) => void;
  /** Finished requests, shown when there are no receipts this week. */
  fallback?: ReactNode;
}

/** Strelva handled: the last 7 days of what Strelva did, with honest undo. */
export function StrelvaHandledSection({ state, pending, notices, onUndo, fallback }: HandledProps) {
  if (state.status === "disabled") return null;
  const canUndo = state.status === "ready" && state.role !== "member";
  return <section className={styles.section} aria-labelledby="home-handled">
    <header className={styles.sectionHeader}><h2 id="home-handled"><CheckCircle2 size={18} aria-hidden="true" />Strelva handled</h2></header>
    {state.status === "loading" ? <p role="status" className={styles.muted}>Checking what Strelva did…</p>
      : state.status === "error" ? <p role="status" className={styles.muted}>What Strelva did this week could not be loaded.</p>
      : !state.handledAvailable ? <p role="status" className={styles.muted}>What Strelva did this week could not be loaded. Nothing about it changed.</p>
      : state.handled.length ? <ul className={styles.list}>{state.handled.map(receipt => {
        const notice = notices[receipt.id];
        return <li key={receipt.id} className={styles.decision}>
          <div className={styles.decisionBody}>
            <strong>{receipt.sentence}</strong>
            <small>{when(receipt.at)}{receipt.changed ? ` · ${receipt.changed}` : ""}{receipt.evidence ? receipt.evidence.readBack === "verified" ? " · Confirmed live" : receipt.evidence.readBack === "not_verified" ? " · Done, not yet confirmed" : " · Accepted" : ""}</small>
            {receipt.undo.state === "undo_needs_review" || receipt.undo.state === "not_undoable" ? <small>{receipt.undo.reason}</small> : receipt.undo.state === "undone" ? <small>Undone.</small> : null}
            {notice && receipt.undo.state !== "undone" ? <small role="status" className={notice.tone === "error" ? styles.decisionError : undefined}>{notice.text}</small> : null}
          </div>
          {receipt.undo.state === "undo" && canUndo ? <div className={styles.decisionActions}><Button size="sm" variant="ghost" loading={pending === receipt.id} disabled={Boolean(pending)} onClick={() => onUndo(receipt)} aria-label={`Undo: ${receipt.sentence}`}>Undo</Button></div> : null}
        </li>;
      })}</ul>
      : fallback ?? <p className={styles.muted}>Nothing this week. When Strelva changes something for you, it shows here with what changed.</p>}
  </section>;
}

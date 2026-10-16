"use client";
/**
 * Requests (XA · O5): what the business and its agency asked for, with an
 * end. Open and Done are two views of one list (segmented, Linear-style).
 * Each row leads with the clay tile of the System it is about (Pebble for a
 * job Strelva runs) and says who asked and who is doing it. A status word
 * appears only for an exception: a request that waits for the owner, with its
 * Review action. A done request that came from a decision offers Undo while
 * that decision's receipt says it can be undone.
 */
import { useState } from "react";
import { XaComposer, XaEmpty, XaHeadline, XaLabel, XaPebbleAvatar, XaRow, XaRows, XaSays, XaSegmented, XaStatus, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import type { HandledReceipt } from "@/platform/needs-you/contracts";
import type { BusinessRequestStage } from "../business-delivery-summary";
import type { BusinessRequestRow } from "../WorkspaceRequests";
import { countWord } from "./today-model";
import styles from "./today.module.css";

export type RequestsViewStatus = { status: "loading" } | { status: "ready" } | { status: "error"; message: string } | { status: "disabled" };

export interface RequestsViewProps {
  businessName: string;
  rows: readonly BusinessRequestRow[];
  state: RequestsViewStatus;
  readOnly: boolean;
  agencySeat?: boolean;
  onRetry: () => void;
  /** Ask for something new; the docked composer passes its words. */
  onAsk: (request?: string) => void;
  onOpenWork: (id: string) => void;
  /** Systems by id, for each request's clay tile. */
  systems?: readonly { id: string; kind: string }[];
  onReview?: (decisionId: string) => void;
  onUndo?: (receipt: HandledReceipt) => void;
  pendingDecision?: string | null;
  initialView?: "open" | "done";
}

const WAITS: readonly BusinessRequestStage[] = ["needs_you", "ready_for_review"];
const OPEN: readonly BusinessRequestStage[] = ["needs_you", "ready_for_review", "in_progress", "asked"];

export function RequestsView({ businessName, rows, state, readOnly, agencySeat = false, onRetry, onAsk, onOpenWork, systems = [], onReview, onUndo, pendingDecision = null, initialView = "open" }: RequestsViewProps) {
  const [view, setView] = useState<"open" | "done">(initialView);
  const [ask, setAsk] = useState("");
  const open = rows.filter(row => OPEN.includes(row.stage));
  const done = rows.filter(row => row.stage === "done" || row.stage === "closed");
  const waits = rows.filter(row => WAITS.includes(row.stage));
  const agencies = [...new Set(rows.map(row => row.provider === "agency" ? row.agencyName : undefined).filter((name): name is string => Boolean(name)))];
  const who = agencySeat ? businessName : "you";
  const headline = agencySeat ? `Requests for ${businessName}.` : agencies.length === 1 ? `What you and ${agencies[0]} asked for.` : "What you asked for.";
  const quiet = state.status !== "ready" || !rows.length ? undefined : waits.length ? `${countWord(waits.length)} ${waits.length === 1 ? "waits" : "wait"} on ${who}.` : `Nothing waits on ${who}.`;
  const loading = state.status === "loading";
  const kindOf = new Map(systems.map(system => [system.id, system.kind]));

  function row(entry: BusinessRequestRow) {
    const waiting = WAITS.includes(entry.stage);
    const lead = entry.provider === "strelva-run" ? <XaPebbleAvatar size={36} /> : <XaSystemTile kind={(entry.systemId && kindOf.get(entry.systemId)) || "form"} size={36} />;
    const review = waiting && !agencySeat && entry.decisionId && onReview ? entry.decisionId : null;
    const undo = entry.stage === "done" && entry.receipt?.undo.state === "undo" && onUndo ? entry.receipt : null;
    const undone = entry.stage === "done" && entry.receipt?.undo.state === "undone";
    const action = review ? <XaTextLink onClick={() => onReview!(review)} aria-label={`Review: ${entry.title}`}>Review</XaTextLink>
      : undo ? pendingDecision === undo.id ? <XaStatus kind="working" size="sm">Undoing</XaStatus> : <XaTextLink onClick={() => onUndo!(undo)} aria-label={`Undo: ${entry.title}`}>Undo</XaTextLink> : undefined;
    const meta = waiting ? <XaStatus kind="waits" size="sm">{agencySeat ? `Waiting on ${businessName}` : "Waits for you"}</XaStatus> : undone ? <XaStatus kind="draft" size="sm">Undone</XaStatus> : undefined;
    // A row with its own action is not itself a link (one control per row).
    return <XaRow key={entry.id} lead={<span className={styles.lead36}>{lead}</span>} title={entry.title} detail={entry.detail} tone={waiting ? "waits" : undefined}
      href={action ? undefined : entry.href} onClick={action || entry.href || !entry.workId ? undefined : () => onOpenWork(entry.workId!)}
      meta={meta} action={action} />;
  }

  const groups = view === "open"
    ? [{ id: "waits", label: agencySeat ? `Waiting on ${businessName}` : "Waits for you", entries: open.filter(entry => WAITS.includes(entry.stage)) }, { id: "open", label: "Open", entries: open.filter(entry => !WAITS.includes(entry.stage)) }]
    : [{ id: "done", label: "Recently done", entries: done.filter(entry => entry.stage === "done") }, { id: "closed", label: "Closed", entries: done.filter(entry => entry.stage === "closed") }];
  const shown = groups.some(group => group.entries.length);
  const canAsk = !readOnly;

  return <div className={styles.page}>
    <div className={styles.pageHead}>
      <XaHeadline quiet={quiet} id="requests-title">{headline}</XaHeadline>
      {rows.length ? <XaSegmented label="Which requests" value={view} onChange={setView} options={[{ value: "open", label: `Open ${open.length}` }, { value: "done", label: `Done ${done.length}` }]} /> : null}
    </div>
    {readOnly ? <XaSays>Shared with you. You can see these Requests and where each one stands.</XaSays> : null}
    {state.status === "disabled" ? <XaSays>Requests outside your current shared scope cannot be checked for {businessName}. The ones below are all you can see.</XaSays> : null}
    {state.status === "error" ? <XaSays links={[<XaTextLink key="retry" onClick={onRetry}>Check again</XaTextLink>]}><span role="alert">{state.message}</span></XaSays> : null}
    {loading ? <div role="status" aria-label="Checking your requests" className={styles.group}><StSkeleton /><StSkeleton width="76%" /><StSkeleton width="88%" /></div>
      : !rows.length && state.status !== "error" ? <XaEmpty pose="resting" size="sm" job="Pebble keeps each Request with who is doing it and when it is due"
        title={canAsk && state.status !== "disabled" ? "Nothing asked yet." : "No requests you can see."}>
        {canAsk && state.status !== "disabled" ? "Ask for something with an end below: a new page, an intake form, a launch. It shows up here with who is doing it and when it is due." : "Requests the owner shares with you appear here."}
      </XaEmpty>
        : shown ? groups.filter(group => group.entries.length).map(group => <section key={group.id} className={styles.group} aria-labelledby={`requests-${group.id}`}>
          <XaLabel as="h2" id={`requests-${group.id}`}>{group.label}</XaLabel>
          <XaRows label={group.label}>{group.entries.map(row)}</XaRows>
        </section>)
          : rows.length ? <XaSays>{view === "open" ? `Nothing is open. ${done.length ? "Everything asked for is done." : ""}` : "Nothing is done yet. Open Requests move here when they finish."}</XaSays> : null}
    {canAsk ? <div className={styles.pageDock}>
      <XaComposer value={ask} onChange={setAsk} onSubmit={() => { const text = ask.trim(); if (text) { onAsk(text); setAsk(""); } }} placeholder="Ask for something new" inputLabel={`Ask for something new for ${businessName}`} />
    </div> : null}
  </div>;
}

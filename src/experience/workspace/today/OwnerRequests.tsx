"use client";
/**
 * Requests (XA · O5): what the business and its agency asked for, with an
 * end. Open and Done are two views of one list (segmented, Linear-style);
 * only rows that wait on someone carry a dot. Each row names who is doing
 * it, by its recorded name; work Strelva runs itself shows Pebble.
 */
import { useState } from "react";
import { XaButton, XaEmpty, XaHeadline, XaInitial, XaLabel, XaPebbleAvatar, XaRow, XaRows, XaSays, XaSegmented, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { REQUEST_STAGE_LABELS, requestStageLabel, type BusinessRequestStage } from "../business-delivery-summary";
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
  onAsk: () => void;
  onOpenWork: (id: string) => void;
  initialView?: "open" | "done";
}

const WAITS: readonly BusinessRequestStage[] = ["needs_you", "ready_for_review"];
const OPEN: readonly BusinessRequestStage[] = ["needs_you", "ready_for_review", "in_progress", "asked"];

export function RequestsView({ businessName, rows, state, readOnly, agencySeat = false, onRetry, onAsk, onOpenWork, initialView = "open" }: RequestsViewProps) {
  const [view, setView] = useState<"open" | "done">(initialView);
  const open = rows.filter(row => OPEN.includes(row.stage));
  const done = rows.filter(row => row.stage === "done" || row.stage === "closed");
  const waits = rows.filter(row => WAITS.includes(row.stage));
  const agencies = [...new Set(rows.map(row => row.provider === "agency" ? row.agencyName : undefined).filter((name): name is string => Boolean(name)))];
  const who = agencySeat ? businessName : "you";
  const headline = agencySeat ? `Requests for ${businessName}.` : agencies.length === 1 ? `What you and ${agencies[0]} asked for.` : "What you asked for.";
  const quiet = state.status !== "ready" || !rows.length ? undefined : waits.length ? `${countWord(waits.length)} ${waits.length === 1 ? "waits" : "wait"} on ${who}.` : `Nothing waits on ${who}.`;
  const loading = state.status === "loading";

  function row(entry: BusinessRequestRow) {
    const waiting = WAITS.includes(entry.stage);
    const label = requestStageLabel(entry.stage, { agencySeat, businessName, agencyName: entry.agencyName });
    const lead = entry.provider === "strelva-run" ? <XaPebbleAvatar size={36} /> : entry.agencyName ? <XaInitial name={entry.agencyName} size={36} /> : <XaInitial name={businessName} size={36} />;
    return <XaRow key={entry.id} lead={<span className={styles.lead36}>{lead}</span>} title={entry.title} detail={entry.detail} tone={waiting ? "waits" : undefined}
      href={entry.href} onClick={!entry.href && entry.workId ? () => onOpenWork(entry.workId!) : undefined}
      meta={waiting ? <XaStatus kind="waits" size="sm">{label}</XaStatus> : entry.stage === "asked" ? REQUEST_STAGE_LABELS.asked : label} />;
  }

  const groups = view === "open"
    ? [{ id: "waits", label: agencySeat ? `Waiting on ${businessName}` : "Waits for you", entries: open.filter(entry => WAITS.includes(entry.stage)) }, { id: "open", label: "Open", entries: open.filter(entry => !WAITS.includes(entry.stage)) }]
    : [{ id: "done", label: "Recently done", entries: done.filter(entry => entry.stage === "done") }, { id: "closed", label: "Closed", entries: done.filter(entry => entry.stage === "closed") }];
  const shown = groups.some(group => group.entries.length);

  return <div className={styles.page}>
    <div className={styles.pageHead}>
      <XaHeadline quiet={quiet} id="requests-title">{headline}</XaHeadline>
      {rows.length ? <XaSegmented label="Which requests" value={view} onChange={setView} options={[{ value: "open", label: `Open ${open.length}` }, { value: "done", label: `Done ${done.length}` }]} /> : null}
    </div>
    {readOnly ? <XaSays>Shared with you. You can see these Requests and where each one stands.</XaSays> : null}
    {state.status === "disabled" ? <XaSays>Requests outside your current shared scope cannot be checked for {businessName}. The ones below are all you can see.</XaSays> : null}
    {state.status === "error" ? <XaSays links={[<XaTextLink key="retry" onClick={onRetry}>Check again</XaTextLink>]}><span role="alert">{state.message}</span></XaSays> : null}
    {loading ? <div role="status" aria-label="Checking your requests" className={styles.group}><StSkeleton /><StSkeleton width="76%" /><StSkeleton width="88%" /></div>
      : !rows.length && state.status !== "error" ? <XaEmpty pose="resting" size="sm" job="Pebble keeps each Request with its stage and due date"
        title={readOnly || state.status === "disabled" ? "No requests you can see." : "Nothing asked yet."}
        action={readOnly || state.status === "disabled" ? undefined : <XaButton onClick={onAsk}>Ask Strelva for something</XaButton>}>
        {readOnly || state.status === "disabled" ? "Requests the owner shares with you appear here." : "Ask for something with an end: a new page, an intake form, a launch. It shows up here with who is doing it and when it is due."}
      </XaEmpty>
        : shown ? groups.filter(group => group.entries.length).map(group => <section key={group.id} className={styles.group} aria-labelledby={`requests-${group.id}`}>
          <XaLabel as="h2" id={`requests-${group.id}`}>{group.label}</XaLabel>
          <XaRows label={group.label}>{group.entries.map(row)}</XaRows>
        </section>)
          : rows.length ? <XaSays>{view === "open" ? `Nothing is open. ${done.length ? "Everything asked for is done." : ""}` : "Nothing is done yet. Open Requests move here when they finish."}</XaSays> : null}
    {!readOnly && rows.length ? <span><XaButton onClick={onAsk}>Ask Strelva for something</XaButton></span> : null}
  </div>;
}

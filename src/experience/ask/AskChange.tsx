"use client";
/**
 * The objects an Ask Strelva turn makes (XA · AS2 to AS5): one question with
 * the answers Strelva found, the drafted change as its visitors would see it,
 * and, once someone decided, what happened with every step named.
 *
 * Presentation only. The yes itself lives where the decider decides (XaYes in
 * Needs you / Today); these parts link there and never approve anything.
 */
import { useState } from "react";
import { Check } from "lucide-react";
import {
  XaAddTile, XaAnswers, XaButton, XaButtonLink, XaDecision, XaHeadline, XaInitial, XaPage, XaPageChange, XaPebbleAvatar, XaSays, XaSegmented, XaStatus, XaTextLink, XaWaiting,
} from "@/components/ui/strelva/Xa";
import type { AskChangeOutcome, AskQuestionView, AskReceiptItemView } from "./ask-model";
import { sameAppPath } from "./ask-model";
import { actorLabel } from "@/platform/presentation/actor";
import styles from "./ask.module.css";

/** Who says yes to a drafted change: the viewer ("you") or someone named. */
export interface AskDecider { name: string; you: boolean }

const COUNT = ["", "this one", "these two", "these three", "these four", "these five", "these six", "these seven", "these eight"];

/* ---------- One question (AS2) ---------- */

/** Answers Strelva found, all picked. "Use these" sends them as an ordinary message. */
export function AskQuestion({ question, onAnswer, onAdd }: { question: AskQuestionView; onAnswer: (words: string) => void; onAdd: () => void }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(question.options.map(option => option.label)));
  const chosen = question.options.filter(option => picked.has(option.label)).map(option => option.label);
  const toggle = (label: string) => setPicked(current => { const next = new Set(current); if (next.has(label)) next.delete(label); else next.add(label); return next; });
  return <div className={styles.question}>
    <ul className={styles.choices} aria-label="Answers Strelva found">
      {question.options.map(option => <li key={option.label}>
        <label className={styles.choice}>
          <input type="checkbox" className={styles.choiceInput} checked={picked.has(option.label)} onChange={() => toggle(option.label)} />
          <span className={styles.check} data-on={picked.has(option.label) || undefined} aria-hidden="true">{picked.has(option.label) ? <Check size={13} strokeWidth={2.6} /> : null}</span>
          <span className={styles.choiceLabel}>{option.label}</span>
          {option.source ? <span className={styles.choiceSource}>{option.source}</span> : null}
        </label>
      </li>)}
      {question.addLabel ? <li><button type="button" className={styles.choice} data-add="true" onClick={onAdd}><XaAddTile size={26} /><span className={styles.choiceLabel}>{question.addLabel}</span></button></li> : null}
    </ul>
    <div className={styles.actions}>
      <XaButton variant="primary" size="sm" disabled={!chosen.length} onClick={() => onAnswer(`Use ${chosen.join(", ")}.`)}>{chosen.length ? `Use ${COUNT[chosen.length] ?? "these"}` : "Pick at least one"}</XaButton>
    </div>
  </div>;
}

/* ---------- The change (AS3, AS4, AS5 panel) ---------- */

function routeStatus(item: AskReceiptItemView, decider: AskDecider) {
  const route = item.needsYou?.route;
  if (route === "owner_decides") return <XaStatus kind="waits">{decider.you ? "Waits for your yes" : `Waits for ${decider.name}`}</XaStatus>;
  if (route === "strelva_reviews") return <XaStatus kind="draft">Strelva checks it first</XaStatus>;
  if (route === "handle_after_notice") return <XaStatus kind="draft">Goes live after a notice</XaStatus>;
  return <XaStatus kind="draft">Draft</XaStatus>;
}

/**
 * The drafted change beside the conversation, as the page its visitors would
 * see. Before a decision an agency person can switch to what the owner sees;
 * the owner gets one way to the yes. After a decision it shows the outcome.
 */
export function AskChangePanel({ item, site, decider, outcome, initialView = "change" }: { item: AskReceiptItemView; site: string; decider: AskDecider; outcome: AskChangeOutcome | null; initialView?: "change" | "sees" }) {
  const [view, setView] = useState<"change" | "sees">(initialView);
  const summary = item.summary || "A change to this page";
  const preview = sameAppPath(item.previewHref);
  const page = <XaPage address={site} label={`${site}, with the change`}><XaPageChange>{summary}</XaPageChange><p className={styles.pageNote}>{outcome?.state === "approved" && outcome.outcome !== "failed" ? "Live on the page" : "Only this part changes"}</p></XaPage>;

  if (outcome) {
    const live = outcome.state === "approved" && outcome.outcome !== "failed";
    const status = live ? <XaStatus kind="live" breathe>Live</XaStatus>
      : outcome.state === "approved" ? <XaStatus kind="down">Didn&apos;t go live</XaStatus>
      : <XaStatus kind="draft">{outcome.state === "declined" ? "Not yet" : "Closed"}</XaStatus>;
    const meta = live ? outcome.readBackAt ? <>Read back at <Clock at={outcome.readBackAt} /></> : "Not read back yet" : outcome.state === "declined" ? `${outcome.decidedBy} said not yet` : null;
    return <XaDecision label={`The change on ${site}`} status={status} meta={meta} yes={outcome.facts?.length ? <XaAnswers rows={outcome.facts} labelWidth={96} /> : null}>
      {page}
    </XaDecision>;
  }

  const by = item.actor && "displayName" in item.actor && item.actor.displayName ? item.actor.displayName : item.actor ? actorLabel(item.actor) : null;
  const waitsOnSomeoneElse = item.needsYou?.route === "owner_decides" && !decider.you;
  const footer = decider.you && item.needsYou?.route === "owner_decides" && item.needsYou.decideAt && sameAppPath(item.needsYou.decideAt)
    ? <XaButtonLink variant="primary" size="lg" block href={item.needsYou.decideAt}>Review the change</XaButtonLink>
    : <p className={styles.panelNote}>
      {waitsOnSomeoneElse ? view === "sees" ? `${decider.name} answers with Put it live or Not yet, from Today.` : `Nothing is public until ${decider.name} says yes.` : "Nothing is public yet."}
      {preview ? <> <XaTextLink href={preview}>See the whole page</XaTextLink></> : null}
    </p>;

  return <XaDecision label={`The change on ${site}`} status={routeStatus(item, decider)} meta={by ? `From ${by}` : null} yes={footer}>
    {waitsOnSomeoneElse ? <XaSegmented label="Show" value={view} onChange={setView} options={[{ value: "change", label: "The change" }, { value: "sees", label: `What ${decider.name} sees` }]} /> : null}
    {view === "sees" ? <XaWaiting item={{ kicker: <>Waits for you{by ? ` · from ${by}` : ""}</>, title: `A change to ${site}`, ...(by ? { from: { name: by } } : {}), action: null }} /> : null}
    {page}
  </XaDecision>;
}

/* ---------- After the decision (AS5) ---------- */

function Clock({ at }: { at: string }) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return <time dateTime={at} suppressHydrationWarning>{date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/, "")}</time>;
}

/** What happened to the change, then every step with whoever acted. */
export function AskChangeStory({ outcome, site, decider }: { outcome: AskChangeOutcome; site: string; decider: AskDecider }) {
  const who = decider.you ? "You" : outcome.decidedBy;
  const live = outcome.state === "approved" && outcome.outcome !== "failed";
  const headline = live ? <XaHeadline as="h2" size="sm" quiet={<>{who} said yes at <Clock at={outcome.decidedAt} />.</>}>Live on {site}.</XaHeadline>
    : outcome.state === "approved" ? <XaHeadline as="h2" size="sm" quiet={`Nothing changed on ${site}.`}>It didn&apos;t go live.</XaHeadline>
    : outcome.state === "declined" ? <XaHeadline as="h2" size="sm" quiet={`Nothing changed on ${site}.`}>{who} said not yet.</XaHeadline>
    : <XaHeadline as="h2" size="sm" quiet={`Nothing changed on ${site}.`}>This change closed without a yes.</XaHeadline>;
  return <section className={styles.story} aria-label="What happened to this change">
    {headline}
    {outcome.state === "approved" && outcome.outcome === "failed" ? <XaSays>The page didn&apos;t take the change, so I left it as it was. I&apos;m checking why.</XaSays> : null}
    <ol className={styles.steps} aria-label="Every step">
      {outcome.steps.map((step, index) => <li key={index}>
        <Clock at={step.at} />
        {step.by.kind === "strelva" ? <XaPebbleAvatar size={24} /> : <XaInitial name={step.by.name.replace(/^(Dr|Mr|Mrs|Ms)\.?\s+/, "")} size={24} shape={step.by.kind === "owner" ? "round" : "square"} color="#2f5236" />}
        <span className={styles.stepText}>{step.text}</span>
        <span className={styles.stepBy}>{step.by.name}</span>
      </li>)}
    </ol>
    {outcome.minutes ? <p className={styles.meta}>{outcome.minutes.value} minutes of {outcome.minutes.person}&apos;s time, logged to {outcome.minutes.to}.</p> : null}
  </section>;
}

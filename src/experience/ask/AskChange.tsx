"use client";
/**
 * The objects an Ask Strelva turn makes (XA · AS2 to AS6): one question with
 * the answers Strelva found, the drafted change as its visitors would read
 * it, what happened once someone decided, and a new System explained in the
 * owner's words with a sample conversation.
 *
 * Presentation only. The yes itself lives where the decider decides (XaYes in
 * Today); these parts link there and never approve anything.
 */
import { useId, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import {
  XaAddTile, XaAnswers, XaButton, XaButtonLink, XaHeadline, XaInitial, XaPage, XaPebbleAvatar, XaPebbleScene, XaSays, XaSegmented, XaStatus, XaTextLink,
} from "@/components/ui/strelva/Xa";
import { ACTOR_NOT_RECORDED, actorPresentation } from "@/platform/presentation/actor";
import { XA_PLACE_LABELS, XA_YES_LABELS } from "@/platform/presentation/place-labels";
import type { AskChangeOutcome, AskQuestionView, AskReceiptItemView } from "./ask-model";
import { sameAppPath } from "./ask-model";
import styles from "./ask.module.css";

/** Who says yes to a drafted change: the viewer ("you") or someone named. */
export interface AskDecider { name: string; you: boolean }

const COUNT = ["", "this one", "these two", "these three", "these four", "these five", "these six", "these seven", "these eight"];

/** Hour and minute, as the board writes it ("10:41"). Null when the time can't be read. */
export function askClock(at: string | null | undefined): string | null {
  if (!at) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/, "");
}

function Clock({ at }: { at: string | null | undefined }) {
  const text = askClock(at);
  return text && at ? <time dateTime={at} suppressHydrationWarning>{text}</time> : null;
}

/** Whoever sent the draft: the recorded actor's name, never the viewer. */
export function askSender(item: AskReceiptItemView): string | null {
  return actorPresentation(item.actor).name;
}

/** The change by its own name. Falls back to the receipt's summary, never to the domain alone. */
export function askChangeTitle(item: AskReceiptItemView): string {
  return item.title ?? (item.summary.trim() || "A drafted change");
}

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

/* ---------- The reply under a draft (AS3, AS4) ---------- */

/** What Strelva assumed and added, at a glance, under its reply (Adds / Lists / Notes / Assumed). */
export function AskChangeFacts({ item }: { item: AskReceiptItemView }) {
  const facts = item.shows?.facts;
  return facts?.length ? <div className={styles.facts}><XaAnswers rows={facts.map(fact => [fact.label, fact.value] as const)} labelWidth={92} /></div> : null;
}

/** Where the draft went, naming who sent it and when: "North Studio sent it to Dr. Lin at 10:14." */
export function AskSentLine({ item, decider, at, reviewHref }: { item: AskReceiptItemView; decider: AskDecider; at: string | null | undefined; reviewHref?: string }) {
  const sender = askSender(item);
  if (decider.you) return <p className={styles.line}>
    <XaStatus kind="waits" size="sm">Waits for your yes</XaStatus>
    {sender ? <span className={styles.faint}>from {sender}</span> : null}
    {reviewHref ? <span className={styles.lineLink}><XaTextLink href={reviewHref}>Review it</XaTextLink></span> : null}
  </p>;
  const time = askClock(at);
  return <p className={styles.line}>
    <XaStatus kind="waits" size="sm">{sender ? `${sender} sent it to ${decider.name}` : `Sent to ${decider.name}`}{time ? <> at <Clock at={at} /></> : null}</XaStatus>
  </p>;
}

/* ---------- The page section (AS3 to AS5) ---------- */

/** The new section as visitors would read it. `added` outlines it in moss and labels it, in place. */
function AskSection({ item, added }: { item: AskReceiptItemView; added: boolean }) {
  const section = item.shows?.section;
  const body = section
    ? <>
      <span className={styles.sectionHead}><span className={styles.sectionHeading}>{section.heading}</span>{added ? <span className={styles.added}>Added</span> : null}</span>
      {section.lines.map((line, index) => <span key={index} className={styles.sectionLine}>{line}</span>)}
      {section.note ? <span className={styles.sectionNote}>{section.note}</span> : null}
    </>
    : <>
      <span className={styles.sectionHead}><span className={styles.sectionHeading}>{askChangeTitle(item)}</span>{added ? <span className={styles.added}>Added</span> : null}</span>
      {item.title && item.summary.trim() && item.summary !== item.title ? <span className={styles.sectionLine}>{item.summary}</span> : null}
    </>;
  return <div className={styles.section} data-added={added || undefined}>
    {added ? <span className={styles.srOnly}>New on the page: </span> : null}
    {body}
  </div>;
}

function ChangePage({ item, site, added, label }: { item: AskReceiptItemView; site: string; added: boolean; label: string }) {
  const placement = item.shows?.placement;
  return <XaPage address={site} label={label}>
    {placement ? <p className={styles.placement}>{placement}</p> : null}
    <AskSection item={item} added={added} />
  </XaPage>;
}

/* ---------- The change beside the conversation (AS3, AS4, AS5) ---------- */

function routeStatus(item: AskReceiptItemView, decider: AskDecider) {
  const route = item.needsYou?.route;
  if (route === "owner_decides") return <XaStatus kind="waits">{decider.you ? "Waits for your yes" : `Waits for ${decider.name}`}</XaStatus>;
  if (route === "strelva_reviews") return <XaStatus kind="draft">Strelva checks it first</XaStatus>;
  if (route === "handle_after_notice") return <XaStatus kind="draft">Goes live after a notice</XaStatus>;
  return <XaStatus kind="draft">Draft</XaStatus>;
}

/**
 * The drafted change as the page its visitors would see, floating on the
 * canvas with its state above it as plain words. Before a decision an agency
 * person can switch to what the owner sees; the owner gets one way to the
 * yes. After a decision it shows the page as it now is.
 */
export function AskChangePanel({ item, site, decider, outcome, initialView = "change" }: { item: AskReceiptItemView; site: string; decider: AskDecider; outcome: AskChangeOutcome | null; initialView?: "change" | "sees" }) {
  const [view, setView] = useState<"change" | "sees">(initialView);
  const preview = sameAppPath(item.previewHref);
  const sender = askSender(item);
  const title = askChangeTitle(item);

  if (outcome) {
    const live = outcome.state === "approved" && (outcome.outcome === "done" || outcome.outcome === "done_unverified");
    if (outcome.state === "approved" && outcome.outcome === "failed") return <figure className={styles.trouble} aria-label={`Pebble looking into why ${site} didn't take the change`}>
      <XaPebbleScene pose="fixing" size={240} />
      <figcaption>Pebble left {site} as it was before the yes.</figcaption>
    </figure>;
    return <div className={styles.change}>
      {live ? <p className={styles.changeHead}><XaStatus kind="live" breathe>Live</XaStatus><span className={styles.changeMeta}>{outcome.readBackAt ? <>Read back at <Clock at={outcome.readBackAt} /></> : "Not read back yet"}</span></p> : null}
      <ChangePage item={item} site={site} added={false} label={live ? `${site}, with the change live` : `${site}, unchanged`} />
      {live && outcome.facts?.length ? <XaAnswers rows={outcome.facts} labelWidth={110} /> : null}
    </div>;
  }

  const waitsOnSomeoneElse = item.needsYou?.route === "owner_decides" && !decider.you;
  const decideAt = item.needsYou?.decideAt ? sameAppPath(item.needsYou.decideAt) : undefined;
  const ownerYes = decider.you && item.needsYou?.route === "owner_decides" && decideAt;
  return <div className={styles.change}>
    <p className={styles.changeHead}>{routeStatus(item, decider)}{sender ? <span className={styles.changeMeta}>From {sender}</span> : null}</p>
    {waitsOnSomeoneElse ? <XaSegmented label="Show" value={view} onChange={setView} options={[{ value: "change", label: "The change" }, { value: "sees", label: `What ${decider.name} sees` }]} /> : null}
    {view === "sees" ? <div className={styles.sees}>
      <p className={styles.seesKicker}>On {decider.name}&apos;s {XA_PLACE_LABELS.today}{sender ? `, from ${sender}` : ""}</p>
      <p className={styles.seesTitle}>{title}</p>
      <p className={styles.seesNote}>{decider.name} answers with {XA_YES_LABELS.yes} or {XA_YES_LABELS.notYet}.</p>
    </div> : null}
    <ChangePage item={item} site={site} added label={`${site}, with the change`} />
    {ownerYes ? <XaButtonLink variant="primary" size="lg" block href={decideAt}>Review the change</XaButtonLink>
      : <p className={styles.changeNote}>
        {waitsOnSomeoneElse ? `Nothing is public until ${decider.name} says yes.` : "Nothing is public yet."}
        {preview ? <> <XaTextLink href={preview}>See the whole page</XaTextLink></> : null}
      </p>}
  </div>;
}

/* ---------- After the decision (AS5) ---------- */

/** "North Studio sent it at 10:14, Dr. Lin said yes at 10:41, and Strelva put it live and read it back at 10:43." */
function storySentence(outcome: AskChangeOutcome, who: string, live: boolean): ReactNode {
  const parts: ReactNode[] = [];
  if (outcome.sentBy && outcome.sentAt) parts.push(<>{outcome.sentBy} sent it at <Clock at={outcome.sentAt} /></>);
  if (outcome.state === "approved") parts.push(<>{who} said yes at <Clock at={outcome.decidedAt} /></>);
  if (live && outcome.liveAt) parts.push(<>{outcome.liveBy ?? ACTOR_NOT_RECORDED} put it live{outcome.readBackAt ? " and read it back" : ""} at <Clock at={outcome.liveAt} /></>);
  if (!parts.length) return null;
  return <>{parts.map((part, index) => <span key={index}>{index === 0 ? null : index === parts.length - 1 ? (parts.length > 2 ? ", and " : " and ") : ", "}{part}</span>)}.</>;
}

function storySteps(outcome: AskChangeOutcome, who: string): { at: string; text: string }[] {
  const steps: { at: string; text: string }[] = [];
  if (outcome.sentAt) steps.push({ at: outcome.sentAt, text: outcome.sentBy ? `${outcome.sentBy} sent it for a yes` : `Sent for a yes (${ACTOR_NOT_RECORDED.toLowerCase()})` });
  const verb = outcome.state === "approved" ? "said yes" : outcome.state === "declined" ? `chose ${XA_YES_LABELS.notYet}` : outcome.state === "expired" ? "didn't answer in time" : "withdrew it";
  steps.push({ at: outcome.decidedAt, text: outcome.state === "expired" ? "The yes expired unanswered" : `${who} ${verb}` });
  if (outcome.liveAt && outcome.outcome !== "failed") steps.push({ at: outcome.liveAt, text: `${outcome.liveBy ?? ACTOR_NOT_RECORDED} put it live` });
  if (outcome.readBackAt) steps.push({ at: outcome.readBackAt, text: "Read it back on the live page" });
  return steps;
}

/**
 * The outcome first, as one sentence that names each person, then the one
 * next action. Every step stays one click away, never the page itself.
 */
export function AskChangeStory({ outcome, site, decider, title, onUndo, onChange, helpHref }: { outcome: AskChangeOutcome; site: string; decider: AskDecider; title: string; onUndo?: () => void; onChange: () => void; helpHref: string }) {
  const [open, setOpen] = useState(false);
  const stepsId = useId();
  const who = decider.you ? "You" : outcome.decidedBy;
  const live = outcome.state === "approved" && (outcome.outcome === "done" || outcome.outcome === "done_unverified");
  const failed = outcome.state === "approved" && outcome.outcome === "failed";
  const going = outcome.state === "approved" && outcome.outcome === null;
  const yesOf = decider.you ? "your yes" : `${decider.name}'s yes`;

  const headline = live ? <XaHeadline as="h2" size="sm" quiet={<>{who} said yes at <Clock at={outcome.decidedAt} />.</>}>Live on {site}.</XaHeadline>
    : failed ? <XaHeadline as="h2" size="sm" quiet="Nothing changed on the site.">It didn&apos;t go live.</XaHeadline>
    : going ? <XaHeadline as="h2" size="sm" quiet="It's going live now.">{who} said yes.</XaHeadline>
    : outcome.state === "declined" ? <XaHeadline as="h2" size="sm" quiet="Nothing changed on the site.">{who} said not yet.</XaHeadline>
    : <XaHeadline as="h2" size="sm" quiet="Nothing changed on the site.">This change closed without a yes.</XaHeadline>;

  const sentence = live ? storySentence(outcome, who, true) : outcome.sentBy && outcome.sentAt ? <>{outcome.sentBy} sent it at <Clock at={outcome.sentAt} />.</> : null;
  const steps = storySteps(outcome, who);

  const next = live
    ? outcome.undo === "available" && onUndo ? <p className={styles.next}><XaTextLink onClick={onUndo}>{XA_YES_LABELS.undo}</XaTextLink> <span>puts it back after {yesOf}.</span></p>
      : outcome.undo === "undone" ? <p className={styles.next}>It has since been undone.</p>
      : <p className={styles.next}>To reverse it, ask Strelva to change it back. That goes to {yesOf} too.</p>
    : failed ? <XaSays links={[<XaTextLink key="help" href={helpHref}>Ask for help</XaTextLink>]}>{outcome.reason ? `The page refused it: ${outcome.reason.replace(/\.$/, "")}. ` : ""}I won&apos;t try again on my own, so nothing changes until someone asks.</XaSays>
    : going ? null
    : <p className={styles.next}><XaTextLink onClick={onChange}>Ask for a change</XaTextLink> <span>and Strelva drafts it again for {yesOf}.</span></p>;

  return <section className={styles.story} aria-label={`What happened to ${title}`}>
    {headline}
    {sentence || steps.length ? <p className={styles.storySentence}>
      {sentence}{sentence ? " " : null}
      {steps.length ? <button type="button" className={styles.quietLink} aria-expanded={open} aria-controls={stepsId} onClick={() => setOpen(value => !value)}>{open ? "Hide the steps" : "Show every step"}</button> : null}
    </p> : null}
    {steps.length ? <ol id={stepsId} className={styles.steps} hidden={!open} aria-label="Every step">
      {steps.map((step, index) => <li key={index}><Clock at={step.at} /><span>{step.text}</span></li>)}
    </ol> : null}
    {next}
  </section>;
}

/* ---------- A new System (AS6) ---------- */

/** How it works, numbered, then what Strelva assumed. The one primary is Turn it on; Change something is text. */
export function AskMaking({ item, decider, onChange }: { item: AskReceiptItemView; decider: AskDecider; onChange: () => void }) {
  const explain = item.explain;
  const tryHref = sameAppPath(item.tryHref) ?? sameAppPath(item.previewHref);
  const decideAt = sameAppPath(item.needsYou?.decideAt);
  const name = item.title ?? "it";
  return <div className={styles.making}>
    {explain ? <ol className={styles.howSteps} aria-label={`How ${name} works`}>
      {explain.steps.map((step, index) => <li key={index}><span className={styles.howNumber} aria-hidden="true">{index + 1}</span><span>{step}</span></li>)}
    </ol> : null}
    {explain?.assumed?.length ? <div className={styles.assumed}>
      <p className={styles.assumedLabel}>What it assumed</p>
      <ul>{explain.assumed.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </div> : null}
    <div className={styles.actions}>
      {decider.you && decideAt ? <XaButtonLink variant="primary" href={decideAt}>Turn it on</XaButtonLink>
        : decider.you && tryHref ? <XaButtonLink variant="primary" href={tryHref}>Try it</XaButtonLink>
        : <XaStatus kind="waits" size="sm">{`Waits for ${decider.name} to turn it on`}</XaStatus>}
      <XaTextLink onClick={onChange}>Change something</XaTextLink>
      {tryHref && (decider.you ? decideAt : true) ? <XaTextLink href={tryHref}>Try it first</XaTextLink> : null}
    </div>
  </div>;
}

/** Pebble beside the sample conversation it is adding: the scene does the job of showing what turns on. */
export function AskSample({ item }: { item: AskReceiptItemView }) {
  const sample = item.explain?.sample;
  if (!sample) return null;
  return <figure className={styles.sample} aria-label={`A sample conversation with ${item.title ?? "the new System"}`}>
    <div className={styles.sampleArt}><XaPebbleScene pose="adds" size={150} bare /></div>
    <div className={styles.phone}>
      <div className={styles.phoneHead}>
        <XaInitial name={sample.with} shape="round" size={40} />
        <strong>{sample.with}</strong>
        <small>{sample.via ? `Sample · ${sample.via}` : "Sample conversation"}</small>
      </div>
      <ol className={styles.bubbles}>
        {sample.lines.map((line, index) => <li key={index} data-from={line.from}><span className={styles.srOnly}>{line.from === "them" ? `${sample.with}: ` : "The business: "}</span>{line.text}</li>)}
      </ol>
    </div>
    <figcaption className={styles.srOnly}>A sample, written to show how it works. Not a real customer&apos;s messages.</figcaption>
  </figure>;
}

/** Pebble beside Strelva's line when it speaks in the thread. Bigger than an avatar dot so Strelva visibly speaks. */
export function AskPebble() {
  return <XaPebbleAvatar size={32} />;
}

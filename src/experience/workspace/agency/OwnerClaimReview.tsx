"use client";

import { XaButton, XaField, XaHeadline, XaLabel, XaSegmented, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "./agency-door.module.css";
import { AGENCY_LEVEL_HELP, AGENCY_SCOPE_LABELS } from "@/platform/agency-directory/contract";
import {
  CLAIM_AREAS, FOUND_FACT_LABELS, FOUND_FACT_SOURCE_LABELS,
  type ClaimArea, type ClaimAreaChoice, type ClaimReview, type ClaimReviewAcceptInput, type FoundFact,
} from "@/products/agency-clients/contracts";

/**
 * The claim review (GLOSSARY: Claim, Found fact, Prepare / Full control). The
 * owner sees what the agency found on their website, each with its source,
 * what it prepared, and decides each area for that agency before taking the
 * business. Presentation only: authority stays in the claim review API.
 */

type FactChoice = "confirm" | "change" | "remove" | "later";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const AREA_OPTIONS = [
  { value: "prepare" as const, label: "Prepare" },
  { value: "full_control" as const, label: "Full control" },
  { value: "none" as const, label: "Not this" },
];

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** One found value as plain words. */
export function foundValueText(fact: Pick<FoundFact, "entity" | "key" | "value">): string {
  const value = fact.value as Record<string, unknown> | string | unknown[] | null;
  if (fact.entity !== "fact") return text((value as Record<string, unknown> | null)?.name);
  if (fact.key === "address") return text((value as Record<string, unknown>)?.formatted) || text((value as Record<string, unknown>)?.line1);
  if (fact.key === "hours") {
    const weekly = Array.isArray((value as Record<string, unknown>)?.weekly) ? (value as { weekly: Array<{ day: number; opens: string; closes: string }> }).weekly : [];
    return weekly.map((item) => `${DAYS[item.day] ?? "?"} ${item.opens}–${item.closes}`).join(", ");
  }
  if (fact.key === "links") return Array.isArray(value) ? value.map((item) => text((item as Record<string, unknown>)?.url)).filter(Boolean).join(", ") : "";
  return text(value);
}

function editable(fact: FoundFact): boolean {
  return fact.entity !== "fact" || ["phone", "email", "description", "address"].includes(fact.key ?? "");
}

/** Where a found fact came from: the page and its words, or the source in plain words. */
function FoundSource({ fact }: { fact: FoundFact }) {
  if (fact.sourceUrl && fact.quote) return <>From <a className={styles.sourceLink} href={fact.sourceUrl} target="_blank" rel="noreferrer noopener">{sourceHost(fact.sourceUrl)}</a>: “{fact.quote}”</>;
  return <>{FOUND_FACT_SOURCE_LABELS[fact.sourceKind]}</>;
}

function changedValue(fact: FoundFact, draft: string): unknown {
  const trimmed = draft.trim();
  if (fact.entity !== "fact") return { name: trimmed };
  if (fact.key === "address") return { formatted: trimmed };
  if (fact.key === "email") return trimmed.toLowerCase();
  return trimmed;
}

function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"; } catch { return "America/New_York"; }
}

function sourceHost(url: string): string {
  try { const parsed = new URL(url); return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`; } catch { return url; }
}

export interface ClaimReviewChoices {
  facts: Record<string, FactChoice>;
  drafts: Record<string, string>;
  timeZone: string;
  areas: Record<ClaimArea, ClaimAreaChoice>;
}

export function initialClaimReviewChoices(review: ClaimReview, timeZone = deviceTimeZone()): ClaimReviewChoices {
  return {
    facts: Object.fromEntries(review.found.map((fact) => [fact.id, "confirm" as FactChoice])),
    drafts: Object.fromEntries(review.found.map((fact) => [fact.id, foundValueText(fact)])),
    timeZone,
    areas: Object.fromEntries(CLAIM_AREAS.map((area) => [area, "prepare" as ClaimAreaChoice])) as Record<ClaimArea, ClaimAreaChoice>,
  };
}

/** What the owner's choices send. "Later" is recorded as seen and stays waiting outside the record. */
export function claimReviewInput(review: ClaimReview, choices: ClaimReviewChoices): ClaimReviewAcceptInput {
  const facts: ClaimReviewAcceptInput["facts"] = [];
  for (const fact of review.found) {
    const choice = choices.facts[fact.id] ?? "later";
    if (choice === "later") { facts.push({ id: fact.id, decision: "later" }); continue; }
    if (choice === "remove") { facts.push({ id: fact.id, decision: "remove" }); continue; }
    if (fact.key === "hours") { facts.push({ id: fact.id, decision: "confirm", value: { ...(fact.value as object), timezone: choices.timeZone.trim() } }); continue; }
    if (choice === "change") { facts.push({ id: fact.id, decision: "change", value: changedValue(fact, choices.drafts[fact.id] ?? "") }); continue; }
    facts.push({ id: fact.id, decision: "confirm" });
  }
  return { facts, areas: choices.areas };
}

/** XA: the claim review. Each found fact is one open row with its choice in place; each area is one row. */
export function ClaimReviewForm({ review, choices, onChange, submitting, onAccept }: {
  review: ClaimReview; choices: ClaimReviewChoices; onChange: (next: ClaimReviewChoices) => void; submitting: boolean; onAccept: () => void;
}) {
  const taken = new Set(review.fullControlTaken);
  const hasHours = review.found.some((fact) => fact.key === "hours");
  const setFact = (id: string, choice: FactChoice) => onChange({ ...choices, facts: { ...choices.facts, [id]: choice } });
  const levels = new Set(Object.values(choices.areas));
  return <>
    <XaHeadline quiet={`Set up by ${review.agencyName}. Nothing they prepared is live yet.`}>Take ownership of {review.workspaceName}.</XaHeadline>
    <p className={styles.sentence}>Check what {review.agencyName} found and prepared, choose what they may do, then claim your business.</p>

    <section className={styles.reviewSection} aria-labelledby="claim-found">
      <XaLabel as="h2" id="claim-found">{review.found.some((fact) => fact.sourceKind !== "website_crawl") ? "We found these about your business" : "We found these on your website"}</XaLabel>
      {review.found.length ? <p className={styles.objectNote}>Confirm, change or remove each one. Anything you leave for later stays out of your business details.</p> : null}
      {review.found.length ? <ul className={styles.reviewRows} aria-label="Found about your business">{review.found.map((fact) => {
        const label = fact.entity === "fact" ? FOUND_FACT_LABELS[fact.key ?? "description"] : FOUND_FACT_LABELS[fact.entity];
        const choice = choices.facts[fact.id] ?? "confirm";
        const options = [
          { value: "confirm" as const, label: "Confirm" },
          ...(editable(fact) ? [{ value: "change" as const, label: "Change" }] : []),
          { value: "remove" as const, label: "Remove" },
          { value: "later" as const, label: "Later" },
        ];
        return <li key={fact.id} className={styles.reviewRow}>
          <div className={styles.reviewFact}>
            <span className={styles.reviewKind}>{label}</span>
            <span className={styles.reviewValue}>{foundValueText(fact)}</span>
            <span className={styles.reviewSource}><FoundSource fact={fact} /></span>
          </div>
          <XaSegmented label={`${label}: ${foundValueText(fact)}`} value={choice} options={options} onChange={(value) => setFact(fact.id, value)} />
          {choice === "change" ? <div className={styles.reviewChange}><XaField label={`Correct ${label.toLowerCase()}`} value={choices.drafts[fact.id] ?? ""} maxLength={fact.key === "description" ? 2000 : 200}
            onChange={(event) => onChange({ ...choices, drafts: { ...choices.drafts, [fact.id]: event.target.value } })} /></div> : null}
        </li>;
      })}</ul> : <p className={styles.sentence}>We didn’t find details on your website. You can add them after you claim.</p>}
      {hasHours ? <XaField label="Time zone for your hours" hint="From this device. Change it if your business is somewhere else." value={choices.timeZone} maxLength={64}
        onChange={(event) => onChange({ ...choices, timeZone: event.target.value })} /> : null}
    </section>

    <section className={styles.reviewSection} aria-labelledby="claim-prepared">
      <XaLabel as="h2" id="claim-prepared">What {review.agencyName} prepared</XaLabel>
      {review.prepared.length ? <ul className={styles.reviewRows} aria-label="Prepared drafts">{review.prepared.map((system) => <li key={system.id} className={styles.reviewLine}>
        <span>{system.name}</span><XaStatus kind="draft" size="sm">Draft</XaStatus></li>)}</ul>
        : <p className={styles.sentence}>Nothing yet. Drafts they make wait for your approval.</p>}
    </section>

    <section className={styles.reviewSection} aria-labelledby="claim-areas">
      <XaLabel as="h2" id="claim-areas">What {review.agencyName} may do</XaLabel>
      <p className={styles.objectNote}>You can change this or end their access anytime.</p>
      <ul className={styles.reviewRows}>{CLAIM_AREAS.map((area) => <li key={area} className={styles.reviewLine}>
        <span>{AGENCY_SCOPE_LABELS[area]}{taken.has(area) ? <small className={styles.reviewSource}>Another agency already has full control here.</small> : null}</span>
        <XaSegmented label={`${AGENCY_SCOPE_LABELS[area]} for ${review.agencyName}`} value={choices.areas[area]}
          options={AREA_OPTIONS.map(option => ({ ...option, disabled: option.value === "full_control" && taken.has(area) }))}
          onChange={(value) => onChange({ ...choices, areas: { ...choices.areas, [area]: value } })} />
      </li>)}</ul>
      <div className={styles.sentenceBlock}>
        {levels.has("prepare") ? <p className={styles.sentence}><strong className={styles.strong}>Prepare:</strong> {AGENCY_LEVEL_HELP.prepare}</p> : null}
        {levels.has("full_control") ? <p className={styles.sentence}><strong className={styles.strong}>Full control:</strong> {AGENCY_LEVEL_HELP.full_control} It starts when {review.agencyName} accepts it. Until then, nothing changes in that area.</p> : null}
        <p className={styles.sentence}>Payment, adding and ending agencies, your data and leaving Strelva always stay with you.</p>
      </div>
    </section>

    <XaButton variant="primary" size="lg" block busy={submitting} onClick={onAccept}>{submitting ? "Claiming…" : "Claim my business"}</XaButton>
  </>;
}

/**
 * After the claim: two optional connections as one line of text links, so the
 * way into the business stays the owner page's one action. Not choosing one is
 * skipping it; nothing is recorded either way.
 */
export function ClaimNextSteps({ workspaceId, returnTo, navigate = (url: string) => window.location.assign(url) }: {
  workspaceId: string; workspaceName: string; returnTo: string; alreadyAccepted?: boolean; navigate?: (url: string) => void;
}) {
  const id = encodeURIComponent(workspaceId);
  const google = `/workspace/google?workspaceId=${id}&returnTo=${encodeURIComponent(returnTo)}`;
  const calendar = `/api/workspace/calendar-connections/oauth/google?workspaceId=${id}`;
  return <p className={styles.sentence} aria-label="Optional next steps">
    Later, if you like: <XaTextLink onClick={() => navigate(google)}>connect Google</XaTextLink> · <XaTextLink onClick={() => navigate(calendar)}>connect your calendar</XaTextLink>. Connecting posts nothing and sends no booking.
  </p>;
}

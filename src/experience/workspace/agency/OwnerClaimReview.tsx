"use client";

import { useState } from "react";
import { StCopy, StHead, StInput, StLabel, StMono, StNotice, StPill, StPillLink, StRow, StRows, StSection, StSegmented, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { AGENCY_LEVEL_HELP, AGENCY_SCOPE_LABELS } from "@/platform/agency-directory/contract";
import {
  CLAIM_AREAS, FOUND_FACT_LABELS,
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

/** What the owner's choices send. Undecided ("later") facts are left out and stay waiting. */
export function claimReviewInput(review: ClaimReview, choices: ClaimReviewChoices): ClaimReviewAcceptInput {
  const facts: ClaimReviewAcceptInput["facts"] = [];
  for (const fact of review.found) {
    const choice = choices.facts[fact.id] ?? "later";
    if (choice === "later") continue;
    if (choice === "remove") { facts.push({ id: fact.id, decision: "remove" }); continue; }
    if (fact.key === "hours") { facts.push({ id: fact.id, decision: "confirm", value: { ...(fact.value as object), timezone: choices.timeZone.trim() } }); continue; }
    if (choice === "change") { facts.push({ id: fact.id, decision: "change", value: changedValue(fact, choices.drafts[fact.id] ?? "") }); continue; }
    facts.push({ id: fact.id, decision: "confirm" });
  }
  return { facts, areas: choices.areas };
}

export function ClaimReviewForm({ review, choices, onChange, submitting, onAccept }: {
  review: ClaimReview; choices: ClaimReviewChoices; onChange: (next: ClaimReviewChoices) => void; submitting: boolean; onAccept: () => void;
}) {
  const taken = new Set(review.fullControlTaken);
  const hasHours = review.found.some((fact) => fact.key === "hours");
  const setFact = (id: string, choice: FactChoice) => onChange({ ...choices, facts: { ...choices.facts, [id]: choice } });
  const levels = new Set(Object.values(choices.areas));
  return <>
    <StHead title={`Take ownership of ${review.workspaceName}`} meta={`Set up by ${review.agencyName}`} />
    <StCopy>Check what {review.agencyName} found and prepared, choose what they may do, then claim your business. Nothing they prepared is live yet.</StCopy>

    <StSection title="We found these on your website" meta={review.found.length ? "Confirm, change or remove each one. Anything you leave for later stays out of your business details." : undefined}>
      {review.found.length ? <StRows label="Found on your website">{review.found.map((fact) => {
        const label = fact.entity === "fact" ? FOUND_FACT_LABELS[fact.key ?? "description"] : FOUND_FACT_LABELS[fact.entity];
        const choice = choices.facts[fact.id] ?? "confirm";
        const options = [
          { value: "confirm" as const, label: "Confirm" },
          ...(editable(fact) ? [{ value: "change" as const, label: "Change" }] : []),
          { value: "remove" as const, label: "Remove" },
          { value: "later" as const, label: "Later" },
        ];
        return <StRow key={fact.id} kind={label} title={foundValueText(fact)}
          detail={<>From <StTextButton href={fact.sourceUrl} target="_blank" rel="noreferrer noopener">{sourceHost(fact.sourceUrl)}</StTextButton>: “{fact.quote}”</>}
          end={<StSegmented label={`${label}: ${foundValueText(fact)}`} value={choice} options={options} onChange={(value) => setFact(fact.id, value)} />}>
          {choice === "change" ? <StInput label={`Correct ${label.toLowerCase()}`} value={choices.drafts[fact.id] ?? ""} maxLength={fact.key === "description" ? 2000 : 200}
            onChange={(event) => onChange({ ...choices, drafts: { ...choices.drafts, [fact.id]: event.target.value } })} /> : null}
        </StRow>;
      })}</StRows> : <StCopy muted>We didn’t find details on your website. You can add them after you claim.</StCopy>}
      {hasHours ? <StInput label="Time zone for your hours" hint="From this device. Change it if your business is somewhere else." value={choices.timeZone} maxLength={64}
        onChange={(event) => onChange({ ...choices, timeZone: event.target.value })} /> : null}
    </StSection>

    <StSection title={`What ${review.agencyName} prepared`}>
      {review.prepared.length ? <StRows label="Prepared drafts">{review.prepared.map((system) => <StRow key={system.id} title={system.name}
        end={<StState kind="draft">Draft</StState>} />)}</StRows> : <StCopy muted>Nothing yet. Drafts they make wait for your approval.</StCopy>}
    </StSection>

    <StSection title={`What ${review.agencyName} may do`} meta="You can change this or end their access anytime.">
      <div className="grid gap-3">{CLAIM_AREAS.map((area) => <div key={area} className="flex flex-wrap items-center justify-between gap-3">
        <StLabel>{AGENCY_SCOPE_LABELS[area]}</StLabel>
        <StSegmented label={`${AGENCY_SCOPE_LABELS[area]} for ${review.agencyName}`} value={choices.areas[area]} options={AREA_OPTIONS}
          disabledValues={taken.has(area) ? ["full_control"] : []} disabledReason="Another agency already has full control here."
          onChange={(value) => onChange({ ...choices, areas: { ...choices.areas, [area]: value } })} />
      </div>)}</div>
      <div className="mt-4 grid gap-2 text-sm text-gray-muted">
        {levels.has("prepare") ? <p><strong className="text-warm-black">Prepare:</strong> {AGENCY_LEVEL_HELP.prepare}</p> : null}
        {levels.has("full_control") ? <p><strong className="text-warm-black">Full control:</strong> {AGENCY_LEVEL_HELP.full_control}</p> : null}
        <p>Payment, adding and ending agencies, your data and leaving Strelva always stay with you.</p>
      </div>
    </StSection>

    <StPill block busy={submitting} onClick={onAccept}>{submitting ? "Claiming…" : "Claim my business"}</StPill>
  </>;
}

/** After the claim: optional, skippable connections, then the business. */
export function ClaimNextSteps({ workspaceId, workspaceName, returnTo, alreadyAccepted, navigate = (url: string) => window.location.assign(url) }: {
  workspaceId: string; workspaceName: string; returnTo: string; alreadyAccepted?: boolean; navigate?: (url: string) => void;
}) {
  const [skipped, setSkipped] = useState<{ google: boolean; calendar: boolean }>({ google: false, calendar: false });
  const id = encodeURIComponent(workspaceId);
  const google = `/workspace/google?workspaceId=${id}&returnTo=${encodeURIComponent(returnTo)}`;
  const calendar = `/api/workspace/calendar-connections/oauth/google?workspaceId=${id}`;
  return <>
    <StHead title={`${workspaceName} is yours`} />
    <StState kind="live">You’re the owner</StState>
    <StCopy>{alreadyAccepted ? "You already claimed it with this link." : "Your choices are saved."} Two optional steps help your agency do more. Each takes a minute, and you can skip them.</StCopy>
    <StRows label="Optional next steps">
      <StRow kind="Optional" title="Connect Google" detail="Lets your agency prepare changes to your Google listing. You still approve before anything posts."
        end={skipped.google ? <StMono>Skipped</StMono> : <span className="flex flex-wrap gap-3"><StPill variant="soft" onClick={() => navigate(google)}>Connect Google</StPill><StTextButton onClick={() => setSkipped((s) => ({ ...s, google: true }))}>Skip</StTextButton></span>} />
      <StRow kind="Optional" title="Connect your calendar" detail="Shows when you’re busy so bookings don’t clash. No booking is sent."
        end={skipped.calendar ? <StMono>Skipped</StMono> : <span className="flex flex-wrap gap-3"><StPill variant="soft" onClick={() => navigate(calendar)}>Connect calendar</StPill><StTextButton onClick={() => setSkipped((s) => ({ ...s, calendar: true }))}>Skip</StTextButton></span>} />
    </StRows>
    <StPillLink href={`/workspace?workspaceId=${id}`}>Open your business</StPillLink>
    <StNotice>You can change what your agency may do, or end their access, anytime from your business.</StNotice>
  </>;
}

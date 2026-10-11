"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { actorLabel, type RecordedActor } from "@/platform/presentation/actor";
import { OwnerBrandIdentity } from "@/components/brand/OwnerBrandIdentity";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { TextInput, TextArea } from "@/components/ui/TextInput";
import { StEmpty, StHead, StNotice, StPage, StPill, StRows, StRow, StSection, StSkeleton, StSurface } from "@/components/ui/strelva/Kit";
import styles from "./try.module.css";
import { SiteDocumentTry, type SiteDocument } from "@/products/websites/client";
import type { PublicBookingSchedule } from "../../../custom-repo-starter/booking-client";

export interface PossibilityTryView {
  businessName?: string;
  proposingActor?: RecordedActor | null;
  agencyBrand?: OwnerBrand | null;
  title: string;
  intent: string;
  /** What each changed System would become, in plain words. */
  changes: string[];
  /** New Systems it would add. */
  introduces: string[];
  /** Whether the candidate takes submissions (a form or a booking page). */
  takesSubmissions: boolean;
  websiteDocument?: SiteDocument;
  bookingSchedule?: PublicBookingSchedule;
  bookingPath?: string;
  inquiryFollowUp?: {
    afterMinutes: number;
    maxAttempts: number;
    messageTemplate: string;
    checks: Array<{ label: string; status: "passed" | "failed" | "skipped"; detail: string }>;
    outboundMessages: string[];
  };
}

export type PossibilityTryState =
  | { kind: "ready"; view: PossibilityTryView }
  | { kind: "expired" }
  | { kind: "changed" };

export function PossibilityTryLoading() {
  return <Shell><StPage><StHead title="Opening your Possibility" /><StSkeleton label="Opening your Possibility" /><StSkeleton width="65%" /></StPage></Shell>;
}

export function PossibilityTryError({ onRetry }: { onRetry: () => void }) {
  return <Shell><StPage><StHead title="This Possibility could not be opened." /><StNotice tone="critical">The preview is unavailable just now. Nothing was published, sent or booked.</StNotice><div><StPill variant="soft" onClick={onRetry}>Try again</StPill></div></StPage></Shell>;
}

/**
 * "Try it" for an owner who never signs in. Shows only the candidate. Any
 * submission is a test: it goes nowhere and says so (spec behaviors 19-20).
 */
export function PossibilityTry({ state, previewContent }: { state: PossibilityTryState; previewContent?: ReactNode }) {
  if (state.kind === "expired") return <Shell><StPage><StHead title="This link has expired." /><StEmpty>Preview links expire after 14 days. Ask the sender for a fresh link. Nothing changed.</StEmpty></StPage></Shell>;
  if (state.kind === "changed") return <Shell><StPage><StHead title="This changed since we emailed you." /><StNotice tone="need">This preview no longer matches the saved Possibility. Ask the sender for the latest link. Nothing live changed.</StNotice></StPage></Shell>;
  const { view } = state;
  return <Shell>
    <header className={styles.topBar}>
      <div><strong>{view.agencyBrand?.agencyId ? view.agencyBrand.name : "Agency not recorded"} · {view.businessName || "Business not recorded"}</strong>{view.agencyBrand?.agencyId ? <OwnerBrandIdentity brand={view.agencyBrand} rail /> : null}<p>Proposed by {actorLabel(view.proposingActor)}</p></div>
      <div><strong>You’re trying a Possibility: {view.title}</strong><p>Not live. Test submissions go nowhere. Only people with this link can open it.</p></div>
      <StPill variant="soft" disabled title="Use the separate approval link in your email to make this real.">Make real</StPill>
    </header>
    <StPage width={view.websiteDocument ? "wide" : "column"}>
      {previewContent ? null : <StHead title={view.title} meta={view.intent} />}
      {previewContent}
      {view.websiteDocument ? <StSurface pad={false} label="The visitor experience, not live"><SiteDocumentTry document={view.websiteDocument} bookingSchedule={view.bookingSchedule} bookingPath={view.bookingPath} /></StSurface> : null}
      {view.inquiryFollowUp ? <InquiryFollowUpTry proposal={view.inquiryFollowUp} /> : null}
      {view.takesSubmissions && !view.websiteDocument && !previewContent ? <TestSubmission /> : null}
      {view.changes.length || view.introduces.length ? <StSection title="What it would change"><StRows>
        {view.changes.map(line => <StRow key={line} title={line} />)}
        {view.introduces.map(line => <StRow key={`new-${line}`} kind="New System" title={line} />)}
      </StRows></StSection> : null}
      <StNotice>Nothing here changes your live site, sends a message or books anything. The separate approval link in your email is where you can make real.</StNotice>
    </StPage>
  </Shell>;
}

function InquiryFollowUpTry({ proposal }: { proposal: NonNullable<PossibilityTryView["inquiryFollowUp"]> }) {
  const [showRehearsal, setShowRehearsal] = useState(false);
  return <StSection title="The follow-up you would send">
    <p className="text-sm">After {proposal.afterMinutes} minutes, with up to {proposal.maxAttempts} follow-up{proposal.maxAttempts === 1 ? "" : "s"}. Your current form, routing and Connections stay in place.</p>
    <div className="whitespace-pre-wrap break-words rounded border border-gray-border bg-surface-inset p-4 text-sm" aria-label="Complete proposed message">{proposal.messageTemplate}</div>
    <StPill variant="soft" onClick={() => setShowRehearsal(!showRehearsal)} aria-expanded={showRehearsal}>{showRehearsal ? "Hide rehearsal" : "Show rehearsal"}</StPill>
    {showRehearsal ? <div className="space-y-4" role="region" aria-label="Recorded follow-up rehearsal">
      <p className="text-sm" role="status">This recorded rehearsal used fictional inquiries. No message was sent and no real inquiry changed.</p>
      <ul className="space-y-2 text-sm">{proposal.checks.map((check, index) => <li key={index}><strong>{check.label}: {check.status}</strong><p>{check.detail}</p></li>)}</ul>
      {proposal.outboundMessages.map((message, index) => <div key={index} className="whitespace-pre-wrap break-words rounded border border-gray-border p-4 text-sm" aria-label={`Rehearsed message ${index + 1}`}>{message}</div>)}
    </div> : null}
  </StSection>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div data-dashboard data-workspace-theme="linen" className={styles.shell}>{children}</div>;
}

function TestSubmission() {
  const [sent, setSent] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSent(true); }
  return <StSurface label="Try it as a visitor">
    <StSection title="Try it as a visitor">
      {sent ? <p role="status" className="text-sm">Test submission, nobody was told. It is not kept as a real record.</p>
        : <form className="grid gap-4" onSubmit={submit}>
          <TextInput label="Name" name="name" autoComplete="off" />
          <TextInput label="Email" name="email" type="email" autoComplete="off" />
          <TextArea label="Message" name="message" rows={3} />
          <div><StPill type="submit">Send a test</StPill></div>
          <p className="text-xs text-gray-muted">This is a test. It goes nowhere.</p>
        </form>}
    </StSection>
  </StSurface>;
}

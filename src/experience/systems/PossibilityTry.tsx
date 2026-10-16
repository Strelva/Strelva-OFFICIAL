"use client";

/**
 * "Try it" for an owner who never signs in (systems-experience spec behaviors
 * 19-20), designed in XA from O3 (the prepared change) and C1 (whose door
 * this is). The candidate itself is the page's one object: the site, the
 * form or the follow-up exactly as visitors would meet it, marked Not live.
 * Beside it, the decision names who proposed it and holds the one yes,
 * which stays disabled here: approval happens through the separate link in
 * the owner's email. Any submission is a test that goes nowhere and says so.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { actorPresentation, type RecordedActor } from "@/platform/presentation/actor";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { XA_YES_LABELS } from "@/platform/presentation/place-labels";
import { XaButton, XaDecision, XaField, XaHeadline, XaInitial, XaLabel, XaPage, XaSays, XaStatus, XaSystemTile, XaTextArea, XaWorking, XaYes } from "@/components/ui/strelva/Xa";
import { XaEntryFelt, XaEntryFrame } from "@/components/ui/strelva/xa/entry";
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

type Mode = { mode?: "light" | "dark" };

export function PossibilityTryLoading({ mode }: Mode = {}) {
  return <XaEntryFrame mode={mode} phoneArt="adds" felt={<XaEntryFelt pose="adds" title="Setting up your test copy.">Only the candidate opens here. Nothing live is read or written.</XaEntryFelt>}>
    <XaHeadline quiet="This takes a moment.">Opening the Possibility.</XaHeadline>
    <XaWorking title="Opening the Possibility" steps={[{ id: "open", label: "Loading the candidate", state: "active" }]} />
  </XaEntryFrame>;
}

export function PossibilityTryError({ onRetry, mode }: { onRetry: () => void } & Mode) {
  return <XaEntryFrame mode={mode} phoneArt="fixing" felt={<XaEntryFelt pose="fixing" title="Your live site is untouched.">The preview failed to open. Nothing was published, sent or booked.</XaEntryFelt>}>
    <XaHeadline quiet="Nothing was published, sent or booked.">This Possibility could not be opened.</XaHeadline>
    <XaSays>The preview is unavailable just now. Try again in a moment.</XaSays>
    <div><XaButton variant="secondary" onClick={onRetry}>Try again</XaButton></div>
  </XaEntryFrame>;
}

function Unavailable({ title, quiet, says, mode }: { title: string; quiet: string; says: string } & Mode) {
  return <XaEntryFrame mode={mode} phoneArt="fixing" felt={<XaEntryFelt pose="fixing" title="Your live site is untouched.">A preview link only ever shows a test copy.</XaEntryFelt>}>
    <XaHeadline quiet={quiet}>{title}</XaHeadline>
    <XaSays>{says}</XaSays>
  </XaEntryFrame>;
}

export function PossibilityTry({ state, previewContent, mode }: { state: PossibilityTryState; previewContent?: ReactNode } & Mode) {
  if (state.kind === "expired") return <Unavailable mode={mode} title="This link has expired." quiet="Preview links last 14 days. Nothing changed." says="Ask whoever sent it for a fresh link." />;
  if (state.kind === "changed") return <Unavailable mode={mode} title="This changed since we emailed you." quiet="Nothing live changed." says="This preview no longer matches the saved Possibility. Ask the sender for the latest link." />;
  const { view } = state;
  const proposer = actorPresentation(view.proposingActor);
  const agency = view.agencyBrand?.agencyId ? view.agencyBrand : null;
  const object = view.websiteDocument
    ? <section className={styles.site} aria-label="The visitor experience, not live"><SiteDocumentTry document={view.websiteDocument} bookingSchedule={view.bookingSchedule} bookingPath={view.bookingPath} /></section>
    : view.inquiryFollowUp ? <InquiryFollowUpTry proposal={view.inquiryFollowUp} />
      : view.takesSubmissions && !previewContent ? <TestSubmission businessName={view.businessName} /> : null;
  return <div data-workspace-mode={mode} className={styles.modeRoot}>
    <div data-workspace-theme="linen" className={styles.shell}>
      <header className={styles.topBar}>
        <div className={styles.who}>
          <XaInitial name={view.businessName || "?"} size={30} />
          <div><strong>{view.businessName || "Business identity unavailable"}</strong>{agency ? <p data-agency-brand={agency.agencyId ?? undefined}>{agency.name} · Runs on Strelva</p> : null}</div>
        </div>
        <XaStatus kind="draft" size="sm">Not live · only people with this link can open it</XaStatus>
      </header>
      <main className={styles.layout}>
        <div className={styles.main}>
          <XaHeadline quiet={view.intent || undefined}>{view.title}</XaHeadline>
          {previewContent}
          {object}
        </div>
        <aside className={styles.aside}>
          <XaDecision label="What this would do" status={<XaStatus kind="waits">Waits for your yes</XaStatus>}
            meta={proposer.name ? `Proposed by ${proposer.name}${proposer.credit ? ` · ${proposer.credit}` : ""}` : "Who proposed this wasn’t recorded"}
            yes={<XaYes state="waiting" onYes={() => {}} shortcut={false} yesLabel={XA_YES_LABELS.yes}
              disabledReason="Use the approval link in your email to put it live. Nothing here changes your live site, sends a message or books anything." />}>
            {view.changes.length || view.introduces.length ? <div className={styles.changes}>
              <XaLabel as="h2">What it would change</XaLabel>
              <ul>
                {view.changes.map(line => <li key={line}>{line}</li>)}
                {view.introduces.map(line => <li key={`new-${line}`} className={styles.newSystem}><XaSystemTile kind={null} size={26} /><span>{line}<small>New System</small></span></li>)}
              </ul>
            </div> : <p className={styles.quiet}>Test submissions go nowhere.</p>}
          </XaDecision>
        </aside>
      </main>
    </div>
  </div>;
}

function InquiryFollowUpTry({ proposal }: { proposal: NonNullable<PossibilityTryView["inquiryFollowUp"]> }) {
  const [showRehearsal, setShowRehearsal] = useState(false);
  const hours = proposal.afterMinutes % 60 === 0 ? proposal.afterMinutes / 60 : null;
  return <section className={styles.followUp} aria-label="The follow-up you would send">
    <p className={styles.quiet}>Sent {hours ? `${hours} hour${hours === 1 ? "" : "s"}` : `${proposal.afterMinutes} minutes`} after an unanswered inquiry, up to {proposal.maxAttempts} time{proposal.maxAttempts === 1 ? "" : "s"}. Your current form, routing and Connections stay in place.</p>
    <XaPage address="Follow-up email" flat label="Complete proposed message"><p className={styles.message}>{proposal.messageTemplate}</p></XaPage>
    <div><XaButton variant="secondary" size="sm" onClick={() => setShowRehearsal(!showRehearsal)} aria-expanded={showRehearsal}>{showRehearsal ? "Hide the rehearsal" : "See the rehearsal"}</XaButton></div>
    {showRehearsal ? <div className={styles.rehearsal} role="region" aria-label="Recorded follow-up rehearsal">
      <p role="status" className={styles.quiet}>This recorded rehearsal used fictional inquiries. No message was sent and no real inquiry changed.</p>
      <ul>{proposal.checks.map((check, index) => <li key={index}><span className={styles.checkName}>{check.label}</span>{check.status === "passed" ? <span className={styles.quiet}> · Passed</span> : <XaStatus kind={check.status === "failed" ? "down" : "draft"} size="sm">{check.status === "failed" ? "Failed" : "Skipped"}</XaStatus>}<p className={styles.quiet}>{check.detail}</p></li>)}</ul>
      {proposal.outboundMessages.map((message, index) => <XaPage key={index} address={`Rehearsed message ${index + 1}`} flat label={`Rehearsed message ${index + 1}`}><p className={styles.message}>{message}</p></XaPage>)}
    </div> : null}
  </section>;
}

function TestSubmission({ businessName }: { businessName?: string }) {
  const [sent, setSent] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSent(true); }
  return <XaPage address={`${businessName || "Your"} form · test copy`} label="Try it as a visitor">
    {sent ? <p role="status" className={styles.quiet}>Test submission, nobody was told. It is not kept as a real record.</p>
      : <form className={styles.form} onSubmit={submit}>
        <XaField label="Name" name="name" autoComplete="off" />
        <XaField label="Email" name="email" type="email" autoComplete="off" />
        <XaTextArea label="Message" name="message" rows={3} />
        <div><XaButton type="submit" variant="secondary">Send a test</XaButton></div>
        <p className={styles.quiet}>This is a test. It goes nowhere.</p>
      </form>}
  </XaPage>;
}

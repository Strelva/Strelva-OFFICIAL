"use client";
import { OwnerBrandIdentity } from "@/components/brand/OwnerBrandIdentity";
import { STRELVA_BRAND } from "@/platform/infra/agency-brand";

import { useState, type FormEvent, type Ref } from "react";
import { Check } from "lucide-react";
import { XaButton, XaButtonLink, XaField, XaLabel, XaSays, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "./answer-check.module.css";
import { attributedAiVisibility } from "./attribution";
import type { AiVisibilityResult, Signal } from "./contracts";

interface AiVisibilityResultViewProps {
  result: AiVisibilityResult;
  scanId: string | null;
  shareUrl: string | null;
  workspaceEnabled?: boolean;
  onReset: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
  sample?: { prompt: string; lines: { text: string; wrong?: boolean }[]; explanation: string };
  continuationHref?: string;
  embedded?: boolean;
  /** Whether this view owns the screen's one ink pill. The combined check gives it to the website fix when there is one. */
  primaryAction?: boolean;
  /** The combined check shows readability on the felt Page instead. */
  showSignals?: boolean;
}

type MonitorState = "idle" | "saving" | "saved" | "error";

/** Change legacy model terminology for display only; saved contracts stay unchanged. */
export function publicCopy(value: string) {
  return ownerPaths(value).replace(/\bAI[- ]crawler/gi, "assistant crawler").replace(/\bAI\b/g, "assistants").replace(/\bagent(s?)\b/gi, (_, plural: string) => `assistant${plural.toLowerCase()}`).replace(/\bautomation\b/gi, "scheduled work").replace(/\bworkflow\b/gi, "process").replace(/\btask\b/gi, "work");
}

/** A site path read as the page it names: "on /contact" becomes "on your contact page". */
export function ownerPaths(value: string) {
  return value.replace(/\b(on|at|from|in) \/([a-z][a-z0-9-]*)\/?(?![\w/]|\.\w)/gi, (_, word: string, path: string) => `${word} your ${path.replace(/-/g, " ")} page`)
    .replace(/\b(on|at|from|in) \/(?![\w/]|\.\w)/gi, (_, word: string) => `${word} your home page`);
}

/**
 * Ask for this check again every month: the one email field after a result.
 * The existing monitor endpoint records the request; nothing is sent from here.
 */
export function AiVisibilityFollowUp({ scanId, agencyName }: { scanId: string; agencyName?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<MonitorState>("idle");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("saving"); setError("");
    try {
      const response = await fetch(`/api/ai-visibility/${scanId}/monitor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "We couldn't save your request.");
      }
      setState("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save your request.");
      setState("error");
    }
  }
  return <section className={styles.stack} aria-label="Check every month">
    <p className={styles.muted}>{agencyName ? `Want ${agencyName} to run recurring Gemini checks for you? Leave your email.` : "Want this checked every month? Leave your email."}</p>
    {state === "saved" ? <p className={styles.saved} role="status">{agencyName ? `Your request was sent to ${agencyName}.` : "Your interest is saved."}</p>
      : <form onSubmit={submit} className={styles.address}><XaField label="Your email" type="email" required value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" error={error || undefined} /><XaButton variant="secondary" type="submit" busy={state === "saving"}>{agencyName ? "Send request" : "Keep me posted"}</XaButton></form>}
  </section>;
}

/** What Gemini could read on the site, labelled in place: found reads quietly, missing reads clay. */
export function AiVisibilitySignals({ signals }: { signals: readonly Signal[] }) {
  return <ul className={styles.signals} aria-label="Website readability">
    {signals.map(signal => <li key={signal.id} data-pass={signal.pass || undefined}>
      <span className={styles.signalMark} aria-hidden="true">{signal.pass ? <Check size={14} strokeWidth={2.4} /> : null}</span>
      <span><span className={styles.signalLabel}>{publicCopy(signal.label)}</span><span className={styles.signalState}>{signal.pass ? " · Found" : " · Missing"}</span><span className={styles.signalDetail}>{publicCopy(signal.detail)}</span></span>
    </li>)}
  </ul>;
}

export function AiVisibilityResultView({ result: raw, scanId, shareUrl, workspaceEnabled = false, onReset, headingRef, sample, continuationHref, embedded = false, primaryAction = !embedded, showSignals = true }: AiVisibilityResultViewProps) {
  const result = attributedAiVisibility(raw, raw.agency);
  const agency = result.agency;
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  const measured = result.readinessMeasured ?? result.measurementStatus !== "unavailable";

  async function handleShare() {
    const url = shareUrl || (scanId ? new URL(`/ai-visibility/${encodeURIComponent(scanId)}`, window.location.origin).href : window.location.href);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${result.business} · Gemini business check`,
          text: publicCopy(result.verdict),
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setShareStatus("copied");
      } catch {
        setShareStatus("idle");
      }
    }
  }

  const nextHref = continuationHref || (scanId && workspaceEnabled ? `/workspace?save=${encodeURIComponent(scanId)}` : agency?.contactUrl || `/access-request?ref=ai-visibility${scanId ? `&scan=${encodeURIComponent(scanId)}` : ""}`);
  const Heading = embedded ? "h3" : "h1";
  const wrong = sample ? sample.lines.filter(line => line.wrong).length : 0;
  return <div className={styles.result}>
    {agency && !embedded ? <OwnerBrandIdentity brand={{ ...STRELVA_BRAND, agencyId: agency.workspaceId, name: agency.name, logoUrl: agency.brand.logoUrl, accentColor: agency.brand.accentColor ?? STRELVA_BRAND.accentColor, replyTo: agency.replyTo ?? null }} /> : null}
    <div className={styles.stack}>
      {result.url && !embedded ? <XaLabel>{result.url}</XaLabel> : null}
      <header className={styles.head}>
        <Heading ref={headingRef} tabIndex={headingRef ? -1 : undefined} className={styles.heading} data-embedded={embedded || undefined}>{sample ? `Gemini gets ${wrong} things wrong about ${result.business}.` : `Gemini check for ${result.business}`}</Heading>
        {sample ? null : <p className={styles.verdict}>{publicCopy(result.verdict)}</p>}
      </header>
      <figure className={styles.answer} aria-label="Gemini result">
        {sample ? <><XaLabel>We asked: “{sample.prompt}”</XaLabel><blockquote className={styles.quote}>{sample.lines.map((line, index) => <p key={index} className={line.wrong ? styles.wrong : undefined}>{line.text}</p>)}</blockquote><p className={styles.muted}>{sample.explanation}</p></>
          : <><XaLabel>{result.citation.probed ? "One sampled Gemini answer" : "Gemini answer unavailable"}</XaLabel><p className={styles.answerText}>{publicCopy(result.citation.note)}</p></>}
        <figcaption className={styles.muted}>One answer, sampled once. Asking again can give a different one.</figcaption>
      </figure>
      {result.measurementStatus === "unavailable" ? <XaSays>{publicCopy(result.measurementNote || "This check could not measure the website or a Gemini answer.")}</XaSays> : result.measurementStatus === "partial" ? <p className={styles.muted}>{publicCopy(result.measurementNote || "Only part of this check completed.")}</p> : null}
      <section className={styles.stack} aria-labelledby="gemini-fix">
        <XaLabel as="h3" id="gemini-fix">{measured ? "The one fix that matters most" : "Next step"}</XaLabel>
        <p className={styles.answerText}>{publicCopy(result.topFix)}</p>
        <div className={styles.actions}>
          <XaButtonLink href={nextHref} variant={primaryAction ? "primary" : "secondary"}>{scanId && workspaceEnabled || continuationHref ? "Start with this fix" : "Get this fixed"}</XaButtonLink>
          {scanId ? <XaTextLink onClick={() => void handleShare()}>{shareStatus === "copied" ? "Link copied" : "Send this to whoever runs your site"}</XaTextLink> : null}
        </div>
        {scanId && workspaceEnabled && !continuationHref ? <p className={styles.muted}>Start your business with its website and this check saved. You review any change before it goes live.</p> : null}
      </section>
      {showSignals ? <section className={styles.stack} aria-labelledby="gemini-readability">
        <XaLabel as="h3" id="gemini-readability">What Gemini can read about {result.business}</XaLabel>
        {result.signals.length ? <AiVisibilitySignals signals={result.signals} /> : <p className={styles.muted}>Website readability was not measured. Try a reachable public website.</p>}
      </section> : null}
      {result.agentBookingAvailability ? <section className={styles.stack} aria-labelledby="gemini-booking">
        <XaLabel as="h3" id="gemini-booking">Can an assistant request a booking through Strelva?</XaLabel>
        <XaStatus kind={result.agentBookingAvailability.status === "yes" ? "live" : "draft"} size="sm">{result.agentBookingAvailability.status === "yes" ? "Available" : result.agentBookingAvailability.status === "no" ? "Not available" : "Not verified"}</XaStatus>
        <p className={styles.muted}>{publicCopy(result.agentBookingAvailability.detail)}</p>
      </section> : null}
    </div>
    {scanId && !continuationHref ? <AiVisibilityFollowUp scanId={scanId} agencyName={agency?.name} /> : null}
    <div><XaTextLink onClick={onReset}>Check another business</XaTextLink></div>
  </div>;
}

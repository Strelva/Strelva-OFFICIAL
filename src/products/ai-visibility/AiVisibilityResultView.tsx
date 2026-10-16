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
  return value.replace(/\bAI[- ]crawler/gi, "assistant crawler").replace(/\bAI\b/g, "assistants").replace(/\bagent(s?)\b/gi, (_, plural: string) => `assistant${plural.toLowerCase()}`).replace(/\bautomation\b/gi, "scheduled work").replace(/\bworkflow\b/gi, "process").replace(/\btask\b/gi, "work");
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
  const [email, setEmail] = useState("");
  const [monitorState, setMonitorState] = useState<MonitorState>("idle");
  const [monitorError, setMonitorError] = useState("");
  const measured = result.readinessMeasured ?? result.measurementStatus !== "unavailable";

  async function handleShare() {
    const url = shareUrl || (scanId ? new URL(`/ai-visibility/${encodeURIComponent(scanId)}`, window.location.origin).href : window.location.href);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${result.business} · Gemini business check`,
          text: measured ? `${result.grade} · ${result.score}/100` : "Measurement unavailable",
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

  async function handleMonitor(event: FormEvent) {
    event.preventDefault();
    if (!scanId) return;
    setMonitorState("saving");
    setMonitorError("");
    try {
      const response = await fetch(`/api/ai-visibility/${scanId}/monitor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "We couldn't save your request.");
      }
      setMonitorState("saved");
    } catch (cause) {
      setMonitorError(cause instanceof Error ? cause.message : "We couldn't save your request.");
      setMonitorState("error");
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
          : <><XaLabel>{result.citation.probed ? "One sampled Gemini answer" : "Gemini answer unavailable"}</XaLabel><p className={styles.answerText}>{publicCopy(result.citation.note)}</p><p className={styles.muted}>The saved check records whether Gemini named your business. Its full answer and claim-by-claim accuracy were not saved.</p></>}
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
        <XaLabel as="h3" id="gemini-readability">Can Google read your site?</XaLabel>
        {result.signals.length ? <AiVisibilitySignals signals={result.signals} /> : <p className={styles.muted}>Website readability was not measured. Try a reachable public website.</p>}
      </section> : null}
      {measured && !embedded ? <p className={styles.muted}>Website check: {result.grade} · {result.score}/100</p> : null}
      {result.agentBookingAvailability ? <section className={styles.stack} aria-labelledby="gemini-booking">
        <XaLabel as="h3" id="gemini-booking">Can an assistant request a booking through Strelva?</XaLabel>
        <XaStatus kind={result.agentBookingAvailability.status === "yes" ? "live" : "draft"} size="sm">{result.agentBookingAvailability.status === "yes" ? "Available" : result.agentBookingAvailability.status === "no" ? "Not available" : "Not verified"}</XaStatus>
        <p className={styles.muted}>{publicCopy(result.agentBookingAvailability.detail)}</p>
      </section> : null}
    </div>
    {scanId && !continuationHref ? <section className={styles.stack} aria-labelledby="gemini-follow">
      <XaLabel as="h3" id="gemini-follow">{agency ? `Contact ${agency.name}` : "Recurring checks pilot"}</XaLabel>
      <p className={styles.muted}>{agency ? `Leave your email to ask ${agency.name} about recurring Gemini checks.` : "Recurring checks are a pilot. Leave your email to register your interest."}</p>
      {monitorState === "saved" ? <p className={styles.saved} role="status">{agency ? `Your request was sent to ${agency.name}.` : "Your interest is saved."}</p>
        : <form onSubmit={handleMonitor} className={styles.address}><XaField label="Your email" type="email" required value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" error={monitorError || undefined} /><XaButton variant="secondary" type="submit" busy={monitorState === "saving"}>{agency ? "Send request" : "Join pilot"}</XaButton></form>}
    </section> : null}
    <div><XaTextLink onClick={onReset}>Check another business</XaTextLink></div>
  </div>;
}

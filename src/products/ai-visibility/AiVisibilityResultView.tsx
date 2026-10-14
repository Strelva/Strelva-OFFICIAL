"use client";
import { OwnerBrandIdentity } from "@/components/brand/OwnerBrandIdentity";
import { STRELVA_BRAND } from "@/platform/infra/agency-brand";

import { useState, type FormEvent, type Ref } from "react";
import { StCopy, StEmpty, StTextField, StHead, StLabel, StMono, StNotice, StPill, StPillLink, StRow, StRows, StSection, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./answer-check.module.css";
import { attributedAiVisibility } from "./attribution";
import type { AiVisibilityResult } from "./contracts";

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
}

type MonitorState = "idle" | "saving" | "saved" | "error";

/** Change legacy model terminology for display only; saved contracts stay unchanged. */
function publicCopy(value: string) {
  return value.replace(/\bAI[- ]crawler/gi, "assistant crawler").replace(/\bAI\b/g, "assistants").replace(/\bagent(s?)\b/gi, (_, plural: string) => `assistant${plural.toLowerCase()}`).replace(/\bautomation\b/gi, "scheduled work").replace(/\bworkflow\b/gi, "process").replace(/\btask\b/gi, "work");
}

export function AiVisibilityResultView({ result: raw, scanId, shareUrl, workspaceEnabled = false, onReset, headingRef, sample, continuationHref, embedded = false }: AiVisibilityResultViewProps) {
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
  return <>
    {agency && !embedded ? <OwnerBrandIdentity brand={{ ...STRELVA_BRAND, agencyId: agency.workspaceId, name: agency.name, logoUrl: agency.brand.logoUrl, accentColor: agency.brand.accentColor ?? STRELVA_BRAND.accentColor, replyTo: agency.replyTo ?? null }} /> : null}
    <div className={styles.split}>
      <div className={styles.stack}>
        {result.url ? <StMono>{result.url}</StMono> : null}
        <StHead as={embedded ? "h3" : "h1"} titleRef={headingRef} title={sample ? `Gemini gets ${sample.lines.filter(line => line.wrong).length} things wrong about ${result.business}.` : `Gemini check for ${result.business}`} meta={sample ? undefined : publicCopy(result.verdict)} />
        <StSurface label="Gemini result"><div className={styles.stack}>
          {sample ? <><StLabel>We asked: “{sample.prompt}”</StLabel><blockquote className={styles.quote}>{sample.lines.map((line, index) => <p key={index} className={line.wrong ? styles.wrong : undefined}>{line.text}</p>)}</blockquote><StCopy muted>{sample.explanation}</StCopy></> : <><StLabel>{result.citation.probed ? "One sampled Gemini answer" : "Gemini answer unavailable"}</StLabel><StCopy>{publicCopy(result.citation.note)}</StCopy><StCopy muted>The saved check records whether Gemini named your business. Its full answer and claim-by-claim accuracy were not saved.</StCopy></>}
          <StCopy muted>One answer, sampled once. Asking again can give a different one.</StCopy>
        </div></StSurface>
        {result.measurementStatus === "unavailable" ? <StNotice tone="need">{publicCopy(result.measurementNote || "This check could not measure the website or a Gemini answer.")}</StNotice> : result.measurementStatus === "partial" ? <StNotice>{publicCopy(result.measurementNote || "Only part of this check completed.")}</StNotice> : null}
        <StSection title={measured ? "The one fix that matters most" : "Next step"}><StCopy>{publicCopy(result.topFix)}</StCopy><div className={styles.actions}><StPillLink href={nextHref}>{scanId && workspaceEnabled || continuationHref ? "Start with this fix" : "Get this fixed"}</StPillLink>{scanId ? <StTextButton onClick={handleShare}>{shareStatus === "copied" ? "Link copied" : "Send this to whoever runs your site"}</StTextButton> : null}</div>{scanId && workspaceEnabled && !continuationHref ? <StCopy muted>Start your business with its website and this check saved. You review any change before it goes live.</StCopy> : null}</StSection>
      </div>
      <div className={styles.stack}>
        <StSection title="Can Google read your site?">{result.signals.length ? <StRows label="Website readability">{result.signals.map(signal => <StRow key={signal.id} title={publicCopy(signal.label)} detail={publicCopy(signal.detail)} lead={<StState kind={signal.pass ? "live" : "down"}>{signal.pass ? "Found" : "Missing"}</StState>} />)}</StRows> : <StEmpty>Website readability was not measured. Try a reachable public website.</StEmpty>}</StSection>
        {measured ? <StCopy muted>Website check: <StMono>{result.grade} · {result.score}/100</StMono></StCopy> : null}
        {result.agentBookingAvailability ? <StSection title="Can an assistant request a booking through Strelva?"><StState kind={result.agentBookingAvailability.status === "yes" ? "live" : "draft"}>{result.agentBookingAvailability.status === "yes" ? "Available" : result.agentBookingAvailability.status === "no" ? "Not available" : "Not verified"}</StState><StCopy muted>{publicCopy(result.agentBookingAvailability.detail)}</StCopy></StSection> : null}
      </div>
    </div>
    {scanId && !continuationHref ? <StSection title={agency ? `Contact ${agency.name}` : "Recurring checks pilot"}><StCopy muted>{agency ? `Leave your email to ask ${agency.name} about recurring Gemini checks.` : "Recurring checks are a pilot. Leave your email to register your interest."}</StCopy>{monitorState === "saved" ? <StNotice>{agency ? `Your request was sent to ${agency.name}.` : "Your interest is saved."}</StNotice> : <form onSubmit={handleMonitor} className={styles.address}><StTextField label="Your email" type="email" required value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /><StPill variant="soft" type="submit" busy={monitorState === "saving"}>{agency ? "Send request" : "Join pilot"}</StPill></form>}{monitorError ? <StNotice tone="critical">{monitorError}</StNotice> : null}</StSection> : null}
    <StTextButton onClick={onReset}>Check another business</StTextButton>
  </>;
}

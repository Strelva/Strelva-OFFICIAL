"use client";

import { useEffect, useState, type ReactNode } from "react";
import { readRequestDraft } from "@/experience/workspace/request-draft";
import { XaButtonLink, XaComposer, XaEmpty, XaHeadline, XaLede, XaMark, XaTextLink } from "@/components/ui/strelva/Xa";
import type { FoundFact } from "@/products/getting-started/contracts";
import styles from "./first-day.module.css";

function greeting(now: Date, name: string | null): string {
  const hour = now.getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}.` : `${part}.`;
}

/** One waiting found fact as the question it asks the owner. */
function waitingQuestion(fact: FoundFact): string {
  return `Check your ${fact.label.toLowerCase()}: “${fact.display}”`;
}

/**
 * Day one at a business (XA · B6): Home right after getting started, while
 * Getting started is still open for the owner. The greeting, one sentence
 * about where things stand, and the composer carrying the one detail still
 * waiting for the owner. That is the screen's one dominant element.
 *
 * There is no activity column: nothing on this screen is invented. When a
 * recorded-events feed exists, its sentences can join under the composer.
 * BusinessHome mounts this behind ownerGettingStartedHref for a business with
 * nothing made, asked or saved yet.
 */
export function FirstDay({ ownerName, businessName, waiting, checkHref, state = "ready", onAsk, initialAsk = "", draftKey, now = new Date(), retryHref, onRetry }: {
  ownerName: string | null;
  businessName: string;
  /** Found facts still waiting for the owner (GettingStartedBusiness.waiting). Null when they couldn't be read. */
  waiting: readonly FoundFact[] | null;
  /** Getting started, where waiting facts are ticked. */
  checkHref: string;
  state?: "ready" | "loading" | "error";
  onAsk?: (words: string) => void;
  /** The owner's first ask, carried from setup, ready to send or change. */
  initialAsk?: string;
  /** Where setup left the first ask (request-draft), read after mount so server and browser agree. */
  draftKey?: string;
  now?: Date;
  retryHref?: string;
  onRetry?: () => void;
}) {
  const [ask, setAsk] = useState(initialAsk);
  useEffect(() => {
    if (!draftKey) return;
    try { const kept = readRequestDraft(window.sessionStorage, draftKey); if (kept) setAsk(current => current || kept); } catch { /* No storage: the composer starts empty. */ }
  }, [draftKey]);
  const first = waiting?.[0];
  if (state === "error") return <div className={styles.center}>
    <XaEmpty pose="fixing" title={`${businessName} did not load just now.`} job="Nothing about your business changed. Try again in a moment."
      action={retryHref ? <XaButtonLink href={retryHref} variant="primary">Try again</XaButtonLink> : undefined} />
  </div>;
  const lede: ReactNode = state === "loading" ? `Opening ${businessName}.`
    : waiting === null ? <>{businessName} is set up. <XaTextLink href={checkHref}>See what waits for you</XaTextLink></>
    : first ? `${businessName} is set up. ${waiting.length === 1 ? "One detail waits for you." : `${waiting.length} details wait for you.`}`
    : `${businessName} is set up. Nothing needs you yet.`;
  return <div className={styles.day} aria-busy={state === "loading" || undefined}>
    <div className={styles.lead}>
      <XaMark size={40} />
      <div className={styles.greeting}>
        <XaHeadline size="lg">{greeting(now, ownerName)}</XaHeadline>
        <XaLede>{lede}</XaLede>
      </div>
      <XaComposer value={ask} onChange={setAsk} onSubmit={() => { if (!ask.trim()) return; onAsk?.(ask.trim()); setAsk(""); }} placeholder="Ask Strelva for anything" disabled={state === "loading" || !onAsk}
        scope={{ label: businessName }}
        waiting={first ? { kicker: "Waits for you · found on your site", title: waitingQuestion(first), from: { pebble: true }, action: <XaButtonLink href={checkHref} size="sm">Check it</XaButtonLink> } : undefined} />
      {waiting === null && onRetry ? <p className={styles.quiet}>Details found on your site could not be checked just now. <XaTextLink onClick={onRetry}>Check again</XaTextLink></p> : null}
    </div>
  </div>;
}

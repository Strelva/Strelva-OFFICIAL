"use client";

import { useState, type ReactNode } from "react";
import { XaButtonLink, XaComposer, XaEmpty, XaHeadline, XaLede, XaMark, XaPebbleScene, XaWorking, type XaWorkingStep } from "@/components/ui/strelva/Xa";
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
 * Day one at a business (XA · B6): Today right after getting started. The
 * greeting, one sentence about where things stand, the composer carrying the
 * one detail still waiting for the owner, and beside it what Pebble has
 * actually done. Every line on the right is a recorded event from the caller,
 * never a timer.
 *
 * Built by lane XA-1 against the real Getting started types. Today itself
 * (BusinessHome) belongs to XA-3; this is the day-one state it renders.
 */
export function FirstDay({ ownerName, businessName, waiting, checkHref, events, state = "ready", onAsk, now = new Date(), retryHref }: {
  ownerName: string | null;
  businessName: string;
  /** Found facts still waiting for the owner (GettingStartedBusiness.waiting). */
  waiting: readonly FoundFact[];
  /** Getting started, where waiting facts are ticked. */
  checkHref: string;
  /** What was done, newest last, each naming who did it. */
  events: readonly XaWorkingStep[];
  state?: "ready" | "loading" | "error";
  onAsk?: (words: string) => void;
  now?: Date;
  retryHref?: string;
}) {
  const [ask, setAsk] = useState("");
  const first = waiting[0];
  if (state === "error") return <div className={styles.center}>
    <XaEmpty pose="fixing" title={`${businessName} did not load just now.`} job="Pebble is trying again. Nothing about your business changed."
      action={retryHref ? <XaButtonLink href={retryHref} variant="primary">Try again</XaButtonLink> : undefined} />
  </div>;
  const lede: ReactNode = state === "loading" ? `Opening ${businessName}.` : first
    ? `${businessName} is set up. ${waiting.length === 1 ? "One detail waits for you." : `${waiting.length} details wait for you.`}`
    : `${businessName} is set up. Nothing needs you yet.`;
  return <div className={styles.split} aria-busy={state === "loading" || undefined}>
    <div className={styles.lead}>
      <XaMark size={40} />
      <div className={styles.greeting}>
        <XaHeadline size="lg">{greeting(now, ownerName)}</XaHeadline>
        <XaLede>{lede}</XaLede>
      </div>
      <XaComposer value={ask} onChange={setAsk} onSubmit={() => { if (!ask.trim()) return; onAsk?.(ask.trim()); setAsk(""); }} placeholder="Ask Strelva for anything" disabled={state === "loading" || !onAsk}
        scope={{ label: businessName, state: "live" }}
        waiting={first ? { kicker: "Waits for you · found on your site", title: waitingQuestion(first), from: { pebble: true }, action: <XaButtonLink href={checkHref} size="sm">Check it</XaButtonLink> } : undefined} />
    </div>
    <aside className={styles.side} aria-label="What Pebble has done">
      <XaPebbleScene pose="resting" size={300} label="Pebble resting beside the bookings calendar" />
      {events.length ? <div className={styles.trail}><XaWorking state={events.some(step => step.state === "active") ? "working" : "done"} title={events.some(step => step.state === "active") ? "Pebble is still at it" : "Pebble is done for now"} steps={events} /></div> : null}
    </aside>
  </div>;
}

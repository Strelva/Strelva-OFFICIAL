"use client";
/**
 * XA · E6, Today on the phone (October 15, 2026). The owner's morning in one
 * thumb's reach: who it is for, the one thing that waits (inside the composer,
 * with whoever prepared it), then what is running. Rows show a quiet fact;
 * status appears only as an exception (Draft, Something is off).
 *
 * Reads the real Needs you state (`useNeedsYou`) and the business's real
 * Systems (`SystemView`). Deciding stays where it is decided today: Review
 * opens the item, and the yes happens there (XaYes or the signed email page).
 * Phone shell (header, account) comes from StrelvaShell's E6 header.
 */
import { useState } from "react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaButton, XaComposer, XaEmpty, XaHeadline, XaLabel, XaLede, XaPebbleScene, XaRow, XaRows, XaStatus, XaSystemTile } from "@/components/ui/strelva/Xa";
import { actorPresentation } from "@/platform/presentation/actor";
import { STATE_LABELS } from "@/platform/presentation/place-labels";
import type { OwnerDecision } from "@/platform/needs-you/contracts";
import type { SystemView } from "@/experience/systems/model";
import type { NeedsYouState } from "./useNeedsYou";
import styles from "./owner-phone-today.module.css";

export interface OwnerPhoneTodayProps {
  /** How Strelva greets the owner: "Dr. Lin". */
  greetingName: string;
  business: string;
  needs: NeedsYouState;
  systems: readonly SystemView[];
  /** A quiet fact per System ("2 booked today"), when the caller has one. Falls back to the System's own detail. */
  facts?: Readonly<Record<string, string>>;
  onReview: (item: OwnerDecision) => void;
  onAsk: (request: string) => void;
  onOpenSystem: (id: string) => void;
  onRetry?: () => void;
  onBringInWebsite?: () => void;
  /** Hour of day for the greeting, in the business's timezone. */
  hour: number;
}

function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function exception(system: SystemView): { kind: "draft" | "down" | "waits"; label: string } | null {
  if (system.lifecycle === "draft") return { kind: "draft", label: STATE_LABELS.lifecycle.draft };
  if (system.lifecycle === "paused") return { kind: "draft", label: STATE_LABELS.lifecycle.paused };
  if (system.health?.state === "blocked") return { kind: "down", label: STATE_LABELS.health.blocked };
  if (system.health?.state === "degraded") return { kind: "waits", label: STATE_LABELS.health.degraded };
  return null;
}

export function OwnerPhoneToday({ greetingName, business, needs, systems, facts, onReview, onAsk, onOpenSystem, onRetry, onBringInWebsite, hour }: OwnerPhoneTodayProps) {
  const [ask, setAsk] = useState("");
  const hello = `${greeting(hour)}, ${greetingName}.`;

  if (needs.status === "loading") return <div className={styles.page} aria-busy="true">
    <StSkeleton width="80%" label={`Loading ${business}`} /><StSkeleton width="60%" />
    <XaComposer value="" onChange={() => undefined} onSubmit={() => undefined} placeholder="Ask Strelva for anything" disabled />
  </div>;

  if (needs.status === "error") return <div className={styles.page}>
    <XaPebbleScene pose="fixing" size={180} label="Pebble checking the connection" />
    <XaHeadline size="sm" quiet="Your Systems keep running while this reloads.">{business} did not load just now.</XaHeadline>
    <p className={styles.fact}>{needs.message}</p>
    {onRetry ? <XaButton variant="primary" size="lg" block onClick={onRetry}>Try again</XaButton> : null}
  </div>;

  const items = needs.status === "ready" ? needs.items.filter(item => item.state === "open") : [];
  const first = items[0];
  const from = first ? actorPresentation(first.actor).name : null;
  const running = systems.filter(system => system.lifecycle === "live");
  const lede = first
    ? `${items.length === 1 ? "One thing waits" : `${items.length} things wait`} for you. ${running.length ? "Everything else is running." : ""}`.trim()
    : running.length ? "Nothing needs you. Everything is running." : "Nothing is running yet.";
  const canDecide = needs.status === "ready" && needs.canDecide !== false;

  return <div className={styles.page}>
    <div className={styles.greeting}>
      <XaHeadline size="md">{hello}</XaHeadline>
      <XaLede>{lede}</XaLede>
    </div>
    <XaComposer value={ask} onChange={setAsk} onSubmit={() => { if (ask.trim()) { onAsk(ask.trim()); setAsk(""); } }} placeholder="Ask Strelva for anything"
      scope={{ label: business, state: first ? "waits" : "live" }}
      waiting={first ? {
        kicker: from ? `Waits for you · from ${from}` : "Waits for you",
        title: first.title,
        from: from ? { name: from } : { pebble: true },
        action: <XaButton size="sm" onClick={() => onReview(first)} aria-label={`Review: ${first.title}`}>{canDecide ? "Review" : "Open"}</XaButton>,
      } : undefined} />
    {systems.length ? <section aria-labelledby="phone-running" className={styles.running}>
      <XaLabel id="phone-running">Running for you</XaLabel>
      <XaRows label="Running for you">
        {systems.map(system => {
          const off = exception(system);
          return <XaRow key={system.id} lead={<XaSystemTile kind={system.kind} size={40} />} title={system.name}
            detail={off ? <XaStatus kind={off.kind} size="sm">{off.label}</XaStatus> : facts?.[system.id] ?? system.detail}
            onClick={() => onOpenSystem(system.id)} />;
        })}
      </XaRows>
    </section> : <XaEmpty pose="waving" size="sm" title="Nothing is running yet." job="Pebble is ready to read your website"
      action={onBringInWebsite ? <XaButton variant={first ? "secondary" : "primary"} onClick={onBringInWebsite}>Bring in your website</XaButton> : undefined}>
      Bring in the website you already have. Nothing about it changes until you say so.
    </XaEmpty>}
  </div>;
}

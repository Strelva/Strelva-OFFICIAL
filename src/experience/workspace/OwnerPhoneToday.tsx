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
import { useRef, useState, useSyncExternalStore } from "react";
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

type Recognition = { lang: string; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; start(): void; stop(): void };

const noSubscribe = () => () => undefined;

/** Dictation through the browser's own speech recognition. Null where the browser has none, so no dead mic is drawn. */
function useDictation(onText: (text: string) => void): (() => void) | null {
  const available = useSyncExternalStore(noSubscribe, () => "SpeechRecognition" in window || "webkitSpeechRecognition" in window, () => false);
  const live = useRef<Recognition | null>(null);
  if (!available) return null;
  return () => {
    if (live.current) { live.current.stop(); return; }
    const Ctor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-US"; recognition.interimResults = false;
    recognition.onresult = event => { const text = Array.from(event.results).map(result => result[0]?.transcript ?? "").join(" ").trim(); if (text) onText(text); };
    recognition.onend = () => { live.current = null; };
    live.current = recognition; recognition.start();
  };
}

export function OwnerPhoneToday({ greetingName, business, needs, systems, facts, onReview, onAsk, onOpenSystem, onRetry, onBringInWebsite, hour }: OwnerPhoneTodayProps) {
  const [ask, setAsk] = useState("");
  const hello = `${greeting(hour)}, ${greetingName}.`;
  const voice = useDictation(text => setAsk(current => current.trim() ? `${current.trim()} ${text}` : text));
  const submit = () => { if (ask.trim()) { onAsk(ask.trim()); setAsk(""); } };
  // The ask bar stays under the thumb on a phone, whatever the page above it says.
  const dock = <div className={styles.dock}>
    <XaComposer value={ask} onChange={setAsk} onSubmit={submit} placeholder="Ask Strelva for anything" inputLabel={`Ask Strelva about ${business}`} onVoice={voice ?? undefined} />
  </div>;

  if (needs.status === "loading") return <div className={styles.page} aria-busy="true">
    <StSkeleton width="80%" label={`Loading ${business}`} /><StSkeleton width="60%" />
    {dock}
  </div>;

  if (needs.status === "error") return <div className={styles.page}>
    <div className={styles.trouble}>
      <XaPebbleScene pose="fixing" size={132} bare label="Pebble checking the connection" />
      <XaHeadline size="sm">{business} didn&rsquo;t load, but your Systems are still running.</XaHeadline>
    </div>
    {onRetry ? <XaButton variant="primary" size="lg" block onClick={onRetry}>Try again</XaButton> : null}
    <XaComposer value={ask} onChange={setAsk} onSubmit={submit} placeholder="Ask Strelva for anything" inputLabel={`Ask Strelva about ${business}`} onVoice={voice ?? undefined} />
  </div>;

  const items = needs.status === "ready" ? needs.items.filter(item => item.state === "open") : [];
  const first = items[0];
  const from = first ? actorPresentation(first.actor).name : null;
  const running = systems.filter(system => system.lifecycle === "live");
  const lede = first
    ? `${items.length === 1 ? "One thing waits" : `${items.length} things wait`} for you. ${running.length ? "Everything else is running." : ""}`.trim()
    : running.length ? "Nothing needs you. Everything is running." : "";
  const canDecide = needs.status === "ready" && needs.canDecide !== false;

  return <div className={styles.page}>
    <div className={styles.greeting}>
      <XaHeadline size="md">{hello}</XaHeadline>
      {lede ? <XaLede>{lede}</XaLede> : null}
    </div>
    <XaComposer value={ask} onChange={setAsk} onSubmit={submit} placeholder="Ask Strelva for anything" inputLabel={`Ask Strelva about ${business}`} onVoice={voice ?? undefined}
      scope={{ label: business }}
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
    </section> : <XaEmpty pose="fixing" size="sm" bare title="Nothing is running yet." job="Pebble reads your website first, then shows you what it found"
      action={onBringInWebsite ? <XaButton variant={first ? "secondary" : "primary"} onClick={onBringInWebsite}>Bring in your website</XaButton> : undefined}>
      Bring in the website you already have. Nothing about it changes until you say so.
    </XaEmpty>}
    {/* One composer per screen: the card above already carries the ask and what waits. */}
  </div>;
}

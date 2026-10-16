"use client";
/**
 * XA-3 preview: the real owner components (OwnerToday, OwnerDecisionView,
 * RequestsView, RunningChecksView) inside the real StrelvaShell and XA
 * sidebar, fed fixtures in the server's own shapes. The decision runs a local
 * stand-in for useNeedsYou (approve, read back, Undo) so the whole yes can be
 * pressed without a database. Nothing here reaches a business.
 */
import { useEffect, useRef, useState } from "react";
import { StrelvaShell, type StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaPinnedItem } from "@/experience/app-frame/workspace-places";
import type { HandledReceipt, OwnerDecision } from "@/platform/needs-you/contracts";
import type { ItemNotice, NeedsYouState } from "../useNeedsYou";
import { OwnerToday } from "../today/OwnerToday";
import { OwnerDecisionView } from "../today/OwnerDecisionView";
import { RequestsView, type RequestsViewStatus } from "../today/OwnerRequests";
import { RunningChecksView } from "../today/OwnerRunning";
import { type Xa3Screen, type Xa3State, HARBOR, NEXT_CHECK_MANDATE, NORTH_STUDIO, PREVIEW_NOW, REQUEST_ROWS, SECOND_DECISION, SINCE, decision, harborSystems, runningProof, yesReceipt } from "./xa-owner-today-fixture";
import styles from "./xa-foundation-preview.module.css";


const BASE = "/preview/strelva/xa/xa3-owner-today";
const MINUTE = Math.floor(PREVIEW_NOW / 60_000);

export function XaOwnerTodayPreview({ screen: initial, state, mode }: { screen: Xa3Screen; state: Xa3State; mode: "light" | "dark" }) {
  const [screen, setScreen] = useState<Xa3Screen>(initial);
  const href = (next: Xa3Screen) => `${BASE}/${next}${mode === "dark" ? "?mode=dark" : ""}`;
  const go = (next: Xa3Screen) => { setScreen(next); window.history.replaceState(null, "", href(next)); };

  // A local stand-in for useNeedsYou: the same state shape, decide and undo.
  const startOpen = !(initial === "o1" || state === "empty" || initial === "o4");
  const [items, setItems] = useState<OwnerDecision[]>(startOpen ? state === "many" ? [decision(), SECOND_DECISION] : [decision()] : []);
  const [handled, setHandled] = useState<HandledReceipt[]>(initial === "o4" ? [...SINCE, yesReceipt(state === "undone" ? "undone" : "undo")] : SINCE);
  const [pending, setPending] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, ItemNotice>>(initial === "o4" ? { [decision().id]: { tone: "done", text: "Close online booking for Thanksgiving: Done." } } : {});
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  const later = (ms: number, run: () => void) => timers.current.push(window.setTimeout(run, ms));

  const needs: NeedsYouState = state === "loading" ? { status: "loading" } : state === "error" ? { status: "error", message: "Your decisions could not be checked. Check again before deciding." }
    : { status: "ready", role: state === "member" ? "member" : "owner", items, complete: true, handled: state === "empty" ? [] : handled, handledAvailable: true };
  const decide = (item: OwnerDecision, choice: "approve" | "not_yet") => {
    setPending(item.id);
    // Fixture timing standing in for the server's write and read-back.
    later(choice === "approve" ? 900 : 300, () => {
      setPending(null);
      setItems(current => current.filter(entry => entry.id !== item.id));
      if (choice === "not_yet") { setNotices(current => ({ ...current, [item.id]: { tone: "done", text: `${item.title}: Not yet. Nothing changed.` } })); return; }
      if (state === "failed") { setItems(current => [item, ...current]); setNotices(current => ({ ...current, [item.id]: { tone: "error", text: "The booking page did not accept the change. Nothing changed for patients." } })); return; }
      setNotices(current => ({ ...current, [item.id]: { tone: "done", text: `${item.title}: Done.` } }));
      later(700, () => setHandled(current => [...current.filter(receipt => receipt.id !== `decision:${item.id}`), item.id === decision().id ? yesReceipt() : { ...yesReceipt(), id: `decision:${item.id}`, sentence: `North Studio did "${item.title}" as you approved`, changed: item.approveEffect }]));
    });
  };
  const undo = (receipt: HandledReceipt) => {
    setPending(receipt.id);
    later(500, () => { setPending(null); setHandled(current => current.map(entry => entry.id === receipt.id ? { ...entry, undo: { state: "undone" } } : entry)); });
  };

  const systems = state === "empty" ? [] : harborSystems({ bookingsDown: state === "down" });
  const waits = needs.status === "ready" && needs.items.length > 0;
  const pinned: StrelvaPinnedItem[] = systems.map(system => ({
    id: system.id, kind: system.kind === "inquiries" ? "inquiries" : system.kind === "listing" ? "listing" : system.kind === "bookings" ? "bookings" : "website",
    title: system.name, href: href("o1"),
    ...(system.kind === "bookings" && waits ? { state: "waits" as const } : system.health.state === "degraded" ? { state: "down" as const } : system.lifecycle === "draft" ? { state: "draft" as const } : { detail: system.lifecycle === "live" && system.kind === "website" ? "Live" : system.detail }),
  }));
  const navigate = (section: StrelvaSection) => {
    if (section === "home") go("o1"); else if (section === "needs-you") go("o3"); else if (section === "requests") go("o5"); else if (section === "ongoing") go("o6");
  };
  const active: StrelvaSection = screen === "o5" ? "requests" : screen === "o6" ? "ongoing" : "home";
  const shell = {
    appBase: "/preview/strelva", signOut: null, systemsReleased: true, mode, workspaceName: HARBOR.name, accountName: "Dr. Amy Lin", pinned, onNavigate: navigate,
    agency: { name: NORTH_STUDIO.name, person: NORTH_STUDIO.person, color: "#2f5236" },
    needsYou: { count: needs.status === "ready" ? needs.items.length : null },
    notice: <p className={styles.notice}>Fictional preview. Nothing here reaches a real business.</p>,
  } as const;

  if (screen === "o5") {
    const status: RequestsViewStatus = state === "loading" ? { status: "loading" } : state === "error" ? { status: "error", message: "Requests could not be checked. Nothing about them changed." } : { status: "ready" };
    return <StrelvaShell {...shell} title="Requests" active={active}>
      <RequestsView businessName={HARBOR.name} rows={state === "empty" ? [] : state === "error" ? [] : REQUEST_ROWS} state={status} readOnly={state === "member"} onRetry={() => undefined} onAsk={() => undefined} onOpenWork={() => undefined} initialView={state === "done" ? "done" : "open"} />
    </StrelvaShell>;
  }

  if (screen === "o6") {
    const data = state === "loading" || state === "error" ? null : { ...runningProof({ slip: state === "down", empty: state === "empty" }), state: { ...runningProof().state, mandates: state === "offer" ? [NEXT_CHECK_MANDATE] : [] } };
    return <StrelvaShell {...shell} title="Running" active={active}>
      <RunningChecksView data={data} error={state === "error" ? "What Strelva keeps true could not be checked." : ""} busy={false} notice="" readOnly={state === "member"} locked={false}
        onReload={() => undefined} onCadence={() => undefined} onKeepMeFound={() => undefined} />
    </StrelvaShell>;
  }

  if (screen === "o3" || screen === "o4") return <StrelvaShell {...shell} title="Bookings" active={active}>
    <OwnerDecisionView businessName={HARBOR.name} needs={needs} pending={pending} notices={notices} selectedId={screen === "o4" ? decision().id : undefined} initialDecided={screen === "o4" ? decision() : undefined} systems={systems} now={PREVIEW_NOW}
      onDecide={decide} onUndo={undo} onRetry={() => undefined} onToday={() => go("o1")} onWhatChanged={() => go("o1")} onOpenDecision={() => go("o3")} onAsk={() => undefined} />
  </StrelvaShell>;

  return <StrelvaShell {...shell} title="Today" active={active}>
    <OwnerToday businessName={HARBOR.name} ownerName={HARBOR.owner} minute={MINUTE} now={PREVIEW_NOW} needs={needs} notices={notices} systems={systems}
      readOnly={false} onAsk={() => undefined} onReview={() => go("o3")} onAllWaiting={() => go("o3")} onRetry={() => undefined} onWhatChanged={() => go("o1")}
      onBringAgency={() => undefined} systemHref={() => href("o1")} gettingStartedHref={state === "empty" ? href("o1") : null} />
  </StrelvaShell>;
}

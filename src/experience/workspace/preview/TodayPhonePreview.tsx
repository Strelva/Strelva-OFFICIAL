"use client";
/**
 * XA · E6 preview: the real owner Home (OwnerToday, the component BusinessHome
 * renders at /workspace) inside the real StrelvaShell, whose E6 phone header
 * shows below 768 px. There is one Home: below 768 px the same component is
 * the phone layout, with the one composer carrying what waits. Fictional
 * Harbor Dental; Review opens the E2 page preview, nothing is decided or sent.
 */
import { useState } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { OwnerToday } from "../today/OwnerToday";
import type { NeedsYouState } from "../useNeedsYou";
import { E6_FACTS, HARBOR, XA7_BASE, e6Decision, e6Systems } from "./xa7-outside-fixture";
import { xaSearchItems, xaOwnerPinned, XA_SYSTEM_HREFS } from "./xa-day";

export type TodayPhoneState = "waiting" | "done" | "empty" | "loading" | "error" | "member";

/** Monday, November 23, 2026, 8:14 am in Buffalo: the one fixture morning. */
const NOW = Date.parse("2026-11-23T08:14:00-05:00");
const systemHref = (id: string) => XA_SYSTEM_HREFS[id === "book" ? "bookings" : id === "inquiries" ? "inquiries" : id === "form" ? "form" : "website"];

export function TodayPhonePreview({ state, mode }: { state: TodayPhoneState; mode: "light" | "dark" }) {
  const [asked, setAsked] = useState("");
  const needs: NeedsYouState = state === "loading" ? { status: "loading" }
    : state === "error" ? { status: "error", message: "Your decisions could not be checked. Check again before deciding." }
      : { status: "ready", role: state === "member" ? "member" : "owner", canDecide: state !== "member", items: state === "waiting" || state === "member" ? [e6Decision()] : [], complete: true, handled: [], handledAvailable: true };
  const systems = state === "empty" ? [] : e6Systems().map(system => system.lifecycle === "draft" ? system : ({ ...system, detail: E6_FACTS[system.id as keyof typeof E6_FACTS] ?? system.detail }));
  return <StrelvaShell searchItems={xaSearchItems("owner")} appBase="/preview/strelva" signOut={null} systemsReleased mode={mode} workspaceName={HARBOR.business} accountName={HARBOR.ownerFull} title="Home" active="home"
    needsYou={{ count: needs.status === "ready" ? needs.items.length : 0 }} onNavigate={() => undefined}
    agency={{ name: "North Studio", person: "Maya", color: "#2f5236" }}
    pinned={state === "empty" ? [] : xaOwnerPinned()}>
    <OwnerToday businessName={HARBOR.business} ownerName={HARBOR.owner} minute={Math.floor(NOW / 60_000)} now={NOW} needs={needs} notices={{}} systems={systems}
      onAsk={setAsked} onReview={() => { window.open(`${XA7_BASE}/phone-yes?state=confirm`, "_self"); }} onAllWaiting={() => undefined}
      onRetry={() => window.location.reload()} onWhatChanged={() => undefined} systemHref={systemHref} onOpenSystem={id => window.location.assign(systemHref(id))} />
    {asked ? <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 20px 40px" }}><XaSays links={[<XaTextLink key="r" onClick={() => setAsked("")}>Clear</XaTextLink>]}>This is a fictional preview, so nothing was read or changed. In Strelva, your words open Ask Strelva for {HARBOR.business}, and I ask before anything goes live.</XaSays></div> : null}
  </StrelvaShell>;
}

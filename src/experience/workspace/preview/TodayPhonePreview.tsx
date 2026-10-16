"use client";
/**
 * XA · E6 preview: OwnerPhoneToday inside the real StrelvaShell (whose E6
 * phone header shows below 768 px). Fictional Harbor Dental; Review opens the
 * E2 page preview, nothing is decided or sent.
 */
import { useState } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { OwnerPhoneToday } from "../OwnerPhoneToday";
import type { NeedsYouState } from "../useNeedsYou";
import { E6_FACTS, HARBOR, XA7_BASE, e6Decision, e6Systems } from "./xa7-outside-fixture";

export type TodayPhoneState = "waiting" | "done" | "empty" | "loading" | "error" | "member";

export function TodayPhonePreview({ state, mode }: { state: TodayPhoneState; mode: "light" | "dark" }) {
  const [asked, setAsked] = useState("");
  const needs: NeedsYouState = state === "loading" ? { status: "loading" }
    : state === "error" ? { status: "error", message: "Your decisions could not be checked. Check again before deciding." }
      : { status: "ready", role: state === "member" ? "member" : "owner", canDecide: state !== "member", items: state === "waiting" || state === "member" ? [e6Decision()] : [], complete: true, handled: [], handledAvailable: true };
  const systems = state === "empty" ? [] : e6Systems();
  return <StrelvaShell appBase="/preview/strelva" signOut={null} systemsReleased mode={mode} workspaceName={HARBOR.business} accountName={HARBOR.ownerFull} title="Today" active="home"
    needsYou={{ count: needs.status === "ready" ? needs.items.length : 0 }} onNavigate={() => undefined}
    agency={{ name: "North Studio", person: "Maya", color: "#2f5236" }}
    pinned={systems.map(system => ({ id: system.id, kind: system.kind, title: system.name, href: `${XA7_BASE}/today-phone`, detail: E6_FACTS[system.id as keyof typeof E6_FACTS] }))}>
    <OwnerPhoneToday greetingName={HARBOR.owner} business={HARBOR.business} needs={needs} systems={systems} facts={E6_FACTS} hour={8}
      onReview={() => { window.open(`${XA7_BASE}/phone-yes?state=confirm`, "_self"); }}
      onAsk={setAsked} onOpenSystem={() => undefined} onRetry={() => window.location.reload()} onBringInWebsite={() => undefined} />
    {asked ? <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 20px 40px" }}><XaSays links={[<XaTextLink key="r" onClick={() => setAsked("")}>Clear</XaTextLink>]}>This is a fictional preview, so nothing was read or changed. In Strelva, I would answer here and ask before anything goes live.</XaSays></div> : null}
  </StrelvaShell>;
}

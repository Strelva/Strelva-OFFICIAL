"use client";
/**
 * XA-5 · Ask Strelva, from a sentence to a live change. The real AskStrelva
 * component inside the real StrelvaShell, fed by fixtures (xa-ask-fixture).
 * Every request ends in the fixture transport: nothing is filed, sent or
 * published, and nothing reaches a real business.
 */
import { useMemo, useState } from "react";
import { AskStrelva, type AskScopeOption } from "@/experience/ask/AskStrelva";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaClientLink, StrelvaPinnedItem } from "@/experience/app-frame/workspace-places";
import { XA_ASK_SYSTEM, XA_ASK_WORKSPACE, xaAskMessages, xaAskOutcomes, xaAskTransport, type XaAskScreen, type XaAskState } from "./xa-ask-fixture";
import surface from "../workspace-surface.module.css";
import styles from "./xa-ask-preview.module.css";

const BASE = "/preview/strelva/xa/xa5-ask";
const COLORS = { harbor: "#2f5236", north: "#9c522c", lakeview: "#4f7590", fieldwork: "#6b6f68" } as const;

export function XaAskPreview({ screen, state, door, mode }: { screen: XaAskScreen; state: XaAskState; door: "agency" | "owner"; mode: "light" | "dark" }) {
  const href = (next: XaAskScreen, query = "") => `${BASE}/${next}?door=${door}${mode === "dark" ? "&mode=dark" : ""}${query}`;
  const request = useMemo(() => xaAskTransport(screen, state), [screen, state]);
  const messages = useMemo(() => xaAskMessages(screen), [screen]);
  const outcomes = useMemo(() => xaAskOutcomes(screen, state), [screen, state]);
  const owner = door === "owner";
  const making = screen === "as6";
  // The scope chip opens this picker; picking re-scopes the next conversation, as WorkspaceLayout does with openAsk.
  const [scoped, setScoped] = useState<string | null>(making ? null : XA_ASK_SYSTEM);
  const scopes: AskScopeOption[] = [
    { id: null, label: "Harbor Dental", state: "live" },
    { id: XA_ASK_SYSTEM, label: "Website", kind: "website", state: "live" },
    { id: "b7000000-0000-4000-8000-0000000005b2", label: "Bookings", kind: "bookings", state: "live" },
    { id: "b7000000-0000-4000-8000-0000000005b3", label: "Inbox", kind: "inbox", state: "live" },
  ];
  const scopedName = scopes.find(option => option.id === scoped && option.id)?.label;
  // The same scroll container and detail frame WorkspaceLayout renders /workspace?view=ask in, so sticky and scroll match the real route.
  const ask = <div className={surface.scroll} data-workspace-scroll><div className={surface.detail} data-place="ask">
    {/* The agency door passes no decider: the owner's name comes from the route (GET owner), as in production. */}
    <AskStrelva key={`${screen}:${state}:${door}:${scoped ?? "business"}`} workspaceId={XA_ASK_WORKSPACE} businessName="Harbor Dental" systemId={scoped} systemName={scopedName} systemKind={scopes.find(option => option.id === scoped)?.kind ?? "website"} systemState="live" address="harbordental.com"
      decider={owner ? { name: "you", you: true } : undefined} outcomes={outcomes} initialChangeView={screen === "as4" ? "sees" : "change"}
      scopes={scopes} onScope={setScoped}
      request={request} initialMessages={messages}
      readOnly={state === "readonly"} readOnlyReason={owner ? "Work in this workspace has stopped. Earlier conversations stay readable." : "Harbor Dental shared this with North Studio to review. You can read, not ask."}
      refusalLinks={{ needsYou: href("as4"), help: href("as1") }} />
  </div></div>;
  const shell = { appBase: "/preview/strelva", signOut: null, systemsReleased: true, mode, active: "ask" as const, title: "Ask Strelva",
    notice: <p className={styles.notice}>Fictional preview. Nothing here reaches a real business.</p> };

  if (owner) {
    const pinned: StrelvaPinnedItem[] = [
      { id: "website", kind: "website", title: "Website", href: href("as1"), detail: "Live" },
      { id: "bookings", kind: "bookings", title: "Bookings", href: href("as1"), detail: "31 this week" },
      { id: "inbox", kind: "inquiries", title: "Inbox", href: href("as1"), detail: "3 new" },
      ...(making ? [{ id: "texts", kind: "app" as const, title: "Text to reschedule", href: href("as6"), current: true, state: "draft" as const }] : []),
    ];
    return <StrelvaShell {...shell} workspaceName="Harbor Dental" accountName="Dr. Amy Lin" pinned={pinned} agency={{ name: "North Studio", person: "Maya", color: COLORS.harbor }}>{ask}</StrelvaShell>;
  }
  const clients: StrelvaClientLink[] = [
    { id: "harbor", name: "Harbor Dental", href: href("as1"), detail: "Dr. Lin", color: COLORS.harbor, current: true },
    { id: "north", name: "North Coast Realty", href: href("as1"), waits: true, color: COLORS.north },
    { id: "lakeview", name: "Lakeview Mediation", href: href("as1"), color: COLORS.lakeview },
    { id: "fieldwork", name: "Fieldwork Studio", href: href("as1"), color: COLORS.fieldwork },
  ];
  return <StrelvaShell {...shell} workspaceName="North Studio" accountName="Maya Okafor"
    agencyNavigation={{ active: "home", queueCount: 3, clients, hrefs: { home: href("as1"), queue: href("as1"), library: href("as1"), minutes: href("as1") } }}>{ask}</StrelvaShell>;
}

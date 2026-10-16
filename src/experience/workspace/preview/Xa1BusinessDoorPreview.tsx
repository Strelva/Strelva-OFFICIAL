"use client";
/**
 * XA-1 · Getting in, the business door. The real components (SignUpDoor and
 * SupabaseSignIn, BusinessSetupPanel, GettingStarted, FirstDay) with
 * fictional fixtures: Harbor Dental, Dr. Amy Lin, 1180 Elmwood Ave, and North
 * Studio (Maya Okafor) as the agency. Every request stays in this file;
 * nothing is read, created, sent or saved.
 */
import { useMemo } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaPinnedItem } from "@/experience/app-frame/workspace-places";
import { XaEntry } from "@/components/ui/strelva/Xa";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { BusinessSetupPanel } from "@/experience/workspace/BusinessSetupPanel";
import { SignUpClosed, SignUpDoor } from "@/experience/getting-started/SignUpDoor";
import { GettingStarted, type GettingStartedLinks, type GettingStartedStart } from "@/experience/getting-started/GettingStarted";
import { FirstDay } from "@/experience/getting-started/FirstDay";
import type { FoundFact, WebsiteReading } from "@/products/getting-started/contracts";

import type { Xa1Screen } from "./xa1-screens";

const BUSINESS = "b6a10000-0000-4000-8000-000000000001";
const ACTOR = "b6a10000-0000-4000-8000-0000000000a0";
const SITE = "https://harbordental.com/";
const at = "2026-10-15T13:02:00.000Z";
const base = { status: "unconfirmed" as const, sourceKind: "website_crawl" as const, foundBy: "owner" as const, foundAt: at, confirmable: true, current: null };
const FOUND: FoundFact[] = [
  { ...base, entity: "fact", key: "hours", id: "b6a10000-0000-4000-8000-0000000000f1", label: "Hours", display: "Mon to Fri 8 to 5, Sat 9 to 1", value: "Mon to Fri 8 to 5, Sat 9 to 1", sourceUrl: "https://harbordental.com/hours", sourceRef: "https://harbordental.com/hours", quote: "Monday to Friday 8am to 5pm, Saturday 9am to 1pm" },
  { ...base, entity: "fact", key: "phone", id: "b6a10000-0000-4000-8000-0000000000f2", label: "Phone", display: "(716) 555-0142", value: "(716) 555-0142", sourceUrl: "https://harbordental.com/contact", sourceRef: "https://harbordental.com/contact", quote: "Call us at (716) 555-0142" },
  { ...base, entity: "fact", key: "address", id: "b6a10000-0000-4000-8000-0000000000f3", label: "Address", display: "1180 Elmwood Ave, Buffalo, NY 14222", value: { formatted: "1180 Elmwood Ave, Buffalo, NY 14222" }, sourceUrl: "https://harbordental.com/contact", sourceRef: "https://harbordental.com/contact", quote: "1180 Elmwood Ave, Buffalo" },
  { ...base, entity: "service", key: null, id: "b6a10000-0000-4000-8000-0000000000f4", label: "Service", display: "Cleanings, fillings, crowns and children's visits", value: { name: "Cleanings, fillings, crowns and children's visits" }, sourceUrl: "https://harbordental.com/services", sourceRef: "https://harbordental.com/services", quote: "Gentle cleanings, fillings, crowns and children's visits" },
  { ...base, entity: "fact", key: "description", id: "b6a10000-0000-4000-8000-0000000000f5", label: "Description", display: "Gentle family dentistry on Elmwood.", value: "Gentle family dentistry on Elmwood.", sourceUrl: "https://harbordental.com/", sourceRef: "https://harbordental.com/", quote: "Gentle family dentistry on Elmwood", current: "Family dentist in Buffalo" },
];
const READING: WebsiteReading = { url: SITE, revision: 2, pagesRead: 5, facts: FOUND };
const LINKS: GettingStartedLinks = { home: "/preview/strelva/xa/xa1-business-door/b6", details: "#business-details", agency: "#bring-in-an-agency", google: null, connect: "#keep-your-site", request: null };

type Mode = "light" | "dark";

/** A transport that answers like the real routes for this fictional business. */
function useTransport(screen: Xa1Screen, state: string) {
  return useMemo<typeof fetch>(() => async (input, init) => {
    const url = String(input);
    const hang = () => new Promise<Response>(() => undefined);
    if (url === "/api/workspace/businesses" && !init?.method) {
      if (state === "loading") return hang();
      if (state === "error") return Response.json({ error: "Business access could not be confirmed. Nothing was created." }, { status: 503 });
      if (state === "signed-out") return Response.json({ error: "Sign in with a confirmed email." }, { status: 401 });
      return Response.json({ actorId: ACTOR, actorEmail: "dr.lin@harbordental.com", businesses: state === "existing" ? [{ id: BUSINESS, name: "Harbor Dental" }, { id: "b6a10000-0000-4000-8000-000000000002", name: "Harbor Dental Kids" }] : [] });
    }
    if (url === "/api/workspace/businesses") return Response.json({ error: "Preview only. Nothing was created." }, { status: 409 });
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string };
    if (body.action === "read_website") return Response.json({ reading: READING });
    if (body.action === "decide_found_facts") return screen === "b4" && state === "conflict"
      ? Response.json({ error: "Your business details changed since this reading. Read the website again." }, { status: 409 })
      : Response.json({ confirmed: 4, websiteSaved: false, revision: 3, waiting: [FOUND[4]] });
    return Response.json({ error: "Not in this preview." }, { status: 404 });
  }, [screen, state]);
}

export function Xa1BusinessDoorPreview({ screen, state, mode }: { screen: Xa1Screen; state: string; mode: Mode }) {
  const transport = useTransport(screen, state);
  return <WorkspaceRequestContext.Provider value={transport}>
    <div data-workspace-theme="linen" data-workspace-mode={mode}>
      {screen === "b1" ? <SignUp state={state} mode={mode} /> : null}
      {screen === "b2" ? <XaEntry mode={mode} account="Dr. Amy Lin" stage={{ pose: "adds", label: "Pebble setting down a first System", title: "Start with what matters now.", body: "What you pick is kept as your first ask. You can add more any time." }}>
        <BusinessSetupPanel key={state} startProduct="help" gettingStarted initialName={state === "picked" ? "Harbor Dental" : ""} initialKeeps={state === "picked" ? ["website", "bookings"] : undefined} navigate={() => undefined} />
      </XaEntry> : null}
      {screen === "b3" || screen === "b4" || screen === "b5" ? <Started screen={screen} state={state} mode={mode} /> : null}
      {screen === "b6" ? <Home state={state} mode={mode} /> : null}
    </div>
  </WorkspaceRequestContext.Provider>;
}

function SignUp({ state, mode }: { state: string; mode: Mode }) {
  if (state === "closed") return <SignUpClosed agencyDoor mode={mode} />;
  const agency = state === "agency";
  return <SignUpDoor mode={mode} next={agency ? "/workspace/agency/start" : state === "invited" ? `/workspace/claim/${"a".repeat(43)}` : "/workspace/business/new"} asAgency={agency} doors={state !== "invited"} requestedNext={null}
    identityName={state === "invited" ? "Harbor Dental" : null} brand={state === "invited" ? "North Studio" : undefined} emailReady={state !== "google-only"} prefillEmail={state === "sent" || state === "error" ? "dr.lin@harbordental.com" : undefined}
    initial={state === "sent" ? { status: "sent" } : state === "error" ? { error: "The sign-in link could not be sent. Try again or continue with Google." } : undefined} />;
}

function Started({ screen, state, mode }: { screen: "b3" | "b4" | "b5"; state: string; mode: Mode }) {
  const start: GettingStartedStart = screen === "b3"
    ? { phase: state === "member" ? "next" : "site", readingNow: state === "reading", error: state === "error" ? "harbordental.com asks crawlers not to read it, so nothing was read. Add your details yourself." : undefined }
    : screen === "b4"
      ? state === "waiting" ? { phase: "check" } : { phase: "check", reading: state === "nothing-found" ? { ...READING, pagesRead: 1, facts: [] } : READING }
      : { phase: "next", saved: state === "nothing-added" ? { added: 0, later: 5 } : { added: 4, later: 1 } };
  const links: GettingStartedLinks = state === "closed" ? { ...LINKS, connect: null } : state === "request" ? { ...LINKS, request: "#request" } : LINKS;
  return <GettingStarted key={`${screen}:${state}`} account="Dr. Amy Lin" mode={mode} start={start} links={links}
    business={{ workspaceId: BUSINESS, name: "Harbor Dental", website: state === "no-website" ? null : SITE, canConfirm: state !== "member", revision: 2, waiting: state === "waiting" ? [{ ...FOUND[4]!, status: "later" }, FOUND[1]!] : [] }} />;
}

function Home({ state, mode }: { state: string; mode: Mode }) {
  const pinned: StrelvaPinnedItem[] = [
    { id: "website", kind: "website", title: "Website", href: "#website", detail: "Checked 7:02" },
    { id: "bookings", kind: "bookings", title: "Bookings", href: "#bookings", state: "draft" },
    { id: "inbox", kind: "inquiries", title: "Inbox", href: "#inbox", state: "draft" },
  ];
  return <StrelvaShell appBase="/preview/strelva" signOut={null} systemsReleased mode={mode} workspaceName="Harbor Dental" accountName="Dr. Amy Lin" title="Today" active="home"
    pinned={state === "quiet" ? pinned.slice(0, 1) : pinned} needsYou={{ count: state === "ready" ? 1 : 0 }} agency={{ name: "North Studio", person: "Maya", color: "#2f5236" }}>
    <FirstDay ownerName="Dr. Lin" businessName="Harbor Dental" state={state === "loading" ? "loading" : state === "error" ? "error" : "ready"} retryHref="/preview/strelva/xa/xa1-business-door/b6"
      waiting={state === "ready" ? [{ ...FOUND[4]!, status: "later" }] : []} checkHref="/preview/strelva/xa/xa1-business-door/b4?state=waiting" onAsk={() => undefined}
      now={new Date(2026, 9, 15, 8, 4)}
      events={state === "quiet" ? [{ id: "1", label: "You added 5 details from harbordental.com", state: "done" }] : [
        { id: "1", label: "You added 4 details from harbordental.com", state: "done" },
        { id: "2", label: "Strelva checked harbordental.com at 7:02", state: "done" },
        { id: "3", label: "Kept your description for you to check", state: "done" },
      ]} />
  </StrelvaShell>;
}

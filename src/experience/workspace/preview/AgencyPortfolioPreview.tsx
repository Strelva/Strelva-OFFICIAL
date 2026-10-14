"use client";

import { useState } from "react";
import { PREVIEW_NORTH_BRAND } from "./chrome-fixture";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StComposerBar, StComposerDock, StEmpty, StHead, StNotice, StPage, StPill, StPillLink, StSkeleton, StToast } from "@/components/ui/strelva/Kit";

import { AgencyClientList, AgencyQueueList } from "../agency/AgencyViews";
import type { AgencyClientRow, AgencyQueueItem } from "../agency-clients";

/** Canon fixtures only: every agency, person, business, number and date is fictional. */
const names = ["Harbor Dental", "The Mooney Firm", "North Coast Realty", "Fieldwork Studio"];
const fixtureId = (prefix: string, index: number) => `${prefix}-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const fixtureClients: AgencyClientRow[] = names.map((name, index) => ({
  workspaceId: fixtureId("d1000000", index), name, reach: "agency", role: "agency", provider: false, status: "ready",
  systems: [{ id: fixtureId("d2000000", index), name: ["2 locations", "attymooney.com", "northcoastrealty.com", "fieldwork.studio"][index]!, kind: "website", lifecycle: "live", versionContext: null,
    health: { status: index === 2 ? "blocked" : index === 3 ? "unknown" : "healthy", summary: "Fictional check", lastVerifiedAt: "2026-10-14T14:06:00Z" } }],
  needsYou: { count: index === 2 ? 0 : 1, oldestAt: "2026-10-13T14:00:00Z" }, openRequests: index < 3 ? 1 : 0,
  improvementsWaiting: 0, lastReceiptAt: "2026-10-14T13:40:00Z",
}));
const queue = [
  { group: "Broken", client: "North Coast Realty", title: "Contact form stopped sending", detail: "Morning check failed at 7:00 and 1:12 · visitors see an error", due: "2h late", action: "Open", kind: "down" as const, href: "/preview/strelva/agency-canon?frame=client" },
  { group: "Requests", client: "The Mooney Firm", title: "Spanish version of the intake form", detail: "Scope agreed · Oct 17", due: "Due in 8d", action: "Open", kind: "need" as const, href: "/preview/strelva/agency-canon?frame=requests" },
  { group: "Requests", client: "Harbor Dental", title: "Add a children’s visit type at Amherst", detail: "Asked yesterday · needs a scope", due: "Answer today", action: "Scope it", kind: "need" as const, href: "/preview/strelva/agency-library?surface=build" },
  { group: "Waiting on owners", client: "The Mooney Firm", title: "Sheri tried Mediation sessions and hasn’t decided", detail: "A Possibility · owner notifications are off", due: "—", action: "Open review", kind: "draft" as const, href: "/preview/strelva/agency-canon?frame=approval" },
  { group: "Waiting on owners", client: "Fieldwork Studio", title: "Owner email bounced", detail: "2 items could not reach the owner", due: "—", action: "Review email", kind: "need" as const, href: "/preview/strelva/provider-change?role=agency&state=notified" },
  { group: "Improvements to offer", client: "Library", title: "Appointments Release 13 is ready for client Versions", detail: "2 ready · 1 needs an earlier release first", due: "—", action: "Bulk review", kind: "draft" as const, href: "/preview/strelva/agency-library?surface=bulk" },
];

export function AgencyPortfolioPreview({ surface, state, mode }: { surface: "clients" | "queue" | "home"; state: "ready" | "loading" | "empty" | "error" | "permission"; mode: "light" | "dark" }) {
  const [ask, setAsk] = useState("");
  const [receipt, setReceipt] = useState("");
  const [recovered, setRecovered] = useState(false);
  const ready = state === "ready" || recovered;
  const base = "/preview/strelva/agency-portfolio";
  const hrefs = { home: `${base}?surface=home`, verification: "/preview/strelva/agency-verification", clients: `${base}?surface=clients`, queue: `${base}?surface=queue`, library: "/preview/strelva/agency-library", team: "/preview/strelva/agency-people?surface=team" };
  return <div data-workspace-theme="linen" data-workspace-mode={mode}><StrelvaShell ownerBrand={PREVIEW_NORTH_BRAND} workspaceName="North Studio" title="North Studio" accountName="You" accountDetail="Agency owner" signOut={null} systemsReleased agencyNavigation={{ active: surface === "queue" ? "queue" : surface === "home" ? "home" : "clients", hrefs }}>
    <StPage width={surface === "clients" ? "wide" : "column"}>
      <StHead title={surface === "home" ? "North Studio" : surface === "clients" ? "Clients" : "Queue"} meta={surface === "queue" ? `${queue.length} items · oldest first within each kind` : `${fixtureClients.length} clients · ${queue.length} client items`} actions={surface === "home" ? <StPillLink href="/preview/strelva/agency-canon?frame=requests">New request</StPillLink> : undefined} />
      {!ready ? state === "loading" ? <div role="status" className="space-y-4"><p>Reading {surface === "home" ? "your clients" : surface}…</p><StSkeleton width="85%" /><StSkeleton width="60%" /><StSkeleton /></div> : state === "empty" ? <StEmpty>{surface === "queue" ? "Nothing is waiting across clients." : "No clients yet. A client appears once they share work with your agency."}</StEmpty> : <StNotice tone={state === "error" ? "critical" : "need"}>{state === "permission" ? "Clients, Queue, Library and Team are for agency members. Ask an agency owner to check your access." : <>{surface === "queue" ? "The Queue" : "Clients"} could not be loaded. The read is incomplete. <StPill variant="soft" onClick={() => setRecovered(true)}>Retry</StPill></>}</StNotice> : <>
        {surface === "clients" || surface === "home" ? <AgencyClientList clients={fixtureClients.map(client => ({ ...client, pageIndex: 0 }))} total={fixtureClients.length} agencyName="North Studio" hasMore={false} loadingMore={false} moreError={false} retrying={new Set()} now={Date.parse("2026-10-14T14:06:00Z")} onOpen={workspaceId => { window.location.href = workspaceId === fixtureClients[3]!.workspaceId ? "/preview/strelva/provider-change?role=agency&state=notified" : "/preview/strelva/agency-canon?frame=client"; }} onRetryPage={() => undefined} onMore={() => undefined} /> : null}
        {surface === "queue" ? <AgencyQueueList items={queue.map((item, index): AgencyQueueItem => ({ id: `fixture-${index}`, kind: item.group === "Broken" ? "health" : item.group === "Requests" ? "request" : item.group === "Waiting on owners" ? "needs_you" : "improvement", workspaceId: fixtureClients.find(client => client.name === item.client)?.workspaceId ?? fixtureClients[0]!.workspaceId, clientName: item.client, title: item.title, systemId: null, workId: null, since: "2026-10-14T12:00:00Z", label: item.detail, href: item.href }))} now={Date.parse("2026-10-14T14:06:00Z")} onWorkspace={() => undefined} onOpenClientWork={() => undefined} /> : null}
      </>}
      <p className="text-xs text-gray-muted">Fictional preview · people, counts, deadlines and last good reads are made up. No email or outside change is sent.</p>
      {receipt ? <StToast>{receipt}</StToast> : null}
    </StPage>
    <StComposerDock><StComposerBar scope="North Studio" placeholder="Bring a client need, Strelva builds it with you" value={ask} onChange={setAsk} disabled={!ready} onSubmit={() => { setReceipt("Preview request saved for scope review. A typed yes does not approve anything."); setAsk(""); }} /></StComposerDock>
  </StrelvaShell></div>;
}

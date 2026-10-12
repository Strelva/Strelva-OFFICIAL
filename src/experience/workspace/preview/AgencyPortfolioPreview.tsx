"use client";

import { HEALTH_LABEL } from "@/experience/systems/model";
import { useState } from "react";
import { PREVIEW_NORTH_BRAND } from "./chrome-fixture";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StBeacon, StComposerBar, StComposerDock, StEmpty, StHead, StMono, StNotice, StPage, StPill, StPillLink, StRow, StRows, StSection, StSkeleton, StState, StTable, StTextButton, StToast } from "@/components/ui/strelva/Kit";

/** Canon fixtures only: every agency, person, business, number and date is fictional. */
const clients = [
  { name: "Harbor Dental", detail: "2 locations", health: HEALTH_LABEL.healthy, kind: "live" as const, waiting: "Dr. Lin · 1 · you · 1", versions: "r12 · r12+1", minutes: 42, receipt: "Reminder sent · 1:40 PM" },
  { name: "The Mooney Firm", detail: "attymooney.com", health: HEALTH_LABEL.healthy, kind: "live" as const, waiting: "Sheri · 1", versions: "—", minutes: 18, receipt: "First reply sent · Thu" },
  { name: "North Coast Realty", detail: "northcoastrealty.com", health: HEALTH_LABEL.blocked, kind: "down" as const, waiting: "You · 1", versions: "—", minutes: 61, receipt: "Check failed · 1:12 PM" },
  { name: "Fieldwork Studio", detail: "fieldwork.studio", health: "Last good read · Tuesday", kind: "draft" as const, waiting: "Owner · 1", versions: "r6", minutes: 9, receipt: "Last good read · Tuesday" },
];
const queue = [
  { group: "Broken", client: "North Coast Realty", title: "Contact form stopped sending", detail: "Morning check failed at 7:00 and 1:12 · visitors see an error", due: "2h late", action: "Open", kind: "down" as const, href: "/preview/strelva/agency-canon?frame=client" },
  { group: "Requests", client: "The Mooney Firm", title: "Spanish version of the intake form", detail: "Scope agreed · Oct 17", due: "Due in 8d", action: "Open", kind: "need" as const, href: "/preview/strelva/agency-canon?frame=requests" },
  { group: "Requests", client: "Harbor Dental", title: "Add a children’s visit type at Amherst", detail: "Asked yesterday · needs a scope", due: "Answer today", action: "Scope it", kind: "need" as const, href: "/preview/strelva/agency-library?surface=build" },
  { group: "Waiting on owners", client: "The Mooney Firm", title: "Sheri tried Mediation sessions and hasn’t decided", detail: "A Possibility · owner notifications are off", due: "—", action: "Open review", kind: "draft" as const, href: "/preview/strelva/agency-canon?frame=approval" },
  { group: "Waiting on owners", client: "Fieldwork Studio", title: "Owner email bounced", detail: "2 items could not reach the owner", due: "—", action: "Review email", kind: "need" as const, href: "/preview/strelva/provider-change?role=agency&state=notified" },
  { group: "Improvements to offer", client: "Library", title: "Appointments r13 is ready for client Versions", detail: "2 ready · 1 needs an earlier revision first", due: "—", action: "Bulk review", kind: "draft" as const, href: "/preview/strelva/agency-library?surface=bulk" },
];

export function AgencyPortfolioPreview({ surface, state, mode }: { surface: "clients" | "queue" | "home"; state: "ready" | "loading" | "empty" | "error" | "permission"; mode: "light" | "dark" }) {
  const [ask, setAsk] = useState("");
  const [receipt, setReceipt] = useState("");
  const [recovered, setRecovered] = useState(false);
  const [retried, setRetried] = useState(false);
  const ready = state === "ready" || recovered;
  const base = "/preview/strelva/agency-portfolio";
  const hrefs = { clients: `${base}?surface=clients`, queue: `${base}?surface=queue`, library: "/preview/strelva/agency-library", team: "/preview/strelva/agency-people?surface=team" };
  return <div data-workspace-theme="linen" data-workspace-mode={mode}><StrelvaShell ownerBrand={PREVIEW_NORTH_BRAND} workspaceName="North Studio" title="North Studio" accountName="You" accountDetail="Agency owner" signOut={null} systemsReleased agencyNavigation={{ active: surface === "queue" ? "queue" : "clients", hrefs }}>
    <StPage width={surface === "clients" ? "wide" : "column"}>
      <StHead title={surface === "home" ? "North Studio" : surface === "clients" ? "Clients" : "Queue"} meta={surface === "queue" ? `${queue.length} items · oldest first within each kind · due clocks from what you promised` : surface === "home" ? "3 clients · 1 thing waiting on you" : "4 clients · 4 things waiting · read 2:06 PM"} actions={surface === "home" ? <StPillLink href="/preview/strelva/agency-canon?frame=requests">New request</StPillLink> : undefined} />
      {!ready ? state === "loading" ? <div role="status" className="space-y-4"><p>Reading {surface === "home" ? "your clients" : surface}…</p><StSkeleton width="85%" /><StSkeleton width="60%" /><StSkeleton /></div> : state === "empty" ? <StEmpty>{surface === "queue" ? "Nothing is waiting across clients." : "No clients yet. A client appears once they share work with your agency."}</StEmpty> : <StNotice tone={state === "error" ? "critical" : "need"}>{state === "permission" ? "Clients, Queue, Library and Team are for agency members. Ask an agency owner to check your access." : <>{surface === "queue" ? "The Queue" : "Clients"} could not be loaded. The read is incomplete. <StPill variant="soft" onClick={() => setRecovered(true)}>Retry</StPill></>}</StNotice> : <>
        {surface === "clients" ? <StTable label="Fictional clients" columns={[{ key: "client", label: "Client" }, { key: "health", label: "Health" }, { key: "waiting", label: "Waiting on" }, { key: "versions", label: "Versions", mono: true }, { key: "minutes", label: "Minutes · Oct", mono: true }, { key: "receipt", label: "Last receipt" }]} rows={clients.map((client, index) => ({ key: client.name, cells: { client: <><StTextButton tone="text" href={index === 3 ? "/preview/strelva/provider-change?role=agency&state=notified" : "/preview/strelva/agency-canon?frame=client"}>{client.name}</StTextButton><small className="block text-xs font-normal text-gray-muted">{client.detail}</small></>, health: index === 3 && !retried ? <><StState kind="need">Couldn’t load this client at 2:06.</StState><small className="block text-xs">Showing Tuesday’s last good read.</small><StTextButton onClick={() => setRetried(true)}>Retry now</StTextButton></> : <StState kind={retried && index === 3 ? "live" : client.kind}>{retried && index === 3 ? HEALTH_LABEL.healthy : client.health}</StState>, waiting: client.waiting, versions: client.versions, minutes: client.minutes, receipt: client.receipt } }))} /> : null}
        {surface === "home" ? <><StSection title="Things to do"><StRows><StRow lead={<StBeacon kind="need" />} title="Review New patient intake for Harbor Dental" detail="Prepared by North Studio · Runs on Strelva · not shown to the client yet" end={<><StTextButton href="/preview/strelva/agency-canon?frame=client">Open client</StTextButton><StPillLink href="/preview/strelva/agency-canon?frame=client" variant="soft">Review</StPillLink></>} /></StRows></StSection><StTable label="Fictional client work" columns={[{ key: "client", label: "Client" }, { key: "open", label: "Open", mono: true }, { key: "state", label: "State" }]} rows={["Harbor Dental", "North Coast Realty", "Fieldwork Studio"].map((name, index) => ({ key: name, cells: { client: name, open: 1, state: <StState kind={index === 0 ? "need" : "live"}>{index === 0 ? "Ready for North Studio’s review" : "In progress"}</StState> } }))} /></> : null}
        {surface === "queue" ? ["Broken", "Requests", "Waiting on owners", "Improvements to offer"].map(group => <StSection key={group} title={group} meta={<StMono>{queue.filter(item => item.group === group).length}</StMono>}><StRows label={group}>{queue.filter(item => item.group === group).map(item => <StRow key={item.title} lead={<StBeacon kind={item.kind} />} title={`${item.client}: ${item.title}`} detail={item.detail} end={<><StMono tone={item.kind === "down" ? "critical" : undefined}>{item.due}</StMono><StPillLink variant="soft" href={item.href}>{item.action}</StPillLink></>} />)}</StRows></StSection>) : null}
      </>}
      <p className="text-xs text-gray-muted">Fictional preview · people, counts, deadlines and last good reads are made up. No email or outside change is sent.</p>
      {receipt ? <StToast>{receipt}</StToast> : null}
    </StPage>
    <StComposerDock><StComposerBar scope="North Studio" placeholder="Bring a client need, Strelva builds it with you" value={ask} onChange={setAsk} disabled={!ready} onSubmit={() => { setReceipt("Preview request saved for scope review. A typed yes does not approve anything."); setAsk(""); }} /></StComposerDock>
  </StrelvaShell></div>;
}

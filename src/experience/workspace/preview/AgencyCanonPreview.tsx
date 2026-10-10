"use client";

import { useState } from "react";
import { TextArea, TextInput } from "@/components/ui/TextInput";
import { StComposerBar, StComposerDock, StEmpty, StHead, StHold, StLabel, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StSkeleton, StState, StSteps, StSurface, StTextButton, StToast } from "@/components/ui/strelva/Kit";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { FICTIONAL_AGENCY_CREDIT, FICTIONAL_AGENCY_MINUTES, FICTIONAL_AGENCY_REQUESTS, type AgencyCanonFrame, type AgencyCanonState } from "./agency-canon-fixture";

const TITLES: Record<AgencyCanonFrame, string> = {
  client: "Harbor Dental", requests: "Requests", approval: "New patient intake is ready for your OK", minutes: "Human minutes", attribution: "What you built, and who uses it",
};
const INTRO: Record<AgencyCanonFrame, string> = {
  client: "Harbor Dental owns this workspace and its data. You build and request here; they can remove your access without losing anything.",
  requests: "Every client need you’ve brought, across 3 clients. Scope is agreed before Strelva builds.",
  approval: "Patients will fill this on your website. Nothing goes live until you approve. You can ask North Studio for changes first.",
  minutes: "130 minutes your team spent in October · logged from Requests, reviews and fixes",
  attribution: "Credit follows the source · royalty rates are not set yet",
};
const link = (frame: AgencyCanonFrame) => `/preview/strelva/agency-canon?frame=${frame}`;

/** Fictional content and local interaction only; no provider call, email or approval write. */
export function AgencyCanonPreview({ frame, state, mode }: { frame: AgencyCanonFrame; state: AgencyCanonState; mode: "light" | "dark" }) {
  const [ask, setAsk] = useState("");
  const [receipt, setReceipt] = useState("");
  const [approved, setApproved] = useState(false);
  const [sent, setSent] = useState(false);
  const [changes, setChanges] = useState(false);
  const [newRequest, setNewRequest] = useState(false);
  const [request, setRequest] = useState("");
  const [retrying, setRetrying] = useState(false);
  const owner = frame === "approval";
  const active = frame === "attribution" ? "library" : frame === "requests" ? "queue" : "clients";
  const scope = owner ? "New patient intake" : frame === "client" ? "Harbor Dental" : "North Studio";
  const available = state === "ready";
  function saveRequest() {
    if (!request.trim()) return;
    setReceipt("Preview request saved for scope review. Nothing was built or sent.");
    setNewRequest(false); setChanges(false); setRequest("");
  }
  return <div data-workspace-theme="linen" data-workspace-mode={mode}>
    <StrelvaShell title="" theme="linen" signedIn={false} signInHref="/preview/strelva?scenario=agency" accountName={owner ? "Owner" : "You"} accountDetail={owner ? "Harbor Dental" : "Agency owner"}
      systemsReleased active={owner ? "home" : undefined} businessContext={<StLabel>{owner ? "Harbor Dental" : "North Studio"}</StLabel>}
      agencyNavigation={owner ? undefined : { active, hrefs: { clients: "/preview/strelva?scenario=agency", queue: "/preview/strelva?scenario=agency&agencyView=queue", library: "/preview/strelva/inquiry-library" } }}
      pinned={owner ? [{ id: "intake", title: "New patient intake", href: link("approval"), kind: "inquiries", current: true }] : [{ id: "harbor", title: "Harbor Dental", href: link("client"), current: frame === "client" }, { id: "north", title: "North Coast Realty", href: "/preview/strelva?scenario=agency" }, { id: "fieldwork", title: "Fieldwork Studio", href: "/preview/strelva?scenario=agency" }]}
      notice={<div className="px-6 text-xs text-gray-muted">Fictional preview · local actions only · no email or publication</div>}>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: "calc(100dvh - 92px)", overflow: "auto" }}>
        <StPage width={frame === "requests" ? "wide" : "column"}>
          <StHead crumb={frame === "client" ? { label: "North Studio", href: "/preview/strelva?scenario=agency" } : owner ? { label: "Built by North Studio with Strelva" } : undefined} title={TITLES[frame]} meta={state === "ready" ? INTRO[frame] : undefined} actions={frame === "requests" && available ? <StPill onClick={() => setNewRequest(true)}>New request</StPill> : undefined} />
          {state === "loading" ? <div className="grid gap-4"><StSkeleton label={`Loading ${TITLES[frame]}`} width="60%" /><StSkeleton width="90%" /><StSkeleton width="75%" /></div> : null}
          {state === "empty" ? <StEmpty>{frame === "minutes" ? "No human minutes recorded this month. Unrecorded time is unknown." : frame === "attribution" ? "No credited sources are available. Royalty rates are not set." : frame === "requests" ? "No client requests yet. Bring a client need to agree its scope." : "There is no prepared change to review. The client’s live systems stay as they are."}</StEmpty> : null}
          {state === "error" ? <StNotice tone="critical"><p className="m-0">This read failed. {frame === "minutes" || frame === "attribution" ? "Totals are unavailable; no saved read is available." : "The prepared change could not be confirmed. Nothing changed."}</p><StTextButton disabled={retrying} onClick={() => { setRetrying(true); setReceipt("The fictional read is still unavailable. No changes were made."); }}>{retrying ? "Read still unavailable" : "Try again"}</StTextButton></StNotice> : null}
          {state === "permission" ? <StNotice tone="need">You do not have permission to read this {owner ? "approval" : "agency view"}. Ask the {owner ? "business" : "agency"} owner to review your access.</StNotice> : null}
          {available && (frame === "client" || owner) ? <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="grid gap-3"><StLabel>New patient intake · built by Strelva · not live</StLabel><StSurface label="New patient intake preview"><div className="grid gap-4"><h2 className="m-0 text-base font-semibold">New patient? Tell us about you</h2><div className={owner ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}><TextInput label="Full name" placeholder={owner ? undefined : "First and last"} readOnly /><TextInput label="Date of birth" placeholder={owner ? undefined : "MM / DD / YYYY"} readOnly /></div><TextInput label="Phone" placeholder={owner ? undefined : "Best number to reach you"} readOnly /><TextInput label="Reason for your visit" placeholder={owner ? undefined : "Cleaning, a toothache, a second opinion…"} readOnly /><p className="m-0 rounded-lg bg-surface-inset px-4 py-3 text-center text-sm text-gray-muted">Send to Harbor Dental · preview only</p></div></StSurface></div>
            <div className="order-first lg:order-last"><StSection title={owner ? "Before you approve" : "Ready for your review"}>
              {!owner ? <p className="m-0 text-base">Strelva built this from your request. Check it before Harbor Dental sees it.</p> : null}
              <StSteps label="Intake review" steps={[{ title: "Rehearsed with a made-up patient", state: "done" }, { title: "Sends to the inbox Harbor Dental chose", state: "done" }, { title: "Shows on the site after Harbor Dental approves", state: approved ? "done" : "pending" }]} />
              {owner ? <StHold label={approved ? "Approved in preview" : "Hold to approve"} block disabled={approved} onAccept={() => { setApproved(true); setReceipt("Approval rehearsed in this preview. Nothing was published."); }} /> : <StPill disabled={sent} onClick={() => { setSent(true); setReceipt("Owner review prepared in this preview. Owner notifications are off; no email was sent."); }}>{sent ? "Owner review prepared" : "Send to Harbor Dental"}</StPill>}
              <StTextButton onClick={() => { setChanges(true); setRequest(""); }}>{owner ? "Ask North Studio for changes" : "Ask for changes"}</StTextButton>
              {!owner ? <StTextButton href={link("approval")}>Open the fictional owner review</StTextButton> : null}
            </StSection></div>
          </div> : null}
          {available && frame === "requests" ? <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5">{["Asked", "Ready for your review", "Open", "With the client", "Done"].map(stage => { const rows = FICTIONAL_AGENCY_REQUESTS.filter(row => row.stage === stage); return <StSection key={stage} title={<StState kind={stage === "Ready for your review" ? "need" : stage === "Open" ? "live" : "draft"}>{stage}</StState>} meta={<StMono>{rows.length}</StMono>}>{rows.length ? rows.map(row => <StSurface key={row.title} tone={stage === "Ready for your review" ? "need" : undefined} label={row.title}><StLabel>{row.client}</StLabel><p className="mb-2 mt-3 text-sm font-medium">{row.title}</p><StTextButton href={stage === "Ready for your review" ? link("client") : undefined} onClick={stage === "Ready for your review" ? undefined : () => setReceipt(`${row.title}: open; scope and deadline have not been agreed.`)}>{stage === "Ready for your review" ? "Review" : "Open request"}</StTextButton></StSurface>) : <StEmpty>Nothing here</StEmpty>}</StSection>; })}</div> : null}
          {available && frame === "minutes" ? <>
            <StSection title="October" meta="Minutes recorded per client"><StRows label="Human minutes per client">{FICTIONAL_AGENCY_MINUTES.map(row => <StRow key={row.client} title={row.client} detail={row.reason} end={<div style={{ display: "flex", alignItems: "center", gap: 10, width: 240, maxWidth: "100%" }}><meter aria-label={`${row.client}: ${row.minutes} recorded minutes`} min={0} max={61} value={row.minutes} style={{ width: "100%", accentColor: "var(--st-accent)" }} /><StMono tone="text">{row.minutes}</StMono></div>} />)}</StRows></StSection>
            <StNotice><div className="grid gap-6 sm:grid-cols-2"><div><StLabel>Why this matters</StLabel><p className="mb-0 mt-2 text-sm">North Coast Realty took nearly half your recorded time this month, mostly the form outage. Strelva fixed the cause in this fictional example. Next month’s time is unknown.</p></div><div><StLabel>Strelva did without you</StLabel><p className="mb-0 mt-2 text-sm">212 replies, checks and reminders across 4 fictional clients</p></div></div></StNotice>
          </> : null}
          {available && frame === "attribution" ? <>
            <StSection title="Sources" meta="Royalty · October"><StRows label="Source attribution">{FICTIONAL_AGENCY_CREDIT.map(row => <StRow key={row.source} title={row.source} detail={row.usage} end={<><span className="max-w-48 text-sm text-gray-muted">{row.credit}</span><StMono tone="text">[amount]</StMono></>} />)}</StRows></StSection>
            <StNotice>When another agency’s client runs your source, it’s credited here. You get the count, never their client’s name. Rates are not set; these placeholders are not earnings.</StNotice>
          </> : null}
          {(newRequest || changes) && available ? <StSurface label={changes ? "Request changes" : "New client request"}><form className="grid gap-4" onSubmit={event => { event.preventDefault(); saveRequest(); }}><TextArea label={changes ? "What should change?" : "What does the client need?"} value={request} onChange={event => setRequest(event.target.value)} required rows={3} /><div className="flex flex-wrap items-center gap-4"><StPill variant="soft" disabled={!request.trim()} onClick={saveRequest}>Save for scope review</StPill><StTextButton onClick={() => { setChanges(false); setNewRequest(false); }}>Cancel</StTextButton></div></form></StSurface> : null}
          {receipt ? <StToast>{receipt}</StToast> : null}
        </StPage>
        <div style={{ marginTop: "auto", paddingBottom: 20 }}><StComposerDock><StComposerBar scope={scope} placeholder={frame === "client" ? "Ask about Harbor Dental" : owner ? "Ask Strelva to change or make something" : "Bring a client need"} value={ask} onChange={setAsk} disabled={!available} onSubmit={() => { setReceipt("Preview request saved for scope review. A typed yes does not approve or publish anything."); setAsk(""); }} /></StComposerDock></div>
      </div>
    </StrelvaShell>
  </div>;
}

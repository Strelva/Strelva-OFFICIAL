"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ownerConversationSiteFixture } from "@/experience/ask/website-comparison-fixture";
import { AskStrelva } from "@/experience/ask/AskStrelva";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StEmpty, StHold, StLedger, StMono, StNotice, StPill, StRows, StRow, StSegmented, StSkeleton, StState, StSteps, StSurface, StTextButton, StToast } from "@/components/ui/strelva/Kit";
import { OWNER_CONVERSATIONS, OWNER_CONVERSATION_BUSINESS, OWNER_CONVERSATION_WORKSPACE, ownerConversationMessages, ownerConversationTransport, type OwnerConversationFrame, type OwnerConversationState } from "./owner-conversation-fixture";
import styles from "./owner-conversation.module.css";

/** All object actions in this page change React state only. No authority or provider is simulated. */
export function OwnerConversationPreview({ frame, state, mode = "light" }: { frame: OwnerConversationFrame; state: OwnerConversationState; mode?: "light" | "dark" }) {
  const fixture = OWNER_CONVERSATIONS[frame];
  const request = useMemo(() => ownerConversationTransport(state), [state]);
  const messages = useMemo(() => state === "permission" ? [] : ownerConversationMessages(frame, state), [frame, state]);
  return <div data-workspace-theme="linen" data-workspace-mode={mode}>
    <StrelvaShell active={frame === "YsBMM" ? "help" : "ask"} title={fixture.title} systemsReleased appBase="/preview/strelva" accountName="Preview owner" signOut={<StTextButton href="/preview/strelva">Leave preview</StTextButton>}
      businessContext={<span>{OWNER_CONVERSATION_BUSINESS}</span>}
      notice={<StNotice>Fictional conversation and results. Controls change this preview only; nothing is sent, published, booked or saved.</StNotice>}
      navigation={<nav className={styles.conversations} aria-label="Fictional conversations">{Object.entries(OWNER_CONVERSATIONS).map(([id, conversation]) => <Link key={id} href={`/preview/strelva/owner-conversation?frame=${id}&mode=${mode}`} aria-current={id === frame ? "page" : undefined}>{conversation.title}</Link>)}</nav>}
    >
      <div className={styles.scroll}>
      <AskStrelva key={`${frame}:${state}`} workspaceId={OWNER_CONVERSATION_WORKSPACE} businessName={OWNER_CONVERSATION_BUSINESS} systemName={fixture.scope} request={request}
        initialMessages={messages} readOnly={state === "permission"} readOnlyReason="You can’t ask or approve in this preview state. Open a business where you have access."
        refusalLinks={{ needsYou: "/preview/strelva/owner-decision", help: "/preview/strelva/owner-conversation?frame=YsBMM" }}
        renderResult={message => message.id !== "fixture-result" ? undefined : state === "loading" ? <LoadingResult /> : state === "error" ? <StNotice tone="critical">This saved result could not be read. Nothing changed. <StTextButton href={`/preview/strelva/owner-conversation?frame=${frame}`}>Try again</StTextButton></StNotice> : <ConversationObject frame={frame} />}
      />
      </div>
    </StrelvaShell>
  </div>;
}

function LoadingResult() {
  return <StSurface label="Loading saved result"><div className={styles.stack}><StSkeleton label="Loading result title" width="48%" /><StSkeleton label="Loading result content" /><StSkeleton label="Loading result details" width="80%" /></div></StSurface>;
}

function ConversationObject({ frame }: { frame: OwnerConversationFrame }) {
  if (frame === "Y2Tn3F") return <WebsiteReceipt />;
  if (frame === "Q1IkY") return <SessionReceipt />;
  if (frame === "s7xyY") return <WorkingResult />;
  if (frame === "T8pknG") return <IntakeProposal />;
  if (frame === "ABt1D") return <FactDecision />;
  if (frame === "HQ5yA") return <RefusalResult />;
  return <HelpResult />;
}

function WebsiteReceipt() {
  const [view, setView] = useState<"before" | "after">("after");
  const [undone, setUndone] = useState(false);
  return <div className={styles.stack}>
    <StSurface pad={false} label="Fictional website receipt">
      <div className={styles.objectHeader}><strong>fictionalfirm.example</strong><StSegmented label="Website comparison" value={view} onChange={setView} options={[{ value: "before", label: "Before" }, { value: "after", label: "After" }]} /></div>
      <iframe className={styles.site} srcDoc={ownerConversationSiteFixture(view === "after" && !undone)} title={`Fictional firm fees page · ${view === "after" && !undone ? "After" : "Before"}`} sandbox="" />
      <StLedger path="fictionalfirm.example/fees" count="1 change" action={<StTextButton onClick={() => { setUndone(!undone); setView(undone ? "after" : "before"); }}>{undone ? "Reapply preview" : "Undo"}</StTextButton>}
        lines={view === "after" && !undone ? [{ sign: "+", text: "Half-day and full-day session fees, linked from Fees" }] : [{ sign: "-", text: "Fees are not shown on this fixture page" }]} />
    </StSurface>
    {undone ? <StToast>Undone in this preview. No live website changed.</StToast> : <StNotice>Simulated published receipt. Before and After show fictional website copy and example fees. This comparison changes this preview only.</StNotice>}
    <StTextButton href="/preview/strelva?scenario=mooney&needsYou=on&systems=on&view=needs-you">Review the decisions in the fictional business</StTextButton>
  </div>;
}

function SessionReceipt() {
  const [undone, setUndone] = useState(false);
  return <div className={styles.stack}>
    <StLedger path="fictionalfirm.example" count="1 page" action={<StTextButton onClick={() => setUndone(!undone)}>{undone ? "Reapply preview" : "Undo"}</StTextButton>}
      lines={[{ sign: undone ? "-" : "+", text: "Request a session date form; open dates only: Wed 14 afternoon, Fri 16, Fri 23" }]} />
    <StLedger path="Mediation sessions · state" lines={undone ? [{ sign: "+", text: "Draft" }] : [{ sign: "-", text: "Draft" }, { sign: "+", text: "Live for requests; each one waits for you to confirm" }]} />
    <StNotice>No one was emailed. Undo resets this fictional receipt only.</StNotice>
    {undone ? <StToast>Undone in this preview.</StToast> : null}
  </div>;
}

function WorkingResult() {
  const [stopped, setStopped] = useState(false);
  return <StSurface label="Inquiries preparation">
    <div className={styles.objectHeader}><StState kind={stopped ? "draft" : "live"}>{stopped ? "Stopped in this preview" : "Inquiries · working"}</StState><StMono>0:42</StMono><StTextButton onClick={() => setStopped(!stopped)}>{stopped ? "Continue preview" : "Stop"}</StTextButton></div>
    <StSteps label="Fictional preparation progress" steps={[
      { title: "Read the form on fictionalfirm.example", state: "done", time: "0:04", detail: "It sends to Inquiries" },
      { title: "Drafted routing to the owner", state: "done", time: "0:12", detail: "New inquiries go to owner@example.invalid" },
      { title: "Rehearsing with a made-up inquiry", state: stopped ? "pending" : "active", time: "0:31", detail: "Test inbox only. Nothing leaves Strelva." },
      { title: "Waiting for your OK", state: "pending", time: "—", detail: "You'll see the follow-up message before it's used" },
    ]} />
  </StSurface>;
}

function IntakeProposal() {
  const [accepted, setAccepted] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [fields, setFields] = useState({ name: "", company: "", conflict: "", people: "", dates: "" });
  if (rejected) return <StEmpty action={<StTextButton onClick={() => setRejected(false)}>Open the Possibility again</StTextButton>}>Rejected in this preview. No System was created.</StEmpty>;
  return <StSurface pad={false} label="Proposed HR intake form">
    <div className={styles.objectHeader}><strong>HR intake</strong><StMono>Proposed · based on Mediation intake</StMono></div>
    <form className={styles.intake} onSubmit={event => event.preventDefault()}>
      {([
        ["name", "Your name", "Full name"], ["company", "Company", "Company name"], ["conflict", "What is the conflict about?", "A sentence is enough"], ["people", "How many people are involved?", "For example, two managers"], ["dates", "Dates that could work", "Week of …"],
      ] as const).map(([id, label, placeholder]) => <label key={id} className={id === "name" || id === "company" ? styles.halfField : styles.field}>{label}<input value={fields[id]} placeholder={placeholder} onChange={event => setFields(current => ({ ...current, [id]: event.target.value }))} /></label>)}
    </form>
    <div className={styles.objectFooter}><p>Internal tool. Its records stay separate from Mediation intake. This form keeps input in this view only.</p><StTextButton onClick={() => setRejected(true)} disabled={accepted}>Not yet</StTextButton><StHold label={accepted ? "Made in this preview" : "Hold to make it live"} onAccept={() => setAccepted(true)} disabled={accepted} /></div>
    {accepted ? <div className={styles.receipt}><StToast>Accepted in this preview. No System or record was saved.</StToast></div> : null}
  </StSurface>;
}

function FactDecision() {
  const [status, setStatus] = useState<"open" | "confirmed" | "removed">("open");
  const [editing, setEditing] = useState(false);
  const [quote, setQuote] = useState("Once the conflict check clears, we confirm availability, fees and the next step.");
  return <StSurface pad={false} label="Rebuilt website fact decision">
    <div className={styles.objectHeader}><strong>Rebuilt fictionalfirm.example</strong><StState kind="draft">Not live yet</StState><StMono>Decision 2 of 2 · fact 1 of 40</StMono></div>
    <div className={styles.factBody}><StState kind={status === "open" ? "need" : "draft"}>{status === "open" ? "Sensitive claim · needs your OK" : status === "confirmed" ? "Confirmed in this preview" : "Removed in this preview"}</StState>
      {editing ? <label className={styles.field}>Edit this fact<textarea rows={4} value={quote} onChange={event => setQuote(event.target.value)} /></label> : <blockquote>“{quote}”</blockquote>}
      <p>Source: fictionalfirm.example current site · fictional quote</p>
    </div>
    <div className={styles.objectFooter}><p>Confirm keeps this sentence on the rebuilt preview. Thirty-nine fictional facts follow.</p><StTextButton disabled={status !== "open"} onClick={() => setStatus("removed")}>Remove</StTextButton><StTextButton disabled={status !== "open"} onClick={() => setEditing(!editing)}>{editing ? "Finish editing" : "Edit"}</StTextButton><StHold label="Confirm" onAccept={() => setStatus("confirmed")} disabled={status !== "open" || !quote.trim()} /></div>
    {status !== "open" ? <div className={styles.receipt}><StToast onUndo={() => setStatus("open")}>{status === "confirmed" ? "Confirmed" : "Removed"} in this preview. Nothing published.</StToast></div> : null}
  </StSurface>;
}

function RefusalResult() {
  const [accepted, setAccepted] = useState(false);
  const [requested, setRequested] = useState(false);
  return <div className={styles.stack}>
    <StRows><StRow title="Start a newsletter people sign up for" detail="A Possibility you can try before anything is sent." end={<StTextButton href="/preview/strelva?scenario=managed&systems=on&publishing=on">Try it in the fictional business</StTextButton>} />
      <StRow title="Ask an agency to do it another way" detail="Becomes a Request. Scope and date still need to be agreed." end={<StTextButton onClick={() => setRequested(true)}>Make it a Request</StTextButton>} /></StRows>
    {requested ? <StToast>Request shown at Asked in this preview. Nothing was filed or accepted.</StToast> : null}
    <StNotice>Saying yes here doesn’t publish anything. The fees update waits in Needs you with its own control, so you see the change before it goes live.</StNotice>
    <StSurface label="Exact fees decision"><div className={styles.stack}><StState kind="need">Needs you · update the fees page</StState><StLedger path="fictionalfirm.example/fees" lines={[{ sign: "+", text: "Half-day and full-day session fees" }]} /><StHold label={accepted ? "Published in preview" : "Hold to make it live"} onAccept={() => setAccepted(true)} disabled={accepted} />{accepted ? <StToast>Accepted in this preview. No live website changed.</StToast> : null}</div></StSurface>
  </div>;
}

function HelpResult() {
  const [prepared, setPrepared] = useState(false);
  return <div className={styles.stack}>
    <StSurface label="Review invitation permissions"><StSteps label="Invitation permission review" steps={[
      { title: "Open the business menu, then People & access", state: "pending" },
      { title: "Review Member, Admin and Owner permissions; a read-only business role is not available", state: "pending" },
      { title: "Invite only if one of those roles matches the access you want", state: "pending" },
    ]} /></StSurface>
    <div className={styles.actions}><StPill onClick={() => setPrepared(true)}>Review supported roles in this preview</StPill><StTextButton href="/preview/strelva?scenario=managed&view=access">Open People &amp; access</StTextButton></div>
    {prepared ? <StNotice tone="need">Read-only business access is not available. This preview has prepared no invitation and sends no email.</StNotice> : null}
  </div>;
}

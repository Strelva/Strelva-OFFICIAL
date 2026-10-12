"use client";

import { STRELVA_HANDLED_LABEL } from "@/platform/presentation/place-labels";

import { useMemo, useState } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StComposerBar, StComposerDock, StHead, StNotice, StPage, StPill, StSegmented, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { NeedsYouSection, StrelvaHandledSection } from "../NeedsYouSection";
import { useNeedsYou } from "../useNeedsYou";
import { WorkspaceRequestContext } from "../WorkspaceRequest";
import { createOwnerDecisionTransport, fictionalReceiptGroups, ownerDecisionWorkspace, type OwnerDecisionPreviewState } from "./owner-decision-fixture";
import styles from "./owner-decision-preview.module.css";

export function OwnerDecisionPreview({ state, dark, view = "decision" }: { state: OwnerDecisionPreviewState; dark: boolean; view?: "decision" | "receipts" }) {
  const transport = useMemo(() => createOwnerDecisionTransport(state), [state]);
  return <div data-workspace-theme="linen" data-workspace-mode={dark ? "dark" : "light"}>
    <WorkspaceRequestContext.Provider value={transport}><DecisionContent key={state} view={view} /></WorkspaceRequestContext.Provider>
  </div>;
}

function DecisionContent({ view }: { view: "decision" | "receipts" }) {
  const needs = useNeedsYou(ownerDecisionWorkspace);
  const [duration, setDuration] = useState<"half" | "full">("half");
  const [date, setDate] = useState<"14" | "16" | "23">("16");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [formNotice, setFormNotice] = useState("");
  const loaded = needs.state.status === "ready" ? needs.state : null;
  const ready = Boolean(loaded?.items.length);
  return <StrelvaShell title={view === "receipts" ? STRELVA_HANDLED_LABEL : "Session date scope"} active="requests" systemsReleased accountName="Fictional owner" appBase="/preview/strelva" signOut={<span>Local preview</span>}
    workspaceName="Fictional mediation firm"
    notice={<p role="note" className={styles.fixtureNotice}>Fictional preview · decisions and Undo change this browser rehearsal only. No website, calendar, message or provider write.</p>}>
    <StPage>
      <StHead title={view === "receipts" ? STRELVA_HANDLED_LABEL : "Let attorneys request a session date"} crumb={{ label: "Requests", href: "/preview/strelva/owner-request" }} meta={view === "receipts" ? "Fictional receipts from the last 7 days, grouped by source." : "This is the proposed form attorneys would see on the fictional website."} />
      {view === "receipts" ? loaded && loaded.handled.length ? fictionalReceiptGroups.map((group, index) => <StrelvaHandledSection key={group.source} headingId={`fixture-handled-${index}`} title={group.source} state={{ ...loaded, handled: loaded.handled.filter(receipt => group.receipts.some(value => value.id === receipt.id)) }} pending={needs.pending} notices={needs.receiptNotices} onUndo={needs.undo} />)
        : <StrelvaHandledSection state={needs.state} pending={needs.pending} notices={needs.receiptNotices} onUndo={needs.undo} /> : <>
        {ready ? <StSurface label="Proposed session-date form"><div className={styles.proposedForm}>
          <h2>Request a session date</h2>
          <StSegmented label="Session length" value={duration} options={[{ value: "half", label: "Half-day" }, { value: "full", label: "Full-day" }]} onChange={setDuration} />
          <StSegmented label="Offered dates in October 2026" value={date} options={[{ value: "14", label: "Wed Oct 14" }, { value: "16", label: "Fri Oct 16" }, { value: "23", label: "Fri Oct 23" }]} onChange={setDate} />
          <StPill variant="soft" block onClick={() => setFormNotice("This is a form preview. No date was requested or booked.")}>Try requesting this date</StPill>
          {formNotice ? <p role="status">{formNotice}</p> : null}
        </div></StSurface> : null}
        <NeedsYouSection variant="deck" state={needs.state} pending={needs.pending} notices={needs.notices} onDecide={needs.decide} onRetry={needs.refresh} empty={<StNotice>Nothing needs you. The form is still a fictional preview.</StNotice>} />
        {reply ? <StNotice>{reply} <StTextButton href="/preview/strelva/owner-decision">Open the decision</StTextButton></StNotice> : null}
      </>}
    </StPage>
    {view === "decision" ? <StComposerDock><StComposerBar scope="Mediation sessions" placeholder="Ask about this decision" value={message} onChange={setMessage} onSubmit={() => { setReply("A typed yes changes nothing. Use this decision’s own Hold control to accept the form, or Not yet to leave it a draft."); setMessage(""); }} /></StComposerDock> : null}
  </StrelvaShell>;
}

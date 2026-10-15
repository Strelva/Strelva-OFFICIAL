"use client";

import { useMemo, useState } from "react";
import { PREVIEW_NORTH_BRAND } from "./chrome-fixture";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { StComposerBar, StComposerDock, StHead, StNotice, StPage, StPill, StRow, StRows, StSection, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import { AgencyTeamPreview } from "../agency/AgencyTeamPreview";
import { AgencyVerification } from "../agency/AgencyOnboarding";
import { WorkspaceRequestContext } from "../WorkspaceRequest";
import ProviderChangeNotices from "@/app/workspace/provider-change/ProviderChangeNotices";
import type { AgencyEffectState } from "@/platform/workspaces/agency-onboarding";

/** Fictional people, agency and dates. Every interaction remains in the preview. */
export function AgencyPeoplePreview({ surface, state, role = "agency", mode = "light" }: { surface: "team" | "verification" | "handoff"; state: string; role?: string; mode?: string }) {
  const [ask, setAsk] = useState("");
  const [reply, setReply] = useState("");
  const business = "d2940000-0000-4000-8000-000000000010";
  const clocked = state === "notified";
  const request = useMemo<typeof fetch>(() => async (_url, init) => {
    const action = JSON.parse(String(init?.body ?? "{}"));
    if (state === "action-error") return Response.json({ error: "Fictional handoff response could not be recorded." }, { status: 503 });
    return Response.json({ id: action.requestId, status: action.action === "cancel" ? "cancelled" : action.action === "complete" ? "completed" : "notified", kind: "handoff_ready", note: action.note, respond_by: "2099-01-01T00:00:00Z" });
  }, [state]);
  const effects: AgencyEffectState[] = ["publish", "google", "email", "payments"].map(effect => ({ effect: effect as AgencyEffectState["effect"], verified: state === "verified" || (state === "partial" && effect === "publish"), recordedAt: null }));
  return <div data-workspace-theme="linen" data-workspace-mode={mode}>
    <StrelvaShell ownerBrand={PREVIEW_NORTH_BRAND} workspaceName="North Studio" title="North Studio" accountName="You" accountDetail="Agency owner" systemsReleased agencyNavigation={{ active: surface === "team" ? "team" : surface === "verification" ? "verification" : "clients", hrefs: { home: "/preview/strelva/agency-portfolio", verification: "/preview/strelva/agency-verification", clients: "/preview/strelva?scenario=agency", queue: "/preview/strelva?scenario=agency&agencyView=queue", library: "/preview/strelva?scenario=agency&agencyView=library", team: "/preview/strelva/agency-people?surface=team" } }}>
      <StPage>
        {surface === "team" ? <><StHead title="Team" meta="Invite a teammate and assign their clients." /><AgencyTeamPreview state={state} /></> : null}
        {surface === "verification" ? state === "loading" ? <><StHead title="Verification" /><StSkeleton label="Loading verification" /></> : state === "error" || state === "permission" ? <><StHead title="Verification" /><StNotice tone="critical">{state === "permission" ? "This agency’s verification is not available to your account." : "Verification could not be loaded. Outside changes stay locked."}</StNotice></> : <AgencyVerification fictionalQualification={{ workspaceId: "22222222-2222-4222-8222-222222222222", canSubmit: true, submissions: [], effects: effects.map(item => ({ effect: item.effect, available: item.verified })) }} onboarding={{ agency: { id: "22222222-2222-4222-8222-222222222222", name: "North Studio", role: "owner" }, effects: state === "empty" ? [] : effects }} /> : null}
        {surface === "handoff" ? <>
          <StHead crumb={{ label: "Clients", href: "/preview/strelva?scenario=agency" }} title="Fieldwork Studio is moving to Pine & Co." meta="Jo decided on Oct 8 · takes effect Oct 22 · you don’t need to approve" beacon="draft" />
          {!['loading', 'empty', 'error', 'permission'].includes(state) ? <>
            <div className="grid gap-8 md:grid-cols-2">
              <StSection title="Goes with Fieldwork"><StRows>
                <StRow title="Every System, keeps running as it is today" />
                <StRow title="All history and receipts, including your work" />
                <StRow title="Their Version of Intake form, frozen at Release 6" />
              </StRows></StSection>
              <StSection title="Stays with North Studio"><StRows>
                <StRow title="Intake form as a source in your Library" />
                <StRow title="Credit for Release 1–Release 6, shown to Pine & Co." />
                <StRow title="Your minutes and notes on Fieldwork" />
              </StRows></StSection>
            </div>
            <StSection title="Before Oct 22"><StRows><StRow title="1 open request: new project gallery" end={<><StTextButton onClick={() => setReply("Fictional request prepared for Pine & Co. No message was sent.")}>Hand to Pine & Co.</StTextButton><StPill variant="soft" onClick={() => setReply("Fictional request opened for North Studio to finish.")}>Finish it</StPill></>} /></StRows></StSection>
            <p className="text-xs text-gray-muted">Transfer summary and the open request are fictional. The current handoff read supplies notice status and responses only.</p>
          </> : null}
          {state === "loading" ? <StSkeleton label="Loading agency handoff" /> : state === "error" || state === "permission" ? <StNotice tone="critical">{state === "permission" ? "This handoff is not available to your account." : "Agency handoff could not be loaded. No provider has changed."}</StNotice> : <WorkspaceRequestContext.Provider value={request}><ProviderChangeNotices key={`${state}:${role}`} workspaceId={role === "agency" ? "d2940000-0000-4000-8000-000000000020" : business} canCancel={role === "owner"} requests={state === "empty" ? [] : [{ id: "d2940000-0000-4000-8000-000000000040", business_workspace_id: business, status: state === "action-error" ? "notified" : state, respond_by: clocked || state === "action-error" ? "2099-01-01T00:00:00Z" : null, policy_version: clocked || state === "awaiting_notice" ? "fictional-ui-policy" : null, responses: clocked ? [{ kind: "acknowledged", note: "Outgoing agency read the notice." }] : [] }]} /></WorkspaceRequestContext.Provider>}
        </> : null}
        {reply ? <p role="status" className="text-sm text-gray-muted">{reply}</p> : null}
        <p className="text-xs text-gray-muted">Fictional preview. No invitation, email or agency change leaves this page.</p>
      </StPage>
      <StComposerDock><StComposerBar scope={surface === "handoff" ? "Fieldwork Studio" : "North Studio"} placeholder={`Ask about ${surface === "team" ? "your team" : surface === "verification" ? "verification" : "this move"}`} value={ask} onChange={setAsk} onSubmit={() => { setAsk(""); setReply("This preview does not send messages. Use the controls above to rehearse this decision."); }} /></StComposerDock>
    </StrelvaShell>
  </div>;
}

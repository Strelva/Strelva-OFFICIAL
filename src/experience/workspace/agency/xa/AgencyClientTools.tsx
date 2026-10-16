"use client";
/**
 * XA · AG3 · The agency's own tools for one client, under the client page:
 * the decisions this agency may make in its Full-control areas, and its
 * responsibility, availability and time for the client. Each opens in place
 * and reads only once opened, so opening the page decides nothing.
 */
import { useState } from "react";
import { AgencyClientDecisions } from "../AgencyClientDecisions";
import { ClientAdditionalControlsBody } from "../AgencyViews";
import { AgencyFold } from "./AgencyFold";

export function AgencyClientTools({ workspaceId, clientName, agencyWorkspaceId, agencyName, viewerEmail, canManage, request }: {
  workspaceId: string; clientName: string; agencyWorkspaceId: string; agencyName: string; viewerEmail?: string; canManage?: boolean; request?: typeof fetch;
}) {
  const [decisions, setDecisions] = useState(false);
  const [carried, setCarried] = useState(false);
  return <>
    <AgencyFold label={`Decisions ${agencyName} can make here`} onToggle={next => { if (next) setDecisions(true); }}>
      {decisions ? <AgencyClientDecisions key={`${agencyWorkspaceId}:${workspaceId}`} workspaceId={workspaceId} agencyWorkspaceId={agencyWorkspaceId} clientName={clientName} request={request} /> : null}
    </AgencyFold>
    <AgencyFold label="Responsibility, availability and time" onToggle={next => { if (next) setCarried(true); }}>
      {carried ? <ClientAdditionalControlsBody workspaceId={workspaceId} clientName={clientName} agencyWorkspaceId={agencyWorkspaceId} viewerEmail={viewerEmail} canManage={canManage} request={request} /> : null}
    </AgencyFold>
  </>;
}

"use client";

import { useEffect, useState } from "react";
import { StEmpty, StHead, StNotice, StPage, StRow, StRows, StSection, StSkeleton, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { providerDefinition } from "@/platform/connections/providers";
import type { WorkspaceConnection } from "@/platform/connections/contracts";
import { accountSetupChoices, accountHolderLabel, connectionNextStep, connectionSetupHref, connectionsResponseSchema, type ConnectionsResponse } from "./model";

type Read = { scope: string; state: "loading" } | { scope: string; state: "error" } | { scope: string; state: "permission" } | { scope: string; state: "ready"; data: ConnectionsResponse };
export interface WorkspaceConnectionsProps {
  workspaceId: string;
  workspaceKind: "customer" | "agency";
  workspaceName: string;
  names?: ReadonlyMap<string, string>;
  systems?: readonly { id: string; name: string }[];
  canManage?: boolean;
  canRead?: boolean;
  request?: typeof fetch;
}

export function WorkspaceConnections({ workspaceId, workspaceKind, workspaceName, names = new Map(), systems = [], canManage = false, canRead = true, request = fetch }: WorkspaceConnectionsProps) {
  const [read, setRead] = useState<Read>({ scope: workspaceId, state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!canRead) return;
    const abort = new AbortController();
    setRead({ scope: workspaceId, state: "loading" });
    void request(`/api/workspace/connections?${new URLSearchParams({ workspaceId })}`, { credentials: "same-origin", cache: "no-store", signal: abort.signal }).then(async response => {
      if (response.status === 401 || response.status === 403) { if (!abort.signal.aborted) setRead({ scope: workspaceId, state: "permission" }); return; }
      if (!response.ok) throw new Error("Connections unavailable");
      const data = connectionsResponseSchema.parse(await response.json());
      if (data.connections.some(row => row.workspaceId !== workspaceId)) throw new Error("Connections belong to another workspace");
      if (!abort.signal.aborted) setRead({ scope: workspaceId, state: "ready", data });
    }).catch(() => { if (!abort.signal.aborted) setRead({ scope: workspaceId, state: "error" }); });
    return () => abort.abort();
  }, [workspaceId, request, canRead, attempt]);
  const current: Read = read.scope === workspaceId ? read : { scope: workspaceId, state: "loading" };
  const holderNames = new Map(names).set(workspaceId, workspaceName);
  return <StPage><StHead title="Connections" meta={`The outside accounts ${workspaceName} works with.`} />
    {!canRead || current.state === "permission" ? <StNotice>You don’t have access to this workspace’s Connections. Ask its owner for access.</StNotice>
      : current.state === "loading" ? <div role="status" aria-label="Loading Connections" className="space-y-4"><StSkeleton width="70%" /><StSkeleton width="45%" /></div>
      : current.state === "error" ? <StNotice tone="critical">Connections could not be loaded. <StTextButton onClick={() => setAttempt(value => value + 1)}>Try again</StTextButton></StNotice>
      : <div className="space-y-8">
        <StTextButton onClick={() => setAttempt(value => value + 1)}>Refresh</StTextButton>
        {current.data.sourceErrors.length ? <StNotice tone="need">Some accounts could not be read: {current.data.sourceErrors.map(provider => providerDefinition(provider).label).join(", ")}. Their connection state is unknown. <StTextButton onClick={() => setAttempt(value => value + 1)}>Try again</StTextButton></StNotice> : null}
        {!current.data.connections.length ? <StEmpty>{current.data.sourceErrors.length ? "No accounts could be confirmed from the available sources." : "No outside accounts are connected yet. Apps show the Connections they need before you install."}</StEmpty> : <StSection title="Accounts"><StRows label="Connected accounts">{current.data.connections.map(connection => <ConnectionRow key={connection.ref} connection={connection} workspaceId={workspaceId} workspaceKind={workspaceKind} names={holderNames} systems={systems} canManage={canManage} />)}</StRows></StSection>}
        {canManage && accountSetupChoices(workspaceKind).some(provider => !current.data.connections.some(row => row.provider === provider) && !current.data.sourceErrors.includes(provider)) ? <StSection title="Add an account"><p className="text-sm text-gray-muted">Open setup to check availability and connect an account.</p><StRows label="Account setup">{accountSetupChoices(workspaceKind).filter(provider => !current.data.connections.some(row => row.provider === provider) && !current.data.sourceErrors.includes(provider)).map(provider => {
          const eligibility = current.data.providerEligibility?.[provider];
          const unavailable = eligibility && !eligibility.eligible ? eligibility : null;
          return <StRow key={provider} title={providerDefinition(provider).label} detail={unavailable?.message} href={unavailable ? undefined : provider === "stripe" && workspaceKind === "agency" ? `/workspace/payment-links?${new URLSearchParams({ workspaceId })}` : connectionSetupHref({ provider }, workspaceId)} end={unavailable ? <StState kind="draft">Coming soon</StState> : "Open setup"} />;
        })}</StRows></StSection> : null}
        <p className="text-sm text-gray-muted">A Connection supplies an account. People & access controls who can act for this workspace.</p>
      </div>}
  </StPage>;
}

function ConnectionRow({ connection, workspaceId, workspaceKind, names, systems, canManage }: { connection: WorkspaceConnection; workspaceId: string; workspaceKind: "customer" | "agency"; names: ReadonlyMap<string, string>; systems: readonly { id: string; name: string }[]; canManage: boolean }) {
  const next = connectionNextStep(connection);
  const unavailable = connection.state === "unavailable" || connection.unavailableReason !== null;
  const reconnect = connection.state === "stale" || connection.accountHolder.kind === "unknown" || connection.accessThrough.kind === "unknown";
  const action = unavailable ? "Coming soon" : reconnect ? "Reconnect" : connection.state === "disconnected" ? "Connect" : "Manage";
  const states = { connected: "Connected", stale: "Needs reconnection", disconnected: "Disconnected", unavailable: "Unavailable" };
  const agency = connection.accessThrough.kind === "agency" ? names.get(connection.accessThrough.workspaceId) || "Agency name unavailable" : null;
  return <StRow title={providerDefinition(connection.provider).label} detail={connection.accountLabel || "Account name not recorded"} align="start" end={<StState kind={unavailable || connection.state === "stale" ? "need" : connection.state === "connected" ? "live" : "draft"}>{unavailable ? "Coming soon" : states[connection.state]}</StState>}>
    <div className="space-y-3 text-sm">
      <p><span className="text-gray-muted">Whose account: </span>{accountHolderLabel(connection.accountHolder, workspaceId, workspaceKind, names)}</p>
      {connection.accessThrough.kind !== "platform" ? <p><span className="text-gray-muted">Access: </span>{agency ? `Through ${agency}’s ${connection.provider === "google_business_profile" ? "Google" : providerDefinition(connection.provider).label} access` : "Unknown"}</p> : null}
      <div><span className="text-gray-muted">Systems using it: </span>{connection.systemIds.length ? <ul className="space-y-1">{connection.systemIds.map(id => <li key={id}><StTextButton href={`/workspace?${new URLSearchParams({ workspaceId, view: "system", system: id })}`}>{systems.find(system => system.id === id)?.name || "Open System"}</StTextButton></li>)}</ul> : "None recorded"}</div>
      {next ? <p>{next}</p> : null}
      {connection.provider === "resend" ? <p className="text-gray-muted">{connection.state === "connected" ? "Email sending is on for this business." : connection.state === "disconnected" ? "Email sending is off for this business." : "Email sending status is unknown for this business."} Strelva manages the sending account.</p> : !unavailable && canManage ? <StTextButton href={connectionSetupHref(connection, workspaceId)}>{action}</StTextButton> : !unavailable && !canManage && action !== "Manage" ? <p className="text-gray-muted">Ask a workspace owner or admin to {reconnect ? "reconnect" : "connect"} this account.</p> : null}
    </div>
  </StRow>;
}

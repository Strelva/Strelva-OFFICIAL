"use client";

import { StField, StLabel, StNotice, StRow, StRows, StSection, StState, StTextButton } from "@/components/ui/strelva/Kit";
import { accountHolderLabel, connectionNextStep, unavailableStateLabel } from "@/experience/connections/model";
import { listProviderDefinitions, providerDefinition } from "@/platform/connections/providers";
import type { ConnectionProvider, ProviderEligibilityMap, RequiredConnection, WorkspaceConnection } from "@/platform/connections/contracts";

export type ConnectionRead =
  | { status: "loading" }
  | { status: "error"; permission: boolean }
  | { status: "ready"; connections: WorkspaceConnection[]; sourceErrors: ConnectionProvider[]; providerEligibility?: ProviderEligibilityMap };

export function WorksWithFilter({ value, onChange }: { value: ConnectionProvider | ""; onChange: (value: ConnectionProvider | "") => void }) {
  return <StField label="Works with"><select aria-label="Works with" value={value} onChange={event => onChange(event.target.value as ConnectionProvider | "")}>
    <option value="">All connections</option>
    {listProviderDefinitions().map(provider => <option key={provider.provider} value={provider.provider}>{provider.label}</option>)}
  </select></StField>;
}

export function worksWith(requirements: readonly RequiredConnection[], provider: ConnectionProvider | "") {
  return !provider || requirements.some(requirement => requirement.provider === provider);
}

/** Installation creates a Draft; availability here never grants release authority. */
export function RequiredConnections({ requirements, read, workspaceId, retry, holderNames = new Map() }: { requirements: readonly RequiredConnection[]; read: ConnectionRead; workspaceId: string; retry: () => void; holderNames?: ReadonlyMap<string, string> }) {
  if (!requirements.length) return <StSection title="Needs"><StLabel>No outside accounts.</StLabel></StSection>;
  return <StSection title="Needs">
    {read.status === "loading" ? <p role="status" className="text-sm text-gray-muted">Checking this business’s Connections…</p> : null}
    {read.status === "error" ? <StNotice tone={read.permission ? undefined : "critical"}>{read.permission ? "You do not have permission to read this business’s Connections. Ask its owner to check access." : <>Connections could not be checked. <StTextButton onClick={retry}>Retry Connections</StTextButton></>}</StNotice> : null}
    <StRows label="Connections this App needs">{requirements.map((requirement, index) => {
      const provider = providerDefinition(requirement.provider);
      const rows = read.status === "ready" ? read.connections.filter(row => row.provider === requirement.provider && row.workspaceId === workspaceId) : [];
      const connection = rows.find(row => row.state === "connected" && row.unavailableReason === null && row.accountHolder.kind !== "unknown" && row.accessThrough.kind !== "unknown") ?? rows[0];
      const failed = read.status === "ready" && read.sourceErrors.includes(requirement.provider);
      const eligibility = read.status === "ready" ? read.providerEligibility?.[requirement.provider] : undefined;
      const denied = eligibility && !eligibility.eligible ? eligibility : null;
      const unknown = connection && (connection.accountHolder.kind === "unknown" || connection.accessThrough.kind === "unknown");
      const unavailable = Boolean(denied || connection && (connection.state === "unavailable" || connection.unavailableReason));
      const reconnect = unknown || connection?.state === "stale" || connection?.state === "disconnected";
      const connected = !failed && !unavailable && connection?.state === "connected" && !unknown;
      const state = failed ? "Could not check" : unavailable ? unavailableStateLabel(denied?.reason ?? connection?.unavailableReason ?? null, requirement.provider) : reconnect ? "Reconnect" : connected ? "Connected" : read.status !== "ready" ? "Not checked" : "Connect";
      return <StRow key={`${requirement.provider}:${requirement.access}:${index}`} title={`${provider.label}${requirement.optional ? " · optional" : ""}`} detail={<>
        <span>{requirement.purpose} · {requirement.access === "act" ? "Acts" : "Reads"}</span><br />
        <span>Whose account: {connection ? accountHolderLabel(connection.accountHolder, workspaceId, "customer", holderNames) : read.status === "ready" && !failed ? "Not connected" : "Not checked"}</span>
        {connection?.accountLabel ? <><br /><span>{connection.accountLabel}</span></> : null}
        {connection?.accessThrough.kind === "agency" ? <><br /><span>Through {accountHolderLabel(connection.accessThrough, workspaceId, "agency", holderNames)}’s {provider.label} access</span></> : null}
        {unknown ? <><br /><span>Reconnect to record whose account this is.</span></> : null}
        {failed ? <><br /><span>This provider could not be checked. Read Connections again before making it live.</span></> : unavailable ? <><br /><span>{denied?.message ?? (connection && connectionNextStep(connection))}</span></> : !connected && read.status === "ready" ? <><br /><StTextButton href={`/workspace?${new URLSearchParams({ workspaceId, view: "connections" })}`}>{reconnect ? "Reconnect" : "Connect"} {provider.label} to confirm access</StTextButton></> : null}
      </>} end={<StState kind={connected ? "live" : "draft"}>{state}</StState>} />;
    })}</StRows>
    <StLabel>Installs as Draft. Required accounts and access are checked again before you make it live.</StLabel>
  </StSection>;
}

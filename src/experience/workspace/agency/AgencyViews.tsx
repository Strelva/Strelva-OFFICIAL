"use client";
import { HEALTH_LABEL } from "@/experience/systems/model";

import { useState } from "react";
import { ResponsibilityProof } from "@/experience/operations/ResponsibilityProof";
import { AgencyClientAvailability } from "./AgencyClientAvailability";
import { AgencyClientDecisions } from "./AgencyClientDecisions";
import { StBeacon, StEmpty, StMono, StNotice, StPill, StRow, StRows, StSection, StSkeleton, StState, StTable, StTextButton } from "@/components/ui/strelva/Kit";
import { agencyQueueOrder, type AgencyClientRow, type AgencyQueueItem, type AgencyTeamMember } from "../agency-clients";
import { clientSystemLabel, lastReceiptLabel, needsYouLabel, openRequestsLabel, queueKindLabel, waitLabel, type AgencyClientsView } from "../agency-home";

type ClientRow = AgencyClientsView["clients"][number];
export interface AgencyLastGoodRead { client: AgencyClientRow; readAt: string }

export function AgencyClientsLoading() {
  return <div role="status" aria-label="Loading clients" className="space-y-4"><p>Loading clients…</p>{[0, 1, 2, 3].map(index => <StSkeleton key={index} width={index % 2 ? "60%" : "90%"} />)}</div>;
}

export function AgencyClientsError({ onRetry }: { onRetry: () => void }) {
  return <StNotice tone="critical">Clients could not be loaded. Access has not changed. <StPill variant="soft" onClick={onRetry}>Retry</StPill></StNotice>;
}

function health(client: AgencyClientRow) {
  if (client.systems.some(system => system.health?.status === "blocked")) return <StState kind="down">{HEALTH_LABEL.blocked}</StState>;
  if (client.systems.some(system => system.health?.status === "degraded")) return <StState kind="need">{HEALTH_LABEL.degraded}</StState>;
  if (client.systems.length && client.systems.every(system => system.health?.status === "healthy")) return <StState kind="live">All latest checks passed</StState>;
  return <StState kind="draft">{HEALTH_LABEL.unknown}</StState>;
}

/** One record per business. Last good reads belong only to this mounted agency view. */
export function AgencyClientList({ clients, total, agencyName, hasMore, loadingMore, moreError, retrying, now, onOpen, onRetryPage, onMore, agencyWorkspaceId, request, lastGoodReads }: {
  clients: ClientRow[]; total: number; agencyName: string; hasMore: boolean; loadingMore: boolean; moreError: boolean;
  retrying: ReadonlySet<number>; now: number; onOpen: (workspaceId: string) => void; onRetryPage: (pageIndex: number) => void;
  onMore: () => void; agencyWorkspaceId?: string; request?: typeof fetch; lastGoodReads?: ReadonlyMap<string, AgencyLastGoodRead>;
}) {
  const [reviewing, setReviewing] = useState<string | null>(null);
  const reviewClient = clients.find(client => client.workspaceId === reviewing && client.status === "ready" && client.provider);
  if (!clients.length) return <StEmpty>No client businesses yet. A business appears here once it shares work with {agencyName}.</StEmpty>;
  return <div>
    <StTable label="Clients" columns={[{ key: "client", label: "Client" }, { key: "health", label: "Health" }, { key: "waiting", label: "Waiting on" }, { key: "requests", label: "Requests" }, { key: "receipt", label: "Last receipt" }]} rows={clients.map(client => {
      const lastGood = client.status === "unavailable" ? lastGoodReads?.get(client.workspaceId) : undefined;
      const read = lastGood?.client || client;
      const unavailable = client.status === "unavailable";
      return { key: client.workspaceId, cells: {
        client: <><StTextButton tone="text" onClick={() => onOpen(client.workspaceId)}>{client.name}</StTextButton>{read.provider ? <small className="block text-xs font-normal text-gray-muted">Operated by {agencyName}</small> : null}<small className="block text-xs font-normal text-gray-muted">{read.systems.length ? read.systems.map(clientSystemLabel).join(" · ") : client.reach === "agency" ? "No shared Systems yet" : "No Systems yet"}</small>
          {client.agentBookings ? <StTextButton href={`/workspace/bookings?${new URLSearchParams({ workspaceId: client.workspaceId, view: "week", source: "agent" })}`}>Booked through assistants · {client.name}</StTextButton> : null}
          {!unavailable && client.provider ? <>{agencyWorkspaceId ? <StTextButton onClick={() => setReviewing(client.workspaceId)}>Review decisions</StTextButton> : null}<ClientAdditionalControls workspaceId={client.workspaceId} agencyWorkspaceId={agencyWorkspaceId} request={request} /></> : null}</>,
        health: unavailable ? <><StState kind="need">{client.name} could not be loaded.</StState><small className="block text-xs">{lastGood ? `Showing the last good read from ${new Date(lastGood.readAt).toLocaleString()}.` : "No last good read is available in this visit."}</small><StPill variant="soft" busy={retrying.has(client.pageIndex)} onClick={() => onRetryPage(client.pageIndex)} aria-label={`Retry loading ${client.name}`}>Retry</StPill></> : health(client),
        waiting: unavailable && !lastGood ? "Unknown" : needsYouLabel(read, now),
        requests: unavailable && !lastGood ? "Unknown" : <>{openRequestsLabel(read.openRequests)}{read.improvementsWaiting ? ` · ${read.improvementsWaiting} improvement${read.improvementsWaiting === 1 ? "" : "s"} ready` : ""}</>,
        receipt: unavailable && !lastGood ? "Unknown" : lastReceiptLabel(read.lastReceiptAt, now),
      } };
    })} />
    {reviewClient && agencyWorkspaceId ? <div className="py-6"><StTextButton onClick={() => setReviewing(null)}>Close decisions</StTextButton><AgencyClientDecisions key={`${agencyWorkspaceId}:${reviewClient.workspaceId}`} workspaceId={reviewClient.workspaceId} agencyWorkspaceId={agencyWorkspaceId} clientName={reviewClient.name} request={request} /></div> : null}
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4"><StMono>{clients.length < total ? `Showing ${clients.length} of ${total} clients` : `${total} ${total === 1 ? "client" : "clients"}`}</StMono>{hasMore ? <StPill variant="soft" busy={loadingMore} onClick={onMore}>Show more clients</StPill> : null}</div>
    {moreError ? <StNotice tone="critical">More clients could not be loaded. Access has not changed. Try again.</StNotice> : null}
  </div>;
}

function ClientAdditionalControls({ workspaceId, agencyWorkspaceId, request }: { workspaceId: string; agencyWorkspaceId?: string; request?: typeof fetch }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary className="min-h-11 cursor-pointer py-2 text-xs font-normal text-gray-muted focus-visible:outline-2 focus-visible:outline-offset-2">Responsibility and availability</summary>{open ? <><ClientResponsibilityProof workspaceId={workspaceId} />{agencyWorkspaceId ? <AgencyClientAvailability agencyWorkspaceId={agencyWorkspaceId} workspaceId={workspaceId} request={request} /> : null}</> : null}</details>;
}

function ClientResponsibilityProof({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  return <details className="mx-2 mb-4" onToggle={event => setOpen(event.currentTarget.open)}><summary className="flex min-h-11 cursor-pointer items-center text-sm text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2">Responsibility receipts and report cadence</summary>{open ? <div className="py-4"><ResponsibilityProof workspaceId={workspaceId} readOnly={false} /></div> : null}</details>;
}

/** Queue: oldest first within each kind, with the client's own entrance. */
export function AgencyQueueList({ items, now, onWorkspace, onOpenClientWork, complete = true }: { complete?: boolean; items: readonly AgencyQueueItem[]; now: number; onWorkspace: (workspaceId: string) => void; onOpenClientWork: (workspaceId: string, workId: string) => void }) {
  if (!items.length) return <StEmpty>{complete ? "Nothing is waiting across clients." : "Nothing is waiting in the loaded clients. The Queue is incomplete."}</StEmpty>;
  const groups: { title: string; kinds: AgencyQueueItem["kind"][] }[] = [{ title: "Broken", kinds: ["health"] }, { title: "Requests", kinds: ["request"] }, { title: "Waiting on owners", kinds: ["needs_you", "owner_email"] }, { title: "Improvements to offer", kinds: ["improvement"] }, { title: "Platform support", kinds: ["operator"] }];
  return <div className="space-y-8">{groups.map(group => {
    const rows = agencyQueueOrder(items.filter(item => group.kinds.includes(item.kind)));
    if (!rows.length) return null;
    return <StSection key={group.title} title={group.title} meta={<StMono>{rows.length}</StMono>}><StRows label={`${group.title}, oldest first`}>{rows.map(item => {
      const wait = waitLabel(item.since, now);
      return <StRow key={`${item.workspaceId}:${item.id}`} lead={<StBeacon kind={item.kind === "health" ? "down" : item.kind === "improvement" ? "draft" : "need"} />} title={item.title} detail={`${item.clientName} · ${item.kind === "needs_you" || item.kind === "owner_email" ? `Waiting on ${item.clientName}` : item.label ?? queueKindLabel(item.kind)}`} href={item.href} onClick={item.href ? undefined : () => item.workId ? onOpenClientWork(item.workspaceId, item.workId) : onWorkspace(item.workspaceId)} end={<><StMono>{wait === "today" ? "Today" : wait}</StMono><span>Open →</span></>} />;
    })}</StRows></StSection>;
  })}</div>;
}

/** Team reach is read from authorized clients; incomplete reads stay named. */
export function AgencyTeamList({ members, partial }: { members: readonly AgencyTeamMember[]; partial: boolean }) {
  if (!members.length) return <StEmpty>No team members are listed for this agency.</StEmpty>;
  const roles: Record<AgencyTeamMember["role"], string> = { owner: "Owner", admin: "Admin", member: "Member" };
  return <><StRows label="Team">{members.map(member => <StRow key={member.userId} title={member.email || "Email not shared"} detail={teamReach(member.clients.map(client => client.name))} end={roles[member.role]} />)}</StRows>{partial ? <p className="text-xs text-gray-muted">Clients reached are counted from the clients loaded so far.</p> : null}</>;
}

function teamReach(names: readonly string[]): string {
  if (!names.length) return "No clients in this list";
  const shown = names.slice(0, 5).join(", ");
  return names.length > 5 ? `${shown} and ${names.length - 5} more` : shown;
}

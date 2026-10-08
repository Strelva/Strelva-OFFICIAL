"use client";

import { ArrowRight, CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SkeletonLine } from "@/components/ui/Skeleton";
import { agencyQueueOrder, type AgencyQueueItem, type AgencyTeamMember } from "../agency-clients";
import {
  clientSystemLabel,
  lastReceiptLabel,
  needsYouLabel,
  openRequestsLabel,
  queueKindLabel,
  waitLabel,
  type AgencyClientsView,
} from "../agency-home";

type ClientRow = AgencyClientsView["clients"][number];

const row = "border-b border-gray-border";
const meta = "text-[12px] leading-4 text-gray-muted";

export function AgencyClientsLoading() {
  return <div role="status" aria-label="Loading clients" className="border-t border-gray-border">
    <p className="sr-only">Loading clients…</p>
    {[0, 1, 2, 3].map((index) => <div key={index} className={`${row} flex flex-col gap-2 px-2 py-4`} aria-hidden="true">
      <SkeletonLine width="w-40" height="h-3.5" />
      <SkeletonLine width="w-64" height="h-3" />
    </div>)}
  </div>;
}

export function AgencyClientsError({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-y border-gray-border py-5">
    <p className="text-[13px] text-warm-black">Clients could not be loaded. Access has not changed.</p>
    <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>Retry</Button>
  </div>;
}

/** Clients: one row per business, read from that business under the actor's own access. */
export function AgencyClientList({
  clients,
  total,
  agencyName,
  hasMore,
  loadingMore,
  moreError,
  retrying,
  now,
  onOpen,
  onRetryPage,
  onMore,
}: {
  clients: ClientRow[];
  total: number;
  agencyName: string;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: boolean;
  retrying: ReadonlySet<number>;
  now: number;
  onOpen: (workspaceId: string) => void;
  onRetryPage: (pageIndex: number) => void;
  onMore: () => void;
}) {
  if (!clients.length) {
    return <p className="border-y border-gray-border py-5 text-[13px] leading-relaxed text-gray-muted">No client businesses yet. A business appears here once it shares work with {agencyName}.</p>;
  }
  return <div>
    <ul aria-label="Clients" className="border-t border-gray-border">
      {clients.map((client) => client.status === "unavailable"
        ? <li key={client.workspaceId} className={`${row} flex flex-wrap items-center justify-between gap-3 px-2 py-4`}>
            <p className="flex items-center gap-2 text-[13px] text-warm-black"><CircleAlert className="shrink-0 text-warning" size={16} aria-hidden="true" />{client.name} could not be loaded.</p>
            <Button variant="ghost" size="sm" loading={retrying.has(client.pageIndex)} onClick={() => onRetryPage(client.pageIndex)} aria-label={`Retry loading ${client.name}`}>Retry</Button>
          </li>
        : <li key={client.workspaceId} className={row}><ClientRowButton client={client} agencyName={agencyName} now={now} onOpen={onOpen} />{client.agentBookings ? <a href={`/workspace/bookings?${new URLSearchParams({ workspaceId: client.workspaceId, view: "week", source: "agent" })}`} className="mx-2 mb-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">Booked through agents · {client.name}</a> : null}</li>)}
    </ul>
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className={meta} aria-live="polite">{clients.length < total ? `Showing ${clients.length} of ${total} clients` : `${total} ${total === 1 ? "client" : "clients"}`}</p>
      {hasMore ? <Button variant="secondary" size="sm" loading={loadingMore} onClick={onMore}>Show more clients</Button> : null}
    </div>
    {moreError ? <p role="alert" className="mt-2 text-[12px] text-critical">More clients could not be loaded. Access has not changed. Try again.</p> : null}
  </div>;
}

function ClientRowButton({ client, agencyName, now, onOpen }: { client: ClientRow; agencyName: string; now: number; onOpen: (workspaceId: string) => void }) {
  const waiting = client.needsYou.count > 0;
  return <button
    type="button"
    onClick={() => onOpen(client.workspaceId)}
    className="grid w-full gap-x-6 gap-y-2 px-2 py-4 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text md:grid-cols-[minmax(0,1fr)_180px_130px_150px_16px] md:items-center"
  >
    <span className="min-w-0">
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <strong className="text-[14px] font-medium text-warm-black">{client.name}</strong>
        {client.provider ? <span className="text-[11px] uppercase tracking-[0.08em] text-gray-muted">Operated by {agencyName}</span> : null}
      </span>
      <span className={`${meta} mt-1 flex flex-wrap gap-x-4 gap-y-1`}>
        {client.systems.length
          ? client.systems.map((system) => <span key={system.id}>{clientSystemLabel(system)}</span>)
          : <span>{client.reach === "agency" ? "No shared Systems yet" : "No Systems yet"}</span>}
      </span>
    </span>
    <span className={`text-[12px] leading-4 ${waiting ? "font-medium text-warm-black" : "text-gray-muted"}`}>
      {waiting ? <span className="mr-1.5 inline-block size-1.5 rounded-full bg-warning align-middle" aria-hidden="true" /> : null}
      {needsYouLabel(client, now)}
    </span>
    <span className={meta}>{openRequestsLabel(client.openRequests)}{client.improvementsWaiting ? ` · ${client.improvementsWaiting} improvement${client.improvementsWaiting === 1 ? "" : "s"} ready` : ""}</span>
    <span className={meta}>{lastReceiptLabel(client.lastReceiptAt, now)}</span>
    <ArrowRight className="hidden shrink-0 text-gray-muted md:block" size={16} aria-hidden="true" />
  </button>;
}

/** Queue: every client's waiting work, oldest first. Each item opens the client's own work. */
export function AgencyQueueList({
  items,
  now,
  onWorkspace,
  onOpenClientWork,
}: {
  items: readonly AgencyQueueItem[];
  now: number;
  onWorkspace: (workspaceId: string) => void;
  onOpenClientWork: (workspaceId: string, workId: string) => void;
}) {
  const ordered = agencyQueueOrder(items);
  if (!ordered.length) return <p className="border-y border-gray-border py-5 text-[13px] text-gray-muted">Nothing is waiting across clients.</p>;
  return <ol aria-label="Queue, oldest first" className="border-t border-gray-border">
    {ordered.map((item) => {
      const wait = waitLabel(item.since, now);
      return <li key={`${item.workspaceId}:${item.id}`} className={row}>
        <button
          type="button"
          onClick={() => item.href ? window.location.assign(item.href) : item.workId ? onOpenClientWork(item.workspaceId, item.workId) : onWorkspace(item.workspaceId)}
          className="grid w-full gap-x-6 gap-y-1 px-2 py-4 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text sm:grid-cols-[minmax(0,1fr)_96px_16px] sm:items-center"
          aria-label={`${item.title}, ${item.clientName}, ${queueKindLabel(item.kind)}${wait ? `, waiting ${wait}` : ""}`}
        >
          <span className="min-w-0">
            <strong className="block text-[14px] font-medium text-warm-black">{item.title}</strong>
            <small className={`${meta} mt-1 block`}>{item.clientName} · {item.label ?? queueKindLabel(item.kind)}</small>
          </span>
          <span className="font-mono text-[12px] leading-4 tabular-nums text-gray-muted sm:text-right">{wait === "today" ? "Today" : wait}</span>
          <ArrowRight className="hidden text-gray-muted sm:block" size={16} aria-hidden="true" />
        </button>
      </li>;
    })}
  </ol>;
}

/** Team: who works here and which clients each person reaches. */
export function AgencyTeamList({ members, partial }: { members: readonly AgencyTeamMember[]; partial: boolean }) {
  if (!members.length) return <p className="border-y border-gray-border py-5 text-[13px] text-gray-muted">No team members are listed for this agency.</p>;
  const roles: Record<AgencyTeamMember["role"], string> = { owner: "Owner", admin: "Admin", member: "Member" };
  return <div>
    <ul aria-label="Team" className="border-t border-gray-border">
      {members.map((member) => <li key={member.userId} className={`${row} grid gap-x-6 gap-y-1 px-2 py-4 md:grid-cols-[minmax(0,240px)_80px_minmax(0,1fr)]`}>
        <strong className="truncate text-[14px] font-medium text-warm-black">{member.email || "Email not shared"}</strong>
        <span className={meta}>{roles[member.role]}</span>
        <span className={meta} title={member.clients.map((client) => client.name).join(", ")}>{teamReach(member.clients.map((client) => client.name))}</span>
      </li>)}
    </ul>
    {partial ? <p className={`${meta} mt-3`}>Clients reached are counted from the clients loaded so far.</p> : null}
  </div>;
}

/** "Twin Trees, The Mooney Firm, … and 45 more". */
function teamReach(names: readonly string[]): string {
  if (!names.length) return "No clients in this list";
  const shown = names.slice(0, 5).join(", ");
  return names.length > 5 ? `${shown} and ${names.length - 5} more` : shown;
}

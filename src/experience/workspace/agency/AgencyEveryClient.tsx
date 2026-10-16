"use client";
/**
 * XA · A6, every client. One sentence says what waits on the agency, then one
 * table: who the client is, whether its owner is in charge, what waits and on
 * whom, and the last receipt. Health shows only when something is wrong. Each
 * row opens the client; its details (Systems, owner reach, decisions,
 * responsibility) open in place under the name.
 *
 * Data is the same batched agency read as before (`agency_client_overview`):
 * rows are scoped exactly as opening that client would be, a client that
 * failed to load is named, and a last good read stays visibly stale.
 */
import { useState } from "react";
import { XaButton, XaButtonLink, XaEmpty, XaHeadline, XaInitial, XaPebbleScene, XaStatus } from "@/components/ui/strelva/Xa";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { AgencyClientDecisions } from "./AgencyClientDecisions";
import { AgencyUsageSummary } from "./AgencyUsageSummary";
import { ClientAdditionalControls, OwnerReachLines, type AgencyLastGoodRead } from "./AgencyViews";
import type { AgencyClientRow } from "../agency-clients";
import { clientSystemLabel, lastReceiptLabel, needsYouLabel, openRequestsLabel, type AgencyClientsView } from "../agency-home";
import styles from "./agency-every-client.module.css";

type ClientRow = AgencyClientsView["clients"][number];

/** What waits on the agency itself for one client: broken Systems, requests, improvements. Empty when nothing does. */
export function agencyWaits(client: AgencyClientRow): string {
  const broken = client.systems.filter(system => system.health?.status === "blocked" || system.health?.status === "degraded");
  const parts: string[] = [];
  if (broken.length) parts.push(broken.length === 1 ? `${broken[0]!.name} ${broken[0]!.health?.status === "blocked" ? "not working" : "needs a look"}` : `${broken.length} Systems need a look`);
  if (client.openRequests) parts.push(openRequestsLabel(client.openRequests));
  if (client.improvementsWaiting) parts.push(`${client.improvementsWaiting} improvement${client.improvementsWaiting === 1 ? "" : "s"} to review`);
  if (client.improvementsStatus === "unavailable") parts.push(client.improvementsWaiting ? "Some improvements unavailable" : "Improvements unavailable");
  if (client.ownerReach && !client.ownerReach.reachable && client.ownerReach.canIssueClaim) parts.push("fix owner contact");
  return parts.join(" · ");
}

/** What waits on the client's owner. Empty when nothing does. */
export function ownerWaits(client: AgencyClientRow, now: number): string {
  if (client.ownerClaimWaiting) return client.needsYou.count ? `claim link · ${needsYouLabel(client, now)}` : "claim link";
  return client.needsYou.count ? needsYouLabel(client, now) : "";
}

function summary(client: AgencyClientRow): string {
  if (!client.systems.length) return client.reach === "agency" ? "No shared Systems yet" : "No Systems yet";
  const locations = [...new Set(client.systems.map(system => system.versionContext).filter(Boolean))];
  if (locations.length > 1) return `${locations.length} locations · ${client.systems.length} Systems`;
  const first = client.systems[0]!;
  return `${first.name}${client.systems.length > 1 ? ` · ${client.systems.length - 1} more` : ""}`;
}

function lastCheck(clients: readonly AgencyClientRow[]): Date | null {
  let latest = 0;
  for (const client of clients) for (const system of client.systems) {
    const at = system.health?.lastVerifiedAt ? Date.parse(system.health.lastVerifiedAt) : NaN;
    if (Number.isFinite(at) && at > latest) latest = at;
  }
  return latest ? new Date(latest) : null;
}

/** Same client colors everywhere a client appears by its initial. */
const CLIENT_COLORS = ["#2f5236", "#9c522c", "#4f7590", "#6b6f68", "#7a5c3e", "#5b6b3a"] as const;
export function clientColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CLIENT_COLORS[hash % CLIENT_COLORS.length]!;
}

export function AgencyEveryClient({ clients, total, agencyName, hasMore, loadingMore, moreError, retrying, now, onOpen, onRetryPage, onMore, agencyWorkspaceId, viewerEmail, canManage, request, lastGoodReads, addClientHref }: {
  clients: ClientRow[]; total: number; agencyName: string; hasMore: boolean; loadingMore: boolean; moreError: boolean;
  retrying: ReadonlySet<number>; now: number; onOpen: (workspaceId: string) => void; onRetryPage: (pageIndex: number) => void;
  onMore: () => void; agencyWorkspaceId?: string; viewerEmail?: string; canManage?: boolean; request?: typeof fetch;
  lastGoodReads?: ReadonlyMap<string, AgencyLastGoodRead>; addClientHref?: string | null;
}) {
  const [reviewing, setReviewing] = useState<string | null>(null);
  const reviewClient = clients.find(client => client.workspaceId === reviewing && client.status === "ready" && client.provider);
  if (!clients.length) return <div className={styles.empty}>
    <XaEmpty pose="alone" title="No clients yet" job="Ready to read your first client’s website" action={addClientHref ? <XaButtonLink variant="primary" href={addClientHref}>Add a client</XaButtonLink> : undefined}>
      A business appears here once you add it, or once it shares work with {agencyName}.
    </XaEmpty>
  </div>;

  const reads = clients.map(client => {
    const lastGood = client.status === "unavailable" ? lastGoodReads?.get(client.workspaceId) : undefined;
    return { client, lastGood, read: lastGood?.client || client };
  });
  const onYou = reads.filter(({ client, read }) => client.status === "ready" && agencyWaits(read)).length;
  const firstOwner = reads.find(({ client, read }) => client.status === "ready" && ownerWaits(read, now));
  const anyBroken = reads.some(({ read }) => read.systems.some(system => system.health?.status === "blocked" || system.health?.status === "degraded"));
  const checked = lastCheck(reads.map(({ read }) => read));
  const countWords = `${total} ${total === 1 ? "client" : "clients"}.`;
  const waitWords = onYou === 0 ? "Nothing waits on you." : onYou === 1 ? "One waits on you." : `${onYou} wait on you.`;
  const quiet = firstOwner ? firstOwner.read.ownerClaimWaiting ? `${firstOwner.client.name} waits for its owner to claim it.` : `${firstOwner.client.name} has ${needsYouLabel(firstOwner.read, now).toLowerCase()} on its owner.`
    : !anyBroken && onYou === 0 ? "Every client is running." : undefined;

  return <div className={styles.every}>
    <header className={styles.head}>
      <XaHeadline size="md" quiet={quiet}>{countWords} {waitWords}</XaHeadline>
      {checked ? <div className={styles.check}>
        <XaPebbleScene pose={anyBroken ? "fixing" : "lineup"} size={168} label={anyBroken ? "Pebble looking into a broken System" : "Pebble with every client's Systems lined up"} />
        <p className={styles.checkJob}><span aria-hidden="true" className={styles.pulse} />Last checked {checked.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
      </div> : null}
    </header>

    <table className={styles.table} aria-label="Clients">
      <thead><tr><th scope="col">Client</th><th scope="col">Owner</th><th scope="col">Waiting on</th><th scope="col" className={styles.right}>Last receipt</th></tr></thead>
      <tbody>{reads.map(({ client, lastGood, read }) => {
        const unavailable = client.status === "unavailable";
        const you = agencyWaits(read);
        const owner = ownerWaits(read, now);
        const ownerState = read.ownerClaimWaiting ? { tone: "waits" as const, text: "Not claimed yet" } : read.ownerReach && !read.ownerReach.reachable ? { tone: "waits" as const, text: "Can’t be reached" } : { tone: undefined, text: "In charge" };
        return <tr key={client.workspaceId} data-stale={unavailable || undefined}>
          <th scope="row" className={styles.client}>
            <div className={styles.clientLine}>
              <XaInitial name={client.name} color={clientColor(client.workspaceId)} size={36} />
              <button type="button" className={styles.open} onClick={() => onOpen(client.workspaceId)}>
                <span className={styles.name}>{client.name}</span><span className={styles.summary}>{summary(read)}</span>
              </button>
            </div>
            {read.systems.length || (!unavailable && client.provider) || client.agentBookings || read.ownerReach ? <details className={styles.details}>
              <summary>Details</summary>
              <div className={styles.detailBody}>
                {read.provider ? <p>Operated by {agencyName}</p> : null}
                {read.systems.length ? <ul aria-label={`${client.name} Systems`}>{read.systems.map(system => <li key={system.id}>{clientSystemLabel(system)}</li>)}</ul> : null}
                {client.agentBookings ? <p><a href={`/workspace/bookings?${new URLSearchParams({ workspaceId: client.workspaceId, view: "week", source: "agent" })}`}>Booked through assistants · {client.name}</a></p> : null}
                <OwnerReachLines client={read} agencyWorkspaceId={agencyWorkspaceId} />
                {!unavailable && client.provider ? <>
                  {agencyWorkspaceId ? <p><button type="button" className={styles.inlineAction} onClick={() => setReviewing(client.workspaceId)}>Review decisions</button></p> : null}
                  <ClientAdditionalControls workspaceId={client.workspaceId} clientName={client.name} agencyWorkspaceId={agencyWorkspaceId} viewerEmail={viewerEmail} canManage={canManage} request={request} />
                </> : null}
              </div>
            </details> : null}
          </th>
          <td data-label="Owner" data-exception={ownerState.tone ? true : undefined}><span className={styles.state} data-tone={ownerState.tone ?? "quiet"}>{unavailable && !lastGood ? "Unknown" : ownerState.text}</span></td>
          <td data-label="Waiting on">{unavailable ? <div className={styles.stale}>
            <XaStatus kind="waits" size="sm">{client.name} could not be loaded.</XaStatus>
            <small>{lastGood ? `Showing the last good read from ${new Date(lastGood.readAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : "No last good read is available in this visit."}</small>
            {lastGood ? <small>{[you && `You · ${you}`, owner && `Owner · ${owner}`].filter(Boolean).join(" · ") || "Nothing waited at that read."}</small> : null}
            <XaButton size="sm" busy={retrying.has(client.pageIndex)} onClick={() => onRetryPage(client.pageIndex)} aria-label={`Retry loading ${client.name}`}>Retry</XaButton>
          </div> : you || owner ? <div className={styles.waits}>
            {you ? <span className={styles.state} data-tone={read.systems.some(system => system.health?.status === "blocked") ? "down" : "waits"}>You · {you}</span> : null}
            {owner ? <span className={styles.state}>Owner · {owner}</span> : null}
          </div> : <span className={styles.quietText}>Nothing waiting</span>}</td>
          <td className={styles.right}><span className={styles.quietText}>{unavailable && !lastGood ? "Unknown" : lastReceiptLabel(read.lastReceiptAt, now)}</span></td>
        </tr>;
      })}</tbody>
    </table>

    {reviewClient && agencyWorkspaceId ? <section className={styles.review} aria-label={`Decisions for ${reviewClient.name}`}>
      <button type="button" className={styles.inlineAction} onClick={() => setReviewing(null)}>Close decisions</button>
      <AgencyClientDecisions key={`${agencyWorkspaceId}:${reviewClient.workspaceId}`} workspaceId={reviewClient.workspaceId} agencyWorkspaceId={agencyWorkspaceId} clientName={reviewClient.name} request={request} />
    </section> : null}

    <footer className={styles.foot}>
      <p className={styles.quietText}>{clients.length < total ? `Showing ${clients.length} of ${total} clients` : `${total} ${total === 1 ? "client" : "clients"}`}</p>
      {hasMore ? <XaButton size="sm" busy={loadingMore} onClick={onMore}>Show more clients</XaButton> : null}
    </footer>
    {moreError ? <p role="alert" className={styles.alert}>More clients could not be loaded. Access has not changed. Try again.</p> : null}
    {agencyWorkspaceId ? <AgencyUsageSummary agencyWorkspaceId={agencyWorkspaceId} request={request} /> : null}
  </div>;
}

export function AgencyEveryClientLoading() {
  return <div role="status" aria-label="Loading clients" className={styles.every}><p className={styles.quietText}>Loading clients…</p>{[0, 1, 2, 3].map(index => <StSkeleton key={index} width={index % 2 ? "60%" : "90%"} />)}</div>;
}

/** The whole read failed. Pebble is in frame; nothing about access changed. */
export function AgencyEveryClientError({ onRetry }: { onRetry: () => void }) {
  return <div className={styles.error} role="alert">
    <XaPebbleScene pose="fixing" size={140} label="Pebble checking the client list" />
    <div className={styles.errorText}>
      <p>Clients could not be loaded. Access has not changed.</p>
      <XaButton onClick={onRetry}>Retry</XaButton>
    </div>
  </div>;
}

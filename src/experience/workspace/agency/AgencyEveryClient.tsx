"use client";
/**
 * XA · A6, every client. One sentence says what waits on the agency, then one
 * table: who the client is, an owner only when something is off (not claimed
 * yet, can't be reached), what waits and on whom, and the last change. Health
 * shows only when something is wrong. The whole row opens the client. One
 * place under the table opens a client's decisions and responsibilities in
 * place, so no row repeats a "Details" link.
 *
 * Data is the same batched agency read as before (`agency_client_overview`):
 * rows are scoped exactly as opening that client would be, a client that
 * failed to load is named, and a last good read stays visibly stale.
 *
 * Not drawn yet, pending an addition to `agency_client_overview`: the owner's
 * first name once claimed, and this month's minutes per client (the render's
 * "This month" column). Until then the Owner cell is blank when all is well.
 */
import { useState, type MouseEvent } from "react";
import { PebbleHoldingEmptyTile } from "./AgencyDayOne";
import { XaButton, XaButtonLink, XaHeadline, XaInitial, XaPebbleScene, XaStatus } from "@/components/ui/strelva/Xa";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { AgencyClientDecisions } from "./AgencyClientDecisions";
import { AgencyUsageSummary } from "./AgencyUsageSummary";
import { ClientAdditionalControls, OwnerReachLines, type AgencyLastGoodRead } from "./AgencyViews";
import { daysWaiting, type AgencyClientRow } from "../agency-clients";
import { clientSystemLabel, needsYouLabel, openRequestsLabel, type AgencyClientsView } from "../agency-home";
import styles from "./agency-every-client.module.css";

type ClientRow = AgencyClientsView["clients"][number];

/** A check older than this reads as stale, and only then gets a dot. */
const STALE_CHECK_MS = 12 * 3_600_000;

function brokenSystems(client: AgencyClientRow) {
  return client.systems.filter(system => system.health?.status === "blocked" || system.health?.status === "degraded");
}

/** What waits on the agency itself for one client: broken Systems, requests, improvements. Empty when nothing does. */
export function agencyWaits(client: AgencyClientRow): string {
  const broken = brokenSystems(client);
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

/** The one sentence about the first client that waits on the agency, naming the client and the thing. */
export function waitsOnYouSentence(client: AgencyClientRow): string {
  const broken = brokenSystems(client);
  if (broken.length === 1) return `${broken[0]!.name} at ${client.name} ${broken[0]!.health?.status === "blocked" ? "is not working" : "needs a look"}.`;
  if (broken.length > 1) return `${broken.length} Systems at ${client.name} need a look.`;
  if (client.openRequests) return `${client.name} has ${openRequestsLabel(client.openRequests)}.`;
  if (client.improvementsWaiting) return `${client.name} has ${client.improvementsWaiting} improvement${client.improvementsWaiting === 1 ? "" : "s"} to review.`;
  if (client.ownerReach && !client.ownerReach.reachable) return `${client.name}’s owner can’t be reached. Fix their contact.`;
  return `${client.name} needs a look.`;
}

/** The owner cell holds an exception or nothing. */
function ownerException(client: AgencyClientRow): string {
  if (client.ownerClaimWaiting) return "Not claimed yet";
  if (client.ownerReach && !client.ownerReach.reachable) return "Can’t be reached";
  return "";
}

/** The last change anyone made for this client, in plain days. */
export function lastChangeLabel(at: string | null | undefined, now: number): string {
  const days = daysWaiting(at ?? null, now);
  if (days === null) return "None yet";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
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

const when = (at: Date | string) => new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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
  const [closer, setCloser] = useState<string>("");
  const [reviewing, setReviewing] = useState(false);
  if (!clients.length) return <div className={styles.empty}>
    <PebbleHoldingEmptyTile size={220} />
    <XaHeadline size="md" quiet={`A business appears here once you add it, or once it shares work with ${agencyName}.`}>No clients yet.</XaHeadline>
    {addClientHref ? <div><XaButtonLink variant="primary" href={addClientHref}>Add a client</XaButtonLink></div> : null}
    <p className={styles.checked}>Pebble reads their website the moment you add one.</p>
  </div>;

  const reads = clients.map(client => {
    const lastGood = client.status === "unavailable" ? lastGoodReads?.get(client.workspaceId) : undefined;
    return { client, lastGood, read: lastGood?.client || client };
  });
  const waiting = reads.filter(({ client, read }) => client.status === "ready" && agencyWaits(read));
  const onYou = waiting.length;
  const firstOwner = reads.find(({ client, read }) => client.status === "ready" && ownerWaits(read, now));
  const broken = reads.find(({ client, read }) => client.status === "ready" && brokenSystems(read).length);
  const lead = broken ?? waiting[0];
  const checked = lastCheck(reads.map(({ read }) => read));
  const staleCheck = checked ? now - checked.getTime() > STALE_CHECK_MS : false;
  const countWords = `${total} ${total === 1 ? "client" : "clients"}.`;
  const waitWords = onYou === 0 ? "Nothing waits on you." : onYou === 1 ? "One waits on you." : `${onYou} wait on you.`;
  const quiet = lead ? `${waitsOnYouSentence(lead.read)}${onYou > 1 ? ` ${onYou - 1} more ${onYou === 2 ? "client needs" : "clients need"} you too.` : ""}`
    : firstOwner ? firstOwner.read.ownerClaimWaiting ? `${firstOwner.client.name} waits for its owner to claim it.` : `${firstOwner.client.name} waits on its owner: ${needsYouLabel(firstOwner.read, now).toLowerCase()}.`
      : "Every client is running.";
  const closerClient = reads.find(({ client }) => client.workspaceId === closer);
  // A click anywhere on a row opens the client, except on its own controls.
  const openRow = (event: MouseEvent<HTMLTableRowElement>, workspaceId: string) => {
    if ((event.target as HTMLElement).closest("button, a, input, select, summary")) return;
    onOpen(workspaceId);
  };

  return <div className={styles.every}>
    <header className={styles.head}>
      <div className={styles.headText}>
        <XaHeadline size="md" quiet={quiet}>{countWords} {waitWords}</XaHeadline>
        {checked ? staleCheck ? <XaStatus kind="waits" size="sm">Last checked {when(checked)}. Strelva checks again within the hour.</XaStatus>
          : <p className={styles.checked}>Last checked {when(checked)}</p> : null}
      </div>
      {/* Pebble is in frame only while it is fixing something; a caption that repeats the headline is decoration. */}
      {broken ? <figure className={styles.pebble}>
        <XaPebbleScene pose="fixing" size={260} bare label={`Pebble working on ${broken.client.name}`} />
        <figcaption className={styles.pebbleJob}>{`On it: ${agencyWaits(broken.read)}`}</figcaption>
      </figure> : null}
    </header>

    <table className={styles.table} aria-label="Clients">
      <thead><tr><th scope="col">Client</th><th scope="col">Owner</th><th scope="col">Waiting on</th><th scope="col" className={styles.right}>Last change</th></tr></thead>
      <tbody>{reads.map(({ client, lastGood, read }) => {
        const unavailable = client.status === "unavailable";
        const you = agencyWaits(read);
        const owner = ownerWaits(read, now);
        const exception = unavailable && !lastGood ? "Unknown" : ownerException(read);
        const down = read.systems.some(system => system.health?.status === "blocked");
        // On a phone the row keeps one line under the name: the most important exception, if any.
        const phoneLine = unavailable ? "" : you ? `You · ${you}` : exception || (owner ? `Owner · ${owner}` : "");
        return <tr key={client.workspaceId} data-stale={unavailable || undefined} className={styles.row} onClick={event => openRow(event, client.workspaceId)}>
          <th scope="row" className={styles.client}>
            <div className={styles.clientLine}>
              <XaInitial name={client.name} color={clientColor(client.workspaceId)} size={36} />
              <button type="button" className={styles.open} onClick={() => onOpen(client.workspaceId)} aria-label={`Open ${client.name}`}>
                <span className={styles.name}>{client.name}</span><span className={styles.summary}>{summary(read)}</span>
                {phoneLine ? <span className={styles.phoneLine} data-tone={unavailable || you ? down ? "down" : "waits" : exception ? "waits" : undefined}>{phoneLine}</span> : null}
              </button>
            </div>
          </th>
          <td data-label="Owner">{exception ? <span className={styles.state} data-tone="waits">{exception}</span> : null}</td>
          <td data-label="Waiting on">{unavailable ? <div className={styles.stale}>
            <XaStatus kind="waits" size="sm">{client.name} could not be loaded.</XaStatus>
            <small>{lastGood ? `Showing the last good read from ${when(lastGood.readAt)}.` : "No last good read is available in this visit."}</small>
            {lastGood ? <small>{[you && `You · ${you}`, owner && `Owner · ${owner}`].filter(Boolean).join(" · ") || "Nothing waited at that read."}</small> : null}
            <XaButton size="sm" busy={retrying.has(client.pageIndex)} onClick={() => onRetryPage(client.pageIndex)} aria-label={`Retry loading ${client.name}`}>Retry</XaButton>
          </div> : you || owner ? <div className={styles.waits}>
            {you ? <span className={styles.state} data-tone={down ? "down" : "waits"}>You · {you}</span> : null}
            {owner ? <span className={styles.state}>Owner · {owner}</span> : null}
          </div> : <span className={styles.quietText}>Nothing</span>}</td>
          <td className={styles.right}><span className={styles.quietText}>{unavailable && !lastGood ? "Unknown" : lastChangeLabel(read.lastReceiptAt, now)}</span></td>
        </tr>;
      })}</tbody>
    </table>

    <footer className={styles.foot}>
      <p className={styles.quietText}>{clients.length < total ? `Showing ${clients.length} of ${total} clients` : `${total} ${total === 1 ? "client" : "clients"}`}</p>
      {hasMore ? <XaButton size="sm" busy={loadingMore} onClick={onMore}>Show more clients</XaButton> : null}
    </footer>
    {moreError ? <p role="alert" className={styles.alert}>More clients could not be loaded. Access has not changed. Try again.</p> : null}

    <section className={styles.closer} aria-label="Look closer at one client">
      <label className={styles.closerPick}>
        <span>Look closer at</span>
        <select value={closer} onChange={event => { setCloser(event.target.value); setReviewing(false); }}>
          <option value="">choose a client</option>
          {reads.map(({ client }) => <option key={client.workspaceId} value={client.workspaceId}>{client.name}</option>)}
        </select>
      </label>
      {closerClient ? <div className={styles.detailBody}>
        {closerClient.read.provider ? <p>Operated by {agencyName}</p> : null}
        {closerClient.read.systems.length ? <ul aria-label={`${closerClient.client.name} Systems`}>{closerClient.read.systems.map(system => <li key={system.id}>{clientSystemLabel(system)}</li>)}</ul> : null}
        {closerClient.client.agentBookings ? <p><a href={`/workspace/bookings?${new URLSearchParams({ workspaceId: closerClient.client.workspaceId, view: "week", source: "agent" })}`}>Booked through assistants · {closerClient.client.name}</a></p> : null}
        <OwnerReachLines client={closerClient.read} agencyWorkspaceId={agencyWorkspaceId} />
        {closerClient.client.status === "ready" && closerClient.client.provider ? <>
          {agencyWorkspaceId ? <p><button type="button" className={styles.inlineAction} onClick={() => setReviewing(value => !value)}>{reviewing ? "Close decisions" : "Review decisions"}</button></p> : null}
          <ClientAdditionalControls workspaceId={closerClient.client.workspaceId} clientName={closerClient.client.name} agencyWorkspaceId={agencyWorkspaceId} viewerEmail={viewerEmail} canManage={canManage} request={request} />
        </> : null}
        {reviewing && agencyWorkspaceId && closerClient.client.status === "ready" && closerClient.client.provider ? <section className={styles.review} aria-label={`Decisions for ${closerClient.client.name}`}>
          <AgencyClientDecisions key={`${agencyWorkspaceId}:${closerClient.client.workspaceId}`} workspaceId={closerClient.client.workspaceId} agencyWorkspaceId={agencyWorkspaceId} clientName={closerClient.client.name} request={request} />
        </section> : null}
      </div> : null}
    </section>
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

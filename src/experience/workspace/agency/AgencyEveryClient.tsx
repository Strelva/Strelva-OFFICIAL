"use client";
/**
 * XA · A6, every client. The headline counts what waits on the agency; the
 * line under it names every client that waits on its owner, so it never
 * repeats the headline. Then one table: who the client is, an owner exception
 * when there is one (not claimed yet, can't be reached, with the fix beside
 * it; a claimed owner leaves the cell empty, and with no exception the column
 * stays out), what waits and on whom, the last change and, when time is on,
 * this month's time. Health shows only when something is wrong, as what waits
 * on the agency, with Pebble's line on that row. The whole row opens the
 * client, where its decisions, responsibility and time live (AG3).
 *
 * Phone keeps every fact: under the name, what waits, then a meta line with
 * the owner exception, the last change and this month's time.
 *
 * Data is the same batched agency read as before (`agency_client_overview`):
 * rows are scoped exactly as opening that client would be, a client that
 * failed to load is named, and a last good read stays visibly stale.
 *
 * Usage across clients is not drawn here while the money call is open: its
 * only measure is dollars, and no figure shows until pricing is decided.
 */
import type { MouseEvent, ReactNode } from "react";
import { XaButton, XaButtonLink, XaHeadline, XaInitial, XaPebbleAvatar, XaPebbleScene, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { clientColor } from "@/platform/presentation/client-color";
import type { AgencyLastGoodRead } from "./AgencyViews";
import { daysWaiting, type AgencyClientRow } from "../agency-clients";
import { openRequestsLabel, type AgencyClientsView } from "../agency-home";
import { countWord, listNames } from "./xa/agency-xa-model";
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

/** "1 decision since yesterday", "3 decisions for 6 days". */
function ownerDecisions(client: AgencyClientRow, now: number): string {
  const count = client.needsYou.count;
  const days = daysWaiting(client.needsYou.oldestAt, now);
  const since = days === null ? "" : days === 0 ? " since today" : days === 1 ? " since yesterday" : ` for ${days} days`;
  return `${count} ${count === 1 ? "decision" : "decisions"}${since}`;
}

/** What waits on the client's owner. Empty when nothing does. */
export function ownerWaits(client: AgencyClientRow, now: number): string {
  if (client.ownerClaimWaiting) return client.needsYou.count ? `to claim it · ${ownerDecisions(client, now)}` : "to claim it";
  return client.needsYou.count ? ownerDecisions(client, now) : "";
}

/**
 * The line under the headline: every client that waits on its owner, never
 * just the first. "Harbor Dental and Fieldwork Studio each wait on an owner
 * for one decision." With more than two, or mixed reasons, it names the
 * oldest and counts the rest.
 */
export function ownerWaitsSentence(clients: readonly AgencyClientRow[]): string | null {
  const waiting = clients.filter(client => client.ownerClaimWaiting || client.needsYou.count > 0);
  if (!waiting.length) return null;
  const one = (client: AgencyClientRow) => client.ownerClaimWaiting ? `${client.name} waits for its owner to claim it` : `${client.name} waits on its owner for ${client.needsYou.count === 1 ? "one decision" : `${countWord(client.needsYou.count, false)} decisions`}`;
  if (waiting.length === 1) return `${one(waiting[0]!)}.`;
  const allClaims = waiting.every(client => client.ownerClaimWaiting && !client.needsYou.count);
  const allDecisions = waiting.every(client => !client.ownerClaimWaiting);
  if (waiting.length === 2 && allClaims) return `${listNames(waiting.map(client => client.name))} wait for their owners to claim them.`;
  if (waiting.length === 2 && allDecisions) {
    const counts = new Set(waiting.map(client => client.needsYou.count));
    const [count] = [...counts];
    return counts.size === 1 ? `${listNames(waiting.map(client => client.name))} each wait on an owner for ${count === 1 ? "one decision" : `${countWord(count!, false)} decisions`}.`
      : `${listNames(waiting.map(client => client.name))} wait on their owners for ${countWord(waiting.reduce((sum, client) => sum + client.needsYou.count, 0), false)} decisions.`;
  }
  // Two for different reasons: name both.
  if (waiting.length === 2) return `${one(waiting[0]!)}. ${one(waiting[1]!)}.`;
  // The oldest wait first; a claim that waits counts as the oldest.
  const at = (client: AgencyClientRow) => client.ownerClaimWaiting ? -Infinity : client.needsYou.oldestAt ? Date.parse(client.needsYou.oldestAt) : Infinity;
  const [oldest, ...rest] = [...waiting].sort((a, b) => at(a) - at(b));
  return `${one(oldest!)}. ${rest.length === 1 ? "One more waits on its owner." : `${countWord(rest.length)} more wait on their owners.`}`;
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

/** The owner cell shows exceptions only: a claimed owner, or one not known, leaves it empty. */
function ownerException(client: AgencyClientRow): string {
  if (client.ownerClaimWaiting) return "Not claimed yet";
  if (client.ownerReach && !client.ownerReach.reachable) return "Can’t be reached";
  return "";
}

/** The fix sits beside the exception it fixes, never as a column of its own. */
function ownerFix(client: AgencyClientRow, agencyWorkspaceId?: string): ReactNode {
  const clientHref = agencyWorkspaceId ? `/workspace/agency/clients/new?${new URLSearchParams({ workspaceId: agencyWorkspaceId, client: client.workspaceId })}` : null;
  // A claim link is shown once, when it is made; the client's page makes a fresh one to copy.
  if (client.ownerClaimWaiting) return clientHref ? <XaTextLink href={clientHref} aria-label={`Make a new claim link for ${client.name}`}>Make a new claim link</XaTextLink> : null;
  const reach = client.ownerReach;
  if (!reach || reach.reachable) return null;
  if (reach.canIssueClaim && clientHref) return <XaTextLink href={clientHref}>Fix owner contact</XaTextLink>;
  if (client.reach === "member") return <XaTextLink href={`/workspace/business-details?workspaceId=${encodeURIComponent(client.workspaceId)}`}>Add the owner’s email</XaTextLink>;
  return <small>Ask {client.name} for the owner’s email.</small>;
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

export function AgencyEveryClient({ clients, total, agencyName, hasMore, loadingMore, moreError, retrying, now, onOpen, onRetryPage, onMore, agencyWorkspaceId, lastGoodReads, addClientHref, minutes, importHref, onBuild }: {
  clients: ClientRow[]; total: number; agencyName: string; hasMore: boolean; loadingMore: boolean; moreError: boolean;
  retrying: ReadonlySet<number>; now: number; onOpen: (workspaceId: string) => void; onRetryPage: (pageIndex: number) => void;
  onMore: () => void; agencyWorkspaceId?: string; viewerEmail?: string; canManage?: boolean; request?: typeof fetch;
  lastGoodReads?: ReadonlyMap<string, AgencyLastGoodRead>; addClientHref?: string | null;
  /** This month's recorded time per client, when time logging is on. Without it the column stays out. */
  minutes?: ReadonlyMap<string, number> | null;
  importHref?: string | null;
  /** An owner or admin of the agency builds something for one client from here. */
  onBuild?: () => void;
}) {
  if (!clients.length) return <div className={styles.empty}>
    <XaHeadline size="md" quiet={`A business appears here once you add it, or once it shares work with ${agencyName}.`}>No clients yet.</XaHeadline>
    {addClientHref ? <div><XaButtonLink variant="primary" href={addClientHref}>Add a client</XaButtonLink></div> : null}
    {addClientHref ? <p className={styles.checked}>Strelva reads their website as soon as you add them.</p> : null}
  </div>;

  const reads = clients.map(client => {
    const lastGood = client.status === "unavailable" ? lastGoodReads?.get(client.workspaceId) : undefined;
    return { client, lastGood, read: lastGood?.client || client };
  });
  const waiting = reads.filter(({ client, read }) => client.status === "ready" && agencyWaits(read));
  const onYou = waiting.length;
  const checked = lastCheck(reads.map(({ read }) => read));
  const staleCheck = checked ? now - checked.getTime() > STALE_CHECK_MS : false;
  const countWords = `${countWord(total)} ${total === 1 ? "client" : "clients"}.`;
  const showMinutes = Boolean(minutes);
  const waitWords = onYou === 0 ? "Nothing waits on you." : `${countWord(onYou)} ${onYou === 1 ? "waits" : "wait"} on you.`;
  // The line under the headline says something the headline doesn't: every client that waits on its owner, else the next client that waits on you.
  const ownerLine = ownerWaitsSentence(reads.filter(({ client }) => client.status === "ready").map(({ read }) => read));
  const quiet = ownerLine ?? (waiting[0] ? waitsOnYouSentence(waiting[0].read) : "Every client is running.");
  // Exceptions only: the owner column stays out when every owner has claimed their business.
  const exceptionOf = (client: ClientRow, read: AgencyClientRow, lastGood: AgencyLastGoodRead | undefined) => client.status === "unavailable" && !lastGood ? "Unknown" : ownerException(read);
  const showOwner = reads.some(({ client, read, lastGood }) => exceptionOf(client, read, lastGood));
  const allLoaded = clients.length >= total;
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
    </header>

    <table className={styles.table} aria-label="Clients">
      <thead><tr><th scope="col">Client</th>{showOwner ? <th scope="col">Owner</th> : null}<th scope="col">Waiting on</th><th scope="col">Last change</th>{showMinutes ? <th scope="col" className={styles.right}>Time this month</th> : null}</tr></thead>
      <tbody>{reads.map(({ client, lastGood, read }) => {
        const unavailable = client.status === "unavailable";
        const you = agencyWaits(read);
        const owner = ownerWaits(read, now);
        const exception = exceptionOf(client, read, lastGood);
        const down = read.systems.some(system => system.health?.status === "blocked");
        const broken = unavailable ? undefined : brokenSystems(read)[0];
        const lastChange = unavailable && !lastGood ? "Unknown" : lastChangeLabel(read.lastReceiptAt, now);
        const time = showMinutes ? minuteLabel(minutes!.get(client.workspaceId)) : null;
        // On a phone nothing is dropped: what waits, then the owner exception, the last change and this month's time.
        const phoneLine = unavailable ? "" : you ? `You · ${you}` : owner ? `Owner · ${owner}` : "";
        // "Owner · to claim it" already says the claim waits, so the meta line doesn't say it again.
        const phoneMeta = [unavailable || (read.ownerClaimWaiting && phoneLine.startsWith("Owner")) ? null : exception, lastChange === "None yet" ? "No changes yet" : lastChange === "Unknown" ? "Last change unknown" : lastChange, time === null ? null : time === "None yet" ? "No time this month" : time].filter(Boolean).join(" · ");
        // Pebble is in frame for bad news, on the row it is about, saying what it knows that the row doesn't.
        const pebble = broken ? <span className={styles.pebbleLine}><XaPebbleAvatar size={22} /><span>{broken.health?.summary || `Pebble keeps checking ${broken.name}.`} <XaTextLink onClick={() => onOpen(client.workspaceId)} aria-label={`Fix ${broken.name} at ${client.name}`}>Fix it</XaTextLink></span></span> : null;
        return <tr key={client.workspaceId} data-stale={unavailable || undefined} className={styles.row} onClick={event => openRow(event, client.workspaceId)}>
          <th scope="row" className={styles.client}>
            <div className={styles.clientLine}>
              <XaInitial name={client.name} color={clientColor(client.workspaceId)} size={36} />
              <button type="button" className={styles.open} onClick={() => onOpen(client.workspaceId)} aria-label={`Open ${client.name}`}>
                <span className={styles.name}>{client.name}</span><span className={styles.summary}>{summary(read)}</span>
                {phoneLine ? <span className={styles.phoneLine} data-tone={you ? down ? "down" : "waits" : undefined}>{phoneLine}</span> : null}
                <span className={styles.phoneMeta}>{phoneMeta}</span>
              </button>
            </div>
            {pebble ? <div className={styles.phoneOnly}>{pebble}</div> : null}
            {exception && !unavailable && ownerFix(read, agencyWorkspaceId) ? <div className={styles.phoneOnly}><span className={styles.fix}>{ownerFix(read, agencyWorkspaceId)}</span></div> : null}
          </th>
          {showOwner ? <td data-label="Owner">{exception ? <div className={styles.waits}><span className={styles.state} data-tone="waits">{exception}</span>{unavailable ? null : <span className={styles.fix}>{ownerFix(read, agencyWorkspaceId)}</span>}</div> : null}</td> : null}
          <td data-label="Waiting on">{unavailable ? <div className={styles.stale}>
            <XaStatus kind="waits" size="sm">{client.name} could not be loaded.</XaStatus>
            <small>{lastGood ? `Showing the last good read from ${when(lastGood.readAt)}.` : "No last good read is available in this visit."}</small>
            {lastGood ? <small>{[you && `You · ${you}`, owner && `Owner · ${owner}`].filter(Boolean).join(" · ") || "Nothing waited at that read."}</small> : null}
            <XaButton size="sm" busy={retrying.has(client.pageIndex)} onClick={() => onRetryPage(client.pageIndex)} aria-label={`Retry loading ${client.name}`}>Retry</XaButton>
          </div> : you || owner ? <div className={styles.waits}>
            {you ? <span className={styles.state} data-tone={down ? "down" : "waits"}>You · {you}</span> : null}
            {pebble}
            {owner ? <span className={styles.state}>Owner · {owner}</span> : null}
          </div> : <span className={styles.quietText}>Nothing</span>}</td>
          <td><span className={styles.quietText}>{lastChange}</span></td>
          {showMinutes ? <td className={styles.right}><span className={styles.quietText}>{time}</span></td> : null}
        </tr>;
      })}</tbody>
    </table>

    {/* The headline already counts every client; a count here only says how many of them are showing. */}
    {!allLoaded || importHref || onBuild || hasMore ? <footer className={styles.foot}>
      <p className={styles.quietText}>{[
        !allLoaded ? <span key="count">Showing {clients.length} of {total} clients</span> : null,
        importHref ? <XaTextLink key="import" href={importHref}>Import clients</XaTextLink> : null,
        onBuild ? <XaTextLink key="build" onClick={onBuild}>Build for a client</XaTextLink> : null,
      ].filter(Boolean).map((item, index) => <span key={index}>{index ? " · " : ""}{item}</span>)}</p>
      {hasMore ? <XaButton size="sm" busy={loadingMore} onClick={onMore}>Show more clients</XaButton> : null}
    </footer> : null}
    {moreError ? <p role="alert" className={styles.alert}>More clients could not be loaded. Access has not changed. Try again.</p> : null}
  </div>;
}

function minuteLabel(value: number | undefined): string {
  return value ? `${value} min` : "None yet";
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

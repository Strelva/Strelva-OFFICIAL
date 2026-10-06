import type { WorkAllowanceInspection } from "@/platform/work-economics/allowances";
import {
  daysWaiting,
  libraryCounts,
  reviewAllImprovements,
  type AgencyBulkReviewResult,
  type AgencyClientRow,
  type AgencyClientSystem,
  type AgencyClientsPage,
  type AgencyLibrarySource,
  type AgencyLibraryVersion,
  type AgencyQueueItem,
  type AgencyTeamMember,
} from "./agency-clients";

export interface AgencyCreditPeriod {
  id: string;
  periodStart: string;
  periodEnd: string;
  units: Array<{ unitKind: string; creditedUnits: number }>;
}

/** Credits appear only when the allowance response contains an explicit award. */
export function agencyCreditPeriods(inspection: WorkAllowanceInspection): AgencyCreditPeriod[] {
  return inspection.allowances.flatMap((allowance): AgencyCreditPeriod[] => {
    const units = allowance.buckets.flatMap((bucket) => bucket.creditedUnits > 0
      ? [{ unitKind: bucket.unitKind, creditedUnits: bucket.creditedUnits }]
      : []);
    return units.length ? [{
      id: allowance.id,
      periodStart: allowance.periodStart,
      periodEnd: allowance.periodEnd,
      units,
    }] : [];
  });
}

/* -------------------------------------------------------------------------- */
/*  Client pages                                                               */
/* -------------------------------------------------------------------------- */

/** One fetched page, kept with the cursor that fetched it so one page can be retried. */
export interface AgencyLoadedPage {
  cursor: string | null;
  page: AgencyClientsPage;
}

export interface AgencyClientsView {
  clients: Array<AgencyClientRow & { pageIndex: number }>;
  queue: AgencyQueueItem[];
  team: AgencyTeamMember[];
  total: number;
  nextCursor: string | null;
}

/**
 * Joins the server pages in order. A client is listed once (its latest page
 * wins), queue items once by id, and each person once with every client they
 * reach across the pages.
 */
export function combineAgencyPages(pages: readonly AgencyLoadedPage[]): AgencyClientsView {
  const clients = new Map<string, AgencyClientRow & { pageIndex: number }>();
  const queue = new Map<string, AgencyQueueItem>();
  const team = new Map<string, AgencyTeamMember>();
  pages.forEach(({ page }, pageIndex) => {
    for (const client of page.clients) clients.set(client.workspaceId, { ...client, pageIndex });
    for (const item of page.queue) queue.set(`${item.workspaceId}:${item.id}`, item);
    for (const member of page.team) {
      const existing = team.get(member.userId);
      if (!existing) { team.set(member.userId, { ...member, clients: [...member.clients] }); continue; }
      const known = new Set(existing.clients.map((client) => client.workspaceId));
      existing.clients.push(...member.clients.filter((client) => !known.has(client.workspaceId)));
    }
  });
  const last = pages.at(-1)?.page;
  return {
    clients: [...clients.values()],
    queue: [...queue.values()],
    team: [...team.values()],
    total: last?.total ?? 0,
    nextCursor: last?.nextCursor ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Words                                                                      */
/* -------------------------------------------------------------------------- */

const LIFECYCLE_LABEL: Record<AgencyClientSystem["lifecycle"], string> = { draft: "Draft", live: "Live", paused: "Paused" };

/** "attymooney.com · Live", or "Twin Trees site · Live · Camillus Version". */
export function clientSystemLabel(system: AgencyClientSystem): string {
  const parts = [system.name, LIFECYCLE_LABEL[system.lifecycle]];
  if (system.versionContext) parts.push(`${system.versionContext} Version`);
  return parts.join(" · ");
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "6 days", "1 day", "today". */
export function waitLabel(at: string | null, now = Date.now()): string | null {
  const days = daysWaiting(at, now);
  if (days === null) return null;
  return days === 0 ? "today" : plural(days, "day");
}

/** "2 waiting · oldest 6 days", or "Nothing waiting". */
export function needsYouLabel(row: Pick<AgencyClientRow, "needsYou">, now = Date.now()): string {
  if (!row.needsYou.count) return "Nothing waiting";
  const wait = waitLabel(row.needsYou.oldestAt, now);
  const count = `${row.needsYou.count} waiting`;
  if (!wait) return count;
  return `${count} · oldest ${wait === "today" ? "from today" : wait}`;
}

/** "Last receipt 3 days ago", "Last receipt today", "No receipts yet". */
export function lastReceiptLabel(at: string | null, now = Date.now()): string {
  const days = daysWaiting(at, now);
  if (days === null) return "No receipts yet";
  if (days === 0) return "Last receipt today";
  if (days === 1) return "Last receipt yesterday";
  return `Last receipt ${days} days ago`;
}

export function openRequestsLabel(count: number): string {
  return count ? plural(count, "open request") : "No open requests";
}

const QUEUE_KIND_LABEL: Record<AgencyQueueItem["kind"], string> = {
  request: "Request",
  needs_you: "Waiting on the owner",
  improvement: "Improvement ready",
};

export function queueKindLabel(kind: AgencyQueueItem["kind"]): string {
  return QUEUE_KIND_LABEL[kind];
}

const ACCOUNT_NAMES: Record<string, string> = {
  google_calendar: "Google Calendar",
  google_business_profile: "Google Business Profile",
  google_analytics: "Google Analytics",
  google_search_console: "Google Search Console",
  gmail: "Gmail",
  domain: "a domain",
  stripe: "Stripe",
};

/** `google_calendar` → "Google Calendar". Unknown kinds read as plain words. */
export function accountName(binding: string): string {
  return ACCOUNT_NAMES[binding] ?? binding.replaceAll("_", " ");
}

function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "Needs Google Calendar connected first". */
export function missingAccountsLabel(bindings: readonly string[]): string {
  return bindings.length ? `Needs ${listWords(bindings.map(accountName))} connected first` : "Needs an account connected first";
}

/** One Version's status in the words the spec uses. */
export function versionStatusLabel(version: AgencyLibraryVersion): string {
  switch (version.state) {
    case "up_to_date": return "Up to date";
    case "ready": return "Improvement ready";
    case "conflicts": return `Needs a choice on ${plural(version.conflicts.length || 1, "change")}`;
    case "missing_accounts": return missingAccountsLabel(version.missingBindings);
    case "declined": return version.declinedReason ? `Declined: ${version.declinedReason}` : "Declined";
    case "unavailable": return "Could not be read";
  }
}

/** "5 ready · 1 has conflicts · 1 missing accounts". Zero counts are left out. */
export function libraryStatusLine(source: AgencyLibrarySource): string {
  const counts = libraryCounts(source);
  const parts = [
    counts.ready ? `${counts.ready} ready` : "",
    counts.conflicts ? `${counts.conflicts} ${counts.conflicts === 1 ? "has" : "have"} conflicts` : "",
    counts.missing_accounts ? `${counts.missing_accounts} missing accounts` : "",
    counts.up_to_date ? `${counts.up_to_date} up to date` : "",
    counts.declined ? `${counts.declined} declined` : "",
    counts.unavailable ? `${counts.unavailable} could not be read` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No client Versions yet";
}

/** A conflict value as the person would read it: text in quotes, the rest as data. */
export function conflictValue(value: unknown): string {
  if (value === undefined || value === null) return "Not set";
  if (typeof value === "string") return `“${value}”`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch { return "Unreadable value"; }
}

/** `followUp.message` → "follow up › message". */
export function conflictPathLabel(path: string): string {
  return path.split(/[./]/).filter(Boolean).map((part) => part.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase()).join(" › ") || path;
}

/* -------------------------------------------------------------------------- */
/*  Review all                                                                 */
/* -------------------------------------------------------------------------- */

export function latestRevision(source: AgencyLibrarySource): AgencyLibrarySource["revisions"][number] | null {
  return source.revisions.reduce<AgencyLibrarySource["revisions"][number] | null>((latest, revision) => (
    !latest || revision.number > latest.number ? revision : latest
  ), null);
}

/** Only `ready` Versions are ever sent. Conflicts and missing accounts are never forced. */
export function reviewableVersionIds(source: AgencyLibrarySource): string[] {
  return source.versions.filter((version) => version.state === "ready").map((version) => version.versionId);
}

export type ReviewLine = AgencyBulkReviewResult["results"][number];

/** What the person sees after Review all: the server's results plus the Versions held back here. */
export function reviewAllLines(source: AgencyLibrarySource, result: AgencyBulkReviewResult | null): ReviewLine[] {
  const heldBack = source.versions.flatMap((version): ReviewLine[] => {
    if (version.state === "conflicts") return [{ versionId: version.versionId, workspaceId: version.workspaceId, clientName: version.clientName, outcome: "skipped_conflicts", detail: versionStatusLabel(version) }];
    if (version.state === "missing_accounts") return [{ versionId: version.versionId, workspaceId: version.workspaceId, clientName: version.clientName, outcome: "skipped_missing_accounts", detail: missingAccountsLabel(version.missingBindings) }];
    return [];
  });
  const sent = result?.results ?? [];
  const sentIds = new Set(sent.map((line) => line.versionId));
  return [...sent, ...heldBack.filter((line) => !sentIds.has(line.versionId))];
}

export function reviewLineLabel(line: ReviewLine): string {
  const detail = line.detail.trim().replace(/\.$/, "");
  switch (line.outcome) {
    case "prepared": return "Prepared. Waiting on the owner’s approval.";
    case "skipped_conflicts": return detail ? `Skipped. ${detail}.` : "Skipped. Needs a choice on the conflicting changes.";
    case "skipped_missing_accounts": return detail ? `Skipped. ${detail}.` : "Skipped. An account needs connecting first.";
    case "skipped_up_to_date": return "Skipped. Already up to date.";
    case "failed": return detail ? `Could not prepare: ${detail}.` : "Could not prepare. Nothing changed for this client.";
  }
}

/**
 * Sends the latest revision with only the ready Versions. Returns null and
 * sends nothing when no Version is ready.
 */
export async function reviewAllReady(
  request: typeof fetch,
  agencyWorkspaceId: string,
  source: AgencyLibrarySource,
): Promise<AgencyBulkReviewResult | null> {
  const revision = latestRevision(source);
  const versionIds = reviewableVersionIds(source);
  if (!revision || !versionIds.length) return null;
  return reviewAllImprovements(request, { agencyWorkspaceId, sourceSystemId: source.systemId, revision: revision.number, versionIds });
}

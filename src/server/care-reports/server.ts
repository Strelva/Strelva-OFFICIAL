import "server-only";
import { readBuiltInAppRelease } from "@/platform/app-releases/server";
import { getDomainHealth, type DomainHealthSnapshot } from "@/platform/infra/domain-health";
import { logger } from "@/platform/infra/logger";
import type { ReleaseViewer } from "@/platform/release-flags/resolve";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import {
  careReportReleaseSnapshotSchema,
  careReportFactsSchema,
  type CareReportSiteChecks,
  type CareReportView,
} from "@/platform/care-reports/contracts";
import { sendCareReportRelease } from "@/platform/care-reports/delivery";
import { careReportWorkspaceUrl } from "@/platform/care-reports/share";
import { generateCareReports, listCareReports, readCareReport } from "@/platform/care-reports/service";

const POOL = 8;
const CHUNK = 25;

async function pooled<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL, items.length) }, run));
  return results;
}

/** Businesses where the App is on. A read that fails leaves the business out. */
export async function careReportsAvailableFor(workspaceIds: string[], viewer?: ReleaseViewer): Promise<Set<string>> {
  const reads = await pooled(workspaceIds, async id => {
    try {
      const state = await readBuiltInAppRelease("care_reports", id, viewer);
      return state.available ? id : null;
    } catch { return null; }
  });
  return new Set(reads.filter((id): id is string => id !== null));
}

/** Site checks come only from the stored domain snapshot. Nothing fetches a site. */
export async function siteChecksFor(
  clients: { workspaceId: string; tenantIds: string[] }[],
  deps: { read: () => Promise<DomainHealthSnapshot | null> } = { read: getDomainHealth },
): Promise<CareReportSiteChecks> {
  const snapshot = await deps.read().catch(() => null);
  if (!snapshot) return {};
  const byTenant = new Map(snapshot.results.map(result => [result.tenantId, result]));
  const out: CareReportSiteChecks = {};
  for (const client of clients) {
    const rows: CareReportSiteChecks[string] = [];
    for (const tenantId of client.tenantIds) {
      const health = byTenant.get(tenantId);
      if (!health) continue;
      const checkedAt = health.checks.map(check => check.checkedAt).sort().at(-1) ?? snapshot.scannedAt;
      rows.push({ host: health.primaryHost ?? health.checks[0]?.host ?? health.tenantId, state: health.worst, checkedAt });
    }
    if (rows.length) out[client.workspaceId] = rows.slice(0, 10);
  }
  return out;
}

export interface BulkCareSkip { workspaceId: string; name: string; reason: "not_available" | "not_allowed" | "failed" }

export async function generateAgencyCareReports(
  actor: WorkspaceActor,
  input: { agencyWorkspaceId: string; month: string; workspaceIds?: string[] },
  viewer?: ReleaseViewer,
): Promise<{ generated: number; reports: { reportId: string; workspaceId: string; revision: number }[]; skipped: BulkCareSkip[] }> {
  const list = await listCareReports(actor, input.agencyWorkspaceId, input.month);
  const requested = input.workspaceIds ? new Set(input.workspaceIds) : null;
  const skipped: BulkCareSkip[] = [];
  const named = new Map(list.clients.map(client => [client.workspaceId, client]));
  if (requested) for (const id of requested) if (!named.has(id)) skipped.push({ workspaceId: id, name: "", reason: "not_allowed" });
  const chosen = list.clients.filter(client => !requested || requested.has(client.workspaceId));
  const writable = chosen.filter(client => {
    if (client.canWrite) return true;
    if (requested) skipped.push({ workspaceId: client.workspaceId, name: client.name, reason: "not_allowed" });
    return false;
  });
  if (!writable.length) return { generated: 0, reports: [], skipped };
  const available = await careReportsAvailableFor(writable.map(client => client.workspaceId), viewer);
  const ready = writable.filter(client => {
    if (available.has(client.workspaceId)) return true;
    skipped.push({ workspaceId: client.workspaceId, name: client.name, reason: "not_available" });
    return false;
  });
  if (!ready.length) return { generated: 0, reports: [], skipped };
  const siteChecks = await siteChecksFor(ready);
  const reports: { reportId: string; workspaceId: string; revision: number }[] = [];
  for (let at = 0; at < ready.length; at += CHUNK) {
    const slice = ready.slice(at, at + CHUNK);
    const chunkChecks: CareReportSiteChecks = {};
    for (const client of slice) if (siteChecks[client.workspaceId]) chunkChecks[client.workspaceId] = siteChecks[client.workspaceId]!;
    const result = await generateCareReports(actor, { agencyWorkspaceId: input.agencyWorkspaceId, month: input.month, workspaceIds: slice.map(client => client.workspaceId), siteChecks: chunkChecks });
    reports.push(...result.reports);
    for (const skip of result.skipped) skipped.push({ workspaceId: skip.workspaceId, name: named.get(skip.workspaceId)?.name ?? "", reason: skip.reason });
  }
  return { generated: reports.length, reports, skipped };
}

/** A Release or draft that no longer parses is dropped and logged, never thrown. */
export async function readCareReportForViewer(actor: WorkspaceActor, reportId: string): Promise<CareReportView> {
  const view = await readCareReport(actor, reportId);
  const releases = view.releases.filter(release => {
    if (careReportReleaseSnapshotSchema.safeParse(release.snapshot).success) return true;
    logger.warn("[care-reports] Dropped a Release that no longer parses", { reportId, release: release.number });
    return false;
  });
  if (view.audience === "owner") {
    if (!releases.length) throw new WorkspaceAccessError();
    return { ...view, releases: releases as typeof view.releases };
  }
  if (!careReportFactsSchema.safeParse(view.report.draft).success) logger.warn("[care-reports] Draft does not parse", { reportId });
  return { ...view, releases };
}

export async function sendCareReport(actor: WorkspaceActor, reportId: string, releaseNumber: number, origin: string) {
  const view = await readCareReportForViewer(actor, reportId);
  if (view.audience !== "agency" || !view.canWrite) throw new WorkspaceAccessError();
  const release = view.releases.find(item => item.number === releaseNumber);
  if (!release) throw new WorkspaceAccessError();
  const snapshot = careReportReleaseSnapshotSchema.parse(release.snapshot);
  // Only a hash of a share link is stored, so the email links to the signed-in report. The owner signs in.
  const link = careReportWorkspaceUrl(origin, reportId, view.report.businessWorkspaceId, release.number);
  return sendCareReportRelease(actor, {
    reportId,
    agencyWorkspaceId: view.report.agencyWorkspaceId,
    businessWorkspaceId: view.report.businessWorkspaceId,
    businessName: view.report.businessName,
    release: release.number,
    releaseId: release.id,
    facts: snapshot,
    link,
  });
}

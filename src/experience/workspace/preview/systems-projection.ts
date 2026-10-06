/**
 * Server-side Systems projection for the local interface preview.
 *
 * The preview runs the same code the workspace route runs: fixture records are
 * turned into the spine's ExistingSystemsSnapshot, projected by
 * `systemsFromExisting`, given health by `healthGraphFromSystems`, and saved
 * rebuilds become Possibilities through src/platform/possibilities. Make real
 * results come from the isolated Make real sandbox, run here at render time.
 * With `systems` off (STRELVA_SYSTEMS_RELEASE, or the page's override) no
 * projection is built, as on the workspace route.
 *
 * Monitor results below are fictional fixture evidence, dated relative to
 * now. Anything without fixture evidence stays `unknown`.
 */
import { uuidFromSeed } from "@/platform/business-record/tenant-import";
import { systemsFromExisting, type ExistingSystemsSnapshot } from "@/platform/systems/from-existing";
import { domainObservations, heartbeatObservations, scanObservation, type Observation } from "@/platform/system-health";
import type { HeartbeatStatus } from "@/lib/heartbeat";
import { CRON_MAX_AGE_SECONDS } from "@/lib/heartbeat";
import { bareHostname, type WebsiteRebuildCandidate } from "@/products/websites/index";
import { inquiryFormUnchecked, makeRealInSandbox, projectWorkspaceSystems, type SystemsProjectionInput } from "@/experience/systems/server";
import type { WorkspaceMakeRealResult, WorkspaceSnapshot, WorkspaceSystems } from "../contracts";
import { createPreviewRequest, type PreviewScenario } from "./fixture";
import { MOONEY_TENANT } from "./systems-fixture";
import { addPublishingSystems } from "@/products/publishing/projection";
import { previewPublishingExtras, previewPublishingSnapshot, type PreviewPublishing } from "./publishing-fixture";
import { withPreviewMakeReal, type PreviewMakeReal } from "./make-real-fixture";

export interface PreviewSystems {
  systems: Record<string, WorkspaceSystems>;
  makeReal: Record<string, WorkspaceMakeRealResult>;
  /** Workspaces where the preview actor is an owner and may make things real. */
  owners: string[];
  /** STRELVA_SYSTEMS_RELEASE for this render. */
  released: boolean;
}

const PREVIEW_ACTOR = { userId: "c0000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.invalid" };
const SPINE_PRODUCTS = new Set(["websites", "applications", "custom-applications", "scheduling", "tracker"]);
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;

function existingSnapshot(snapshot: WorkspaceSnapshot, inquiryTenant: string | null): ExistingSystemsSnapshot {
  const businessId = snapshot.workspaceId;
  const sites = snapshot.managedWork ?? [];
  const stable = (tenantId: string) => uuidFromSeed(`preview-tenant:${tenantId}`);
  return {
    businessId,
    savedWork: snapshot.work.filter((work) => SPINE_PRODUCTS.has(work.productId)).map((work) => ({
      id: work.id, productId: work.productId, resourceKind: work.resourceKind, title: work.title,
      createdAt: work.createdAt, updatedAt: work.createdAt,
      applicationStatus: work.productId === "applications" ? work.operation?.status ?? null : null,
      customApplicationStatus: work.productId === "custom-applications" ? work.operation?.status ?? null : null,
    })),
    managedWebsites: sites.map((site) => ({ link: "tenant_link" as const, tenantStableId: stable(site.id), tenantId: site.id, siteName: site.title, tenantActive: true, linkedAt: "2026-10-01T15:00:00.000Z" })),
    inquiryWorkspaces: sites.filter((site) => site.id === inquiryTenant).map((site) => ({
      id: uuidFromSeed(`preview-inquiries:${site.id}`), tenantStableId: stable(site.id), businessId, createdAt: "2026-10-01T15:00:00.000Z", updatedAt: "2026-10-01T15:00:00.000Z",
    })),
    bookingGrants: [],
    calendarConnections: [],
  };
}

function candidates(snapshot: WorkspaceSnapshot): WebsiteRebuildCandidate[] {
  return snapshot.work.flatMap((work) => {
    const preview = text(work.input.candidatePreviewHref);
    if (work.productId !== "websites" || !preview) return [];
    const source = text(work.input.sourceUrl);
    return [{
      workId: work.id, title: work.title, sourceHost: source ? bareHostname(source) : null, tenantId: null,
      ready: ["review", "approved", "ready"].includes(work.operation?.status ?? ""),
      summary: text(work.input.summary) ?? "The same business, pages and facts, rebuilt on Strelva's website system.",
      evidence: text(work.input.evidence), previewHref: preview, candidateRevision: 1, candidateContentHash: null, origin: "rebuild" as const,
    }];
  });
}

function fixtureEvidence(scenario: PreviewScenario, input: Pick<SystemsProjectionInput, "listing">, now: number): Observation[] {
  if (!scenario.startsWith("mooney")) return [];
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const heartbeats: HeartbeatStatus[] = (["domain-monitor", "portfolio-scan", "inquiry-follow-ups"] as const).map((cron) => ({ cron, lastSeen: ago(20), ageSeconds: 1200, maxAgeSeconds: CRON_MAX_AGE_SECONDS[cron], stale: false, lastOk: true }));
  const observations: Observation[] = [];
  for (const { system, references } of input.listing.systems) {
    if (system.kind === "website" && references.tenantId === MOONEY_TENANT) {
      observations.push(...domainObservations(system.id, {
        tenantId: MOONEY_TENANT, siteName: "The Mooney Firm", ownerName: "Sheri", primaryHost: "www.attymooney.com", worst: "up", nearestExpiryDays: 214,
        checks: [{ host: "www.attymooney.com", kind: "custom", url: "https://www.attymooney.com", httpStatus: 200, bytes: 48_211, state: "up", expiresAt: null, daysToExpiry: 214, checkedAt: ago(35), latencyMs: 310 }],
      }, ago(35)));
      observations.push(scanObservation(system.id, scenario === "mooney-error" ? { scannedAt: ago(360), grade: "D", overallScore: 58 } : { scannedAt: ago(360), grade: "B", overallScore: 84 }));
      observations.push(...heartbeatObservations(system.id, heartbeats, ["domain-monitor", "portfolio-scan"]));
    }
    if (system.kind === "inquiry") {
      observations.push(inquiryFormUnchecked(system.id));
      observations.push(...heartbeatObservations(system.id, heartbeats, ["inquiry-follow-ups"]));
    }
  }
  return observations;
}

export async function previewSystems(scenario: PreviewScenario, options: { installedStaffRequest?: boolean; seededRequests?: boolean; systems: boolean; publishing?: PreviewPublishing; makeReal?: PreviewMakeReal }, now: number = Date.now()): Promise<PreviewSystems> {
  const { systems: released, publishing: publishingMode = "off", makeReal: _makeReal, ...fixtureOptions } = options;
  if (!released) return { systems: {}, makeReal: {}, owners: [], released };
  const request = createPreviewRequest(scenario, fixtureOptions);
  const first = await (await request("/api/workspace")).json() as WorkspaceSnapshot;
  if (!first?.workspaces) return { systems: {}, makeReal: {}, owners: [], released };
  const inquiryTenant = scenario.startsWith("mooney") ? MOONEY_TENANT : "buffalo-realty";
  const result: PreviewSystems = { systems: {}, makeReal: {}, owners: [], released };
  for (const workspace of first.workspaces) {
    if (workspace.kind !== "customer") continue;
    if (workspace.role === "owner" && workspace.access !== "delegated_read") result.owners.push(workspace.id);
    const response = await request(`/api/workspace?workspaceId=${encodeURIComponent(workspace.id)}`);
    if (!response.ok) continue;
    const snapshot = await response.json() as WorkspaceSnapshot;
    const existing = systemsFromExisting(existingSnapshot(snapshot, inquiryTenant));
    // Publishing runs the workspace route's projection over a fictional snapshot.
    const published = publishingMode === "off" ? null
      : addPublishingSystems(existing, previewPublishingSnapshot(existing, scenario, publishingMode, now), { ...previewPublishingExtras(scenario), now });
    const listing = published?.listing ?? existing;
    const base = {
      listing,
      ...(published ? { publishing: { websiteParts: published.websiteParts, offers: published.offers, listings: published.listings } } : {}),
      siteDomains: new Map((snapshot.managedWork ?? []).flatMap((site) => site.domain ? [[site.id, site.domain] as const] : [])),
      candidates: candidates(snapshot),
      actorId: PREVIEW_ACTOR.userId,
      now,
      // The Mooney Firm's site is changed through Requests (a custom repo), so Ask for a change files one.
      ...(scenario.startsWith("mooney") ? { siteEditing: new Map([[MOONEY_TENANT, "request" as const]]) } : {}),
    };
    const projected = await projectWorkspaceSystems({ ...base, observations: [...fixtureEvidence(scenario, { listing }, now), ...(published?.observations ?? [])] });
    const projection = scenario.startsWith("mooney") ? withPreviewMakeReal(projected, options.makeReal ?? "off", now) : projected;
    result.systems[workspace.id] = projection;
    for (const possibility of projection.possibilities.filter((item) => item.status === "ready")) {
      const made = await makeRealInSandbox(base, PREVIEW_ACTOR, possibility.id, { canActivate: true });
      if (made) result.makeReal[`${workspace.id}:${possibility.id}`] = made;
    }
  }
  return result;
}

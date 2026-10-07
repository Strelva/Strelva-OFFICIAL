import { createHash } from "node:crypto";
import { getRedis } from "@/platform/infra/redis";
import { getSupabase } from "@/platform/infra/db/client";
import { getEventsRaw } from "@/lib/events";
import { listDrafts } from "@/lib/storage";
import { listPendingDigests } from "@/lib/maintenance-digest";
import { buildAttentionBriefing, buildAttentionFromSnapshot } from "@/lib/attention";
import { getPortfolioSummaryState } from "@/lib/portfolio";
import { getDomainHealth } from "@/lib/domain-monitor-store";
import { listTenantDomainClaims } from "@/lib/domains";
import { LEAD_MIRROR_PENDING_KEY, parsePendingMember } from "@/lib/lead-mirror";
import { getDeliveryLeads } from "@/lib/access-request-delivery";
import { getAllLeadWorkflow } from "@/lib/lead-workflow";
import { readCatalogReportFailures } from "@/platform/catalog-reports/operator-source";
import { isCustomChangeRequestMetadata } from "@/lib/custom-repos";
import { listOperationalExceptions } from "@/products/operations/inbox";
import { PostgresServiceRequestStore } from "@/platform/service-requests";
import type { UnifiedEvent } from "@/lib/types";
import type { QueueActor, QueueContext, QueueItemRaw, QueueKind } from "./contracts";
import type { SourceRead } from "./project";
import { readSiteHealth } from "./site-health-store";
import { readListingReadbackFailures, type ListingReadbackFailure } from "./store";
import { EVENT_RETENTION_DAYS, DOMAIN_VERIFICATION_ESCALATION_DAYS } from "./rules";

/**
 * Readers for every source in spec §3.1. Each reader returns its rows or names
 * why it couldn't read; a reader never returns a shorter list in place of an
 * outage. Readers only read: no source state changes here.
 */

const DAY = 24 * 3600_000;
const EVENT_WINDOW = 200;
const PROSPECT_WINDOW_DAYS = 45;
const DOMAIN_EXPIRY_WATCH_DAYS = 30;

export interface QueueTenant { id: string; siteName?: string; stableId?: string }

function clientHref(tenantId: string, anchor?: string) {
  return `/admin/clients/${encodeURIComponent(tenantId)}${anchor ? `#${anchor}` : ""}`;
}

function shortHash(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 16); }

function failure(kind: QueueKind, source: string, error: unknown): SourceRead {
  const reason = error instanceof Error && error.message ? error.message : "unavailable";
  return { kind, source, ok: false, reason: reason.length > 120 ? `${reason.slice(0, 119)}…` : reason };
}

function noRedis(kinds: QueueKind[], source: string): SourceRead[] {
  return kinds.map((kind) => ({ kind, source, ok: false as const, reason: "Redis unavailable" }));
}

function siteLabel(tenants: Map<string, QueueTenant>, tenantId: string) {
  return tenants.get(tenantId)?.siteName || tenantId;
}

/** draft_review, owner_pending and change_request all live in the event store. */
export async function readEventKinds(tenants: QueueTenant[], context: QueueContext | null): Promise<SourceRead[]> {
  const source = "Drafts, owner approvals and change requests";
  if (!getRedis()) return noRedis(["draft_review", "owner_pending", "change_request"], source);
  const marked = new Set((context?.marks ?? []).filter((mark) => !mark.closedState).map((mark) => `${mark.source}:${mark.sourceRef}`));
  const drafts: QueueItemRaw[] = [];
  const owner: QueueItemRaw[] = [];
  const changes: QueueItemRaw[] = [];
  const failed: string[] = [];
  await Promise.all(tenants.map(async (tenant) => {
    let events: UnifiedEvent[];
    try {
      events = await getEventsRaw(tenant.id, { limit: EVENT_WINDOW, requireStore: true });
    } catch {
      failed.push(tenant.id);
      return;
    }
    for (const event of events) {
      const ref = `event:${event.id}`;
      if (event.type === "change_request") {
        const meta = event.metadata;
        if (!isCustomChangeRequestMetadata(meta)) continue;
        if (meta.workflowStatus === "shipped" || meta.workflowStatus === "declined") continue;
        changes.push({
          kind: "change_request", sourceRef: ref, tenantId: event.tenantId, workspaceId: null,
          title: `${event.title || "Change request"} (${meta.workflowStatus.replace("_", " ")})`,
          openedAt: meta.requestedAt || event.createdAt, dueAt: meta.workflowStatus === "requested" ? meta.triageDueAt : null,
          facts: { workflowStatus: meta.workflowStatus }, href: clientHref(event.tenantId, "requests"),
        });
        continue;
      }
      const isDraft = event.type === "content_update" || event.type === "suggestion" || event.type === "newsletter_draft"
        || (event.type === "review" && event.metadata?.kind === "review_reply_draft");
      if (!isDraft) continue;
      const kind: QueueKind = event.metadata?.reviewAudience === "owner" ? "owner_pending" : "draft_review";
      const base: QueueItemRaw = {
        kind, sourceRef: ref, tenantId: event.tenantId, workspaceId: null,
        title: event.title || "Draft to review", openedAt: event.createdAt,
        facts: { expiresAt: new Date(Date.parse(event.createdAt) + EVENT_RETENTION_DAYS * DAY).toISOString() },
        href: kind === "owner_pending" ? clientHref(event.tenantId, "needs-you") : "/admin/actions",
      };
      if (event.status === "pending") {
        (kind === "owner_pending" ? owner : drafts).push(base);
      } else if (marked.has(`${kind}:${ref}`)) {
        // Closed by its source (approved on the client dashboard, say) while a
        // mark is still open here: show it closed elsewhere, not silently gone.
        const by = typeof event.metadata?.execution?.actor === "string" ? event.metadata.execution.actor : event.status === "auto_approved" ? "auto mode" : "the owner";
        const closed = { ...base, facts: { ...base.facts, closedElsewhere: { by, at: event.resolvedAt ?? event.createdAt } } };
        (kind === "owner_pending" ? owner : drafts).push(closed);
      }
    }
  }));
  if (failed.length) {
    const reason = `Redis read failed for ${failed.length} site${failed.length === 1 ? "" : "s"}`;
    return (["draft_review", "owner_pending", "change_request"] as const).map((kind) => ({ kind, source, ok: false as const, reason }));
  }
  return [
    { kind: "draft_review", source: "Strelva drafts", ok: true, rows: drafts },
    { kind: "owner_pending", source: "Owner approvals", ok: true, rows: owner },
    { kind: "change_request", source: "Change requests", ok: true, rows: changes },
  ];
}

export async function readSiteDrafts(tenants: QueueTenant[], now: number): Promise<SourceRead> {
  try {
    const rows: QueueItemRaw[] = [];
    for (const tenant of tenants) {
      const drafts = await listDrafts(tenant.id);
      for (const section of Object.keys(drafts).filter((key) => drafts[key])) {
        rows.push({
          kind: "site_draft", sourceRef: `${tenant.id}:${section}`, tenantId: tenant.id, workspaceId: null,
          // The draft store keeps no timestamp; age reads from the queue's own read.
          title: `Draft of the ${section} section`, openedAt: new Date(now).toISOString(), href: `/admin/drafts?tenant=${encodeURIComponent(tenant.id)}`,
        });
      }
    }
    return { kind: "site_draft", source: "Site drafts", ok: true, rows };
  } catch (error) {
    return failure("site_draft", "Site drafts", error);
  }
}

export async function readMaintenanceDigests(): Promise<SourceRead> {
  if (!getRedis()) return noRedis(["maintenance_digest"], "Maintenance digests")[0]!;
  try {
    const digests = await listPendingDigests();
    return {
      kind: "maintenance_digest", source: "Maintenance digests", ok: true,
      rows: digests.map((digest) => ({
        kind: "maintenance_digest" as const, sourceRef: `${digest.tenant}:${digest.weekOf}`, tenantId: digest.tenant, workspaceId: null,
        title: `Maintenance digest for the week of ${digest.weekOf} (${digest.items.length} item${digest.items.length === 1 ? "" : "s"})`,
        openedAt: digest.createdAt, href: "/admin/digests",
      })),
    };
  } catch (error) {
    return failure("maintenance_digest", "Maintenance digests", error);
  }
}

export async function readOpsAlerts(): Promise<SourceRead> {
  try {
    const state = await getPortfolioSummaryState();
    const briefing = state.snapshot ? buildAttentionFromSnapshot(state.snapshot) : await buildAttentionBriefing();
    return {
      kind: "ops_alert", source: "Operations alerts", ok: true,
      rows: briefing.items.filter((item) => item.kind === "ops").map((item) => ({
        kind: "ops_alert" as const, sourceRef: shortHash(`${item.tenant ?? ""}:${item.message}`),
        tenantId: item.tenant ?? null, workspaceId: null, title: item.message, openedAt: briefing.generatedAt,
        facts: { severity: item.severity }, href: item.href ?? (item.tenant ? clientHref(item.tenant) : "/admin/ops"),
      })),
    };
  } catch (error) {
    return failure("ops_alert", "Operations alerts", error);
  }
}

export async function readDomainAlerts(): Promise<SourceRead> {
  const source = "Domain monitor";
  if (!getRedis()) return noRedis(["domain_alert"], source)[0]!;
  const snapshot = await getDomainHealth();
  if (!snapshot) return { kind: "domain_alert", source, ok: false, reason: "No domain scan on record" };
  const rows: QueueItemRaw[] = [];
  for (const tenant of snapshot.results) {
    for (const check of tenant.checks) {
      if (check.state === "down" || check.state === "parked" || check.state === "unreachable") {
        rows.push({
          kind: "domain_alert", sourceRef: `${check.state}:${check.host}`, tenantId: tenant.tenantId, workspaceId: null,
          title: `${check.host} is ${check.state}${check.reason ? `: ${check.reason}` : ""}`, openedAt: check.checkedAt,
          facts: { domainState: check.state, daysToExpiry: check.daysToExpiry }, href: "/admin/uptime",
        });
      } else if (check.kind === "custom" && check.daysToExpiry !== null && check.daysToExpiry <= DOMAIN_EXPIRY_WATCH_DAYS) {
        rows.push({
          kind: "domain_alert", sourceRef: `expiring:${check.host}:${check.expiresAt ?? ""}`, tenantId: tenant.tenantId, workspaceId: null,
          title: `${check.host} expires ${check.expiresAt ? `on ${check.expiresAt.slice(0, 10)}` : `in ${check.daysToExpiry} days`}`,
          openedAt: check.checkedAt, facts: { domainState: "expiring", daysToExpiry: check.daysToExpiry }, href: "/admin/uptime",
        });
      }
    }
  }
  return { kind: "domain_alert", source, ok: true, rows };
}

export async function readUnverifiedDomains(tenants: QueueTenant[], now: number): Promise<SourceRead> {
  try {
    const rows: QueueItemRaw[] = [];
    for (const tenant of tenants) {
      for (const claim of await listTenantDomainClaims(tenant.id)) {
        if (claim.status !== "pending" && claim.status !== "misconfigured") continue;
        if (now - Date.parse(claim.createdAt) < DOMAIN_VERIFICATION_ESCALATION_DAYS * DAY) continue;
        rows.push({
          kind: "domain_unverified", sourceRef: `${tenant.id}:${claim.domain}`, tenantId: tenant.id, workspaceId: null,
          title: `${claim.domain} is ${claim.status} and waiting on the owner's DNS`, openedAt: claim.createdAt,
          href: clientHref(tenant.id, "domains"),
        });
      }
    }
    return { kind: "domain_unverified", source: "Domain claims", ok: true, rows };
  } catch (error) {
    return failure("domain_unverified", "Domain claims", error);
  }
}

export async function readSiteHealthItems(context: QueueContext | null, tenants: Map<string, QueueTenant>): Promise<SourceRead> {
  const source = "Site health";
  let snapshot;
  try {
    snapshot = await readSiteHealth();
  } catch (error) {
    return failure("site_health", source, error);
  }
  if (!snapshot) return { kind: "site_health", source, ok: false, reason: "No site health run on record" };
  const rows: QueueItemRaw[] = snapshot.results.filter((result) => result.status !== "healthy").map((result) => ({
    kind: "site_health" as const, sourceRef: `site:${result.tenantId}`, tenantId: result.tenantId, workspaceId: null,
    title: result.status === "unknown"
      ? `${result.siteName || siteLabel(tenants, result.tenantId)}: no recent evidence`
      : `${result.siteName || siteLabel(tenants, result.tenantId)}: ${result.reasons[0]?.message ?? result.status}`,
    openedAt: result.lastVerifiedAt ?? snapshot.checkedAt, facts: { healthStatus: result.status }, href: clientHref(result.tenantId, "health"),
  }));
  for (const health of context?.documentHealth ?? []) {
    if (health.status === "healthy") continue;
    rows.push({
      kind: "site_health", sourceRef: `document:${health.workId}:${health.revision}`, tenantId: health.tenantId, workspaceId: health.workspaceId,
      title: `Published revision ${health.revision} is not verified (${health.status.replace("_", " ")})`,
      openedAt: health.checkedAt, facts: { healthStatus: "blocked" }, href: `/admin/websites`,
    });
  }
  return { kind: "site_health", source, ok: true, rows };
}

export async function readServiceRequests(actor: QueueActor): Promise<SourceRead> {
  try {
    const requests = await PostgresServiceRequestStore.list(actor, { providerKind: "strelva" });
    return {
      kind: "service_request", source: "Service requests", ok: true,
      rows: requests.filter((request) => request.status === "requested" && request.providerAcceptance.status === "pending").map((request) => ({
        kind: "service_request" as const, sourceRef: request.id, tenantId: null, workspaceId: request.businessId,
        title: request.outcome.length > 120 ? `${request.outcome.slice(0, 119)}…` : request.outcome,
        openedAt: request.createdAt, href: `/admin/work?workspaceId=${encodeURIComponent(request.businessId)}`,
      })),
    };
  } catch (error) {
    return failure("service_request", "Service requests", error);
  }
}

export async function readOperationalExceptions(): Promise<SourceRead> {
  try {
    const exceptions = await listOperationalExceptions();
    return {
      kind: "operational_exception", source: "Operational exceptions", ok: true,
      rows: exceptions.map((exception) => ({
        kind: "operational_exception" as const, sourceRef: exception.id, tenantId: null, workspaceId: exception.workspaceId,
        title: `${exception.title}${exception.reason ? `: ${exception.reason}` : ""}`, openedAt: exception.ageAt,
        facts: { effect: exception.effect }, href: exception.deepLink,
      })),
    };
  } catch (error) {
    return failure("operational_exception", "Operational exceptions", error);
  }
}

type SelectResult = { data: Record<string, unknown>[] | null; error: unknown };
interface UntypedQuery extends PromiseLike<SelectResult> {
  select(columns: string): UntypedQuery;
  eq(column: string, value: string): UntypedQuery;
  gt(column: string, value: string): UntypedQuery;
  order(column: string, options: { ascending: boolean }): UntypedQuery;
  limit(count: number): UntypedQuery;
}
export async function readAssignmentOffers(now: number): Promise<SourceRead> {
  const source = "Assignment offers";
  const db = getSupabase() as unknown as { from(table: string): UntypedQuery } | null;
  if (!db) return { kind: "assignment_offer", source, ok: false, reason: "Postgres unavailable" };
  try {
    const result = await db.from("operational_assignments")
      .select("id,workspace_id,work_id,assignee_email,offered_at,expires_at")
      .eq("status", "offered")
      .gt("expires_at", new Date(now).toISOString())
      .order("offered_at", { ascending: true })
      .limit(500);
    if (result.error || !result.data) return { kind: "assignment_offer", source, ok: false, reason: "Postgres read failed" };
    return {
      kind: "assignment_offer", source, ok: true,
      rows: result.data.map((row) => ({
        kind: "assignment_offer" as const, sourceRef: String(row.id), tenantId: null, workspaceId: String(row.workspace_id),
        title: `Offered to ${String(row.assignee_email ?? "someone")}, expires ${String(row.expires_at).slice(0, 10)}`,
        openedAt: String(row.offered_at), dueAt: String(row.expires_at),
        href: `/admin/work?workspaceId=${encodeURIComponent(String(row.workspace_id))}&workId=${encodeURIComponent(String(row.work_id))}`,
      })),
    };
  } catch (error) {
    return failure("assignment_offer", source, error);
  }
}

export async function readUnkeptLeads(): Promise<SourceRead> {
  const source = "Client lead copies";
  const redis = getRedis();
  if (!redis) return noRedis(["lead_unkept"], source)[0]!;
  try {
    const flat = await redis.zrange<(string | number)[]>(LEAD_MIRROR_PENDING_KEY, 0, 499, { withScores: true });
    const rows: QueueItemRaw[] = [];
    for (let index = 0; index + 1 < flat.length; index += 2) {
      const member = String(flat[index]);
      const parsed = parsePendingMember(member);
      if (!parsed) continue;
      rows.push({
        // Lead contents never appear in the list; they open on click.
        kind: "lead_unkept", sourceRef: member, tenantId: parsed.tenant, workspaceId: null,
        title: "A lead's Postgres copy failed. It is safe in Redis for 90 days.",
        openedAt: new Date(Number(flat[index + 1])).toISOString(), href: `/admin/client-leads?tenant=${encodeURIComponent(parsed.tenant)}`,
      });
    }
    return { kind: "lead_unkept", source, ok: true, rows };
  } catch (error) {
    return failure("lead_unkept", source, error);
  }
}

export async function readProspectLeads(now: number): Promise<SourceRead> {
  const source = "Strelva sales leads";
  if (!getRedis()) return noRedis(["prospect_lead"], source)[0]!;
  try {
    const leads = await getDeliveryLeads(200);
    const workflow = await getAllLeadWorkflow(leads.map((lead) => lead.statusToken));
    const cutoff = now - PROSPECT_WINDOW_DAYS * DAY;
    return {
      kind: "prospect_lead", source, ok: true,
      rows: leads.filter((lead) => {
        if (lead.deliveryStatus !== "received") return false;
        if ((workflow[lead.statusToken]?.status ?? "new") !== "new") return false;
        const submitted = Date.parse(lead.submittedAt);
        return Number.isNaN(submitted) || submitted >= cutoff;
      }).map((lead) => ({
        kind: "prospect_lead" as const, sourceRef: lead.statusToken, tenantId: null, workspaceId: null,
        title: `New request from ${lead.businessName}`, openedAt: lead.submittedAt, href: "/admin/leads",
      })),
    };
  } catch (error) {
    return failure("prospect_lead", source, error);
  }
}

export function readbackFailureItems(context: QueueContext | null): SourceRead {
  if (!context) return { kind: "readback_failed", source: "Outside-write receipts", ok: false, reason: "Postgres unavailable" };
  return {
    kind: "readback_failed", source: "Outside-write receipts", ok: true,
    rows: context.readbackFailures.map((receipt) => ({
      kind: "readback_failed" as const, sourceRef: receipt.id, tenantId: receipt.tenantId, workspaceId: receipt.workspaceId,
      systemId: receipt.systemId, title: `${receipt.subject}: accepted, read-back ${receipt.readback}`,
      openedAt: receipt.acceptedAt ?? receipt.createdAt, receiptIds: [receipt.id],
      href: receipt.tenantId ? clientHref(receipt.tenantId, "receipts") : "/admin",
    })),
  };
}

const LISTING_WRITE_LABEL: Record<string, string> = {
  reply_post: "Google review reply", reply_update: "Google review reply edit", reply_delete: "Google review reply removal",
  hours_patch: "Google hours", info_patch: "Google business info", post_create: "Google post", post_delete: "Google post removal",
};

/**
 * Google listing writes (review replies on a linked business among them) keep
 * their one receipt in google_listing_receipts, not the outside-write ledger,
 * so their failed read-backs are read from there. Never re-sent.
 */
export function listingReadbackItems(rows: readonly ListingReadbackFailure[]): QueueItemRaw[] {
  return rows.map((receipt) => ({
    kind: "readback_failed" as const, sourceRef: `listing:${receipt.id}`, tenantId: receipt.tenantId, workspaceId: receipt.workspaceId,
    title: `${LISTING_WRITE_LABEL[receipt.action] ?? "Google listing change"} for ${receipt.workspaceName}: accepted, read-back ${receipt.readback}`,
    openedAt: receipt.completedAt ?? receipt.createdAt, receiptIds: [receipt.id],
    href: receipt.tenantId ? clientHref(receipt.tenantId, "receipts") : "/admin",
  }));
}

export async function readListingReadbackSource(actor: QueueActor, read: typeof readListingReadbackFailures = readListingReadbackFailures): Promise<SourceRead> {
  const source = "Google listing receipts";
  try {
    return { kind: "readback_failed", source, ok: true, rows: listingReadbackItems(await read(actor)) };
  } catch (error) {
    return failure("readback_failed", source, error);
  }
}

/** Every source, read in parallel. A reader that throws becomes a named gap. */
export async function readAllSources(input: { tenants: QueueTenant[]; context: QueueContext | null; actor: QueueActor; now: number }): Promise<SourceRead[]> {
  const { tenants, context, actor, now } = input;
  const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const guard = async (kind: QueueKind, source: string, read: () => Promise<SourceRead | SourceRead[]>): Promise<SourceRead[]> => {
    try {
      const value = await read();
      return Array.isArray(value) ? value : [value];
    } catch (error) {
      return [failure(kind, source, error)];
    }
  };
  const groups = await Promise.all([
    guard("draft_review", "Drafts, owner approvals and change requests", () => readEventKinds(tenants, context)),
    guard("site_draft", "Site drafts", () => readSiteDrafts(tenants, now)),
    guard("maintenance_digest", "Maintenance digests", readMaintenanceDigests),
    guard("ops_alert", "Operations alerts", readOpsAlerts),
    guard("ops_alert", "Report delivery", () => readCatalogReportFailures(actor)),
    guard("domain_alert", "Domain monitor", readDomainAlerts),
    guard("domain_unverified", "Domain claims", () => readUnverifiedDomains(tenants, now)),
    guard("site_health", "Site health", () => readSiteHealthItems(context, byId)),
    guard("service_request", "Service requests", () => readServiceRequests(actor)),
    guard("operational_exception", "Operational exceptions", readOperationalExceptions),
    guard("assignment_offer", "Assignment offers", () => readAssignmentOffers(now)),
    guard("lead_unkept", "Client lead copies", readUnkeptLeads),
    guard("prospect_lead", "Strelva sales leads", () => readProspectLeads(now)),
    Promise.resolve([readbackFailureItems(context)]),
    guard("readback_failed", "Google listing receipts", () => readListingReadbackSource(actor)),
  ]);
  return groups.flat();
}

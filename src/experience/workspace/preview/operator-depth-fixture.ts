import type { PortfolioActionsSnapshot } from "@/app/admin/actions/portfolio-actions";
import type { PortfolioOpportunitiesSnapshot } from "@/app/admin/actions/portfolio-opportunities";
import type { AuditEventView } from "@/app/admin/audit/AuditList";
import type { AuditRow } from "@/app/admin/audit/SiteAuditsBoard";
import type { DraftItem } from "@/app/admin/drafts/DraftsView";
import type { BusinessPolicy, OperatorLoad } from "@/app/admin/needs-you/data";
import type { ProvisionResult } from "@/app/admin/onboard/OnboardForm";
import type { PaidPayment, PayLink } from "@/app/admin/pay-links/PayLinksView";
import type { BusinessEffortLoad } from "@/app/admin/work/effort-data";
import type { DeliveryLead } from "@/platform/infra/delivery-contracts";
import type { HealthReport } from "@/platform/infra/health-contracts";
import type { LeadWorkflow } from "@/platform/infra/lead-workflow-contracts";
import type { MaintenanceDigest } from "@/platform/infra/maintenance-contracts";
import type { OpsReport } from "@/platform/infra/ops-contracts";
import { measureBusinessEffort } from "@/platform/business-effort/measure";
import type { BusinessEffortEntry, EffortBusiness } from "@/platform/business-effort/types";
import { buildPolicyView } from "@/platform/needs-you/policy-model";
import { OPERATOR_DESTINATIONS } from "@/experience/operator/destinations";
import { OPERATOR_CLIENTS, OPERATOR_TIME, OPERATOR_WORKSPACE } from "./operator-fixture";

/** Fictional specimens only. No reader, database, provider or live payment is used. */
export const OPERATOR_DEPTH_SURFACES = ["actions", "audit", "digests", "drafts", "leads", "needs-you", "onboard", "ops", "pay-links", "work"] as const;
export type OperatorDepthSurface = typeof OPERATOR_DEPTH_SURFACES[number];
export type OperatorDepthScenario = "ready" | "empty" | "loading" | "error" | "denied";
export const OPERATOR_DEPTH_TITLES: Record<OperatorDepthSurface, string> = {
  actions: OPERATOR_DESTINATIONS.actions.label,
  audit: OPERATOR_DESTINATIONS.audits.label,
  digests: OPERATOR_DESTINATIONS.maintenance.label,
  drafts: OPERATOR_DESTINATIONS.drafts.label,
  leads: OPERATOR_DESTINATIONS.prospects.label,
  "needs-you": OPERATOR_DESTINATIONS.policy.label,
  onboard: OPERATOR_DESTINATIONS.onboard.label,
  ops: OPERATOR_DESTINATIONS.health.label,
  "pay-links": OPERATOR_DESTINATIONS.payLinks.label,
  work: OPERATOR_DESTINATIONS.work.label,
};

export function operatorDepthActions(empty = false): PortfolioActionsSnapshot {
  return { availability: "complete", incomplete: [], totalItems: empty ? 0 : 1, totalClients: empty ? 0 : 1, groups: empty ? [] : [{ tenantId: "mooney", siteName: "The Mooney Firm", capped: false, items: [{ id: "fictional-about-change", tenantId: "mooney", label: "Content update", title: "Clarify how to request a session", createdAt: OPERATOR_TIME, type: "content_update", metadata: { diffs: [{ field: "Headline", before: "Contact the firm", after: "Request a mediation session", type: "changed" }] } }] }] };
}
export function operatorDepthOpportunities(empty = false): PortfolioOpportunitiesSnapshot {
  return { availability: "complete", incomplete: [], totalOpportunities: empty ? 0 : 1, groups: empty ? [] : [{ kind: "low_health", title: "Sites that need attention", summary: "One fictional site has a search issue to review.", actionLabel: "Prepare a draft", clients: [{ tenantId: "north", siteName: "North Coast Realty", detail: "Search preview is missing a page description." }] }] };
}
export function operatorDepthAudits(empty = false): AuditRow[] {
  return empty ? [] : [
    { id: "north", siteName: "North Coast Realty", url: "https://northcoastrealty.example", grade: "D", score: 54, issues: 4, high: 1, scannedAt: OPERATOR_TIME },
    { id: "mooney", siteName: "The Mooney Firm", url: "https://attymooney.example", grade: "A", score: 94, issues: 1, high: 0, scannedAt: OPERATOR_TIME },
    { id: "lakeview", siteName: "Lakeview Yoga", url: null, grade: null, score: null, issues: null, high: 0, scannedAt: null },
  ];
}
export function operatorDepthActivity(empty = false): AuditEventView[] {
  return empty ? [] : [{ id: "fictional-audit", time: OPERATOR_TIME, action: "content.draft.prepared", targetType: "content", targetId: "about", actorLabel: "Strelva Agency · Runs on Strelva", tenant: "mooney" }];
}
export function operatorDepthDigests(empty = false): MaintenanceDigest[] {
  return empty ? [] : [{ tenant: "mooney", siteName: "The Mooney Firm", weekOf: "2026-10-05", status: "pending", createdAt: OPERATOR_TIME, items: [{ id: "fictional-upkeep", type: "content", title: "Review the session description", detail: "The fictional page still describes the previous session format.", action: "Prepare a refreshed session description for owner review." }] }];
}
export function operatorDepthDrafts(empty = false): DraftItem[] {
  return empty ? [] : [{ tenantId: "mooney", tenantName: "The Mooney Firm", section: "hero", data: { heading: "Request a mediation session", _updatedAt: OPERATOR_TIME }, diffs: [{ field: "Headline", before: "Contact the firm", after: "Request a mediation session", type: "changed" }] }];
}
export function operatorDepthLeads(empty = false): DeliveryLead[] {
  return empty ? [] : [{ businessName: "Lakeview Yoga", description: "A simple site for class inquiries and studio details.", location: "Buffalo", email: "studio@example.test", currentWebsite: "https://lakeviewyoga.example", statusToken: "fictional-studio-request", deliveryStatus: "reviewing", submittedAt: OPERATOR_TIME, statusUpdatedAt: OPERATOR_TIME }];
}
export const OPERATOR_DEPTH_LEAD_STATUS: Record<string, LeadWorkflow> = { "fictional-studio-request": { token: "fictional-studio-request", status: "contacted", note: "Fictional fit review. Scope and deadline are not agreed.", updatedAt: OPERATOR_TIME } };
export function operatorDepthPolicy(empty = false): OperatorLoad<BusinessPolicy> {
  const view = buildPolicyView({ settings: [{ systemId: null, kind: "copy.routine", layer: "owner", route: "owner_decides", reason: "The fictional owner wants to review every content change.", version: 1, updatedAt: OPERATOR_TIME }], history: [] });
  return { state: "ready", value: { businesses: empty ? [] : [{ id: OPERATOR_WORKSPACE, name: "The Mooney Firm", strelvaRows: 0, ownerRows: 1 }], selected: empty ? null : { id: OPERATOR_WORKSPACE, name: "The Mooney Firm", view } } };
}
export function operatorDepthWork(empty = false): BusinessEffortLoad {
  const businesses: EffortBusiness[] = empty ? [] : [{ id: OPERATOR_WORKSPACE, name: "The Mooney Firm", tenantIds: ["mooney"], firstEffortOn: "2026-08-03" }];
  const entries: BusinessEffortEntry[] = empty ? [] : [
    { id: "22222222-2222-4222-8222-222222222221", businessId: OPERATOR_WORKSPACE, minutes: 45, category: "change", occurredOn: "2026-08-03", note: "Fictional copy review", recordedBy: "33333333-3333-4333-8333-333333333333", recordedAt: "2026-08-03T15:00:00Z", void: null },
    { id: "22222222-2222-4222-8222-222222222222", businessId: OPERATOR_WORKSPACE, minutes: 15, category: "change", occurredOn: "2026-09-03", note: "Fictional hours review", recordedBy: "33333333-3333-4333-8333-333333333333", recordedAt: "2026-09-03T15:00:00Z", void: null },
  ];
  return { state: "ready", overview: { businesses, entries, measure: measureBusinessEffort({ businesses, entries, now: new Date(OPERATOR_TIME) }) }, today: "2026-10-09" };
}
export function operatorDepthOps(empty = false): OpsReport {
  return { timestamp: OPERATOR_TIME, activeTenants: empty ? 0 : 5, metrics: { webhookFailures: 0, revalidationFailures: empty ? 0 : 1, pendingEvents: empty ? {} : { mooney: 1 }, totalPendingEvents: empty ? 0 : 1, failedAiWrites: 0, failedAiWriteItems: [], tenantDomainDrift: [], domainDrift: [] }, revalidationFailures: empty ? [] : [{ tenantId: "north", url: "https://northcoastrealty.example", error: "Fictional site did not confirm the content refresh", timestamp: OPERATOR_TIME, attempts: 3 }] };
}
export const OPERATOR_DEPTH_HEALTH: HealthReport = { status: "healthy", version: "1.0.0", timestamp: OPERATOR_TIME, checks: { redis: { status: "ok", responseMs: 8 }, supabase: { status: "ok", responseMs: 12 }, stripe: { status: "not configured", responseMs: 0 }, gemini: { status: "not configured", responseMs: 0 } } };
export function operatorDepthPayLinks(empty = false): PayLink[] {
  return empty ? [] : [{ slug: "fictional-mooney", clientName: "The Mooney Firm", tenantId: "mooney", amountCents: 60000, createdAt: OPERATOR_TIME }, { slug: "fictional-lakeview", clientName: "Lakeview Yoga", minCents: 50000, maxCents: 90000, createdAt: OPERATOR_TIME }];
}
export const OPERATOR_DEPTH_PAYMENTS: Record<string, PaidPayment> = { "fictional-mooney": { amountCents: 60000, customerEmail: "owner@example.test", paidAt: OPERATOR_TIME } };
export function operatorDepthProvision(tenantId = "fictional-studio"): ProvisionResult {
  return { tenantId, siteUrl: `https://${tenantId}.example`, steps: [{ key: "record", label: "Client record", status: "ok", detail: "Fictional result held in this page only." }, { key: "site", label: "Website delivery", status: "skipped", detail: "No deployment was made." }], manualNext: ["DEPLOY:preview|Inspect the private preview|This fictional specimen has no hosted site or production record."], clientEnv: {} };
}

/** Closed in-memory transport. Unrecognized paths never fall back to fetch. */
export function createOperatorDepthTransport(empty = false): typeof fetch {
  let links = operatorDepthPayLinks(empty);
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://fixture.invalid");
    const method = init?.method ?? "GET";
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(typeof init?.body === "string" ? init.body : "{}"); } catch { return Response.json({ error: "Invalid fictional request." }, { status: 400 }); }
    if (url.pathname === "/api/admin/tenants" && method === "GET") return Response.json(OPERATOR_CLIENTS);
    if (url.pathname === "/api/admin/pay-links") {
      if (method === "GET") return Response.json({ payLinks: links, paidPayments: empty ? {} : OPERATOR_DEPTH_PAYMENTS });
      if (method === "POST" && typeof body.slug === "string" && typeof body.clientName === "string") {
        if (links.some(link => link.slug === body.slug)) return Response.json({ error: "This fictional link already exists." }, { status: 409 });
        const link: PayLink = { slug: body.slug, clientName: body.clientName, createdAt: OPERATOR_TIME };
        for (const key of ["amountCents", "minCents", "maxCents"] as const) if (typeof body[key] === "number") link[key] = body[key];
        for (const key of ["tenantId", "customCopy", "returnUrl"] as const) if (typeof body[key] === "string") link[key] = body[key];
        links = [...links, link];
        return Response.json({ payLink: link });
      }
      if (method === "DELETE" && links.some(link => link.slug === url.searchParams.get("slug"))) { links = links.filter(link => link.slug !== url.searchParams.get("slug")); return Response.json({ ok: true }); }
    }
    if (url.pathname === "/api/admin/scan" && method === "POST" && OPERATOR_CLIENTS.some(client => client.id === body.tenant)) return Response.json({ grade: "A", overallScore: 94, scannedAt: OPERATOR_TIME, prioritizedIssues: [] });
    if (url.pathname === "/api/admin/maintenance-digest" && method === "POST" && body.tenant === "mooney" && ["approved", "dismissed"].includes(String(body.decision))) return Response.json({ ok: true });
    if (url.pathname === "/api/admin/provision" && method === "POST" && typeof body.subdomain === "string") return Response.json(operatorDepthProvision(body.subdomain));
    return Response.json({ error: "This fictional preview has no other reads or writes." }, { status: 404 });
  };
}

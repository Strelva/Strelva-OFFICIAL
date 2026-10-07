/**
 * Local fixtures for the Systems experience (October 4). The Mooney Firm is the
 * default walkthrough: its website facts come from the October 1 capture of
 * attymooney.com (src/experience/websites/fixtures). Inquiries, bookings, the
 * intake tool, requests and the agency/Twin Trees data are fictional fixture
 * records. No request leaves the browser.
 */
import mooneyEvidence from "@/experience/websites/fixtures/mooney-evidence-2026-10-01.json";
import { applicationSchema } from "@/products/applications/contracts";
import type { ServiceRequest } from "@/platform/service-requests";
import type { InquiryPreviewProfile } from "@/experience/inquiries/preview-fixture";
import type { WorkspaceSnapshot, WorkspaceSystemEntry, WorkspaceSystemVersion, WorkspaceWork } from "../contracts";

export const SYSTEMS_PREVIEW_SCENARIOS = ["mooney", "mooney-empty", "mooney-loading", "mooney-shared", "mooney-member", "mooney-error", "agency-systems", "twin-trees"] as const;
export type SystemsPreviewScenario = typeof SYSTEMS_PREVIEW_SCENARIOS[number];
export const isSystemsPreviewScenario = (value: string): value is SystemsPreviewScenario => (SYSTEMS_PREVIEW_SCENARIOS as readonly string[]).includes(value);

const MOONEY = "a0000000-0000-4000-8000-000000000001";
const HARBOR = "a0000000-0000-4000-8000-000000000002";
const TWIN_TREES = "a0000000-0000-4000-8000-000000000003";
const AGENCY = "a0000000-0000-4000-8000-000000000009";
const SOURCE_INTAKE = "b0000000-0000-4000-8000-000000000001";
const MOONEY_INTAKE = "b0000000-0000-4000-8000-000000000002";
const MOONEY_ARBITRATION = "b0000000-0000-4000-8000-000000000008";
const MOONEY_SESSIONS = "b0000000-0000-4000-8000-000000000003";
const MOONEY_REBUILD = "b0000000-0000-4000-8000-000000000004";
const MOONEY_FACT_REVIEW = "b0000000-0000-4000-8000-000000000005";
const HARBOR_INTAKE = "b0000000-0000-4000-8000-000000000006";
const HARBOR_STAFF = "b0000000-0000-4000-8000-000000000007";
const ACTOR = "local-preview";
const ACTOR_ID = "c0000000-0000-4000-8000-000000000001";
const AT = "2026-10-01T15:00:00.000Z";

export const MOONEY_TENANT = "mooney-firm";

export const MOONEY_INQUIRY_PROFILE: InquiryPreviewProfile = {
  id: MOONEY_TENANT, name: "The Mooney Firm", domain: "www.attymooney.com", type: "Mediation practice",
  description: "Website facts from the October 1 capture of attymooney.com. Inquiries in this preview are fictional; nothing is sent.",
  intent: "Route mediation inquiries from attymooney.com to Sheri, with a follow-up if nobody replies within a business day.",
  title: "Mediation inquiries", destination: "sheri@example.invalid", owner: "Sheri",
};

const work = (id: string, workspaceId: string, title: string, productId: string, resourceKind: string, extra: Partial<WorkspaceWork> = {}): WorkspaceWork =>
  ({ id, workspaceId, title, productId, resourceKind, payload: null, input: {}, createdAt: AT, ...extra });

function intakeApplication(title: string, released: boolean) {
  const spec = {
    title, maintenanceOwner: ACTOR,
    fields: [
      { id: "name", label: "Your name", type: "text" as const, required: true },
      { id: "organization", label: "Firm or organization", type: "text" as const, required: false },
      { id: "matter", label: "What is the matter about?", type: "text" as const, required: true },
      { id: "dates", label: "Dates that could work", type: "text" as const, required: false },
    ],
    components: [{ kind: "form" as const, fields: ["name", "organization", "matter", "dates"] }, { kind: "list" as const, fields: ["name", "matter"] }, { kind: "detail" as const, fields: ["name", "organization", "matter", "dates"] }],
  };
  const release = released ? { version: 2, spec, publishedAt: AT, publishedBy: ACTOR, provenance: "published" as const } : null;
  return applicationSchema.parse({
    version: 1, revision: 4, title, createdBy: ACTOR, createdAt: AT,
    history: [{ revision: 1, kind: "create", actorId: ACTOR, at: AT }],
    spec, specVersion: 2, status: released ? "installed" : "draft", versions: [{ version: 2, spec }], rehearsal: null,
    records: released ? [
      { id: "r1", values: { name: "[Attorney name]", organization: "[Law firm]", matter: "Commercial lease dispute, two parties", dates: "Week of Oct 20" } },
      { id: "r2", values: { name: "[HR director]", organization: "[Employer]", matter: "Workplace conflict between two managers", dates: "Any Friday" } },
    ] : [],
    designRevision: 1, recordsRevision: released ? 2 : 0,
    candidate: { designRevision: 1, specVersion: 2, spec, rehearsal: null },
    release, releases: release ? [release] : [],
  });
}

function sessionsSchedule() {
  const day = (date: string, from: string, to: string) => ({ start: `${date}T${from}:00.000-04:00`, end: `${date}T${to}:00.000-04:00` });
  return {
    version: 1, revision: 3, title: "Mediation sessions", createdBy: ACTOR, createdAt: AT,
    history: [{ revision: 1, kind: "create", actorId: ACTOR, at: AT }],
    availability: [day("2026-10-14", "09:00", "17:00"), day("2026-10-16", "09:00", "13:00"), day("2026-10-21", "09:00", "17:00"), day("2026-10-23", "09:00", "17:00")],
    reservations: [{ ...day("2026-10-14", "09:00", "13:00"), requestId: "fixture-1", title: "Half-day session · [Matter A]", status: "reserved" }, { ...day("2026-10-21", "09:00", "17:00"), requestId: "fixture-2", title: "Full-day session · [Matter B]", status: "reserved" }],
  };
}

function serviceRequests(): ServiceRequest[] {
  const operatorId = "c0000000-0000-4000-8000-000000000002";
  const base = (index: number, outcome: string, updatedAt: string): ServiceRequest => ({
    id: `d0000000-0000-4000-8000-${String(index).padStart(12, "0")}`, businessId: MOONEY, status: "requested", request: outcome, outcome,
    context: { workspaceName: "The Mooney Firm", source: "workspace_help" }, scope: ["website_change"], provider: { kind: "strelva" },
    providerAcceptance: { status: "accepted", actorId: operatorId, acceptedAt: "2026-09-30T14:00:00.000Z", note: null },
    installationId: null, deliveryId: null, revision: 2, createdBy: ACTOR_ID, createdAt: "2026-09-29T14:00:00.000Z", updatedAt,
  });
  const commitment = (status: "proposed" | "accepted", dueAt: string) => ({
    version: 1 as const, status, operatorId, termsReference: "The Mooney Firm website care", deliveryDefinition: "Live on attymooney.com and checked on desktop and mobile.",
    scope: ["website_change"], proposedAt: "2026-10-01T14:00:00.000Z", startedAt: status === "proposed" ? null : "2026-10-01T15:00:00.000Z", dueAt,
    customerAcceptedBy: status === "proposed" ? null : ACTOR_ID, customerAcceptedAt: status === "proposed" ? null : "2026-10-01T15:00:00.000Z",
    blocker: null, result: null, decision: status === "accepted" ? { kind: "accepted" as const, note: "Looks right.", actorId: ACTOR_ID, at: "2026-10-02T16:00:00.000Z" } : null,
  });
  return [
    { ...base(1, "Let attorneys request a session date from attymooney.com", "2026-10-03T13:00:00.000Z"), deliveryCommitment: commitment("proposed", "2026-10-16T21:00:00.000Z") },
    { ...base(2, "Half-day and full-day fees shown on the fees page", "2026-10-02T16:00:00.000Z"), deliveryCommitment: commitment("accepted", "2026-10-02T21:00:00.000Z") },
  ];
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function createSystemsPreviewRequest(scenario: SystemsPreviewScenario): typeof fetch {
  const agency = scenario === "agency-systems";
  const twin = scenario === "twin-trees";
  const current = agency ? AGENCY : twin ? TWIN_TREES : MOONEY;
  const mooneyAccess = scenario === "mooney-shared" || agency ? { access: "delegated_read" as const } : scenario === "mooney-member" ? { access: "member" as const, role: "member" as const } : { role: "owner" as const };
  const workspaces: WorkspaceSnapshot["workspaces"] = [
    ...(agency ? [{ id: AGENCY, kind: "agency" as const, name: "Strelva Agency", role: "owner" as const }] : []),
    ...(twin ? [{ id: TWIN_TREES, kind: "customer" as const, name: "Twin Trees", role: "owner" as const }] : [{ id: MOONEY, kind: "customer" as const, name: "The Mooney Firm", ...mooneyAccess }]),
    ...(agency ? [{ id: HARBOR, kind: "customer" as const, name: "Harbor Dental", access: "delegated_read" as const }] : []),
  ];
  const mooneyWork: WorkspaceWork[] = scenario === "mooney-empty" ? [] : [
    work(MOONEY_FACT_REVIEW, MOONEY, "Confirm 40 flagged facts on the rebuilt site", "operations", "responsibility", { operation: { status: "needs_attention", reason: `${mooneyEvidence.needsReview} credentials, fees and practice claims need your confirmation before the rebuilt site can go live.` } }),
    work(MOONEY_INTAKE, MOONEY, "Mediation intake", "applications", "application", { operation: { status: "installed" }, sourceWorkId: SOURCE_INTAKE }),
    work(MOONEY_ARBITRATION, MOONEY, "Arbitration intake", "applications", "application", { operation: { status: "installed" }, sourceWorkId: SOURCE_INTAKE }),
    work(MOONEY_SESSIONS, MOONEY, "Mediation sessions", "scheduling", "schedule", { operation: { status: "draft" } }),
    ...(agency ? [] : [work(MOONEY_REBUILD, MOONEY, "attymooney.com rebuild", "websites", "website", { operation: { status: "review" }, input: {
      sourceUrl: "https://www.attymooney.com",
      candidatePreviewHref: "/preview/strelva/rebuild/site?example=mooney",
      summary: "Every page, fact and contact route from attymooney.com, rebuilt on Strelva's website system so changes take minutes instead of a developer.",
      evidence: `${mooneyEvidence.pages} public pages carried over. ${mooneyEvidence.facts} facts keep their source quotes; ${mooneyEvidence.needsReview} need your review.`,
    } })]),
  ];
  const saved = new Map<string, WorkspaceWork[]>([
    [MOONEY, mooneyWork],
    [AGENCY, [work(SOURCE_INTAKE, AGENCY, "Intake for professional practices", "applications", "application", { operation: { status: "installed" } })]],
    [HARBOR, [work(HARBOR_INTAKE, HARBOR, "New-patient intake", "applications", "application", { operation: { status: "draft" }, sourceWorkId: SOURCE_INTAKE }), work(HARBOR_STAFF, HARBOR, "Staff requests", "applications", "application", { operation: { status: "installed" } })]],
    [TWIN_TREES, []],
  ]);
  const managedWork = twin
    ? [{ id: "twintrees-camillus", title: "Twin Trees Camillus", href: "/preview/strelva/website", productId: "managed_presence" as const, relationship: "client" as const },
      { id: "twintrees-fayetteville", title: "Twin Trees Fayetteville", href: "/preview/strelva/website", productId: "managed_presence" as const, relationship: "client" as const }]
    : scenario === "mooney-empty" || agency ? [] : [{ id: MOONEY_TENANT, title: "The Mooney Firm", href: "/preview/strelva/website", productId: "managed_presence" as const, relationship: "client" as const, domain: "www.attymooney.com" }];
  const delegations: WorkspaceSnapshot["delegations"] = [
    { id: "e0000000-0000-4000-8000-000000000001", workId: MOONEY_INTAKE, customerWorkspaceId: MOONEY, agencyWorkspaceId: AGENCY, status: "active", canRevoke: !agency },
    { id: "e0000000-0000-4000-8000-000000000002", workId: MOONEY_SESSIONS, customerWorkspaceId: MOONEY, agencyWorkspaceId: AGENCY, status: "active", canRevoke: !agency },
    ...(agency ? [
      { id: "e0000000-0000-4000-8000-000000000003", workId: HARBOR_INTAKE, customerWorkspaceId: HARBOR, agencyWorkspaceId: AGENCY, status: "active" as const, canRevoke: false },
      { id: "e0000000-0000-4000-8000-000000000004", workId: HARBOR_STAFF, customerWorkspaceId: HARBOR, agencyWorkspaceId: AGENCY, status: "active" as const, canRevoke: false },
    ] : []),
  ];
  const products: WorkspaceSnapshot["products"] = [
    { id: "applications", name: "Internal tools", description: "Private tools with working forms and records.", availability: "available" },
    { id: "inquiries", name: "Inquiries", description: "Keep customer requests moving.", availability: "available" },
    { id: "scheduling", name: "Bookings", description: "Time people can reserve.", availability: "available" },
    { id: "managed_presence", name: "Managed website", description: "Your website, built and run by Strelva.", availability: "managed" },
  ];
  const requests = serviceRequests();

  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://preview.invalid");
    const method = init?.method || "GET";
    if (url.origin !== "http://preview.invalid") return json({ error: "This request is outside the local interface preview." }, 403);
    // Holds the slower business reads open so the loading state can be inspected.
    if (scenario === "mooney-loading" && url.pathname !== "/api/workspace") await new Promise(resolve => setTimeout(resolve, 20_000));
    if (url.pathname === "/api/workspace" && method === "GET") {
      const id = url.searchParams.get("workspaceId") || current;
      if (!workspaces.some(item => item.id === id)) return json({ error: "This workspace is not part of the local preview." }, 403);
      return json({
        actor: { email: agency ? "operator@strelva.example" : twin ? "owner@twintrees.example" : "sheri@example.invalid", localPreview: true },
        workspaceId: id, workspaces, work: saved.get(id) || [], handoffs: [],
        delegations: delegations.filter(item => item.customerWorkspaceId === id || item.agencyWorkspaceId === id),
        products, managedWork: id === current ? managedWork : [], ...(scenario === "mooney-error" ? { managedWorkUnavailable: true } : {}),
      } satisfies WorkspaceSnapshot);
    }
    if (url.pathname === "/api/offerings" && method === "GET") {
      const id = url.searchParams.get("businessId");
      return json({
        businessId: id, permissions: { canRead: true, canManage: true, role: "owner" }, definitions: [], installations: [],
        websiteBindings: managedWork.map((site, index) => ({ id: `f0000000-0000-4000-8000-00000000000${index}`, businessId: id, status: "active", revision: 1, tenantId: site.id, siteName: site.title, tenantActive: true, canOpen: true, surface: { id: "managed_website", label: site.title, description: "Website controls.", href: site.href }, createdBy: ACTOR, createdAt: AT, updatedBy: ACTOR, updatedAt: AT })),
      });
    }
    if (url.pathname === "/api/service-requests" && method === "GET") {
      if (scenario === "mooney-error") return json({ error: "Requests are unavailable right now. Nothing has changed." }, 503);
      if (url.searchParams.get("businessId") === MOONEY && scenario !== "mooney-empty") return json({ requests });
      return json({ requests: [] });
    }
    if (url.pathname === "/api/bounded-work" && method === "GET") {
      const id = url.searchParams.get("workId");
      if (id === MOONEY_SESSIONS) return json({ id, payload: sessionsSchedule() });
      if (id === MOONEY_INTAKE) return json({ id, payload: intakeApplication("Mediation intake", true) });
      if (id === MOONEY_ARBITRATION) return json({ id, payload: intakeApplication("Arbitration intake", true) });
      if (id === SOURCE_INTAKE) return json({ id, payload: intakeApplication("Intake for professional practices", true) });
      if (id === HARBOR_INTAKE) return json({ id, payload: intakeApplication("New-patient intake", false) });
      return json({ error: "This saved work is unavailable in the local preview." }, 404);
    }
    if (url.pathname === "/api/agency-applications" || url.pathname === "/api/agency-website-draft-access") return json({ applications: [], websites: [] });
    if (url.pathname === "/api/work-allowances") return json({ error: "Allowances are not simulated in this preview." }, 403);
    return json({ error: "This action is not performed in the local preview. Nothing was changed." }, method === "GET" ? 404 : 409);
  };
}

/**
 * Stored Version rows (system_versions) for the fixture, in the shape
 * read_business_versions returns. Lineage is read only from these rows, so
 * without them the preview would show no Versions at all. Fictional: the
 * Mooney and Harbor intakes are Versions of the agency's intake source.
 */
export function previewStoredVersions(businessId: string, systems: readonly WorkspaceSystemEntry[], state: "ready" | "unavailable" | "empty" = "ready"): WorkspaceSystemVersion[] {
  const contexts: Record<string, { workId: string; label: string }> = {
    [MOONEY]: { workId: MOONEY_INTAKE, label: "The Mooney Firm" },
    [HARBOR]: { workId: HARBOR_INTAKE, label: "Harbor Dental" },
  };
  const context = contexts[businessId];
  const system = context ? systems.find((entry) => entry.savedWorkId === context.workId) : undefined;
  if (!context || !system) return [];
  const sibling = businessId === MOONEY ? systems.find(entry => entry.savedWorkId === MOONEY_ARBITRATION) : undefined;
  return [{
    id: `f0000000-0000-4000-8000-${businessId.slice(-12)}`,
    systemId: system.ref.systemId,
    source: { businessId: AGENCY, systemId: "f1000000-0000-4000-8000-000000000001", name: "Intake for professional practices", hidden: false },
    context: { kind: "agency_client", label: context.label },
    baselineRevision: 3, latestRevision: 3, currentRelease: 2, declined: [], siblings: sibling ? [{ id: "f0000000-0000-4000-8000-000000000008", systemId: sibling.ref.systemId, context: { kind: "customer_segment", label: "Arbitration" }, comparison: state === "unavailable" ? { state: "unavailable", changes: [] } : { state: "ready", changes: state === "empty" ? [] : [
      { path: "title", beforePresent: true, afterPresent: true, before: "Intake for professional practices", after: "Arbitration intake" },
      { path: "followUp.message", beforePresent: true, afterPresent: true, before: "We will get back to you shortly.", after: "We will call within one business day about your arbitration matter." },
      { path: "optionalConsultation", beforePresent: true, afterPresent: false, before: true, after: null },
    ] } }] : [],
  }];
}

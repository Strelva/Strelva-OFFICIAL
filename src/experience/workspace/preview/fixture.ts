import type { WorkspaceAction, WorkspaceSnapshot, WorkspaceWork } from "../contracts";
import { presentAssessmentWork } from "@/products/assessment";
import { listOfferingDefinitions } from "@/platform/offerings/definitions";
import { applicationSchema } from "@/products/applications/contracts";
import type { z } from "zod";

export const PREVIEW_SCENARIOS = ["free", "paid", "managed", "business", "agency", "enterprise", "empty", "read-only", "unavailable", "signed-out", "website-audit", "recovery"] as const;
export type PreviewScenario = typeof PREVIEW_SCENARIOS[number];
export function previewScenario(value: string | undefined): PreviewScenario {
  return PREVIEW_SCENARIOS.includes(value as PreviewScenario) ? value as PreviewScenario : "free";
}

const PERSONAL = "11111111-1111-4111-8111-111111111111";
const AGENCY = "22222222-2222-4222-8222-222222222222";
const CUSTOMER = "33333333-3333-4333-8333-333333333333";
const SECOND_CUSTOMER = "66666666-6666-4666-8666-666666666666";
const STAFF_REQUEST_APP = "88888888-8888-4888-8888-888888888888";
const PREVIEW_ACTOR = "local-preview";
type ApplicationPayload = z.infer<typeof applicationSchema>;
type PreviewApplication = ApplicationPayload & {
  candidate: NonNullable<ApplicationPayload["candidate"]>;
  release: ApplicationPayload["release"];
  releases: NonNullable<ApplicationPayload["releases"]>;
  designRevision: number;
  recordsRevision: number;
};

function staffRequestWork(): WorkspaceWork {
  return {
    id: STAFF_REQUEST_APP,
    workspaceId: CUSTOMER,
    title: "Staff requests",
    productId: "applications",
    resourceKind: "application",
    payload: null,
    input: { offering: "private_staff_requests" },
    createdAt: "2026-09-15T12:00:00.000Z",
  };
}

function initialStaffRequestApplication(): PreviewApplication {
  const spec = {
    title: "Staff requests",
    maintenanceOwner: PREVIEW_ACTOR,
    fields: [
      { id: "request", label: "What do you need?", type: "text" as const, required: true },
      { id: "urgent", label: "Urgent", type: "boolean" as const, required: false },
    ],
    components: [
      { kind: "form" as const, fields: ["request", "urgent"] },
      { kind: "list" as const, fields: ["request", "urgent"] },
      { kind: "detail" as const, fields: ["request", "urgent"] },
    ],
  };
  return applicationSchema.parse({
    version: 1 as const,
    revision: 1,
    title: spec.title,
    createdBy: PREVIEW_ACTOR,
    createdAt: "2026-09-15T12:00:00.000Z",
    history: [{ revision: 1, kind: "create", actorId: PREVIEW_ACTOR, at: "2026-09-15T12:00:00.000Z" }],
    spec,
    specVersion: 1,
    status: "draft" as const,
    versions: [{ version: 1, spec }],
    rehearsal: null,
    records: [] as Array<{ id: string; values: Record<string, string | number | boolean> }>,
    designRevision: 0,
    recordsRevision: 0,
    candidate: { designRevision: 0, specVersion: 1, spec, rehearsal: null },
    release: null,
    releases: [] as Array<{ version: number; spec: typeof spec; publishedAt: string; publishedBy: string; provenance: "published" }>,
  }) as PreviewApplication;
}

function sampleWork(workspaceId: string, title = "Harbor Dental", id = "44444444-4444-4444-8444-444444444444"): WorkspaceWork {
  const payload = {
    business: title, url: "https://harbordental.example", score: 74, grade: "B" as const,
    verdict: "The business identity is clear. Specific service evidence needs more detail.",
    signals: [
      { id: "identity", label: "Business identity", pass: true, detail: "Name, location, and contact information are stated clearly.", weight: 25 },
      { id: "services", label: "Service evidence", pass: false, detail: "Service pages lack specific treatment and practitioner details.", weight: 20 },
      { id: "structure", label: "Website structure", pass: true, detail: "Business facts have readable, stable pages.", weight: 15 },
    ],
    citation: { probed: false, mentioned: false, recommended: false, note: "Synthetic preview. No AI system or live website was queried." },
    topFix: "Explain each primary treatment on its own page, with location and practitioner details.",
    measurementStatus: "partial" as const, measurementNote: "Synthetic preview data. These scores are fictional and are not a measured business result.", readinessMeasured: true,
  };
  return {
    id, workspaceId, title, productId: "ai_visibility", resourceKind: "ai_visibility_assessment",
    input: { category: "Dentist", location: "Buffalo, NY" }, createdAt: "2026-09-07T12:00:00.000Z",
    payload,
    assessment: presentAssessmentWork({ id, workspaceId, title, productId: "ai_visibility", resourceKind: "ai_visibility_assessment", payload, createdAt: "2026-09-07T12:00:00.000Z" }) || undefined,
  };
}

export function createPreviewRequest(scenario: PreviewScenario, options: { installedStaffRequest?: boolean } = {}): typeof fetch {
  const workspaceId = scenario === "agency" ? AGENCY : scenario === "read-only" || scenario === "business" ? CUSTOMER : PERSONAL;
  const base: WorkspaceSnapshot = {
    actor: { email: "alex@example.com", localPreview: true },
    workspaceId,
    workspaces: [
      { id: PERSONAL, kind: "personal", name: "Alex’s work" },
      ...(scenario === "agency" || scenario === "read-only" || scenario === "business" ? [
        { id: AGENCY, kind: "agency" as const, name: "North Studio" },
        { id: CUSTOMER, kind: "customer" as const, name: "Harbor Dental", ...(scenario === "business" ? { role: "owner" as const } : { access: "delegated_read" as const }) },
        ...(scenario === "agency" ? [{ id: SECOND_CUSTOMER, kind: "customer" as const, name: "Lake Bakery", access: "delegated_read" as const }] : []),
      ] : []),
    ],
    work: [], handoffs: [], delegations: scenario === "agency" ? [{
      id: "55555555-5555-4555-8555-555555555555",
      workId: "44444444-4444-4444-8444-444444444444",
      customerWorkspaceId: CUSTOMER,
      agencyWorkspaceId: AGENCY,
      status: "active",
      canRevoke: false,
    }, {
      id: "77777777-7777-4777-8777-777777777777",
      workId: "88888888-8888-4888-8888-888888888888",
      customerWorkspaceId: SECOND_CUSTOMER,
      agencyWorkspaceId: AGENCY,
      status: "active",
      canRevoke: false,
    }] : [],
    products: [
      { id: "ai_visibility", name: "AI Visibility", description: "See what AI can understand about a business.", availability: "available" },
      { id: "managed_presence", name: "Managed Websites", description: "Your website and the work that keeps it useful.", availability: "managed" },
      { id: "inquiries", name: "Inquiry work", description: "Keep customer requests moving with a clear, inspectable thread.", availability: "available" },
      { id: "tracker", name: "Spreadsheet tracker", description: "Turn a CSV into working data with a saved history.", availability: "available" },
      { id: "documents", name: "Documents", description: "Write procedures, proposals, and notes with a saved history.", availability: "available" },
      { id: "homefinder", name: "Home Finder", description: "Home search for a brokerage’s own site.", availability: "not_enabled", previewHref: "http://127.0.0.1:3213/embed/agency-preview" },
    ],
    managedWork: scenario === "managed" || scenario === "enterprise" || scenario === "business" ? [{
      id: "preview-harbor", title: "Harbor Dental", href: "/preview/strelva/website",
      productId: "managed_presence", relationship: scenario === "enterprise" ? "enterprise" : "client",
    }] : [],
  };
  if (scenario === "recovery") base.pendingAssessments = [{ id: "88888888-8888-4888-8888-888888888888", status: "ready", createdAt: "2026-09-08T12:00:00Z" }];
  const saved = new Map(base.workspaces.map(workspace => [workspace.id, scenario === "empty" || scenario === "recovery" ? [] : scenario === "website-audit" ? (() => {
    const auditPayload = { url: "https://harbordental.example", scannedAt: "2026-09-08T12:00:00Z", overallScore: 74, grade: "B" as const, categories: [{ name: "SEO", slug: "seo", weight: 1, score: 74, checks: [{ name: "Service descriptions", status: "warn" as const, score: 74, message: "Fictional example: add specific treatment descriptions. No live site was queried." }] }] };
    const work = { ...sampleWork(workspace.id), productId: "website_audit", resourceKind: "website_audit_report", title: "https://harbordental.example", payload: null, auditPayload };
    return [{ ...work, assessment: presentAssessmentWork({ id: work.id, workspaceId: work.workspaceId, productId: work.productId, resourceKind: work.resourceKind, title: work.title, payload: auditPayload, createdAt: work.createdAt }) || undefined }];
  })() : [sampleWork(workspace.id)]]));
  if (scenario === "agency") {
    const shared = saved.get(CUSTOMER)?.[0];
    if (shared) saved.set(CUSTOMER, [{ ...shared, operation: { status: "proposed" } }]);
    saved.set(SECOND_CUSTOMER, [sampleWork(SECOND_CUSTOMER, "Lake Bakery", "88888888-8888-4888-8888-888888888888")]);
  }
  if (scenario === "business" && options.installedStaffRequest) {
    saved.set(CUSTOMER, [staffRequestWork(), ...(saved.get(CUSTOMER) || [])]);
  }
  let sequence = 0;
  let allowanceAccepted = false;
  let pendingOfferingInstall: string | null = null;
  let staffRequestApplication = initialStaffRequestApplication();
  let installedApplication = options.installedStaffRequest === true;
  const staffRequestInstallation = {
    id: "77777777-7777-4777-8777-777777777777", businessId: CUSTOMER, definitionId: "private_staff_requests", definitionVersion: "1.0.0",
    status: "draft", revision: 1, configuration: {}, nativeResources: [{ kind: "application", id: "88888888-8888-4888-8888-888888888888" }],
    responsibility: { kind: "provider_requested", providerKind: "strelva", providerName: "Strelva" }, acceptedScope: ["submit_requests", "review_requests"],
    surfaces: [{ id: "business_workspace", label: "Business workspace", description: "Manage the application.", href: `/preview/strelva/workspace?scenario=business&workspaceId=${CUSTOMER}&view=applications&work=88888888-8888-4888-8888-888888888888&previewSetup=staff-request` }],
    installedBy: "local-preview", installedAt: "2026-09-15T12:00:00.000Z", updatedBy: "local-preview", updatedAt: "2026-09-15T12:00:00.000Z",
  };
  const accessGrants: Array<{ id: string; recipientEmail: string; views: Array<"form" | "list" | "detail" | "document">; recordRead: "none" | "own" | "all"; recordSubmit: boolean; purpose: string; expiresAt: string; status: "active" | "revoked" }> = [];
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  // Deliberately has no fallback to fetch: no request can reach identity,
  // persistence, assessments, email, billing, or other live providers.
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://preview.invalid");
    if (url.origin !== "http://preview.invalid") return response({ error: "This request is outside the local interface preview." }, 403);
    if (scenario === "business" && url.pathname === "/api/offerings" && (init?.method || "GET") === "GET") return response({
      businessId: CUSTOMER,
      permissions: { canRead: true, canManage: true, role: "owner" },
      definitions: listOfferingDefinitions(),
      installations: installedApplication ? [staffRequestInstallation] : [],
      websiteBindings: [],
    });
    if (scenario === "business" && url.pathname === "/api/offerings" && init?.method === "POST" && typeof init.body === "string") {
      if (pendingOfferingInstall === null) {
        pendingOfferingInstall = init.body;
        return response({ error: { code: "source_unavailable", message: "The local fixture lost the first response after accepting the command." } }, 503);
      }
      if (pendingOfferingInstall !== init.body) return response({ error: { code: "installation_conflict", message: "The retry changed the accepted command." } }, 409);
      installedApplication = true;
      const current = saved.get(CUSTOMER) || [];
      if (!current.some((work) => work.id === STAFF_REQUEST_APP)) saved.set(CUSTOMER, [staffRequestWork(), ...current]);
      return response({ installation: staffRequestInstallation });
    }
    if (scenario === "business" && url.pathname === "/api/bounded-work" && url.searchParams.get("productId") === "applications" && (init?.method || "GET") === "GET") {
      if (!installedApplication || url.searchParams.get("workId") !== STAFF_REQUEST_APP) return response({ error: "This application is unavailable in the local preview." }, 404);
      return response({ id: STAFF_REQUEST_APP, payload: staffRequestApplication });
    }
    if (scenario === "business" && url.pathname === "/api/bounded-work" && init?.method === "POST" && typeof init.body === "string") {
      const body = JSON.parse(init.body) as { productId?: string; action?: string; workId?: string; command?: Record<string, unknown> };
      if (body.productId !== "applications" || body.action !== "command" || body.workId !== STAFF_REQUEST_APP || !body.command) return response({ error: "This application command is unavailable in the local preview." }, 422);
      const command = body.command;
      const now = "2026-09-15T12:05:00.000Z";
      const history = (kind: string) => [...staffRequestApplication.history, { revision: staffRequestApplication.revision + 1, kind, actorId: PREVIEW_ACTOR, at: now }];
      if (command.kind === "rehearse") {
        const rehearsal = { specVersion: staffRequestApplication.candidate.specVersion, checks: [{ name: "Definition is valid", passed: true }, { name: "Existing records remain compatible", passed: true }] };
        staffRequestApplication = { ...staffRequestApplication, revision: staffRequestApplication.revision + 1, history: history("rehearse_candidate"), rehearsal, candidate: { ...staffRequestApplication.candidate, rehearsal } };
      } else if (command.kind === "publish") {
        const release = { version: Math.max(0, ...staffRequestApplication.releases.map((item) => item.version)) + 1, spec: staffRequestApplication.candidate.spec, publishedAt: now, publishedBy: PREVIEW_ACTOR, provenance: "published" as const };
        staffRequestApplication = { ...staffRequestApplication, revision: staffRequestApplication.revision + 1, history: history("publish_candidate"), status: "installed", release, releases: [...staffRequestApplication.releases, release] };
      } else if (command.kind === "submit" && command.record && typeof command.record === "object") {
        const record = command.record as { id: string; values: Record<string, string | number | boolean> };
        if (!staffRequestApplication.records.some((item) => item.id === record.id)) {
          staffRequestApplication = { ...staffRequestApplication, revision: staffRequestApplication.revision + 1, recordsRevision: staffRequestApplication.recordsRevision + 1, history: history("submit_record"), records: [...staffRequestApplication.records, record] };
        }
      } else if (command.kind === "revise" && command.spec && typeof command.spec === "object") {
        const spec = command.spec as typeof staffRequestApplication.spec;
        const candidate = { designRevision: staffRequestApplication.candidate.designRevision + 1, specVersion: staffRequestApplication.candidate.specVersion + 1, spec, rehearsal: null };
        staffRequestApplication = { ...staffRequestApplication, revision: staffRequestApplication.revision + 1, title: spec.title, history: history("revise_candidate"), spec, specVersion: candidate.specVersion, status: "draft", rehearsal: null, candidate, versions: [...staffRequestApplication.versions, { version: candidate.specVersion, spec }] };
      } else if (command.kind === "rollback_release" && typeof command.version === "number") {
        const release = staffRequestApplication.releases.find((item) => item.version === command.version);
        if (!release) return response({ error: "That released application version is unavailable." }, 409);
        const candidate = { designRevision: staffRequestApplication.candidate.designRevision + 1, specVersion: staffRequestApplication.candidate.specVersion + 1, spec: release.spec, rehearsal: null };
        staffRequestApplication = { ...staffRequestApplication, revision: staffRequestApplication.revision + 1, title: release.spec.title, history: history("rollback_release"), status: "installed", release, candidate, spec: release.spec, specVersion: candidate.specVersion, rehearsal: null, versions: [...staffRequestApplication.versions, { version: candidate.specVersion, spec: release.spec }] };
      } else return response({ error: "This application command is unavailable in the local preview." }, 422);
      return response({ id: STAFF_REQUEST_APP, payload: staffRequestApplication });
    }
    if (scenario === "business" && url.pathname === `/api/apps/${STAFF_REQUEST_APP}/access`) {
      if ((init?.method || "GET") === "GET") return response({ grants: accessGrants });
      if (init?.method === "POST" && typeof init.body === "string") {
        if (!staffRequestApplication.release) return response({ error: "Publish the application before issuing access." }, 409);
        const input = JSON.parse(init.body) as Omit<(typeof accessGrants)[number], "id" | "status">;
        const existing = accessGrants.find((grant) => grant.recipientEmail === input.recipientEmail && grant.status === "active");
        const grant = existing || { ...input, id: `preview-grant-${accessGrants.length + 1}`, status: "active" as const };
        if (!existing) accessGrants.unshift(grant);
        return response({ grant, href: `/apps/${STAFF_REQUEST_APP}` });
      }
      if (init?.method === "DELETE") {
        const grant = accessGrants.find((item) => item.id === url.searchParams.get("grantId"));
        if (!grant) return response({ error: "That access link is unavailable." }, 404);
        grant.status = "revoked";
        return response({ ok: true });
      }
    }
    if (scenario === "business" && url.pathname === "/api/offerings/websites" && init?.method === "POST" && typeof init.body === "string") {
      const command = JSON.parse(init.body) as { action?: string; tenantId?: string };
      if (command.action !== "bind_managed_website" || command.tenantId !== "preview-harbor") return response({ error: { code: "invalid_request", message: "The local fixture only binds its authorized example site." } }, 400);
      return response({ websiteBinding: {
        id: "99999999-9999-4999-8999-999999999999", businessId: CUSTOMER, status: "active", revision: 1, tenantId: "preview-harbor", siteName: "Harbor Dental",
        tenantActive: true, canOpen: true, surface: { id: "managed_website", label: "Harbor Dental", description: "The website management surface.", href: "/preview/strelva/website" },
        createdBy: "local-preview", createdAt: "2026-09-15T12:00:00.000Z", updatedBy: "local-preview", updatedAt: "2026-09-15T12:00:00.000Z",
      } });
    }
    if (scenario === "business" && url.pathname === "/api/work-allowances" && (init?.method || "GET") === "GET") return response({
      allowances: [{
        id: "55555555-5555-4555-8555-555555555555", workspaceId: CUSTOMER, businessName: "Harbor Dental", payerId: "66666666-6666-4666-8666-666666666666",
        periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-09-30T23:59:59.000Z", spendingCapCents: 25000, reservedCapCents: 3000,
        consumedCapCents: 5000, actualCostCents: 4200, source: "local_configured", status: allowanceAccepted ? "active" : "pending_cap_acceptance",
        capAcceptedBy: allowanceAccepted ? "66666666-6666-4666-8666-666666666666" : null, capAcceptedAt: allowanceAccepted ? "2026-09-15T12:00:00.000Z" : null,
        createdBy: "local-preview", createdAt: "2026-09-01T00:00:00.000Z",
        buckets: [{ unitKind: "completed_application_change", grantedUnits: 20, creditedUnits: 0, reservedUnits: 2, consumedUnits: 4, availableUnits: 14 }],
      }],
      policy: { stripeSynchronized: false, pricesDefined: false, customerUsageSource: "trusted_execution_receipts", retriesConsumeCustomerAllowance: false, spendingCapMeaning: "operational_cost_limit_not_invoice_price", contributionPayouts: false },
      currentActorId: "66666666-6666-4666-8666-666666666666",
    });
    if (scenario === "business" && url.pathname === "/api/work-allowances/accept" && init?.method === "POST") {
      allowanceAccepted = true;
      return response({
        allowances: [],
        policy: { stripeSynchronized: false, pricesDefined: false, customerUsageSource: "trusted_execution_receipts", retriesConsumeCustomerAllowance: false, spendingCapMeaning: "operational_cost_limit_not_invoice_price", contributionPayouts: false },
        currentActorId: "66666666-6666-4666-8666-666666666666",
      });
    }
    if (url.pathname !== "/api/workspace") return response({ error: "This request is outside the local interface preview." }, 403);
    if (scenario === "signed-out") return response({ error: "Sign in with a confirmed email to open your work." }, 401);
    if (scenario === "unavailable") return response({ error: "Saved work is unavailable right now. Nothing has been confirmed. Please try again." }, 503);
    if ((init?.method || "GET") === "GET") {
      const current = url.searchParams.get("workspaceId") || workspaceId;
      if (!base.workspaces.some(workspace => workspace.id === current)) return response({ error: "This workspace is not part of the local preview." }, 403);
      if (scenario === "agency" && current === SECOND_CUSTOMER) return response({ error: "This fictional client is unavailable for partial-load testing." }, 503);
      return response({ ...base, workspaceId: current, work: saved.get(current) || [] });
    }
    if (init?.method !== "POST" || typeof init.body !== "string") return response({ error: "Unsupported local preview request." }, 400);
    let action: WorkspaceAction;
    try { action = JSON.parse(init.body) as WorkspaceAction; }
    catch { return response({ error: "Invalid local preview request." }, 400); }
    if (action.action === "recover_assessment" && scenario === "recovery") {
      const work = sampleWork(workspaceId);
      saved.set(workspaceId, [work]);
      base.pendingAssessments = [];
      return response({ work });
    }
    if (action.action === "assess") {
      const workspace = base.workspaces.find(item => item.id === action.workspaceId);
      if (!workspace || workspace.access === "delegated_read") return response({ error: "This workspace is read-only." }, 403);
      const work = sampleWork(action.workspaceId, action.business, `preview-work-${++sequence}`);
      saved.set(action.workspaceId, [work, ...(saved.get(action.workspaceId) || [])]);
      return response({ work }, 201);
    }
    if (action.action === "create_agency") {
      if (!base.workspaces.some(workspace => workspace.id === AGENCY)) base.workspaces.push({ id: AGENCY, kind: "agency", name: action.name });
      saved.set(AGENCY, saved.get(AGENCY) || []);
      return response({ workspaceId: AGENCY }, 201);
    }
    return response({ error: "This action is not performed in the local preview. No invitation, email, or account change has been created." }, 409);
  };
}

import type { WorkspaceAction, WorkspaceSnapshot, WorkspaceWork } from "../contracts";

export const PREVIEW_SCENARIOS = ["free", "paid", "managed", "agency", "enterprise", "empty", "read-only", "unavailable", "signed-out", "website-audit", "recovery"] as const;
export type PreviewScenario = typeof PREVIEW_SCENARIOS[number];
export function previewScenario(value: string | undefined): PreviewScenario {
  return PREVIEW_SCENARIOS.includes(value as PreviewScenario) ? value as PreviewScenario : "free";
}

const PERSONAL = "11111111-1111-4111-8111-111111111111";
const AGENCY = "22222222-2222-4222-8222-222222222222";
const CUSTOMER = "33333333-3333-4333-8333-333333333333";

function sampleWork(workspaceId: string, title = "Harbor Dental", id = "44444444-4444-4444-8444-444444444444"): WorkspaceWork {
  return {
    id, workspaceId, title, productId: "ai_visibility", resourceKind: "ai_visibility_assessment",
    input: { category: "Dentist", location: "Buffalo, NY" }, createdAt: "2026-09-07T12:00:00.000Z",
    payload: {
      business: title, url: "https://harbordental.example", score: 74, grade: "B",
      verdict: "The business identity is clear. Specific service evidence needs more detail.",
      signals: [
        { id: "identity", label: "Business identity", pass: true, detail: "Name, location, and contact information are stated clearly.", weight: 25 },
        { id: "services", label: "Service evidence", pass: false, detail: "Service pages lack specific treatment and practitioner details.", weight: 20 },
        { id: "structure", label: "Website structure", pass: true, detail: "Business facts have readable, stable pages.", weight: 15 },
      ],
      citation: { probed: false, mentioned: false, recommended: false, note: "Synthetic preview. No AI system or live website was queried." },
      topFix: "Explain each primary treatment on its own page, with location and practitioner details.",
      measurementStatus: "partial", measurementNote: "Synthetic preview data. These scores are fictional and are not a measured business result.", readinessMeasured: true,
    },
  };
}

export function createPreviewRequest(scenario: PreviewScenario): typeof fetch {
  const workspaceId = scenario === "agency" ? AGENCY : scenario === "read-only" ? CUSTOMER : PERSONAL;
  const base: WorkspaceSnapshot = {
    actor: { email: "alex@example.com", localPreview: true },
    workspaceId,
    workspaces: [
      { id: PERSONAL, kind: "personal", name: "Alex’s work" },
      ...(scenario === "agency" || scenario === "read-only" ? [
        { id: AGENCY, kind: "agency" as const, name: "North Studio" },
        { id: CUSTOMER, kind: "customer" as const, name: "Harbor Dental", access: "delegated_read" as const },
      ] : []),
    ],
    work: [], handoffs: [], delegations: [],
    products: [
      { id: "ai_visibility", name: "AI Visibility", description: "See what AI can understand about a business.", availability: "available" },
      { id: "managed_presence", name: "Managed Websites", description: "Your website and the work that keeps it useful.", availability: "managed" },
      { id: "homefinder", name: "Home Finder", description: "Home search for a brokerage’s own site.", availability: "not_enabled" },
    ],
    managedWork: scenario === "managed" || scenario === "enterprise" ? [{
      id: "preview-harbor", title: "Harbor Dental", href: "/preview/strelva/website",
      productId: "managed_presence", relationship: scenario === "enterprise" ? "enterprise" : "client",
    }] : [],
  };
  if (scenario === "recovery") base.pendingAssessments = [{ id: "88888888-8888-4888-8888-888888888888", status: "ready", createdAt: "2026-09-08T12:00:00Z" }];
  const saved = new Map(base.workspaces.map(workspace => [workspace.id, scenario === "empty" || scenario === "recovery" ? [] : scenario === "website-audit" ? [{ ...sampleWork(workspace.id), productId: "website_audit", resourceKind: "website_audit_report", title: "https://harbordental.example", payload: null, auditPayload: { url: "https://harbordental.example", scannedAt: "2026-09-08T12:00:00Z", overallScore: 74, grade: "B" as const, categories: [{ name: "SEO", slug: "seo", weight: 1, score: 74, checks: [{ name: "Service descriptions", status: "warn" as const, score: 74, message: "Fictional example: add specific treatment descriptions. No live site was queried." }] }] } }] : [sampleWork(workspace.id)]]));
  let sequence = 0;
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  // Deliberately has no fallback to fetch: no request can reach identity,
  // persistence, assessments, email, billing, or other live providers.
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://preview.invalid");
    if (url.pathname !== "/api/workspace" || url.origin !== "http://preview.invalid") return response({ error: "This request is outside the local interface preview." }, 403);
    if (scenario === "signed-out") return response({ error: "Sign in with a confirmed email to open your work." }, 401);
    if (scenario === "unavailable") return response({ error: "Saved work is unavailable right now. Nothing has been confirmed. Please try again." }, 503);
    if ((init?.method || "GET") === "GET") {
      const current = url.searchParams.get("workspaceId") || workspaceId;
      if (!base.workspaces.some(workspace => workspace.id === current)) return response({ error: "This workspace is not part of the local preview." }, 403);
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

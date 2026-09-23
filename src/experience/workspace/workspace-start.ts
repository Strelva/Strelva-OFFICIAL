import type { WorkspaceProduct } from "./contracts";

export type WorkspaceStartRoute = "assessment" | "tracker" | "inquiries" | "website" | "websites" | "document" | "onboarding" | "applications" | "scheduling" | "investigations" | "operations" | "help";
export type WorkspaceStartOutcome = "Answer" | "Change" | "Capability" | "Responsibility";
export type WorkspaceStartPlanKind = "empty" | "supported" | "help";
export type WorkspaceStartPlanStatus = "ready" | "blocked" | "help";

export interface WorkspaceStartBusiness {
  id: string;
  title: string;
}

export interface WorkspaceStartSite {
  id: string;
  title: string;
  href?: string;
}

export interface WorkspaceStartWebsiteHandoff {
  site: WorkspaceStartSite & { href: string };
  request: string;
}

export interface WorkspaceStartTemplate {
  id: string;
  label: string;
  description?: string;
}

export interface WorkspaceStartContext {
  /** A delegated workspace may inspect shared work but cannot create new work. */
  readOnly?: boolean;
  products?: readonly { id: string; availability: WorkspaceProduct["availability"]; name?: string }[];
  inquiryBusinesses?: readonly WorkspaceStartBusiness[];
  managedSites?: readonly WorkspaceStartSite[];
  trackerTemplates?: readonly WorkspaceStartTemplate[];
  /** Discovery can be partially unavailable even when saved work is readable. */
  managedWorkUnavailable?: boolean;
  /** Layout supplies the callbacks that are actually mounted in this route. */
  native?: Partial<Record<WorkspaceStartRoute, boolean>>;
}

export interface WorkspaceStartPart {
  id: string;
  label: string;
  detail: string;
  outcome: WorkspaceStartOutcome;
  /** Optional lines can be removed before a supported flow starts. */
  optional?: boolean;
  editable?: boolean;
}

export interface WorkspaceStartPlan {
  kind: WorkspaceStartPlanKind;
  status: WorkspaceStartPlanStatus;
  request: string;
  /** The discovery context used to shape this proposal. */
  context?: WorkspaceStartContext;
  route?: WorkspaceStartRoute;
  productId?: string;
  outcome?: WorkspaceStartOutcome;
  title: string;
  summary: string;
  parts: readonly WorkspaceStartPart[];
  reason?: string;
  helpRequest?: string;
  /** A provider request opens review, never a self-service generator or delivery promise. */
  deliveryMode?: "service";
  /** Native routes found in the request, in the order they were mentioned. */
  matchedRoutes?: readonly Exclude<WorkspaceStartRoute, "help">[];
  needsSelection?: "business" | "site";
  suggestedTemplateId?: string;
  /** The next user-visible action this proposal can honestly take. */
  nextAction: string;
  /** All lines are included until the person removes an optional line. */
  selectedPartIds: readonly string[];
  canContinue: boolean;
}

export interface WorkspaceStartContinuation {
  request: string;
  route: WorkspaceStartRoute;
  /** Keep the supplied discovery context available to the mounted native flow. */
  context?: WorkspaceStartContext;
  productId?: string;
  includedPartIds: readonly string[];
  businessId?: string;
  siteId?: string;
  trackerTemplateId?: string;
}

export interface WorkspaceStartInput {
  request: string;
  context?: WorkspaceStartContext;
}

export function workspaceStartContinueLabel(plan: WorkspaceStartPlan): string {
  if (plan.route === "inquiries") return plan.needsSelection === "business" ? "Choose a business" : "Open inquiry work";
  if (plan.route === "tracker") return "Open your tracker";
  if (plan.route === "website") return plan.needsSelection === "site" ? "Choose a website" : "Open your website";
  if (plan.route === "websites") return "Create your website";
  if (plan.route === "document") return "Open your document";
  if (plan.route === "onboarding") return "Organize onboarding";
  if (plan.route === "applications") return "Prepare application";
  if (plan.route === "scheduling") return "Open scheduling";
  if (plan.route === "investigations") return "Open ongoing checks";
  if (plan.route === "operations") return "Open ongoing work";
  return "Continue to business assessment";
}

const PRODUCT_FOR_ROUTE: Record<Exclude<WorkspaceStartRoute, "help">, string> = {
  assessment: "ai_visibility",
  tracker: "tracker",
  inquiries: "inquiries",
  website: "managed_presence",
  websites: "websites",
  document: "documents",
  onboarding: "onboarding",
  applications: "applications", scheduling: "scheduling", investigations: "investigations", operations: "operations",
};

const AVAILABLE_PRODUCT_ROUTES: ReadonlySet<WorkspaceStartRoute> = new Set(["assessment", "tracker", "inquiries", "websites", "document", "onboarding", "applications", "scheduling", "investigations", "operations"]);

const ROUTE_COPY: Record<Exclude<WorkspaceStartRoute, "help">, { title: string; summary: string; outcome: WorkspaceStartOutcome; nextAction: string }> = {
  onboarding: { title: "Onboarding requirements", summary: "Keep requirements, private documents and their review status together.", outcome: "Capability", nextAction: "Open onboarding, define the requirements, and review supplied documents before accepting them." },
  websites: { title: "Your website", summary: "Turn your business description into a saved website draft that you can preview and change.", outcome: "Capability", nextAction: "Create a draft, review it, then choose when to prepare it for launch." },
  applications: { title: "A private working application", summary: "Create a form and working list from approved parts, then test it before accepting records.", outcome: "Capability", nextAction: "Prepare a plan before creating the application." },
  scheduling: { title: "A working schedule", summary: "Reserve permitted time and prevent overlapping reservations in this workspace.", outcome: "Capability", nextAction: "Open scheduling and review the permitted times before reserving one." },
  investigations: { title: "An ongoing check", summary: "Compare two saved sources, keep the evidence, and check again when due.", outcome: "Responsibility", nextAction: "Open ongoing checks and choose the two saved sources to compare." },
  operations: { title: "Delegated work", summary: "Review a bounded change, then let Strelva carry its progress and evidence forward.", outcome: "Responsibility", nextAction: "Open ongoing work and review the responsibility before it starts." },
  assessment: {
    title: "A business assessment",
    summary: "This looks like a read-only business assessment that you can save and return to.",
    outcome: "Answer",
    nextAction: "Start the assessment and review its evidence before saving it.",
  },
  tracker: {
    title: "A working tracker",
    summary: "This looks like a CSV-to-tracker setup with the field mapping visible before anything is saved.",
    outcome: "Capability",
    nextAction: "Open the tracker flow and review the field mapping before saving it.",
  },
  inquiries: {
    title: "An inquiry workflow",
    summary: "This looks like a customer request flow for one selected business, with its shape shown before work begins.",
    outcome: "Capability",
    nextAction: "Choose the business, then review the inquiry flow before it receives requests.",
  },
  website: {
    title: "A website change",
    summary: "This looks like work on one connected website, with a reviewable change and receipt in the website flow.",
    outcome: "Change",
    nextAction: "Choose the website, then review the proposed change before anything is sent.",
  },
  document: {
    title: "A private document",
    summary: "This looks like a private document for a procedure, proposal, or working note, with its history kept alongside the text.",
    outcome: "Capability",
    nextAction: "Open the document draft and review it before saving it to this workspace.",
  },
};

interface Signal {
  route: Exclude<WorkspaceStartRoute, "help">;
  pattern: RegExp;
  weight: number;
}

const SIGNALS: readonly Signal[] = [
  { route: "onboarding", pattern: /\b(?:organize|collect|manage|review|track|set up|create)\b[\s\S]{0,80}\bonboarding\b|\bonboarding\s+(?:requirements|checklist|case|documents)\b/i, weight: 7 },
  { route: "websites", pattern: /\b(?:build|create|make|generate|design|start|launch)\b[\s\S]{0,80}\b(?:website|web site|landing page)\b|\bnew website\b/i, weight: 7 },
  { route: "applications", pattern: /\b(?:build|create|make|set up|design)\b[\s\S]{0,80}\b(?:app|application|portal)s?\b|\b(?:staff|employee|internal|team)\b[\s-]*(?:request|intake)s?[\s-]*(?:app|application|portal|form)s?\b/i, weight: 5 },
  { route: "scheduling", pattern: /\b(?:schedule|scheduling|calendar|availability|appointment)s?\b|reserve (?:a |the )?time|\b(?:book|reserve)\b[\s\S]{0,60}\b(?:appointment|slot|time)\b|time[- ]off|(?:vacation|leave) request/i, weight: 5 },
  { route: "investigations", pattern: /\b(?:compare|reconcile|cross[- ]?check|find differences)\b|\b(?:watch|monitor)\b[\s\S]{0,80}\b(?:change|difference|update)s?\b|\bcheck\b[\s\S]{0,80}\b(?:match|agree|disagree|same|different)\b|\b(?:two|both)\s+(?:source|record|spreadsheet|sheet)s?\b/i, weight: 5 },
  { route: "operations", pattern: /\bdelegate(?:d)?\b|delegated work|approved work|run these steps|repeatable responsibility|ongoing responsibility|\b(?:have|let)\b[\s\S]{0,60}\b(?:handle|carry out|take care of)\b/i, weight: 5 },
  { route: "document", pattern: /document|procedure|proposal|working note|meeting notes?|brief|memo|draft/i, weight: 4 },
  { route: "inquiries", pattern: /inquir(?:y|ies|e)|customer request|contact form|quote request|booking request|follow[ -]?up|lead(?:s)?|reply/i, weight: 3 },
  { route: "tracker", pattern: /\bcsv\b|spreadsheet|excel|\brows?\b|\bcolumns?\b|\btracker\b|import|\btable\b|\bdata\b|\bkeep track(?: of)?\b|\btrack(?:ing)?\b/i, weight: 3 },
  { route: "assessment", pattern: /ai visibility|visibility|discoverab|assessment|what .* understand|find .* business|search result|mention(?:ed)?/i, weight: 3 },
  { route: "website", pattern: /website|web site|homepage|landing page|\bsite\b|\bseo\b|accessib|page speed|web content|domain/i, weight: 3 },
];

const ROUTE_ORDER = ["onboarding", "websites", "applications", "scheduling", "investigations", "operations", "document", "inquiries", "tracker", "assessment", "website"] as const;

function normalizeRequest(value: string): string {
  // Preserve the person's wording, punctuation and line breaks for the native
  // or model-backed flow. Matching operates on whitespace-insensitive regexes.
  return value.trim();
}

function classify(request: string): Exclude<WorkspaceStartRoute, "help"> | null {
  const scores = new Map<Exclude<WorkspaceStartRoute, "help">, number>();
  for (const signal of SIGNALS) {
    if (signal.pattern.test(request)) scores.set(signal.route, (scores.get(signal.route) || 0) + signal.weight);
  }
  let best: Exclude<WorkspaceStartRoute, "help"> | null = null;
  let score = 0;
  for (const route of ROUTE_ORDER) {
    const next = scores.get(route) || 0;
    if (next > score) {
      best = route;
      score = next;
    }
  }
  return best;
}

/**
 * Find separate outcomes without treating every overlapping keyword as a
 * second intent. For example, "schedule follow-ups for inquiries" contains
 * both scheduling and inquiry words but is one scheduling request; an
 * explicit "and then" separates two outcomes that a native flow cannot hold.
 */
function matchedRoutes(request: string): Exclude<WorkspaceStartRoute, "help">[] {
  const clauses = request
    .split(/\s+(?:and then|and|then|also|plus|as well as|while)\s+|[,;]+/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const found: Exclude<WorkspaceStartRoute, "help">[] = [];
  for (const clause of clauses) {
    const route = classify(clause);
    if (route && !found.includes(route)) found.push(route);
  }
  return found;
}

function productFor(context: WorkspaceStartContext, route: Exclude<WorkspaceStartRoute, "help">) {
  return context.products?.find((product) => product.id === PRODUCT_FOR_ROUTE[route]);
}

function supportedFlowMounted(context: WorkspaceStartContext, route: WorkspaceStartRoute): boolean {
  return context.native?.[route] !== false;
}

function hasAvailableProduct(context: WorkspaceStartContext, route: Exclude<WorkspaceStartRoute, "help">): boolean {
  const product = productFor(context, route);
  if (!product) return false;
  if (AVAILABLE_PRODUCT_ROUTES.has(route)) return product.availability === "available";
  return product.availability === "managed";
}

function partsFor(route: Exclude<WorkspaceStartRoute, "help">, request: string): WorkspaceStartPart[] {
  if (["websites", "onboarding", "applications", "scheduling", "investigations", "operations"].includes(route)) return [{ id: "scope", label: ROUTE_COPY[route].title, detail: ROUTE_COPY[route].summary, outcome: ROUTE_COPY[route].outcome }, { id: "control", label: "Your workspace and permissions", detail: "Keep the result private. Review changes and preserve their evidence.", outcome: "Responsibility" }];
  if (route === "assessment") {
    return [
      { id: "business-scope", label: "business in scope", detail: "Use the business details you provide for this assessment.", outcome: "Answer" },
      { id: "visibility-signals", label: "AI visibility signals", detail: "Inspect what the assessment can support about how this business is understood.", outcome: "Answer" },
      { id: "saved-assessment", label: "Saved assessment", detail: "Keep the result as private work so you can return to its evidence.", outcome: "Answer" },
    ];
  }

  if (route === "tracker") {
    return [
      { id: "source-file", label: "Source CSV", detail: "Keep the original file and row references available during import.", outcome: "Capability" },
      { id: "field-mapping", label: "Proposed field mapping", detail: "Review names, types, duplicate headers, and import warnings before saving.", outcome: "Capability" },
      { id: "saved-tracker", label: "Saved tracker", detail: "Create a filterable tracker with its import history in this workspace.", outcome: "Capability" },
    ];
  }

  if (route === "inquiries") {
    const mentionsFollowUp = /follow[ -]?up|remind|reply|respond|escalat/i.test(request);
    return [
      { id: "request-form", label: "Request form", detail: "Start from the selected business and its existing inquiry entry point.", outcome: "Capability" },
      { id: "inquiry-record", label: "Inquiry record", detail: "Keep each incoming customer request in a durable, inspectable record.", outcome: "Capability" },
      { id: "routing-rule", label: "Routing rule", detail: "Show who receives the request and what evidence is recorded.", outcome: "Responsibility" },
      { id: "follow-up-rule", label: mentionsFollowUp ? "Follow-up rule" : "Follow-up if unanswered", detail: "Keep a follow-up condition visible before any message or reminder is authorized.", outcome: "Responsibility" },
    ];
  }

  if (route === "document") {
    return [
      { id: "document-purpose", label: "Document purpose", detail: "Start from the result you described and keep the first draft private.", outcome: "Capability" },
      { id: "document-history", label: "Change history", detail: "Keep each saved revision inspectable so the latest edit can be reviewed or undone.", outcome: "Responsibility" },
      { id: "document-review", label: "Review before saving", detail: "Review the title and text before the document is saved to this workspace.", outcome: "Responsibility" },
    ];
  }

  return [
    { id: "website-scope", label: "Website in scope", detail: "Open one connected website explicitly selected from your account.", outcome: "Change" },
    { id: "proposed-change", label: "Proposed change", detail: "Describe the requested page or content change in the website flow.", outcome: "Change" },
    { id: "change-receipt", label: "Review and receipt", detail: "Inspect the consequence before any live website action is authorized.", outcome: "Change" },
  ];
}

function suggestedTrackerTemplate(request: string, templates: readonly WorkspaceStartTemplate[] | undefined): string | undefined {
  if (!templates?.length) return undefined;
  const normalized = request.toLowerCase();
  const term = /\btask|todo|to-do\b/.test(normalized)
    ? "task"
    : /\bproject|roadmap|milestone\b/.test(normalized)
      ? "project"
      : /\binventory|stock|sku|products?\b/.test(normalized)
        ? "inventory"
        : undefined;
  if (!term) return undefined;
  return templates.find((template) => `${template.id} ${template.label}`.toLowerCase().includes(term))?.id;
}

function emptyPlan(): WorkspaceStartPlan {
  return {
    kind: "empty",
    status: "help",
    request: "",
    context: undefined,
    title: "Start with the result you want.",
    summary: "Describe an assessment, tracker, inquiry workflow, website delivery, document, onboarding requirements, application, schedule, ongoing check, or delegated work.",
    parts: [],
    matchedRoutes: [],
    selectedPartIds: [],
    nextAction: "Describe the result you want.",
    canContinue: false,
  };
}

function helpPlan(request: string, context: WorkspaceStartContext, routes: readonly Exclude<WorkspaceStartRoute, "help">[] = []): WorkspaceStartPlan {
  const reason = context.readOnly ? "This workspace is read-only. Switch to a workspace you own before preparing a plan." : undefined;
  const multiOutcome = routes.length > 1;
  return {
    kind: "help",
    status: reason ? "blocked" : "help",
    route: "help",
    request,
    context,
    title: multiOutcome ? "A plan that keeps the whole request" : "Let’s narrow that down together.",
    summary: multiOutcome
      ? "We’ll prepare one plan for the full request. You can review it before work starts."
      : "This request does not match a workspace flow yet. You can send it to Strelva with its context so the team can explain the next step.",
    parts: [],
    ...(reason ? { reason } : {}),
    helpRequest: request,
    matchedRoutes: [...routes],
    selectedPartIds: [],
    nextAction: multiOutcome ? "Review a plan for these outcomes." : "Ask Strelva to help narrow this request down.",
    canContinue: !reason,
  };
}

function requestsWebsiteService(request: string): boolean {
  if (!/\b(?:website|web site|landing page)\b/i.test(request)) return false;
  // Negated or explicitly self-service requests stay on the existing planning path.
  if (/\b(?:do not|don['’]t|not|never)\b[^.!?;\n]{0,60}\b(?:strelva|agency|24[- ]hour|24 hours?)\b|\b(?:myself|ourselves|self[- ]service)\b/i.test(request)) return false;
  if (/\bstrelva\b[^.!?;\n]{0,40}\b(?:do not|don['’]t|not|never|cannot|can['’]t)\b[^.!?;\n]{0,30}\b(?:build|create|make|design|deliver)\b/i.test(request)) return false;
  const providerFirst = /\bstrelva[\s,]*(?:(?:can|could|would|will)\s+(?:you\s+)?)?(?:please\s+)?(?:build|create|make|design|deliver)\b/i.test(request);
  return providerFirst || /\b(?:have|hire|ask|pay|get|want|need|like)\b[^.!?;\n]{0,40}\bstrelva\b[^.!?;\n]{0,40}\b(?:build|create|make|design|deliver)\b|\b(?:agency[- ]built|done[- ]for[- ](?:me|us|you)|24[- ]hour|24 hours?)\b/i.test(request);
}

function websiteServicePlan(request: string, context: WorkspaceStartContext): WorkspaceStartPlan {
  const plan = helpPlan(request, context);
  const reason = plan.reason || (context.native?.help === false
    ? "Service requests are unavailable in this workspace. Nothing has been submitted."
    : undefined);
  return {
    ...plan,
    deliveryMode: "service",
    title: "Have Strelva build your website",
    summary: "Keep your brief together for a website delivery request. You do not need to build the website yourself.",
    nextAction: "Review the request with Strelva. Scope, price and the delivery deadline require separate acceptance.",
    status: reason ? "blocked" : "help",
    reason,
    canContinue: !reason,
  };
}

function blockedReason(context: WorkspaceStartContext, route: Exclude<WorkspaceStartRoute, "help">): string | undefined {
  if (context.readOnly) return "This workspace is read-only. Switch to a workspace you own before starting new work.";
  if (!supportedFlowMounted(context, route)) return "This flow is not available in the current workspace. Nothing has been started.";
  if (!hasAvailableProduct(context, route)) {
    if (route === "website") return "Website work is available here only for a connected managed website.";
    return `This ${ROUTE_COPY[route].title.toLowerCase()} is not available in this workspace yet.`;
  }
  if (route === "inquiries" && !context.inquiryBusinesses?.length) return "No business scope is available for inquiry work in this workspace.";
  if (route === "website" && context.managedWorkUnavailable) return "Website access is temporarily unavailable. Nothing has been opened or changed.";
  if (route === "website" && !context.managedSites?.length) return "No connected managed website is available in this workspace.";
  return undefined;
}

export function planWorkspaceStart(requestOrInput: string | WorkspaceStartInput, suppliedContext: WorkspaceStartContext = {}): WorkspaceStartPlan {
  const request = normalizeRequest(typeof requestOrInput === "string" ? requestOrInput : requestOrInput.request);
  const context = typeof requestOrInput === "string" ? suppliedContext : requestOrInput.context || suppliedContext;
  if (!request) return emptyPlan();
  if (requestsWebsiteService(request)) return websiteServicePlan(request, context);

  const routes = matchedRoutes(request);
  if (routes.length > 1) return helpPlan(request, context, routes);
  const route = routes[0] || classify(request);
  if (!route) return helpPlan(request, context);

  const copy = ROUTE_COPY[route];
  const parts = partsFor(route, request);
  const reason = blockedReason(context, route);
  const needsSelection = route === "inquiries" && (context.inquiryBusinesses?.length || 0) > 1
    ? "business"
    : route === "website" && (context.managedSites?.length || 0) > 1
      ? "site"
      : undefined;
  const selectedPartIds = parts.map((part) => part.id);
  const canContinue = !reason && !needsSelection;
  const suggestedTemplateId = route === "tracker" ? suggestedTrackerTemplate(request, context.trackerTemplates) : undefined;

  return {
    kind: "supported",
    status: reason ? "blocked" : "ready",
    request,
    context,
    route,
    productId: PRODUCT_FOR_ROUTE[route],
    outcome: route === "inquiries" && /follow[ -]?up|remind|reply|respond|ongoing|every/i.test(request) ? "Responsibility" : copy.outcome,
    title: copy.title,
    summary: copy.summary,
    parts,
    reason,
    helpRequest: reason ? request : undefined,
    matchedRoutes: [route],
    needsSelection,
    suggestedTemplateId,
    nextAction: needsSelection === "business"
      ? "Choose the business, then review the inquiry flow before it receives requests."
      : needsSelection === "site"
        ? "Choose the website, then review the proposed change before anything is sent."
        : copy.nextAction,
    selectedPartIds,
    canContinue,
  };
}

export function createWorkspaceStartContinuation(
  plan: WorkspaceStartPlan,
  includedPartIds: readonly string[] = plan.selectedPartIds,
  selections: Pick<WorkspaceStartContinuation, "businessId" | "siteId" | "trackerTemplateId"> = {},
  currentContext: WorkspaceStartContext = plan.context || {},
): WorkspaceStartContinuation | null {
  if (plan.kind !== "supported" || plan.status !== "ready" || !plan.route || plan.route === "help" || (!plan.canContinue && !plan.needsSelection)) return null;
  // Discovery is a UI constraint, not authorization. Native services must still
  // recheck the actor, business and resource before every read or mutation.
  if (blockedReason(currentContext, plan.route)) return null;
  if (plan.productId !== PRODUCT_FOR_ROUTE[plan.route]) return null;
  if (selections.businessId && plan.route !== "inquiries") return null;
  if (selections.siteId && plan.route !== "website") return null;
  if (selections.trackerTemplateId && plan.route !== "tracker") return null;
  const businessId = selections.businessId || (plan.route === "inquiries" && currentContext.inquiryBusinesses?.length === 1 ? currentContext.inquiryBusinesses[0]!.id : undefined);
  const siteId = selections.siteId || (plan.route === "website" && currentContext.managedSites?.length === 1 ? currentContext.managedSites[0]!.id : undefined);
  if (plan.route === "inquiries" && (!businessId || !currentContext.inquiryBusinesses?.some((item) => item.id === businessId))) return null;
  if (plan.route === "website" && (!siteId || !currentContext.managedSites?.some((item) => item.id === siteId))) return null;
  if (selections.trackerTemplateId && !currentContext.trackerTemplates?.some((item) => item.id === selections.trackerTemplateId)) return null;
  const allowed = new Set(plan.parts.map((part) => part.id));
  const required = new Set(plan.parts.filter((part) => !part.optional).map((part) => part.id));
  const included = [...new Set(includedPartIds)].filter((id) => allowed.has(id));
  if ([...required].some((id) => !included.includes(id))) return null;
  return {
    request: plan.request,
    route: plan.route,
    productId: plan.productId,
    includedPartIds: included,
    context: currentContext,
    ...(businessId ? { businessId } : {}),
    ...(siteId ? { siteId } : {}),
    ...(selections.trackerTemplateId ? { trackerTemplateId: selections.trackerTemplateId } : {}),
  };
}

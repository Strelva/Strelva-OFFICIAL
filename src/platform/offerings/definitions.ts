import { HOME_FINDER_MANAGEMENT_OPERATIONS } from "@/platform/customers/home-finder-port";
import { getProductDefinition } from "@/platform/products/catalog";
import {
  assertOfferingDeclaration,
  isOfferingQualified,
  qualifyOffering,
  type OfferingQualificationEvidence,
  type OfferingQualificationRecord,
} from "./qualification";
import {
  OfferingNotQualifiedError,
  type OfferingDefinitionView,
  type OfferingNativeResource,
  type OfferingStatus,
  type OfferingSurface,
} from "./types";

/** A server-owned definition. `qualified` is derived by the catalog, never declared. */
export type OfferingDefinition = Omit<OfferingDefinitionView, "qualified"> & {
  resolveSurfaces(resources: readonly OfferingNativeResource[], businessId: string, status: OfferingStatus): readonly OfferingSurface[];
};

const STRELVA = { kind: "strelva", name: "Strelva" } as const;

const privateStaffRequests: OfferingDefinition = {
  id: "private_staff_requests",
  version: "1.0.0",
  name: "Staff request application",
  description: "Give staff a private request form and review submissions in one place.",
  availability: "local",
  installability: "available",
  installationNote: "Create a draft from the staff-request template or connect an app this business has already published. Staff can use a new app only after it passes checks and you publish it. The label and notes here do not change the app. Setup does not notify or hire a provider.",
  requiredResources: [{
    kind: "application",
    minimum: 1,
    maximum: 1,
    description: "An app owned by this business. Existing apps must already be published.",
  }],
  scopes: [
    { id: "submit_requests", label: "Submit requests", description: "Use the released form to add request records.", required: true },
    { id: "review_requests", label: "Review requests", description: "Review the application's records through its existing access rules.", required: true },
  ],
  surfaces: [
    { id: "staff_app", label: "Staff application", description: "The released application used by permitted staff.", href: null, required: true },
    { id: "business_workspace", label: "Business workspace", description: "The existing workspace where owners manage the application.", href: null, required: true },
  ],
  configurationFields: [
    { id: "displayName", label: "Offering label (display only)", kind: "short_text", required: false, maximumLength: 80 },
    { id: "instructions", label: "Operator note (display only)", kind: "long_text", required: false, maximumLength: 500 },
  ],
  declaration: {
    data: [
      { class: "application_records", access: "write", heldBy: "strelva", description: "Staff request records in the business's native application tables." },
      { class: "business_configuration", access: "write", heldBy: "strelva", description: "The display-only offering label and operator note." },
    ],
    permissions: [
      { scope: "submit_requests", effect: "create_resource", authority: ["workspace_membership", "scoped_delegation"] },
      { scope: "review_requests", effect: "read", authority: ["workspace_membership"] },
    ],
    outsideSystems: [],
    madeBy: STRELVA,
  },
  resolveSurfaces(resources, businessId, status) {
    const application = resources.find((resource) => resource.kind === "application");
    return [
      { id: "staff_app", label: "Staff application", description: "The released application used by permitted staff.", href: application && status === "active" ? `/apps/${application.id}` : null },
      { id: "business_workspace", label: "Business workspace", description: "The existing workspace where owners manage the application.", href: application ? `/workspace?workspaceId=${businessId}&work=${application.id}` : `/workspace?workspaceId=${businessId}` },
    ];
  },
};

const customerInquiryIntake: OfferingDefinition = {
  id: "customer_inquiry_intake",
  version: "1.0.0",
  name: "Customer inquiry intake",
  description: "Review customer inquiries and decide what happens next.",
  availability: "release_gated",
  installability: "available",
  installationNote: "Connect the existing inquiry workspace for this business. The release gate still controls whether the offering can be surfaced outside the local workspace.",
  requiredResources: [{ kind: "inquiry_workspace", minimum: 1, maximum: 1, description: "An inquiry workspace verified through its tenant authority." }],
  scopes: [{ id: "handle_inquiries", label: "Handle inquiries", description: "Use the governed inquiry handling path.", required: true }],
  surfaces: [{ id: "inquiry_workspace", label: "Inquiry workspace", description: "The existing inquiry handling surface.", href: null, required: true }],
  configurationFields: [],
  declaration: {
    data: [
      { class: "customer_inquiry_content", access: "read", heldBy: "strelva", description: "Inquiry fields submitted through the business's website form, held in the tenant inquiry store." },
      { class: "inquiry_handling_state", access: "write", heldBy: "strelva", description: "Handling status, assignment and publication receipts; never a copy of inquiry fields." },
    ],
    permissions: [
      { scope: "handle_inquiries", effect: "external_side_effect", authority: ["workspace_membership", "tenant_membership"] },
    ],
    outsideSystems: [
      { id: "business_website", name: "The business's website", purpose: "Hosts the inquiry form that submits to the tenant inquiry store." },
      { id: "resend", name: "Resend", purpose: "Delivers inquiry notifications and governed replies through the shared email boundary." },
    ],
    madeBy: STRELVA,
  },
  resolveSurfaces(resources, businessId, status) {
    const workspace = resources.find((resource) => resource.kind === "inquiry_workspace");
    return [{
      id: "inquiry_workspace",
      label: "Inquiry workspace",
      description: "The existing inquiry handling surface.",
      href: workspace && status === "active"
        ? `/workspace?workspaceId=${encodeURIComponent(businessId)}&view=inquiries&inquiryWorkspaceId=${encodeURIComponent(workspace.id)}`
        : null,
    }];
  },
};

const managedWebsiteChanges: OfferingDefinition = {
  id: "managed_website_changes",
  version: "1.0.0",
  name: "Managed website changes",
  description: "Request changes to a website Strelva already manages.",
  availability: "existing_clients",
  installability: "available",
  installationNote: "First link a website you own to this business. This offering only lets you prepare change requests. Everyone still needs their own website access; linking does not grant it.",
  requiredResources: [{ kind: "managed_website", minimum: 1, maximum: 1, description: "An active website binding verified against workspace and tenant ownership." }],
  scopes: [{ id: "request_changes", label: "Request changes", description: "Prepare changes for the website's existing governance path.", required: true }],
  surfaces: [{ id: "managed_website", label: "Managed website", description: "The website's existing authenticated management surface.", href: null, required: true }],
  configurationFields: [],
  declaration: {
    data: [
      { class: "website_content", access: "read", heldBy: "strelva", description: "Published and draft content for the bound tenant; changes are proposals for the governed approval path." },
    ],
    permissions: [
      { scope: "request_changes", effect: "propose_change", authority: ["workspace_membership", "tenant_membership"] },
    ],
    outsideSystems: [
      { id: "client_website", name: "The client website repository and host", purpose: "Reads approved content through the versioned storefront API after governed publication." },
    ],
    madeBy: STRELVA,
  },
  resolveSurfaces() {
    return [{ id: "managed_website", label: "Managed website", description: "The website's existing authenticated management surface.", href: null }];
  },
};

/** One scope per signed management read in the Home Finder port. */
const HOME_FINDER_SCOPE_BY_OPERATION = {
  readInstallationSummary: { id: "read_installation_summary", label: "Read installation summary", description: "Read the installation's brokerage, mode and approved origin." },
  readReadiness: { id: "read_readiness", label: "Read readiness", description: "Read each launch requirement and who is responsible for it." },
  listDeliveryReceipts: { id: "list_delivery_receipts", label: "List delivery receipts", description: "List content-free inquiry delivery receipts." },
  readDeliveryReceipt: { id: "read_delivery_receipt", label: "Read a delivery receipt", description: "Read one content-free inquiry delivery receipt." },
} as const satisfies Record<(typeof HOME_FINDER_MANAGEMENT_OPERATIONS)[number], { id: string; label: string; description: string }>;

export const HOME_FINDER_OFFERING_SCOPES = HOME_FINDER_MANAGEMENT_OPERATIONS.map((operation) => HOME_FINDER_SCOPE_BY_OPERATION[operation].id);

/** The outstanding release gates are read from the product catalog, not restated here. */
function homeFinderInstallationNote(): string {
  const gates = getProductDefinition("homefinder").release.gates.filter((gate) => gate.state !== "met");
  return `Home Finder cannot be installed yet. Outstanding: ${gates.map((gate) => gate.label.toLowerCase()).join("; ")}. A request does not establish a brokerage agreement, MLS or provider approval, or deployment.`;
}

const homeFinder: OfferingDefinition = {
  id: "home_finder",
  version: "1.0.0",
  name: "IDX Home Finder",
  description: "A brokerage-branded home search that delivers consented buyer inquiries with verifiable receipts.",
  availability: "external_pilot",
  installability: "not_enabled",
  installationNote: homeFinderInstallationNote(),
  requiredResources: [{
    kind: "home_finder_installation",
    minimum: 1,
    maximum: 1,
    description: "The Home Finder runtime's installation id; the same identity Customers maps as a home_finder_installation reference.",
  }],
  scopes: HOME_FINDER_MANAGEMENT_OPERATIONS.map((operation) => ({ ...HOME_FINDER_SCOPE_BY_OPERATION[operation], required: true })),
  surfaces: [{ id: "home_finder_management", label: "Home Finder management", description: "Read-only installation, readiness and delivery evidence from the Home Finder runtime.", href: null, required: true }],
  configurationFields: [],
  declaration: {
    data: [
      { class: "listing_data", access: "read", heldBy: "trestle", description: "MLS listing data displayed under the brokerage's IDX rules." },
      { class: "buyer_inquiry_content", access: "write", heldBy: "home_finder_host", description: "Consented buyer inquiries collected and delivered by the Home Finder runtime. Strelva's control plane never reads their content." },
      { class: "delivery_receipts", access: "read", heldBy: "home_finder_host", description: "Content-free delivery receipts read through the signed management adapter." },
      { class: "installation_readiness", access: "read", heldBy: "home_finder_host", description: "Installation summary and launch readiness read through the signed management adapter." },
    ],
    permissions: HOME_FINDER_MANAGEMENT_OPERATIONS.map((operation) => ({
      scope: HOME_FINDER_SCOPE_BY_OPERATION[operation].id,
      effect: "read" as const,
      authority: ["workspace_membership", "scoped_delegation"] as const,
    })),
    outsideSystems: [
      { id: "trestle", name: "Trestle (MLS listing feed)", purpose: "Supplies listing data under the brokerage's MLS display authority." },
      { id: "resend", name: "Resend", purpose: "Delivers consented buyer inquiries to the brokerage and reports delivery events." },
      { id: "home_finder_host", name: "Home Finder host", purpose: "Runs the separate Home Finder runtime, stores installations and inquiries, and answers signed management reads." },
    ],
    madeBy: { kind: "agency", name: "John Leone, Agency Partner" },
  },
  resolveSurfaces() {
    return [{ id: "home_finder_management", label: "Home Finder management", description: "Read-only installation, readiness and delivery evidence from the Home Finder runtime.", href: null }];
  },
};

export const OFFERING_DEFINITIONS: readonly OfferingDefinition[] = Object.freeze([
  privateStaffRequests,
  customerInquiryIntake,
  managedWebsiteChanges,
  homeFinder,
]);

const localEvidence = (
  id: string,
  definition: OfferingDefinition,
  reference: string,
  summary: string,
): OfferingQualificationEvidence => ({
  id,
  offeringId: definition.id,
  offeringVersion: definition.version,
  kind: "focused_test",
  environment: "local",
  status: "passed",
  reference,
  checkedAt: "2026-09-28T00:00:00.000Z",
  summary,
});

/**
 * Local qualification witnesses for exact definition versions. They establish
 * no production, provider, deployment or customer adoption result. Home Finder
 * has none: its brokerage, inventory-rights, inquiry-delivery and handoff gates
 * are unmet, so it cannot be installed or activated.
 */
export const OFFERING_QUALIFICATIONS: readonly OfferingQualificationRecord[] = Object.freeze([
  qualifyOffering(privateStaffRequests, [
    localEvidence("staff-requests-service", privateStaffRequests, "src/__tests__/offering-installations.test.ts", "Business isolation, idempotent install, default draft preparation and release-gated activation."),
    localEvidence("staff-requests-sql", privateStaffRequests, "tests/offering-installations-schema.sql", "Actor-checked install, activation and retirement functions in isolated PostgreSQL."),
  ], "2026-09-28T00:00:00.000Z", "Local staff request offering proof."),
  qualifyOffering(customerInquiryIntake, [
    localEvidence("inquiry-intake-service", customerInquiryIntake, "src/__tests__/offering-installations.test.ts", "Installs only against the business-owned inquiry workspace and resolves its destination."),
  ], "2026-09-28T00:00:00.000Z", "Local customer inquiry intake offering proof."),
  qualifyOffering(managedWebsiteChanges, [
    localEvidence("managed-website-service", managedWebsiteChanges, "src/__tests__/offering-installations.test.ts", "Installs only against an active dual-ownership website binding; revocation removes the surface."),
    localEvidence("managed-website-sql", managedWebsiteChanges, "tests/offering-websites-schema.sql", "Website binding ownership and revocation in isolated PostgreSQL."),
  ], "2026-09-28T00:00:00.000Z", "Local managed website changes offering proof."),
]);

export interface OfferingCatalog {
  list(): readonly OfferingDefinitionView[];
  get(id: string, version?: string): OfferingDefinition | null;
  isQualified(definition: Pick<OfferingDefinitionView, "id" | "version">): boolean;
  /** Returns the definition only when this exact version is qualified. */
  requireQualified(id: string, version: string): OfferingDefinition;
  resolveSurfaces(
    definitionId: string,
    definitionVersion: string,
    resources: readonly OfferingNativeResource[],
    selectedIds: readonly string[],
    businessId: string,
    status: OfferingStatus,
  ): readonly OfferingSurface[];
}

/**
 * The only qualification boundary for offerings. Every definition must carry a
 * valid declaration; a qualification applies to one exact id and version.
 */
export function createOfferingCatalog(input: {
  definitions: readonly OfferingDefinition[];
  qualifications: readonly OfferingQualificationRecord[];
}): OfferingCatalog {
  const seen = new Set<string>();
  for (const definition of input.definitions) {
    assertOfferingDeclaration(definition);
    const key = `${definition.id}@${definition.version}`;
    if (seen.has(key)) throw new Error(`Duplicate offering definition ${key}.`);
    seen.add(key);
  }
  const qualified = new Set<string>();
  for (const record of input.qualifications) {
    const definition = input.definitions.find((candidate) => candidate.id === record.offeringId && candidate.version === record.offeringVersion);
    if (!definition || !isOfferingQualified(definition, record)) {
      throw new Error(`Qualification ${record.offeringId}@${record.offeringVersion} does not match a declared definition.`);
    }
    qualified.add(`${definition.id}@${definition.version}`);
  }
  const definitions = Object.freeze([...input.definitions]);
  const isQualified = (definition: Pick<OfferingDefinitionView, "id" | "version">) => qualified.has(`${definition.id}@${definition.version}`);
  const get = (id: string, version?: string) =>
    definitions.find((definition) => definition.id === id && (version === undefined || definition.version === version)) ?? null;

  const catalog: OfferingCatalog = {
    list() {
      return definitions.map(({ resolveSurfaces: _resolve, ...definition }) => {
        const isDefinitionQualified = isQualified(definition);
        return {
          ...definition,
          installability: isDefinitionQualified ? definition.installability : "not_enabled" as const,
          qualified: isDefinitionQualified,
        };
      });
    },
    get,
    isQualified,
    requireQualified(id: string, version: string) {
      const definition = get(id, version);
      if (!definition) throw new OfferingNotQualifiedError(id, version, "This offering definition version is unavailable.");
      if (!isQualified(definition)) {
        throw new OfferingNotQualifiedError(id, version,
          `${definition.name} ${definition.version} is not qualified to be turned on. ${definition.installationNote}`);
      }
      return definition;
    },
    resolveSurfaces(definitionId, definitionVersion, resources, selectedIds, businessId, status) {
      const definition = get(definitionId, definitionVersion);
      if (!definition) return [];
      const selected = new Set(selectedIds);
      return definition.resolveSurfaces(resources, businessId, status).filter((surface) => selected.has(surface.id));
    },
  };
  return Object.freeze(catalog);
}

export const offeringCatalog = createOfferingCatalog({
  definitions: OFFERING_DEFINITIONS,
  qualifications: OFFERING_QUALIFICATIONS,
});

export function listOfferingDefinitions(): readonly OfferingDefinitionView[] {
  return offeringCatalog.list();
}

export function getOfferingDefinition(id: string, version?: string): OfferingDefinition | null {
  return offeringCatalog.get(id, version);
}

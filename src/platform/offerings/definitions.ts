import type {
  OfferingDefinitionView,
  OfferingNativeResource,
  OfferingStatus,
  OfferingSurface,
} from "./types";

type OfferingDefinition = OfferingDefinitionView & {
  resolveSurfaces(resources: readonly OfferingNativeResource[], businessId: string, status: OfferingStatus): readonly OfferingSurface[];
};

const definitions: readonly OfferingDefinition[] = [
  {
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
    resolveSurfaces(resources, businessId, status) {
      const application = resources.find((resource) => resource.kind === "application");
      return [
        { id: "staff_app", label: "Staff application", description: "The released application used by permitted staff.", href: application && status === "active" ? `/apps/${application.id}` : null },
        { id: "business_workspace", label: "Business workspace", description: "The existing workspace where owners manage the application.", href: application ? `/workspace?workspaceId=${businessId}&work=${application.id}` : `/workspace?workspaceId=${businessId}` },
      ];
    },
  },
  {
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
  },
  {
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
    resolveSurfaces() {
      return [{ id: "managed_website", label: "Managed website", description: "The website's existing authenticated management surface.", href: null }];
    },
  },
] as const;

export function listOfferingDefinitions(): readonly OfferingDefinitionView[] {
  return definitions.map(({ resolveSurfaces: _resolve, ...definition }) => definition);
}

export function getOfferingDefinition(id: string, version?: string): OfferingDefinition | null {
  return definitions.find((definition) => definition.id === id && (version === undefined || definition.version === version)) ?? null;
}

export function resolveOfferingSurfaces(
  definitionId: string,
  definitionVersion: string,
  resources: readonly OfferingNativeResource[],
  selectedIds: readonly string[],
  businessId: string,
  status: OfferingStatus,
): readonly OfferingSurface[] {
  const definition = getOfferingDefinition(definitionId, definitionVersion);
  if (!definition) return [];
  const selected = new Set(selectedIds);
  return definition.resolveSurfaces(resources, businessId, status).filter((surface) => selected.has(surface.id));
}

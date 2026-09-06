import type { ProductDefinition, ProductId } from "./contracts";

/**
 * Release catalog for discovery and presentation.
 *
 * This catalog is not an authorization, approval, entitlement, billing, or
 * provider-configuration source. A visible operation can still be unavailable
 * to a caller when its executing use case checks authoritative state.
 */
export const PRODUCT_CATALOG = [
  {
    id: "ai_visibility",
    name: "AI Visibility",
    promise: "Check how ready a business is to appear in AI answers and keep a shareable assessment.",
    resources: [
      {
        kind: "ai_visibility_assessment",
        label: "AI Visibility assessment",
        ownership: "public_result",
        description: "A scored assessment with signals, a citation probe, and a top recommended fix.",
      },
      {
        kind: "private_ai_visibility_work",
        label: "Private AI Visibility work",
        ownership: "customer_account",
        compatibilityKinds: ["ai_visibility_assessment"],
        description: "An account-owned copy of an assessment prepared, saved, or handed to a customer.",
      },
    ],
    operations: [
      {
        id: "run_assessment",
        label: "Run an assessment",
        resourceKind: "ai_visibility_assessment",
        effect: "create_resource",
        support: "supported",
        description: "Score a supplied business and optional website through the existing public assessment.",
      },
      {
        id: "view_shared_assessment",
        label: "View a shared assessment",
        resourceKind: "ai_visibility_assessment",
        effect: "read",
        support: "supported",
        description: "Open a retained assessment by its public result link while it remains available.",
      },
      {
        id: "save_private_assessment",
        label: "Save private work",
        resourceKind: "private_ai_visibility_work",
        effect: "create_resource",
        support: "release_gated",
        description: "Save an assessment in an owned workspace after the workspace migration is live.",
      },
      {
        id: "handoff_private_assessment",
        label: "Hand work to a customer",
        resourceKind: "private_ai_visibility_work",
        effect: "create_resource",
        support: "release_gated",
        description: "Copy one prepared result into a customer-owned workspace, with optional read access for the agency.",
      },
    ],
    presentations: [
      {
        mode: "structured_result",
        primary: true,
        description: "Score, grade, evidence signals, citation observation, and top fix.",
      },
    ],
    distribution: [
      {
        id: "public_assessment",
        kind: "public_route",
        label: "Check AI Visibility",
        href: "/ai-visibility",
        status: "available",
        description: "Public assessment entry in this application.",
      },
      {
        id: "shared_assessment",
        kind: "shared_result",
        label: "Shared assessment",
        href: "/ai-visibility/:id",
        status: "available",
        description: "Public result route for an existing retained assessment.",
      },
      {
        id: "private_work",
        kind: "client_workspace",
        label: "Private saved work",
        href: null,
        status: "restricted",
        description: "Workspace persistence exists in source but has not been verified against a live migrated database.",
      },
      {
        id: "agency_handoff",
        kind: "agency_handoff",
        label: "Agency handoff",
        href: null,
        status: "restricted",
        description: "A scoped private-work handoff exists in source, gated on the unapplied workspace migration and live integration checks.",
      },
    ],
    controls: {
      enforcement: "executing_use_case",
      access: ["public", "authenticated_person", "scoped_delegation"],
      approval: "operation_policy",
      note: "The public assessment needs no approval. Private work needs verified identity; a customer explicitly chooses whether an agency keeps read access. Executing routes remain authoritative.",
    },
    release: {
      availability: "public",
      releaseOne: true,
      gates: [
        {
          id: "public_assessment_exists",
          label: "Public assessment path exists",
          state: "met",
          evidence: "The application has public create and retained-result routes.",
        },
        {
          id: "account_saved_work",
          label: "Account-owned saved work",
          state: "partial",
          evidence: "Private work and per-work agency handoff are implemented and pass isolated PostgreSQL tests. The migration and live route behavior are not verified in production.",
        },
      ],
      note: "Release one includes the existing public assessment. Monitoring signup is sales follow-up, not an activated monitoring product.",
    },
  },
  {
    id: "managed_presence",
    name: "Managed Websites",
    promise: "Keep an existing client's website current through managed work and governed changes.",
    resources: [
      {
        kind: "managed_business_presence",
        label: "Managed business presence",
        ownership: "managed_tenant",
        description: "The existing tenant-scoped business presence, including its connected site and control-plane records.",
      },
      {
        kind: "governed_change",
        label: "Governed change",
        ownership: "managed_tenant",
        description: "A proposed or completed managed action with its approval and activity record.",
      },
    ],
    operations: [
      {
        id: "view_client_workspace",
        label: "Open client work",
        resourceKind: "managed_business_presence",
        effect: "read",
        support: "managed_only",
        description: "Open the existing tenant workspace for an authorized client member.",
      },
      {
        id: "request_managed_change",
        label: "Request a managed change",
        resourceKind: "governed_change",
        effect: "propose_change",
        support: "managed_only",
        description: "Ask for supported work inside the existing managed-client boundary.",
      },
      {
        id: "apply_governed_change",
        label: "Apply an approved change",
        resourceKind: "governed_change",
        effect: "external_side_effect",
        support: "managed_only",
        description: "Execute only after the existing product policy, capability, and approval checks pass.",
      },
    ],
    presentations: [
      {
        mode: "workspace",
        primary: true,
        description: "Existing client control plane for current work, requests, website, analytics, and reports.",
      },
      {
        mode: "preview",
        primary: false,
        description: "Focused preview when a proposed site change needs review.",
      },
      {
        mode: "activity",
        primary: false,
        description: "Governed work status, decisions, and receipts.",
      },
    ],
    distribution: [
      {
        id: "existing_client_workspace",
        kind: "client_workspace",
        label: "Client workspace",
        href: "/dashboard",
        status: "restricted",
        description: "Available to existing tenant members under current access checks.",
      },
      {
        id: "agency_handoff",
        kind: "agency_handoff",
        label: "Agency handoff",
        href: null,
        status: "not_enabled",
        description: "No scoped agency-to-customer handoff route exists in the shared application yet.",
      },
    ],
    controls: {
      enforcement: "executing_use_case",
      access: ["tenant_membership", "scoped_delegation"],
      approval: "operation_policy",
      note: "Tenant membership, capabilities, site support, and governed-action policy decide each operation. Scoped agency delegation is part of the contract but is not implemented here.",
    },
    release: {
      availability: "existing_clients",
      releaseOne: true,
      gates: [
        {
          id: "existing_client_continuity",
          label: "Existing client workspace remains available",
          state: "met",
          evidence: "Current tenant routes and the managed-presence compatibility boundary remain in place.",
        },
        {
          id: "scoped_agency_delegation",
          label: "Scoped, revocable agency delegation",
          state: "unmet",
          evidence: "A catalog entry cannot replace customer-owned delegation and revocation records.",
        },
      ],
      note: "Release one carries forward the existing client product. It does not open managed tools to general users or agencies by catalog membership.",
    },
  },
  {
    id: "domain_monitoring",
    name: "Domain Monitoring",
    promise: "Detect domain and site failures for the currently managed portfolio and alert Strelva operators.",
    resources: [
      {
        kind: "portfolio_domain_health_snapshot",
        label: "Portfolio domain health snapshot",
        ownership: "managed_tenant",
        description: "The latest operator-facing health scan for domains in the managed tenant portfolio.",
      },
    ],
    operations: [
      {
        id: "scan_managed_portfolio",
        label: "Scan managed domains",
        resourceKind: "portfolio_domain_health_snapshot",
        effect: "create_resource",
        support: "internal_only",
        description: "Run the existing portfolio-wide check through scheduled or operator-only infrastructure.",
      },
      {
        id: "view_operator_status",
        label: "View domain status",
        resourceKind: "portfolio_domain_health_snapshot",
        effect: "read",
        support: "internal_only",
        description: "Inspect the latest portfolio snapshot in the operator uptime view.",
      },
    ],
    presentations: [
      {
        mode: "activity",
        primary: true,
        description: "Operator uptime status and recovery alerts.",
      },
    ],
    distribution: [
      {
        id: "operator_uptime",
        kind: "operator_workspace",
        label: "Operator uptime",
        href: "/admin/uptime",
        status: "restricted",
        description: "Internal operator view backed by the current portfolio snapshot.",
      },
    ],
    controls: {
      enforcement: "executing_use_case",
      access: ["operator"],
      approval: "none",
      note: "Current cron and admin authorization remain authoritative. This description does not make snapshots tenant-readable.",
    },
    release: {
      availability: "managed_internal",
      releaseOne: true,
      gates: [
        {
          id: "portfolio_monitoring_exists",
          label: "Managed portfolio monitoring exists",
          state: "met",
          evidence: "Scheduled scanning, latest-snapshot storage, operator status, and operator alert delivery exist.",
        },
        {
          id: "installation_scoping",
          label: "Account-scoped installations and history",
          state: "unmet",
          evidence: "Current storage is one latest portfolio snapshot, not a customer product lifecycle.",
        },
      ],
      note: "Release one may rely on existing managed monitoring. Customer or agency activation is not enabled.",
    },
  },
  {
    id: "homefinder",
    name: "Homefinder",
    promise: "Help a brokerage test a guided home-search experience through the separate pilot product.",
    resources: [
      {
        kind: "external_homefinder_installation",
        label: "Homefinder installation",
        ownership: "external_product",
        description: "A brokerage installation owned by the separate pilot runtime and its provider rules.",
      },
    ],
    operations: [
      {
        id: "prepare_external_pilot",
        label: "Prepare a pilot",
        resourceKind: "external_homefinder_installation",
        effect: "create_resource",
        support: "not_enabled",
        description: "No shared-platform operation is enabled. Pilot preparation remains outside this repository.",
      },
    ],
    presentations: [
      {
        mode: "external_experience",
        primary: true,
        description: "A separate pilot experience, not a route or embedded surface in this application.",
      },
    ],
    distribution: [
      {
        id: "external_pilot",
        kind: "external_pilot",
        label: "External pilot",
        href: null,
        status: "not_enabled",
        description: "The shared application has no enabled Homefinder entry or verified live inventory connection.",
      },
      {
        id: "agency_handoff",
        kind: "agency_handoff",
        label: "Agency handoff",
        href: null,
        status: "not_enabled",
        description: "Agency handoff remains a release gate, not an available platform action.",
      },
    ],
    controls: {
      enforcement: "executing_use_case",
      access: ["external_product", "scoped_delegation"],
      approval: "external_product",
      note: "The external pilot must enforce brokerage authorization, provider terms, data access, and inquiry delivery.",
    },
    release: {
      availability: "not_enabled",
      releaseOne: false,
      gates: [
        {
          id: "authorized_brokerage",
          label: "Authorized brokerage pilot",
          state: "external",
          evidence: "No authorization is established by this repository or catalog.",
        },
        {
          id: "live_inventory_rights",
          label: "Verified inventory rights and provider configuration",
          state: "external",
          evidence: "Synthetic preview inventory does not establish live display rights.",
        },
        {
          id: "inquiry_delivery",
          label: "Verified inquiry delivery",
          state: "external",
          evidence: "Delivery must be verified in the external pilot before activation.",
        },
        {
          id: "platform_handoff",
          label: "Customer-owned agency handoff",
          state: "unmet",
          evidence: "The shared application does not yet have scoped delegation and handoff persistence.",
        },
      ],
      note: "Homefinder is recorded for compatibility with future product structure. It is not enabled or sold by this catalog.",
    },
  },
] as const satisfies readonly ProductDefinition[];

const PRODUCT_BY_ID: ReadonlyMap<ProductId, ProductDefinition> = new Map(
  PRODUCT_CATALOG.map((product) => [product.id, product]),
);

/** Lookup is descriptive only and performs no access or entitlement check. */
export function getProductDefinition(productId: ProductId): ProductDefinition {
  const product = PRODUCT_BY_ID.get(productId);
  if (!product) throw new Error(`Unknown product: ${productId}`);
  return product;
}

/** Products included in release one, including restricted and internal products. */
export function listReleaseOneProducts(): readonly ProductDefinition[] {
  return PRODUCT_CATALOG.filter((product) => product.release.releaseOne);
}

/**
 * Product records safe to include in a customer workspace discovery response.
 *
 * This is intentionally different from `listReleaseOneProducts`: release-one
 * includes internal operator tooling, while the workspace may keep an
 * explicit disabled record such as Homefinder so the UI can say that it is
 * not enabled. Products marked managed-internal, external-pilot, or any
 * future availability are not customer discovery entries by default.
 */
export function listWorkspaceDiscoveryProducts(): readonly ProductDefinition[] {
  return PRODUCT_CATALOG.filter((product) =>
    product.release.availability === "public" ||
    product.release.availability === "existing_clients" ||
    product.release.availability === "not_enabled",
  );
}

/**
 * Products that may be named in a customer-facing discovery surface.
 *
 * Internal portfolio monitoring remains in the catalog for operator tooling,
 * but it is not a consumer product. Homefinder is retained as an explicit
 * not-enabled record and is likewise excluded until its external gates pass.
 */
export function listConsumerProducts(): readonly ProductDefinition[] {
  return PRODUCT_CATALOG.filter((product) =>
    product.release.releaseOne &&
    (product.release.availability === "public" || product.release.availability === "existing_clients"),
  );
}

/** Alias for callers that describe the same surface as product discovery. */
export const listDiscoverableProducts = listConsumerProducts;

/** Public-only subset for unauthenticated acquisition surfaces. */
export function listPublicProducts(): readonly ProductDefinition[] {
  return PRODUCT_CATALOG.filter((product) =>
    product.release.releaseOne && product.release.availability === "public",
  );
}

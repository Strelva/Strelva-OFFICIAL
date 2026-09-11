/**
 * Browser-safe descriptions of products Strelva can present.
 *
 * These records describe product shape and release posture. They never grant
 * access, approve work, create an entitlement, or prove that a provider is
 * configured. The route or use case handling an operation must enforce those
 * decisions against its authoritative stores.
 */

export type ProductId =
  | "ai_visibility"
  | "managed_presence"
  | "domain_monitoring"
  | "homefinder"
  | "documents"
  | "tracker";

export type ResourceOwnership =
  | "public_result"
  | "person"
  | "customer_account"
  | "managed_tenant"
  | "external_product";

export interface DurableResourceKind {
  /** Stable wire name. Do not derive persistence keys from this value. */
  kind: string;
  /**
   * Older persisted identifiers accepted while callers migrate to `kind`.
   * These are descriptive compatibility metadata, not a second permission
   * or storage lookup mechanism.
   */
  compatibilityKinds?: readonly string[];
  label: string;
  ownership: ResourceOwnership;
  description: string;
}

export type OperationEffect =
  | "read"
  | "create_resource"
  | "propose_change"
  | "external_side_effect";

export type OperationSupport =
  | "supported"
  | "release_gated"
  | "managed_only"
  | "internal_only"
  | "external_pilot"
  | "not_enabled";

export interface ProductOperation {
  id: string;
  label: string;
  resourceKind: DurableResourceKind["kind"];
  effect: OperationEffect;
  support: OperationSupport;
  description: string;
}

export type PresentationMode =
  | "structured_result"
  | "workspace"
  | "document"
  | "preview"
  | "activity"
  | "external_experience";

export interface ProductPresentation {
  mode: PresentationMode;
  primary: boolean;
  description: string;
}

/**
 * Browser-safe presentation contract for saved product work.
 *
 * A workspace can use this descriptor to parse and title a known payload, but
 * it must never treat persisted identifiers as module names or executable
 * expressions. Product implementations provide descriptors through their
 * browser-safe entry point; the workspace owns the explicit registry.
 */
export interface ProductWorkPresentation<TPayload = unknown> {
  readonly productId: string;
  readonly resourceKinds: readonly string[];
  readonly parsePayload: (payload: unknown) => TPayload | null;
  readonly titleForPayload?: (payload: TPayload | null) => string | undefined;
}

export type DistributionEntryKind =
  | "public_route"
  | "shared_result"
  | "client_workspace"
  | "operator_workspace"
  | "agency_handoff"
  | "external_pilot";

export interface DistributionEntry {
  id: string;
  kind: DistributionEntryKind;
  label: string;
  /** A real route when this repository owns one. Null means no platform entry. */
  href: string | null;
  status: "available" | "restricted" | "not_enabled";
  description: string;
}

export type AccessRequirement =
  | "public"
  | "authenticated_person"
  | "tenant_membership"
  | "scoped_delegation"
  | "operator"
  | "external_product";

export type ApprovalRequirement =
  | "none"
  | "operation_policy"
  | "customer_approval"
  | "external_product";

export interface ProductControlPolicy {
  /** Descriptive only. The executing use case remains the authority. */
  enforcement: "executing_use_case";
  access: readonly AccessRequirement[];
  approval: ApprovalRequirement;
  note: string;
}

export type ProductAvailability =
  | "public"
  | "existing_clients"
  | "managed_internal"
  | "external_pilot"
  | "not_enabled";

export type ReleaseGateState = "met" | "partial" | "unmet" | "external";

export interface ReleaseGate {
  id: string;
  label: string;
  state: ReleaseGateState;
  evidence: string;
}

export interface ProductRelease {
  availability: ProductAvailability;
  releaseOne: boolean;
  gates: readonly ReleaseGate[];
  note: string;
}

export interface ProductDefinition {
  id: ProductId;
  name: string;
  promise: string;
  resources: readonly DurableResourceKind[];
  operations: readonly ProductOperation[];
  presentations: readonly ProductPresentation[];
  distribution: readonly DistributionEntry[];
  controls: ProductControlPolicy;
  release: ProductRelease;
}

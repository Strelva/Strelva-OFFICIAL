import type { AiVisibilityResult } from "@/products/ai-visibility/contracts";

/** Browser response contract. Internal membership and invitation secrets stay server-side. */
export interface WorkspaceSummary {
  id: string;
  kind: "personal" | "agency" | "customer";
  name: string;
  access?: "member" | "delegated_read";
}

/**
 * Browser-safe payload currently supported by the release-one workspace.
 * Product-specific validation and rendering live with the product; this alias
 * only keeps existing UI callers strongly typed during the migration.
 */
export type WorkspaceWorkPayload = AiVisibilityResult;

export interface WorkspaceWork<TPayload = WorkspaceWorkPayload> {
  id: string;
  workspaceId: string;
  title: string;
  productId: string;
  resourceKind: string;
  payload: TPayload | null;
  auditPayload?: import("@/products/website-audit/client").AuditResult | null;
  unavailableReason?: string;
  input: Record<string, unknown>;
  createdAt: string;
}

/**
 * A link to an existing managed-presence tenant.
 *
 * Managed tenants remain the source entity during this migration. They are
 * deliberately not copied into `saved_product_work`; the shared workspace
 * only receives a browser-safe pointer after the server verifies the current
 * user's tenant membership.
 */
export interface ManagedWork {
  id: string;
  title: string;
  href: string;
  productId: "managed_presence";
  relationship: "client" | "enterprise";
}

export interface WorkspaceHandoff {
  id: string;
  sourceWorkId: string;
  recipientEmail: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
}

export interface WorkspaceDelegation {
  id: string;
  workId: string;
  agencyWorkspaceId: string;
  status: "active" | "revoked";
  /** Only customer owners can revoke agency read access. */
  canRevoke: boolean;
}

export interface WorkspaceProduct {
  id: string;
  name: string;
  description: string;
  availability: "available" | "managed" | "not_enabled" | "release_gated";
}

export interface WorkspaceSnapshot {
  actor: { email: string; localPreview: boolean };
  workspaces: WorkspaceSummary[];
  workspaceId: string;
  work: WorkspaceWork[];
  pendingAssessments?: Array<{ id: string; status: string; createdAt: string }>;
  /** Existing managed sites visible to this verified account, if any. */
  managedWork?: ManagedWork[];
  /** True only when managed-site discovery was partially unavailable. */
  managedWorkUnavailable?: boolean;
  handoffs: WorkspaceHandoff[];
  delegations: WorkspaceDelegation[];
  products: WorkspaceProduct[];
}

export interface WorkspaceHandoffPreview<TPayload = WorkspaceWorkPayload> {
  recipientEmail: string;
  agencyName: string;
  work: WorkspaceWork<TPayload>;
  expiresAt: string;
  accepted: boolean;
}

export type WorkspaceAction =
  | { action: "create_agency"; name: string }
  | { action: "assess"; workspaceId: string; requestId?: string; business: string; url?: string; category?: string; location?: string }
  | { action: "recover_assessment"; workspaceId: string; requestId: string }
  | { action: "save_website_audit"; workspaceId: string; resultId: string }
  | { action: "save_public_result"; workspaceId: string; resultId: string }
  | { action: "handoff"; workId: string; recipientEmail: string }
  | { action: "inspect_handoff"; token: string }
  | { action: "accept_handoff"; token: string; allowAgencyAccess: boolean }
  | { action: "revoke_delegation"; delegationId: string }
  | { action: "revoke_handoff"; handoffId: string };

// Action responses: create_agency { workspaceId }; assess/save_public_result { work };
// handoff { token }; accept_handoff { workspaceId, workId }; revocations { ok: true }.
// Errors always use { error: string }, with 401/403/404/409/429/503 as appropriate.

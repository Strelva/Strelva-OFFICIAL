/**
 * What the tenant model (src/lib) asks of the workspace layers, inverted
 * (Strelva Reborn section 7: "src/lib never imports a workspace layer").
 *
 * src/lib declares each port here as the shape it needs, in its own types.
 * The workspace side supplies module loaders in src/server/workspace-ports.ts,
 * and the app edge registers them once per runtime
 * (src/register-workspace-ports.ts, imported by instrumentation.ts,
 * vitest.setup.ts and the scripts that reach these modules).
 *
 * Every port is a loader, called where the module used to be imported, so
 * the workspace module is resolved at call time exactly as a dynamic import
 * would be: same module instance, same test mocks. The registration lives on
 * globalThis so every bundle in one process shares it. An unregistered port
 * throws: a missing registration is a deploy bug, never a silent skip.
 */
import type { UnifiedEvent } from "./types";

// ── Shared shapes ─────────────────────────────────────────────────────────────

/** A verified signed-in person (the workspace layer's WorkspaceActor). */
export interface VerifiedActor {
  userId: string;
  verifiedEmail: string;
}

// ── Client records (src/platform/client-records) ──────────────────────────────

export type ClientRecordStoreName = "spam_held" | "inquiry_timeline" | "inquiry_reply" | "inquiry_delivery" | "booking_config" | "account_grouping" | "orders" | "provider_connections" | "provider_metadata" | "reward_members" | "reward_transactions" | "threads" | "tenant_settings";

export interface ClientRecordCopy {
  recordId: string;
  payload: Record<string, unknown>;
  capturedAt: string;
}

export interface ClientRecordsPort {
  /** Dual-write one record after the Redis write. Never throws. */
  mirrorClientRecord(store: ClientRecordStoreName, tenant: string, record: ClientRecordCopy, mode?: "replace" | "keep_first"): Promise<unknown>;
  /** Dual-write a removal. Never throws. */
  mirrorClientRecordRemoval(store: ClientRecordStoreName, tenant: string, recordId: string): Promise<unknown>;
  /** Read one store through STRELVA_CLIENT_RECORDS_READ, falling back to Redis. */
  readThroughFlag<T>(store: ClientRecordStoreName, tenant: string, fromRedis: () => Promise<T>, fromPostgres: (records: ClientRecordCopy[]) => T): Promise<T>;
}

// ── Tenant settings that are really policy (src/platform/needs-you/tenant-settings) ─

export type TenantPolicyKind = "copy.routine" | "review.reply";
export type TenantPolicyLayer = "owner" | "strelva";
/** The decision ladder's routes, loosest first (src/platform/needs-you/contracts.ts LADDER_ROUTES). */
export type PolicyRoute = "handle" | "handle_after_notice" | "strelva_reviews" | "owner_decides";

/** Test seam: `port` is the decision-policy store; omit it for Postgres. */
export interface TenantPolicyOptions {
  enabled?: boolean;
  port?: unknown;
  timeoutMs?: number;
}

export interface TenantPolicyState {
  route: PolicyRoute;
  strelvaRoute: PolicyRoute;
  ownerRoute: PolicyRoute | null;
}

export interface TenantPolicyPlan {
  route: PolicyRoute | null;
  notMigrated: string | null;
}

export type TenantPolicyWriteResult =
  | { stored: "decision_policies"; route: PolicyRoute; notMigrated: string | null }
  | { stored: "redis" };

export interface TenantPolicyPort {
  readTenantPolicyRoute(tenantId: string, kind: TenantPolicyKind, options?: TenantPolicyOptions): Promise<PolicyRoute | null>;
  writeTenantPolicySetting(input: {
    tenantId: string;
    actor: VerifiedActor;
    layer: TenantPolicyLayer;
    kind: TenantPolicyKind;
    todayValue: string;
    via: "owner_save" | "operator_save" | "seed";
    plan: (state: TenantPolicyState) => TenantPolicyPlan;
  }, options?: TenantPolicyOptions): Promise<TenantPolicyWriteResult>;
  contentAutonomyFromRoute(route: PolicyRoute): "auto" | "approve";
  planContentAutonomy(mode: "auto" | "approve", layer: TenantPolicyLayer, state: TenantPolicyState): TenantPolicyPlan;
  replyModeFromRoute(route: PolicyRoute): "auto" | "approve";
  planReplyMode(mode: "auto" | "approve", layer: TenantPolicyLayer): TenantPolicyPlan;
}

// ── Outside-write receipts (src/platform/operator-queue/receipts) ──────────────

export type OutsideWriteAcceptance = "accepted" | "rejected" | "unknown";
export type ReadbackCheck = { result: "matched" | "differs" | "failed"; detail: string };

export interface OutsideWriteReceiptsPort {
  beginGoogleWrite(input: { commandKey: string; tenantId: string; writeKind: "gbp_hours" | "gbp_post" | "gbp_photo" | "review_reply"; request: Record<string, unknown> }): Promise<{ claimed: boolean; attemptId: string; acceptance: "pending" | OutsideWriteAcceptance; receipt?: { providerRef: string | null; readback: string } | null }>;
  completeGoogleWrite(attemptId: string, input: Parameters<OutsideWriteReceiptsPort["recordGoogleWrite"]>[0]): Promise<{ id: string }>;
  recordReadback(receiptId: string, readback: "matched" | "differs" | "failed" | "not_possible", detail: string): Promise<unknown>;
  /** Legacy Google writes join the same ledger when the operator release is on. */
  recordGoogleWrite(input: {
    commandKey: string; tenantId: string; writeKind: "gbp_hours" | "gbp_post" | "gbp_photo" | "review_reply";
    subject: string; request: Record<string, unknown>; beforeState?: unknown;
    acceptance: OutsideWriteAcceptance; acceptanceDetail?: string; providerRef?: string;
    readback?: "pending" | "matched" | "differs" | "failed" | "not_possible"; readbackDetail?: string; actor: string;
  }): Promise<unknown>;
  /** A Google review reply, after publish and its immediate read-back. Never throws on storage failure. */
  recordReviewReply(input: {
    tenantId: string; reviewId: string; replyText: string; actor: string;
    outcome: { kind: "accepted"; verified: boolean; readbackError?: string } | { kind: "rejected"; detail: string } | { kind: "unknown"; detail: string };
  }): Promise<unknown>;
  /** A Vercel domain add. */
  recordDomainAdd(input: {
    tenantId: string; domain: string; actor: string; role: string; at: string;
    acceptance: OutsideWriteAcceptance; detail?: string | null; providerRef?: string | null;
    readback?: ReadbackCheck;
  }): Promise<unknown>;
  /** Strelva's claim on a domain removed (Vercel untouched). */
  recordDomainClaimRemoval(input: {
    tenantId: string; domain: string; actor: string; at: string;
    before: { role: string; status: string } | null;
    readback: ReadbackCheck;
  }): Promise<unknown>;
}

// ── Business record (src/platform/business-record/service) ─────────────────────

export interface TenantOwnerRecipientRow {
  email: string;
  name: string | null;
  from: "record" | "tenant" | "linked_tenant";
  workspaceId: string | null;
}

/** Public confirmed facts only; the SQL reader never returns owner contacts. */
export interface TenantBusinessContext {
  revision: number;
  facts: {
    display_name?: string; legal_name?: string; description?: string; phone?: string; email?: string;
    address?: { formatted?: string; line1?: string; line2?: string; city?: string; region?: string; postalCode?: string; country?: string };
    hours?: { timezone: string; weekly: Array<{ day: number; opens: string; closes: string }> };
    links?: Array<{ kind: string; url: string }>;
  };
  services: Array<{ id: string; name: string; description: string | null; priceText: string | null }>;
}

export interface BusinessRecordPort {
  ownerNoticeWorkspaceUrl?(tenant: { id: string; stableId?: string }, path: string, legacyUrl: string): Promise<string>;
  /** The owner-recipient rule for one tenant. Server-only; sends nothing. */
  resolveTenantOwnerRecipient(tenantId: string): Promise<TenantOwnerRecipientRow | null>;
  readTenantBusinessContext(tenantId: string): Promise<TenantBusinessContext | null>;
}

// ── Google account bindings (src/platform/account-bindings) ────────────────────

export type BindingStatus = "connected" | "needs_reauth" | "revoked" | "error";

export interface GoogleBindingLocation {
  accountId: string;
  locationId: string;
  isPrimary: boolean;
}

export interface GoogleBindingWithSecrets {
  id: string;
  workspaceId: string;
  status: BindingStatus;
  scopes: string[] | null;
  accessTokenCiphertext: string | null;
  refreshTokenCiphertext: string | null;
  tokenExpiresAt: string | null;
  locations: GoogleBindingLocation[];
}

export interface GoogleBindingsPort {
  googleBindingsEnabled(): boolean;
  readBindingTarget(tenantId: string): Promise<{ workspaceId: string; tenantStableId: string } | null>;
  readGoogleBindingForTenant(tenantId: string): Promise<GoogleBindingWithSecrets | null>;
  setGoogleBindingStatus(bindingId: string, status: BindingStatus, error: string | null, checkedAt: string | null): Promise<unknown>;
  updateGoogleBindingTokens(bindingId: string, tokens: { accessToken: string; expiresAt: string | null; rotatedRefreshToken?: string | null }): Promise<unknown>;
  upsertGoogleBinding(input: {
    workspaceId: string;
    originTenantStableId: string;
    scopes: string[] | null;
    refreshToken: string | null;
    accessToken: string;
    tokenExpiresAt: string;
    status: "connected";
  }, via: "oauth"): Promise<{ id: string }>;
  upsertGoogleLocation(bindingId: string, location: { accountId: string; locationId: string; title?: string | null }): Promise<unknown>;
  /** The store's error classes, for instanceof checks. */
  BindingEncryptionRefused: abstract new (...args: never[]) => Error;
  AccountBindingStoreError: abstract new (...args: never[]) => Error & { code: string | null };
}

// ── Business billing (src/platform/business-billing) ───────────────────────────

export interface BusinessBillingPort {
  /** `workspaceId` for checkout metadata when the tenant is a converted business (STRELVA_BUSINESS_BILLING). */
  businessBillingCheckoutMetadata(tenantId: string): Promise<Record<string, string>>;
  readBusinessPortfolioMrr(tenantIds: string[]): Promise<Array<{ workspaceId: string; monthlyCents: number; tenantIds: string[] }> | null>;
}

// ── Inquiries (src/products/inquiries) ─────────────────────────────────────────

export interface InquiryReviewOutcome {
  accepted: boolean;
  safeToResolve: boolean;
  receiptPersisted: boolean;
  verified: boolean;
  reason?: string;
}

export interface InquiriesPort {
  inquiryOutcomeProofEnabled(): boolean;
  readTenantInquiryOutcomeProof(tenantId: string, from: string, to: string): Promise<import("./types").WeeklyInquiryOutcomeProof>;
  notifyInquiryOwner(input: { tenantId: string; lead: import("./leads").LeadRecord }): Promise<unknown>;
  isInquiryMessageReviewEvent(event: UnifiedEvent): boolean;
  authorizeInquiryMessageReviewActor(input: { tenantId: string; event: UnifiedEvent; actorId: string; eventAction?: "approved" | "dismissed" }): Promise<{ allowed: boolean; reason?: string }>;
  executeInquiryMessageReview(input: { tenantId: string; eventId: string; event: UnifiedEvent; actorId: string }): Promise<InquiryReviewOutcome & {
    acceptedAt?: string;
    providerMessageId?: string;
    deliveryAttemptId?: string;
  }>;
  reconcileInquiryMessageReview(input: { tenantId: string; event: UnifiedEvent; actorId: string }): Promise<InquiryReviewOutcome>;
  authorizeInquiryPublicationActor(input: { tenantId: string; eventId: string; claimId: string; event: UnifiedEvent; actorId: string; action: "approved" | "dismissed" }): Promise<{ allowed: boolean; reason?: string }>;
  executeInquiryPublication(input: { tenantId: string; eventId: string; claimId: string; event: UnifiedEvent; actorId: string }): Promise<{ accepted: boolean; verified: boolean; reason?: string }>;
}

// ── Google listing replies for a tenant (src/products/google-listing) ──────────

/** Opaque: built by the port, handed back to it. */
export type TenantReplyDepsHandle = object;

export type TenantReplyAuthority =
  | { kind: "auto_reply_policy"; rating: number }
  | { kind: "owner_approval"; actor: string; approvalRef: string }
  | { kind: "operator_instruction"; actor: string; instructionRef: string };

export interface TenantReviewRepliesPort {
  defaultTenantReplyDeps(): Promise<TenantReplyDepsHandle>;
  listingDraftingAllowed(tenantId: string, locationId?: string): Promise<boolean>;
  routeTenantReviewReply(tenantId: string, deps: TenantReplyDepsHandle): Promise<{ kind: "legacy"; reason: string } | { kind: "listing"; workspaceId: string }>;
  postTenantReviewReply(input: {
    tenantId: string; workspaceId: string; eventId: string; attemptId: string; reviewId: string; text: string;
    authority: TenantReplyAuthority;
  }, deps: TenantReplyDepsHandle): Promise<{ status: string }>;
}

// ── Website documents for the agent's v2 site tools (src/products/websites) ────

export interface WebsiteRebuildView {
  workId: string;
  workspaceId: string;
  rebuild: {
    tenantId: string | null;
    revision: number;
    candidate: { revision: number; contentHash: string; document: unknown } | null;
  };
}

export interface WebsitesPort {
  websiteRebuildReleaseMayBeOn(): boolean;
  websiteRebuildReleasedFor(actor: { userId: string }, workspaceId: string): Promise<boolean>;
  websiteDocumentStore: { published(tenantId: string): Promise<{ workspaceId: string; workId: string } | null> };
  readWebsiteRebuild(actor: VerifiedActor, workId: string): Promise<WebsiteRebuildView>;
  readSiteNodes(document: unknown, path?: string): Record<string, unknown>;
  patchWebsiteRebuild(actor: VerifiedActor, workId: string, patch: Record<string, unknown> & { forceReview: true }): Promise<unknown>;
}

/** Observation only: the tenant write and revalidation have already started. */
export interface WebsitePublicationReadbackPort {
  observeAcceptedNativePublish(input: {
    tenantId: string; section: string; expected: unknown; actorId: string;
    publicationRef?: string; revalidation: Promise<unknown>;
  }): Promise<void>;
}

export interface PublishingContentPort {
  authorizePublishingEvent(input: { tenantId: string; event: UnifiedEvent; actorId: string }): Promise<{ allowed: boolean; reason?: string }>;
  prepareTenantCollectionDraft(input: { tenantId: string; actor: VerifiedActor | null; draft: unknown }): Promise<{ eventId: string; slug: string } | null>;

  executePublishingEvent(input: { tenantId: string; event: UnifiedEvent; actorId: string; attemptId: string }): Promise<null | { accepted: boolean; reason?: string; receiptId?: string; verified?: boolean }>;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export interface WorkspacePorts {
  bookingProof(): Promise<{ readAgentRequestProof(tenantId: string, from: string, to: string): Promise<string | null> }>;
  clientRecords(): Promise<ClientRecordsPort>;
  tenantPolicy(): Promise<TenantPolicyPort>;
  outsideWriteReceipts(): Promise<OutsideWriteReceiptsPort>;
  businessRecord(): Promise<BusinessRecordPort>;
  googleBindings(): Promise<GoogleBindingsPort>;
  businessBilling(): Promise<BusinessBillingPort>;
  inquiries(): Promise<InquiriesPort>;
  tenantReviewReplies(): Promise<TenantReviewRepliesPort>;
  websites(): Promise<WebsitesPort>;
  websitePublicationReadback(): Promise<WebsitePublicationReadbackPort>;
  publishingContent(): Promise<PublishingContentPort>;
}

const SLOT = Symbol.for("strelva.workspace-ports");
type Slot = { [SLOT]?: WorkspacePorts };

/** Called once per runtime by the app edge (src/register-workspace-ports.ts). */
export function registerWorkspacePorts(ports: WorkspacePorts): void {
  (globalThis as Slot)[SLOT] = ports;
}

export function workspacePortsRegistered(): boolean {
  return Boolean((globalThis as Slot)[SLOT]);
}

/** The registered ports. Throws when the app edge never registered them. */
export function workspacePorts(): WorkspacePorts {
  const ports = (globalThis as Slot)[SLOT];
  if (!ports) {
    throw new Error("Workspace ports are not registered. Import src/register-workspace-ports.ts at the app edge (instrumentation.ts, vitest.setup.ts, or the script).");
  }
  return ports;
}

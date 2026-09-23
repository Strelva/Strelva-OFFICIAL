/**
 * Durable boundary for the inquiry engine.
 *
 * The engine owns the lifecycle and its canonical contracts. This adapter
 * stores a revisioned snapshot and the publication claim that sits in front
 * of a non-idempotent live write. Customer inquiry records stay in Redis and
 * are intentionally removed from the Postgres snapshot.
 */

import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Json } from "@/lib/db/database.types";
import { getSupabase, type Db, type Row } from "@/lib/db/client";
import { decodeOnboarding } from "./onboarding";
import { INQUIRY_ENGINE_VERSION, type ActionReceipt, type InquiryEngineState, type InquiryTimelineEvent, type ReceiptActor, type ResponsibilityActionReceipt, type InquiryRecordStatus } from "./contracts";

export const INQUIRY_SCHEMA_VERSION = INQUIRY_ENGINE_VERSION;
export const INQUIRY_PUBLISH_EVENT_KIND = "inquiry_capability_publish" as const;
export const INQUIRY_UNDO_EVENT_KIND = "inquiry_capability_undo" as const;

export type JsonRecord = Record<string, unknown>;

/** State stored in the durable row. Inquiry records are Redis-authoritative. */
export type InquiryDurableState = Omit<InquiryEngineState, "inquiries"> & { inquiries: [] };

export interface InquiryWorkspaceSnapshot {
  businessId: string;
  tenantId: string;
  tenantStableId: string | null;
  revision: number;
  stateVersion: number;
  state: InquiryDurableState;
  updatedAt: string;
}

export interface CompareAndSwapInput {
  tenantId: string;
  businessId: string;
  expectedRevision: number | null;
  state: InquiryEngineState;
  actorId?: string | null;
}

export type CompareAndSwapResult =
  | { changed: true; snapshot: InquiryWorkspaceSnapshot }
  | { changed: false; reason: "conflict"; current: InquiryWorkspaceSnapshot | null };

export type PublicationAction = "make_live" | "undo";
export type PublicationClaimStatus = "claimed" | "accepted" | "verification_failed" | "failed";

export interface PublicationClaim {
  id: string;
  tenantId: string;
  tenantStableId: string | null;
  businessId: string;
  requestId: string;
  capabilityId: string;
  changeId: string;
  action: PublicationAction;
  version: number;
  idempotencyKey: string;
  /** Digest binds an idempotency key to its complete command payload. */
  commandDigest: string;
  status: PublicationClaimStatus;
  acceptanceId: string | null;
  providerReceipt: JsonRecord | null;
  failureReason: string | null;
  actorId: string | null;
  governanceEventId: string | null;
  createdAt: string;
  acceptedAt: string | null;
  updatedAt: string;
}

export interface ClaimPublicationInput {
  tenantId: string;
  businessId: string;
  requestId: string;
  capabilityId: string;
  changeId: string;
  action: PublicationAction;
  version: number;
  idempotencyKey: string;
  actorId?: string | null;
}

/** Only the caller that won the claim may perform the provider write. */
export type ClaimPublicationResult =
  | { acquired: true; claim: PublicationClaim; claimToken: string }
  | { acquired: false; claim: PublicationClaim; reason: "already_claimed" | "already_accepted" | "already_failed" };

export interface MarkPublicationAcceptedInput {
  tenantId: string;
  claimId: string;
  claimToken: string;
  acceptanceId: string;
  providerReceipt?: JsonRecord | null;
}

export interface MarkPublicationFailedInput {
  tenantId: string;
  claimId: string;
  claimToken: string;
  reason: string;
  /** Verification failure is only valid after the provider accepted the write. */
  verificationFailed?: boolean;
}

export interface LinkPublicationEventInput {
  tenantId: string;
  claimId: string;
  claimToken: string;
  governanceEventId: string;
}

/** Non-PII status/assignment metadata for Redis-authoritative lead records. */
export interface InquiryRecordOverlay {
  tenantId: string;
  tenantStableId: string | null;
  businessId: string;
  inquiryId: string;
  capabilityId: string;
  status: InquiryRecordStatus;
  assigneeId: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertInquiryRecordOverlayInput {
  tenantId: string;
  businessId: string;
  inquiryId: string;
  capabilityId: string;
  status: InquiryRecordStatus;
  assigneeId?: string | null;
  updatedBy?: string | null;
}

export class InquiryPersistenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InquiryPersistenceError";
  }
}

export class InquiryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InquiryValidationError";
  }
}

const STATE_COLLECTIONS = [
  "requests",
  "capabilities",
  "changes",
  "actionReceipts",
  "rehearsalScenarios",
  "rehearsalRuns",
  "inquiries",
  "timeline",
  "responsibilities",
  "responsibilityReceipts",
] as const;

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asJson(value: unknown): Json {
  return value as Json;
}

function normalizedTenant(value: string): string {
  const tenant = value.trim();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(tenant)) {
    throw new InquiryValidationError("A valid business tenant is required.");
  }
  return tenant;
}

function normalizedBusiness(value: string): string {
  const business = value.trim();
  if (!business || business.length > 160 || /[\u0000-\u001f\u007f]/.test(business)) {
    throw new InquiryValidationError("A valid business id is required.");
  }
  return business;
}

function bounded(value: string, label: string, max = 256): string {
  const result = value.trim();
  if (!result || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new InquiryValidationError(`${label} is invalid.`);
  }
  return result;
}

function safeText(value: string, max = 500): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function redactText(value: string, max = 500): string {
  return safeText(value, max)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/(?:\+?\d[\d .()\-]{7,}\d)/g, "[redacted phone]");
}

/** Stable JSON is used only for an idempotency digest, never as a wire format. */
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as JsonRecord)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(",")}}`;
}

function digest(input: ClaimPublicationInput): string {
  return createHash("sha256").update(stable({
    businessId: normalizedBusiness(input.businessId),
    requestId: bounded(input.requestId, "Request"),
    capabilityId: bounded(input.capabilityId, "Capability"),
    changeId: bounded(input.changeId, "Change"),
    action: input.action,
    version: input.version,
    actorId: input.actorId ?? null,
  })).digest("hex");
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function claimTokenSecret(): string {
  const configured = process.env.INQUIRY_PUBLICATION_CLAIM_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "local-inquiry-publication-claim-secret";
  throw new InquiryPersistenceError("Inquiry publication claim signing is unavailable.");
}

/**
 * Derive the handoff token from durable claim identity. The token itself never
 * goes into the event queue or a browser response, while a later governed
 * executor can recover the same owner proof after a process restart.
 */
export function publicationClaimToken(claim: Pick<PublicationClaim, "id" | "commandDigest">): string {
  return createHmac("sha256", claimTokenSecret())
    .update(`${claim.id}:${claim.commandDigest}`)
    .digest("base64url");
}

function boundedRevision(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new InquiryValidationError("A valid workspace revision is required.");
  }
  return value;
}

function assertBusiness(value: unknown, business: string, label: string): void {
  const item = record(value);
  if (typeof item.businessId !== "string" || item.businessId !== business) {
    throw new InquiryValidationError(`${label} belongs to another business.`);
  }
}

function assertNestedBusinesses(value: unknown, business: string, path = "state"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNestedBusinesses(item, business, `${path}[${index}]`));
    return;
  }
  const item = value as JsonRecord;
  if ("businessId" in item && item.businessId !== business) {
    throw new InquiryValidationError(`${path} belongs to another business.`);
  }
  for (const [key, child] of Object.entries(item)) {
    assertNestedBusinesses(child, business, `${path}.${key}`);
  }
}

function assertStateReferences(state: InquiryEngineState): void {
  const requestIds = new Set(state.requests.map((item) => item.id));
  const capabilityIds = new Set(state.capabilities.map((item) => item.id));
  const scenarioIds = new Set(state.rehearsalScenarios.map((item) => item.id));
  for (const request of state.requests) {
    if (!request.id || !request.capabilityId || !capabilityIds.has(request.capabilityId)) {
      throw new InquiryValidationError("The inquiry workspace has an invalid request reference.");
    }
  }
  for (const capability of state.capabilities) {
    if (!capability.id) throw new InquiryValidationError("The inquiry workspace has an invalid capability.");
    if (capability.activeRequestId && !requestIds.has(capability.activeRequestId)) {
      throw new InquiryValidationError("The inquiry workspace has an invalid active request reference.");
    }
    for (const definition of [capability.live, capability.previousLive]) {
      if (definition && (definition.id !== capability.id || definition.businessId !== capability.businessId)) {
        throw new InquiryValidationError("The inquiry workspace has an invalid capability definition.");
      }
    }
  }
  for (const change of state.changes) {
    if (!requestIds.has(change.requestId) || !capabilityIds.has(change.capabilityId)) {
      throw new InquiryValidationError("The inquiry workspace has an invalid change reference.");
    }
  }
  for (const scenario of state.rehearsalScenarios) {
    if (!capabilityIds.has(scenario.capabilityId)) throw new InquiryValidationError("The inquiry workspace has an invalid rehearsal capability reference.");
  }
  for (const run of state.rehearsalRuns) {
    if (!requestIds.has(run.requestId) || !capabilityIds.has(run.capabilityId) || !scenarioIds.has(run.scenarioId)) {
      throw new InquiryValidationError("The inquiry workspace has an invalid rehearsal reference.");
    }
  }
}

/** Validate state before either a cast or a durable write. */
function validateState(value: unknown, business: string, allowInquiryRecords: boolean): InquiryEngineState {
  const state = record(value);
  if (state.stateVersion !== INQUIRY_ENGINE_VERSION) {
    throw new InquiryValidationError("This inquiry state version is not supported.");
  }
  for (const key of STATE_COLLECTIONS) {
    if (!Array.isArray(state[key])) throw new InquiryValidationError("The inquiry workspace state is malformed.");
  }
  for (const key of STATE_COLLECTIONS) {
    for (const item of state[key] as unknown[]) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new InquiryValidationError("The inquiry workspace state is malformed.");
      }
      assertBusiness(item, business, `Inquiry ${key}`);
    }
  }
  assertNestedBusinesses(state, business);
  assertStateReferences(state as unknown as InquiryEngineState);
  if (!allowInquiryRecords && (state.inquiries as unknown[]).length > 0) {
    throw new InquiryValidationError("Customer inquiry records cannot be stored in the durable workspace.");
  }
  return structuredClone(state) as unknown as InquiryEngineState;
}

function safeActor(actor: ReceiptActor): ReceiptActor {
  return {
    ...actor,
    id: bounded(actor.id, "Receipt actor"),
    ...(actor.label ? { label: redactText(actor.label, 160) } : {}),
  } as ReceiptActor;
}

function safeReceipt(receipt: ActionReceipt): ActionReceipt {
  const facts = decodeOnboarding(receipt.setupFacts);
  return {
    ...receipt,
    actor: safeActor(receipt.actor),
    action: redactText(receipt.action),
    what: redactText(receipt.what),
    why: redactText(receipt.why),
    lookedAt: receipt.lookedAt.map((item) => redactText(item, 240)).slice(0, 50),
    evidence: receipt.evidence.map((item) => redactText(item, 240)).slice(0, 50),
    setupFacts: facts ? { website: facts.website ? redactText(facts.website, 2_000) : null,
      statements: facts.statements.map((item) => ({ ...item, label: redactText(item.label, 80), value: item.value ? redactText(item.value, 2_000) : item.value, provenance: item.provenance ? redactText(item.provenance, 2_200) : null })),
      checks: facts.checks.map((item) => ({ ...item, label: redactText(item.label, 80), detail: redactText(item.detail, 500) })) } : undefined,
  };
}

function safeTimeline(event: InquiryTimelineEvent): InquiryTimelineEvent {
  return {
    ...event,
    summary: redactText(event.summary),
    evidence: event.evidence.map((item) => redactText(item, 240)).slice(0, 50),
  };
}

function safeResponsibilityReceipt(receipt: ResponsibilityActionReceipt): ResponsibilityActionReceipt {
  return {
    ...receipt,
    what: redactText(receipt.what),
    why: redactText(receipt.why),
    lookedAt: receipt.lookedAt.map((item) => redactText(item, 240)).slice(0, 50),
    outcomeEvidence: receipt.outcomeEvidence.map((item) => redactText(item, 240)).slice(0, 50),
    evaluation: {
      ...receipt.evaluation,
      reason: redactText(receipt.evaluation.reason),
      ...(receipt.evaluation.clause ? { clause: redactText(receipt.evaluation.clause) } : {}),
    },
  };
}

/**
 * Remove only Redis-authoritative customer records. Synthetic rehearsal
 * fixtures, change before/after values, and saved receipts keep their
 * canonical shapes so a reloaded rehearsal remains rerunnable.
 */
export function durableState(state: InquiryEngineState, business?: string): InquiryDurableState {
  const expectedBusiness = normalizedBusiness(
    business ?? state.requests[0]?.businessId ?? state.capabilities[0]?.businessId ?? "unknown",
  );
  const copy = validateState(state, expectedBusiness, true);
  return {
    ...copy,
    inquiries: [],
    timeline: copy.timeline.map(safeTimeline),
    actionReceipts: copy.actionReceipts.map(safeReceipt),
    responsibilityReceipts: copy.responsibilityReceipts.map(safeResponsibilityReceipt),
  };
}

function stateFromRow(row: Row<"inquiry_workspaces">): InquiryWorkspaceSnapshot {
  const business = normalizedBusiness(row.business_id);
  const state = validateState(row.state, business, false);
  return {
    businessId: business,
    tenantId: normalizedTenant(row.tenant_id),
    tenantStableId: row.tenant_stable_id,
    revision: row.revision,
    stateVersion: row.state_version,
    state: state as InquiryDurableState,
    updatedAt: row.updated_at,
  };
}

function mapPublication(row: Row<"inquiry_publication_claims">): PublicationClaim {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantStableId: row.tenant_stable_id,
    businessId: row.business_id,
    requestId: row.request_id,
    capabilityId: row.capability_id,
    changeId: row.change_id,
    action: row.action as PublicationAction,
    version: row.version,
    idempotencyKey: row.idempotency_key,
    commandDigest: row.command_digest,
    status: row.status as PublicationClaimStatus,
    acceptanceId: row.acceptance_id,
    providerReceipt: row.provider_receipt ? safeProviderReceipt(record(row.provider_receipt)) : null,
    failureReason: row.failure_reason,
    actorId: row.actor_id,
    governanceEventId: row.governance_event_id,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    updatedAt: row.updated_at,
  };
}

function mapRecordOverlay(row: Row<"inquiry_record_overlays">): InquiryRecordOverlay {
  return {
    tenantId: row.tenant_id,
    tenantStableId: row.tenant_stable_id,
    businessId: row.business_id,
    inquiryId: row.inquiry_id,
    capabilityId: row.capability_id,
    status: row.status as InquiryRecordStatus,
    assigneeId: row.assignee_id,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resultReason(status: PublicationClaimStatus): "already_claimed" | "already_accepted" | "already_failed" {
  return status === "claimed" ? "already_claimed" : status === "accepted" || status === "verification_failed" ? "already_accepted" : "already_failed";
}

function assertSameCommand(existing: PublicationClaim, input: ClaimPublicationInput, expectedDigest: string): void {
  if (
    existing.commandDigest !== expectedDigest ||
    existing.businessId !== normalizedBusiness(input.businessId) ||
    existing.requestId !== bounded(input.requestId, "Request") ||
    existing.capabilityId !== bounded(input.capabilityId, "Capability") ||
    existing.changeId !== bounded(input.changeId, "Change") ||
    existing.action !== input.action ||
    existing.version !== input.version ||
    existing.actorId !== (input.actorId ?? null)
  ) {
    throw new InquiryValidationError("That idempotency key was already used for a different publication command.");
  }
}

function ensureClaimToken(expectedHash: string, supplied: string): void {
  if (tokenHash(bounded(supplied, "Publication claim token", 512)) !== expectedHash) {
    throw new InquiryValidationError("Publication claim ownership could not be verified.");
  }
}

/** Provider responses are evidence, not a second secret store. */
function safeProviderReceipt(value: JsonRecord | null | undefined): JsonRecord | null {
  if (!value) return null;
  const sensitive = /(?:secret|token|password|authorization|credential|api[_-]?key|access[_-]?key|private[_-]?key)/i;
  const visit = (item: unknown, depth: number): unknown => {
    if (depth > 4) return "[truncated]";
    if (typeof item === "string") return redactText(item, 500);
    if (typeof item === "number" || typeof item === "boolean" || item === null) return item;
    if (Array.isArray(item)) return item.slice(0, 50).map((child) => visit(child, depth + 1));
    if (typeof item !== "object") return null;
    const result: JsonRecord = {};
    for (const [key, child] of Object.entries(item as JsonRecord).slice(0, 50)) {
      if (sensitive.test(key)) continue;
      result[key.slice(0, 100)] = visit(child, depth + 1);
    }
    return result;
  };
  return visit(value, 0) as JsonRecord;
}

export interface InquiryRepository {
  getSnapshot(tenantId: string, businessId?: string): Promise<InquiryWorkspaceSnapshot | null>;
  compareAndSwap(input: CompareAndSwapInput): Promise<CompareAndSwapResult>;
  claimPublication(input: ClaimPublicationInput): Promise<ClaimPublicationResult>;
  getPublicationClaim(tenantId: string, claimId: string): Promise<PublicationClaim | null>;
  markPublicationAccepted(input: MarkPublicationAcceptedInput): Promise<PublicationClaim>;
  markPublicationFailed(input: MarkPublicationFailedInput): Promise<PublicationClaim>;
  linkPublicationEvent(input: LinkPublicationEventInput): Promise<PublicationClaim>;
  getRecordOverlays(tenantId: string, businessId: string, inquiryIds?: string[]): Promise<InquiryRecordOverlay[]>;
  upsertRecordOverlay(input: UpsertInquiryRecordOverlayInput): Promise<InquiryRecordOverlay>;
}

/** Explicit local test adapter. It is never selected implicitly in production. */
export class InMemoryInquiryRepository implements InquiryRepository {
  private readonly snapshots = new Map<string, InquiryWorkspaceSnapshot>();
  private readonly publications = new Map<string, PublicationClaim>();
  private readonly publicationByKey = new Map<string, string>();
  private readonly publicationTokens = new Map<string, string>();
  private readonly overlays = new Map<string, InquiryRecordOverlay>();

  async getSnapshot(tenant: string, business = tenant): Promise<InquiryWorkspaceSnapshot | null> {
    const key = `${normalizedTenant(tenant)}:${normalizedBusiness(business)}`;
    const snapshot = this.snapshots.get(key);
    return snapshot ? structuredClone(snapshot) : null;
  }

  async compareAndSwap(input: CompareAndSwapInput): Promise<CompareAndSwapResult> {
    const tenant = normalizedTenant(input.tenantId);
    const business = normalizedBusiness(input.businessId);
    const expected = boundedRevision(input.expectedRevision);
    const key = `${tenant}:${business}`;
    const current = this.snapshots.get(key);
    if (expected === null ? Boolean(current) : !current || current.revision !== expected) {
      return { changed: false, reason: "conflict", current: current ? structuredClone(current) : null };
    }
    const next: InquiryWorkspaceSnapshot = {
      businessId: business,
      tenantId: tenant,
      tenantStableId: null,
      revision: (current?.revision ?? 0) + 1,
      stateVersion: INQUIRY_SCHEMA_VERSION,
      state: durableState(input.state, business),
      updatedAt: new Date().toISOString(),
    };
    this.snapshots.set(key, next);
    return { changed: true, snapshot: structuredClone(next) };
  }

  async claimPublication(input: ClaimPublicationInput): Promise<ClaimPublicationResult> {
    const tenant = normalizedTenant(input.tenantId);
    const business = normalizedBusiness(input.businessId);
    const idempotencyKey = bounded(input.idempotencyKey, "Publication idempotency key");
    const key = `${tenant}:${idempotencyKey}`;
    const expectedDigest = digest(input);
    const existingId = this.publicationByKey.get(key);
    if (existingId) {
      const existing = this.publications.get(existingId)!;
      assertSameCommand(existing, input, expectedDigest);
      return { acquired: false, claim: structuredClone(existing), reason: resultReason(existing.status) };
    }
    const now = new Date().toISOString();
    const claimId = randomUUID();
    const claim: PublicationClaim = {
      id: claimId,
      tenantId: tenant,
      tenantStableId: null,
      businessId: business,
      requestId: bounded(input.requestId, "Request"),
      capabilityId: bounded(input.capabilityId, "Capability"),
      changeId: bounded(input.changeId, "Change"),
      action: input.action,
      version: input.version,
      idempotencyKey,
      commandDigest: expectedDigest,
      status: "claimed",
      acceptanceId: null,
      providerReceipt: null,
      failureReason: null,
      actorId: input.actorId ?? null,
      governanceEventId: null,
      createdAt: now,
      acceptedAt: null,
      updatedAt: now,
    };
    this.publications.set(claim.id, claim);
    this.publicationByKey.set(key, claim.id);
    const claimToken = publicationClaimToken(claim);
    this.publicationTokens.set(claim.id, tokenHash(claimToken));
    return { acquired: true, claim: structuredClone(claim), claimToken };
  }

  async getPublicationClaim(tenant: string, claimId: string): Promise<PublicationClaim | null> {
    const claim = this.publications.get(bounded(claimId, "Publication claim"));
    return claim?.tenantId === normalizedTenant(tenant) ? structuredClone(claim) : null;
  }

  async markPublicationAccepted(input: MarkPublicationAcceptedInput): Promise<PublicationClaim> {
    const claim = this.publications.get(bounded(input.claimId, "Publication claim"));
    if (!claim || claim.tenantId !== normalizedTenant(input.tenantId)) throw new InquiryValidationError("Publication claim was not found.");
    if (claim.status === "accepted" || claim.status === "verification_failed") return structuredClone(claim);
    if (claim.status !== "claimed") throw new InquiryValidationError("Publication claim cannot be accepted in its current state.");
    ensureClaimToken(this.publicationTokens.get(claim.id) ?? "", input.claimToken);
    const now = new Date().toISOString();
    const next = {
      ...claim,
      status: "accepted" as const,
      acceptanceId: bounded(input.acceptanceId, "Provider acceptance"),
      providerReceipt: safeProviderReceipt(input.providerReceipt),
      acceptedAt: now,
      updatedAt: now,
    };
    this.publications.set(claim.id, next);
    return structuredClone(next);
  }

  async markPublicationFailed(input: MarkPublicationFailedInput): Promise<PublicationClaim> {
    const claim = this.publications.get(bounded(input.claimId, "Publication claim"));
    if (!claim || claim.tenantId !== normalizedTenant(input.tenantId)) throw new InquiryValidationError("Publication claim was not found.");
    if (claim.status === "verification_failed" || claim.status === "failed") return structuredClone(claim);
    ensureClaimToken(this.publicationTokens.get(claim.id) ?? "", input.claimToken);
    if (claim.status === "accepted") {
      if (!input.verificationFailed) return structuredClone(claim);
      const next = { ...claim, status: "verification_failed" as const, failureReason: safeText(input.reason), updatedAt: new Date().toISOString() };
      this.publications.set(claim.id, next);
      return structuredClone(next);
    }
    if (input.verificationFailed) throw new InquiryValidationError("A verification failure requires an accepted provider write.");
    const next = { ...claim, status: "failed" as const, failureReason: safeText(input.reason), updatedAt: new Date().toISOString() };
    this.publications.set(claim.id, next);
    return structuredClone(next);
  }

  async linkPublicationEvent(input: LinkPublicationEventInput): Promise<PublicationClaim> {
    const claim = this.publications.get(bounded(input.claimId, "Publication claim"));
    if (!claim || claim.tenantId !== normalizedTenant(input.tenantId)) throw new InquiryValidationError("Publication claim was not found.");
    ensureClaimToken(this.publicationTokens.get(claim.id) ?? "", input.claimToken);
    const eventId = bounded(input.governanceEventId, "Governance event");
    if (claim.governanceEventId && claim.governanceEventId !== eventId) throw new InquiryValidationError("Publication claim is already linked to another governance event.");
    const next = { ...claim, governanceEventId: eventId, updatedAt: new Date().toISOString() };
    this.publications.set(claim.id, next);
    return structuredClone(next);
  }

  async getRecordOverlays(tenant: string, business: string, inquiryIds?: string[]): Promise<InquiryRecordOverlay[]> {
    const normalizedTenantId = normalizedTenant(tenant);
    const normalizedBusinessId = normalizedBusiness(business);
    const filter = inquiryIds ? new Set(inquiryIds.map((id) => bounded(id, "Inquiry record"))) : null;
    return [...this.overlays.values()]
      .filter((overlay) => overlay.tenantId === normalizedTenantId && overlay.businessId === normalizedBusinessId && (!filter || filter.has(overlay.inquiryId)))
      .map((overlay) => structuredClone(overlay));
  }

  async upsertRecordOverlay(input: UpsertInquiryRecordOverlayInput): Promise<InquiryRecordOverlay> {
    const tenant = normalizedTenant(input.tenantId);
    const business = normalizedBusiness(input.businessId);
    const inquiryId = bounded(input.inquiryId, "Inquiry record");
    const key = `${tenant}:${business}:${inquiryId}`;
    const current = this.overlays.get(key);
    const now = new Date().toISOString();
    const next: InquiryRecordOverlay = {
      tenantId: tenant,
      tenantStableId: current?.tenantStableId ?? null,
      businessId: business,
      inquiryId,
      capabilityId: bounded(input.capabilityId, "Capability"),
      status: input.status,
      assigneeId: input.assigneeId ? bounded(input.assigneeId, "Assignee") : null,
      updatedBy: input.updatedBy ? bounded(input.updatedBy, "Actor") : null,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    this.overlays.set(key, next);
    return structuredClone(next);
  }
}

class PostgresInquiryRepository implements InquiryRepository {
  constructor(private readonly db: Db) {}

  async getSnapshot(tenantValue: string, businessValue = tenantValue): Promise<InquiryWorkspaceSnapshot | null> {
    const tenant = normalizedTenant(tenantValue);
    const business = normalizedBusiness(businessValue);
    const result = await this.db.from("inquiry_workspaces").select("*").eq("tenant_id", tenant).eq("business_id", business).maybeSingle();
    if (result.error) throw new InquiryPersistenceError("Read inquiry workspace failed.", { cause: result.error });
    return result.data ? stateFromRow(result.data as Row<"inquiry_workspaces">) : null;
  }

  async compareAndSwap(input: CompareAndSwapInput): Promise<CompareAndSwapResult> {
    const tenant = normalizedTenant(input.tenantId);
    const business = normalizedBusiness(input.businessId);
    const expected = boundedRevision(input.expectedRevision);
    const state = durableState(input.state, business);
    const now = new Date().toISOString();
    if (expected === null) {
      const result = await this.db.from("inquiry_workspaces").insert({
        tenant_id: tenant,
        business_id: business,
        state: asJson(state),
        state_version: INQUIRY_SCHEMA_VERSION,
        revision: 1,
        updated_by: input.actorId ?? null,
        updated_at: now,
      }).select("*").maybeSingle();
      if (result.data) return { changed: true, snapshot: stateFromRow(result.data as Row<"inquiry_workspaces">) };
      if (result.error?.code !== "23505") throw new InquiryPersistenceError("Save inquiry workspace failed.", { cause: result.error });
      return { changed: false, reason: "conflict", current: await this.getSnapshot(tenant, business) };
    }
    const result = await this.db.from("inquiry_workspaces").update({
      state: asJson(state),
      state_version: INQUIRY_SCHEMA_VERSION,
      revision: expected + 1,
      updated_by: input.actorId ?? null,
      updated_at: now,
    }).eq("tenant_id", tenant).eq("business_id", business).eq("revision", expected).select("*").maybeSingle();
    if (result.data) return { changed: true, snapshot: stateFromRow(result.data as Row<"inquiry_workspaces">) };
    if (result.error) throw new InquiryPersistenceError("Save inquiry workspace failed.", { cause: result.error });
    return { changed: false, reason: "conflict", current: await this.getSnapshot(tenant, business) };
  }

  async claimPublication(input: ClaimPublicationInput): Promise<ClaimPublicationResult> {
    const tenant = normalizedTenant(input.tenantId);
    const key = bounded(input.idempotencyKey, "Publication idempotency key");
    const expectedDigest = digest(input);
    const existing = await this.db.from("inquiry_publication_claims").select("*").eq("tenant_id", tenant).eq("idempotency_key", key).maybeSingle();
    if (existing.error) throw new InquiryPersistenceError("Read publication claim failed.", { cause: existing.error });
    if (existing.data) {
      const claim = mapPublication(existing.data as Row<"inquiry_publication_claims">);
      assertSameCommand(claim, input, expectedDigest);
      return { acquired: false, claim, reason: resultReason(claim.status) };
    }
    const claimId = randomUUID();
    const claimToken = publicationClaimToken({ id: claimId, commandDigest: expectedDigest });
    const result = await this.db.from("inquiry_publication_claims").insert({
      id: claimId,
      tenant_id: tenant,
      business_id: normalizedBusiness(input.businessId),
      request_id: bounded(input.requestId, "Request"),
      capability_id: bounded(input.capabilityId, "Capability"),
      change_id: bounded(input.changeId, "Change"),
      action: input.action,
      version: input.version,
      idempotency_key: key,
      command_digest: expectedDigest,
      claim_token_hash: tokenHash(claimToken),
      status: "claimed",
      actor_id: input.actorId ?? null,
    }).select("*").maybeSingle();
    if (result.data) return { acquired: true, claim: mapPublication(result.data as Row<"inquiry_publication_claims">), claimToken };
    if (result.error?.code === "23505") {
      const retry = await this.db.from("inquiry_publication_claims").select("*").eq("tenant_id", tenant).eq("idempotency_key", key).single();
      if (!retry.error && retry.data) {
        const claim = mapPublication(retry.data as Row<"inquiry_publication_claims">);
        assertSameCommand(claim, input, expectedDigest);
        return { acquired: false, claim, reason: resultReason(claim.status) };
      }
    }
    throw new InquiryPersistenceError("Create publication claim failed.", { cause: result.error });
  }

  async getPublicationClaim(tenantValue: string, claimId: string): Promise<PublicationClaim | null> {
    const result = await this.db.from("inquiry_publication_claims").select("*").eq("tenant_id", normalizedTenant(tenantValue)).eq("id", bounded(claimId, "Publication claim")).maybeSingle();
    if (result.error) throw new InquiryPersistenceError("Read publication claim failed.", { cause: result.error });
    return result.data ? mapPublication(result.data as Row<"inquiry_publication_claims">) : null;
  }

  private async claimRow(tenantValue: string, claimId: string): Promise<Row<"inquiry_publication_claims">> {
    const result = await this.db.from("inquiry_publication_claims").select("*").eq("tenant_id", normalizedTenant(tenantValue)).eq("id", bounded(claimId, "Publication claim")).maybeSingle();
    if (result.error) throw new InquiryPersistenceError("Read publication claim failed.", { cause: result.error });
    if (!result.data) throw new InquiryValidationError("Publication claim was not found.");
    return result.data as Row<"inquiry_publication_claims">;
  }

  async markPublicationAccepted(input: MarkPublicationAcceptedInput): Promise<PublicationClaim> {
    const tenant = normalizedTenant(input.tenantId);
    const current = await this.claimRow(tenant, input.claimId);
    const mapped = mapPublication(current);
    if (mapped.status === "accepted" || mapped.status === "verification_failed") return mapped;
    if (mapped.status !== "claimed") throw new InquiryValidationError("Publication claim cannot be accepted in its current state.");
    const hash = tokenHash(bounded(input.claimToken, "Publication claim token", 512));
    if (current.claim_token_hash !== hash) throw new InquiryValidationError("Publication claim ownership could not be verified.");
    const now = new Date().toISOString();
    const result = await this.db.from("inquiry_publication_claims").update({
      status: "accepted",
      acceptance_id: bounded(input.acceptanceId, "Provider acceptance"),
      provider_receipt: input.providerReceipt ? asJson(safeProviderReceipt(input.providerReceipt)) : null,
      accepted_at: now,
      updated_at: now,
    }).eq("tenant_id", tenant).eq("id", input.claimId).eq("status", "claimed").eq("claim_token_hash", hash).select("*").maybeSingle();
    if (result.error) throw new InquiryPersistenceError("Mark publication accepted failed.", { cause: result.error });
    if (result.data) return mapPublication(result.data as Row<"inquiry_publication_claims">);
    const latest = await this.claimRow(tenant, input.claimId);
    const latestMapped = mapPublication(latest);
    if (latestMapped.status === "accepted" || latestMapped.status === "verification_failed") return latestMapped;
    throw new InquiryValidationError("Publication claim could not be accepted.");
  }

  async markPublicationFailed(input: MarkPublicationFailedInput): Promise<PublicationClaim> {
    const tenant = normalizedTenant(input.tenantId);
    const current = await this.claimRow(tenant, input.claimId);
    const mapped = mapPublication(current);
    if (mapped.status === "verification_failed" || mapped.status === "failed") return mapped;
    const hash = tokenHash(bounded(input.claimToken, "Publication claim token", 512));
    if (current.claim_token_hash !== hash) throw new InquiryValidationError("Publication claim ownership could not be verified.");
    if (mapped.status === "accepted") {
      if (!input.verificationFailed) return mapped;
      const result = await this.db.from("inquiry_publication_claims").update({ status: "verification_failed", failure_reason: safeText(input.reason), updated_at: new Date().toISOString() }).eq("tenant_id", tenant).eq("id", input.claimId).eq("status", "accepted").eq("claim_token_hash", hash).select("*").maybeSingle();
      if (result.error) throw new InquiryPersistenceError("Record publication verification failure failed.", { cause: result.error });
      return result.data ? mapPublication(result.data as Row<"inquiry_publication_claims">) : mapPublication(await this.claimRow(tenant, input.claimId));
    }
    if (input.verificationFailed) throw new InquiryValidationError("A verification failure requires an accepted provider write.");
    const result = await this.db.from("inquiry_publication_claims").update({ status: "failed", failure_reason: safeText(input.reason), updated_at: new Date().toISOString() }).eq("tenant_id", tenant).eq("id", input.claimId).eq("status", "claimed").eq("claim_token_hash", hash).select("*").maybeSingle();
    if (result.error) throw new InquiryPersistenceError("Mark publication failed.", { cause: result.error });
    return result.data ? mapPublication(result.data as Row<"inquiry_publication_claims">) : mapPublication(await this.claimRow(tenant, input.claimId));
  }

  async linkPublicationEvent(input: LinkPublicationEventInput): Promise<PublicationClaim> {
    const tenant = normalizedTenant(input.tenantId);
    const current = await this.claimRow(tenant, input.claimId);
    const mapped = mapPublication(current);
    const eventId = bounded(input.governanceEventId, "Governance event");
    if (mapped.governanceEventId === eventId) return mapped;
    const hash = tokenHash(bounded(input.claimToken, "Publication claim token", 512));
    if (current.claim_token_hash !== hash) throw new InquiryValidationError("Publication claim ownership could not be verified.");
    if (mapped.governanceEventId) throw new InquiryValidationError("Publication claim is already linked to another governance event.");
    const result = await this.db.from("inquiry_publication_claims").update({ governance_event_id: eventId, updated_at: new Date().toISOString() }).eq("tenant_id", tenant).eq("id", input.claimId).eq("claim_token_hash", hash).is("governance_event_id", null).select("*").maybeSingle();
    if (result.error) throw new InquiryPersistenceError("Link publication governance event failed.", { cause: result.error });
    return result.data ? mapPublication(result.data as Row<"inquiry_publication_claims">) : mapPublication(await this.claimRow(tenant, input.claimId));
  }

  async getRecordOverlays(tenantValue: string, businessValue: string, inquiryIds?: string[]): Promise<InquiryRecordOverlay[]> {
    const tenant = normalizedTenant(tenantValue);
    const business = normalizedBusiness(businessValue);
    let query = this.db.from("inquiry_record_overlays").select("*").eq("tenant_id", tenant).eq("business_id", business).order("updated_at", { ascending: false });
    if (inquiryIds?.length) query = query.in("inquiry_id", inquiryIds.map((id) => bounded(id, "Inquiry record")));
    const result = await query;
    if (result.error) throw new InquiryPersistenceError("Read inquiry record metadata failed.", { cause: result.error });
    return ((result.data ?? []) as Row<"inquiry_record_overlays">[]).map(mapRecordOverlay);
  }

  async upsertRecordOverlay(input: UpsertInquiryRecordOverlayInput): Promise<InquiryRecordOverlay> {
    const tenant = normalizedTenant(input.tenantId);
    const business = normalizedBusiness(input.businessId);
    const result = await this.db.from("inquiry_record_overlays").upsert({
      tenant_id: tenant,
      business_id: business,
      inquiry_id: bounded(input.inquiryId, "Inquiry record"),
      capability_id: bounded(input.capabilityId, "Capability"),
      status: input.status,
      assignee_id: input.assigneeId ? bounded(input.assigneeId, "Assignee") : null,
      updated_by: input.updatedBy ? bounded(input.updatedBy, "Actor") : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,business_id,inquiry_id" }).select("*").single();
    if (result.error) throw new InquiryPersistenceError("Save inquiry record metadata failed.", { cause: result.error });
    return mapRecordOverlay(result.data as Row<"inquiry_record_overlays">);
  }
}

let injectedRepository: InquiryRepository | null = null;
let localRepository: InMemoryInquiryRepository | null = null;

/** Inject only in focused tests or a local harness. */
export function setInquiryRepositoryForTests(repository: InquiryRepository | null): () => void {
  const previous = injectedRepository;
  injectedRepository = repository;
  return () => { injectedRepository = previous; };
}

export function createInMemoryInquiryRepository(): InMemoryInquiryRepository {
  return new InMemoryInquiryRepository();
}

export function getInquiryRepository(): InquiryRepository {
  if (injectedRepository) return injectedRepository;
  const db = getSupabase();
  if (db) return new PostgresInquiryRepository(db);
  if (process.env.NODE_ENV !== "production" && process.env.INQUIRY_WORKSPACE_LOCAL === "1") {
    localRepository ??= new InMemoryInquiryRepository();
    return localRepository;
  }
  throw new InquiryPersistenceError("The inquiry workspace durable store is unavailable.");
}

export const __private = { redactText, stable, digest, tokenHash, validateState, safeReceipt, durableState };

/**
 * Thin RPC layer over supabase/migrations/20261007120000_needs_you.sql. Every
 * call goes through a service-role function; the actor-facing ones recheck
 * the actor in SQL. This file shapes arguments and maps database errors.
 */
import { STRELVA_HANDLED_LABEL } from "@/platform/presentation/place-labels";
import { businessRecordRevisionSchema } from "@/platform/business-record/contracts";
import { projectRecordActors } from "./record-attribution";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  changeKindSchema,
  ladderRouteSchema,
  ownerDecisionSchema,
  policyLayerSchema,
  type Decision,
  type LadderRoute,
  type OwnerDecision,
  type PolicyLayer,
  type PolicySetting,
  type ProposedItem,
} from "./contracts";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { parseServiceSession, startMakeRealLinkSession, startOwnerDecisionLinkSession, authorizeOwnerDecisionLinkRun, type ServiceSession } from "./service-actor";

type DbError = { message?: string; code?: string } | null;
export type NeedsYouDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }> };

let override: NeedsYouDb | null = null;
export function setNeedsYouDb(client: NeedsYouDb | null): void {
  override = client;
}
function db(): NeedsYouDb {
  if (override) return override;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Needs you storage is unavailable.");
  return client as unknown as NeedsYouDb;
}

export class NeedsYouRefusedError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "NeedsYouRefusedError";
  }
}

const REFUSALS: Record<string, string> = {
  decision_policy_below_floor: "That setting is below what Strelva allows for this kind of change.",
  decision_policy_looser_than_default: "You can loosen this only back to Strelva's default.",
  decision_policy_invalid: "That is not a valid setting.",
  owner_decision_owner_only: "Only the owner can decide this.",
  owner_decision_sign_in_required: "Sign in to decide this.",
  owner_decision_recipient_not_owner: "This link isn't for this account.",
  owner_decision_permission_denied: "You can't decide this.",
  owner_decision_not_open: "This is no longer open.",
  owner_decision_not_claimed: "This decision has no recorded outcome to finish.",
  owner_decision_invalid: "That item is not valid.",
};
const ACCESS = ["decision_policy_access_denied", "owner_decision_access_denied", "owner_decision_not_found"];

function mapError(error: DbError, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (ACCESS.some(code => detail.includes(code))) throw new WorkspaceAccessError();
  if (detail.includes("decision_policy_version_conflict")) throw new WorkspaceConflictError("The setting changed since it was read. Reload and try again.");
  for (const [code, message] of Object.entries(REFUSALS)) if (detail.includes(code)) throw new NeedsYouRefusedError(code, message);
  throw new WorkspaceStoreError(fallback);
}

async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) mapError(error, fallback);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
  return parsed.data;
}

function actorArgs(actor: WorkspaceActor) {
  return { p_user_id: z.string().uuid().parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()) };
}

const recipientSchema = z.object({ email: z.string(), from: z.string(), tenantId: z.string().nullable().optional(), trusted: z.boolean().optional() }).passthrough();
export type DeliveryRow = OwnerDecision & { businessName: string; timezone: string; recipient: z.infer<typeof recipientSchema> | null };
const deliveryRowSchema = ownerDecisionSchema.extend({ businessName: z.string(), timezone: z.string(), recipient: recipientSchema.nullable() });
const inquiryNoticeClaimSchema = z.object({ acquired: z.boolean(), status: z.enum(["sending", "accepted", "delivered", "deferred", "bounced", "failed", "suppressed", "unknown"]) });
export type InquiryNoticeClaim = z.infer<typeof inquiryNoticeClaimSchema>;

const claimSchema = z.object({ status: z.enum(["claimed", "already_handled", "changed", "expired"]), item: ownerDecisionSchema });
export type ClaimResult = z.infer<typeof claimSchema>;

const policyRowSchema = z.object({
  systemId: z.string().uuid().nullable(),
  kind: changeKindSchema,
  layer: policyLayerSchema,
  route: ladderRouteSchema,
});
const policyStateSchema = z.object({ kind: changeKindSchema, route: ladderRouteSchema, strelvaRoute: ladderRouteSchema, ownerRoute: ladderRouteSchema.nullable(), floor: ladderRouteSchema, default: ladderRouteSchema, strelvaVersion: z.number(), ownerVersion: z.number() }).passthrough();
export type PolicyState = z.infer<typeof policyStateSchema>;

/** The store the service depends on. Tests supply an in-memory one. */
export interface NeedsYouStore {
  open(workspaceId: string, item: ProposedItem): Promise<OwnerDecision>;
  withdraw(workspaceId: string, itemId: string, reason: string): Promise<OwnerDecision>;
  read(workspaceId: string, itemId: string): Promise<OwnerDecision | null>;
  list(actor: WorkspaceActor, workspaceId: string, includeClosed: boolean): Promise<OwnerDecision[]>;
  claim(input: { workspaceId: string; itemId: string; revision: string; decision: Decision; by: "owner_link" | "session" | "operator"; actor?: WorkspaceActor; recipient?: string }): Promise<ClaimResult>;
  expire(workspaceId: string, itemId: string): Promise<OwnerDecision>;
  finish(workspaceId: string, itemId: string, outcome: "done" | "done_unverified" | "failed", reason: string | null, receiptRef: string | null): Promise<OwnerDecision>;
  recordDelivery(workspaceId: string, itemId: string, kind: "urgent" | "digest" | "reminder_1" | "reminder_2", status: "sent" | "suppressed" | "bounced" | "failed", recipient: string | null, providerMessageId: string | null, reason: string | null): Promise<OwnerDecision>;
  dueForDelivery(limit: number): Promise<DeliveryRow[]>;
  /** Exact urgent source; avoids unrelated businesses or the cron's page cap. */
  deliveryForSource?(workspaceId: string, lifecycle: string, sourceId: string): Promise<DeliveryRow | null>;
  /** One durable inquiry urgent-send purpose. Ambiguous sends never reopen. */
  claimInquiryNotice?(row: DeliveryRow, recipient: string, subject: string): Promise<InquiryNoticeClaim>;
  finishInquiryNotice?(row: DeliveryRow, status: "accepted" | "suppressed" | "unknown", providerMessageId: string | null, acceptedAt: string | null, reason: string | null): Promise<void>;
  linkedTenants(workspaceId: string | null): Promise<{ workspaceId: string; tenantId: string }[]>;
  ownerActor(workspaceId: string, recipient: string): Promise<WorkspaceActor | null>;
  /**
   * Strelva (system) for the hourly cron: a logged `needs_you_sync` session
   * for one business Strelva runs, or null. Read and open only.
   */
  serviceSession?(workspaceId: string): Promise<ServiceSession | null>;
  /** Open an item under that session; it is marked and logged as opened by Strelva (system). */
  openAsService?(workspaceId: string, sessionId: string, item: ProposedItem): Promise<OwnerDecision>;
  /**
   * Strelva (system) for one Make real decision an owner with no account
   * decides by signed link: a `make_real_link` session bound in SQL to that
   * open item and the owner recipient, or null (20261009131000). Null while
   * the business's `make_real_owner_link` release flag is off (20261009140000).
   */
  linkSession?(workspaceId: string, itemId: string, recipient: string): Promise<ServiceSession | null>;
  ownerLinkSession?(workspaceId: string, itemId: string, revision: string, recipient: string, decision?: Decision): Promise<ServiceSession | null>;
  authorizeOwnerLinkRun?(session: ServiceSession): Promise<void>;
  policies(actor: WorkspaceActor, workspaceId: string): Promise<PolicySetting[]>;
  setPolicy(actor: WorkspaceActor, input: { workspaceId: string; layer: PolicyLayer; systemId: string | null; kind: string; route: LadderRoute | null; reason: string | null; expectedVersion: number }): Promise<PolicyState>;
  handled(actor: WorkspaceActor, workspaceId: string, since: string | null): Promise<Record<string, unknown>[]>;
}

export const PostgresNeedsYouStore: NeedsYouStore = {
  open: (workspaceId, item) => call("open_owner_decision", { p_workspace_id: workspaceId, p_item: item }, ownerDecisionSchema, "The Needs you item could not be opened."),
  withdraw: (workspaceId, itemId, reason) => call("withdraw_owner_decision", { p_workspace_id: workspaceId, p_decision_id: itemId, p_reason: reason }, ownerDecisionSchema, "The item could not be withdrawn."),
  read: (workspaceId, itemId) => call("read_owner_decision", { p_workspace_id: workspaceId, p_decision_id: itemId }, ownerDecisionSchema.nullable(), "The item could not be read."),
  list: (actor, workspaceId, includeClosed) => call("list_owner_decisions", { p_workspace_id: workspaceId, ...actorArgs(actor), p_include_closed: includeClosed }, z.array(ownerDecisionSchema), "Needs you could not be loaded."),
  claim: (input) => call("claim_owner_decision", {
    p_workspace_id: input.workspaceId, p_decision_id: input.itemId, p_revision_hash: input.revision, p_decision: input.decision, p_by_kind: input.by,
    p_user_id: input.actor?.userId ?? null, p_verified_email: input.actor?.verifiedEmail ?? null, p_recipient: input.recipient ?? null,
  }, claimSchema, "The decision could not be recorded."),
  expire: (workspaceId, itemId) => call("expire_owner_decision", { p_workspace_id: workspaceId, p_decision_id: itemId }, ownerDecisionSchema, "The item could not lapse."),
  finish: (workspaceId, itemId, outcome, reason, receiptRef) => call("finish_owner_decision", { p_workspace_id: workspaceId, p_decision_id: itemId, p_outcome: outcome, p_reason: reason, p_receipt_ref: receiptRef }, ownerDecisionSchema, "The outcome could not be recorded."),
  recordDelivery: (workspaceId, itemId, kind, status, recipient, providerMessageId, reason) => call("record_owner_decision_delivery", {
    p_workspace_id: workspaceId, p_decision_id: itemId, p_kind: kind, p_status: status, p_recipient: recipient, p_provider_message_id: providerMessageId, p_reason: reason,
  }, ownerDecisionSchema, "The delivery could not be recorded."),
  dueForDelivery: (limit) => call("list_open_owner_decisions_for_delivery", { p_limit: limit }, z.array(deliveryRowSchema), "Open decisions could not be listed."),
  deliveryForSource: (workspaceId, lifecycle, sourceId) => call("read_owner_decision_source_for_delivery", { p_workspace_id: workspaceId, p_lifecycle: lifecycle, p_source_id: sourceId }, deliveryRowSchema.nullable(), "The urgent decision could not be read."),
  claimInquiryNotice: (row, recipient, subject) => call("claim_inquiry_decision_notice_v2", { p_workspace_id: row.workspaceId, p_decision_id: row.id, p_revision: row.revisionHash, p_recipient: recipient, p_subject: subject }, inquiryNoticeClaimSchema, "The inquiry email could not be claimed."),
  finishInquiryNotice: async (row, status, providerMessageId, acceptedAt, reason) => {
    await call("finish_inquiry_decision_notice", { p_workspace_id: row.workspaceId, p_decision_id: row.id, p_status: status, p_provider_message_id: providerMessageId, p_accepted_at: acceptedAt, p_reason: reason }, z.boolean(), "The inquiry email receipt could not be recorded.");
  },
  linkedTenants: (workspaceId) => call("needs_you_linked_tenants", { p_workspace_id: workspaceId }, z.array(z.object({ workspaceId: z.string().uuid(), tenantId: z.string() })), "Linked sites could not be read."),
  ownerActor: (workspaceId, recipient) => call("needs_you_owner_actor", { p_workspace_id: workspaceId, p_recipient: recipient }, z.object({ userId: z.string().uuid(), verifiedEmail: z.string() }).nullable(), "The owner could not be confirmed."),
  serviceSession: async (workspaceId) => parseServiceSession(await call("strelva_service_reader", { p_workspace_id: workspaceId, p_purpose: "needs_you_sync" }, z.unknown(), "Strelva's service session could not start.")),
  openAsService: (workspaceId, sessionId, item) => call("open_owner_decision_as_service", { p_workspace_id: workspaceId, p_session_id: sessionId, p_item: item }, ownerDecisionSchema, "The Needs you item could not be opened."),
  // Off by default, per business: no session is asked for, so the link answers "Sign in".
  linkSession: async (workspaceId, itemId, recipient) =>
    (await workspaceReleaseFlagEnabled("make_real_owner_link", workspaceId))
      ? startMakeRealLinkSession(workspaceId, itemId, recipient)
      : null,
  ownerLinkSession: async (workspaceId, itemId, revision, recipient, decision = "approve") =>
    (await workspaceReleaseFlagEnabled("owner_decision_links", workspaceId))
      ? startOwnerDecisionLinkSession(workspaceId, itemId, revision, recipient, decision)
      : null,
  authorizeOwnerLinkRun: async (session) => {
    if (!(await workspaceReleaseFlagEnabled("owner_decision_links", session.workspaceId))) throw new WorkspaceAccessError();
    await authorizeOwnerDecisionLinkRun(session);
  },
  policies: async (actor, workspaceId) => (await call("read_decision_policies", { p_workspace_id: workspaceId, ...actorArgs(actor) }, z.object({ settings: z.array(policyRowSchema.passthrough()) }).passthrough(), "The policy could not be read."))
    .settings.flatMap(row => row.kind === "suggestion" || row.kind === "health.owner_action" ? [] : [{ layer: row.layer, systemId: row.systemId, kind: row.kind, route: row.route } as PolicySetting]),
  setPolicy: (actor, input) => call("set_decision_policy", {
    p_workspace_id: input.workspaceId, ...actorArgs(actor), p_layer: input.layer, p_system_id: input.systemId, p_kind: input.kind,
    p_route: input.route, p_reason: input.reason, p_expected_version: input.expectedVersion,
  }, policyStateSchema, "The setting could not be saved."),
  handled: async (actor, workspaceId, since) => {
    const args = { p_workspace_id: workspaceId, ...actorArgs(actor) };
    const fallback = `${STRELVA_HANDLED_LABEL} could not be loaded.`;
    const rows = await call("read_strelva_handled", { ...args, p_since: since }, z.array(z.record(z.string(), z.unknown())), fallback);
    // Existing RPC rechecks this actor's access; no privileged/current-name lookup.
    const history = await call("read_business_record_history", { ...args, p_limit: 200 }, z.array(businessRecordRevisionSchema.passthrough()), fallback);
    return projectRecordActors(rows, history, since);
  },
};

/** Latest open published-schema item; SQL scopes the active site to this business. */
export function readConnectedSiteSchemaDecision(workspaceId: string, siteId: string): Promise<OwnerDecision | null> {
  return call("read_connected_site_schema_conflict", { p_workspace_id: z.string().uuid().parse(workspaceId), p_site_id: z.string().uuid().parse(siteId) }, ownerDecisionSchema.nullable(), "The published schema decision could not be read.");
}

import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  appEventAgentReadSchema,
  appEventCaptureSchema,
  appEventDeliveriesViewSchema,
  appEventEndpointViewSchema,
  appEventHealthSchema,
  appEventSchema,
  appEventTypeSchema,
  type AppEvent,
  type AppEventAgentRead,
  type AppEventCapture,
  type AppEventDeliveriesView,
  type AppEventEndpointView,
  type AppEventHealth,
  type AppEventType,
} from "./contracts";

type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
let override: Rpc | null = null;
/** Test seam. */
export function setAppEventsDb(value: Rpc | null): void { override = value; }

const UNREADABLE = "Events could not be read. Nothing changed.";

function db(): Rpc {
  if (override) return override;
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError(UNREADABLE);
  return client as unknown as Rpc;
}

async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    const detail = `${error.code ?? ""} ${error.message ?? ""}`;
    if (detail.includes("workspace_access_denied") || detail.includes("workspace_release_operator_required") || detail.includes("workspace_release_workspace_invalid")) {
      throw new WorkspaceAccessError();
    }
    if (detail.includes("app_event_area_not_granted")) throw new WorkspaceAccessError("Your agency's access to this client doesn't cover those events.");
    if (detail.includes("app_event_endpoint_limit")) throw new WorkspaceConflictError("This client already has 5 webhooks. Turn one off first.");
    if (detail.includes("app_event_endpoint_disabled")) throw new WorkspaceConflictError("A turned-off webhook can't be turned back on. Add a new one.");
    if (detail.includes("app_event_already_delivered")) throw new WorkspaceConflictError("This event was already delivered.");
    if (detail.includes("app_event_endpoint_invalid")) throw new WorkspaceConflictError("Check the address and the events.");
    throw new WorkspaceStoreError(UNREADABLE);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new WorkspaceStoreError(UNREADABLE);
  return parsed.data;
}

const anything = z.unknown();
const count = z.number().int().min(0);

// ---- Dispatcher side (service role, called by the cron) ----

export const claimedEventSchema = appEventSchema.extend({ allowed: z.boolean() }).strict();
export type ClaimedEvent = AppEvent & { allowed: boolean };

export const claimedLaneSchema = z.object({
  subscriber: z.string(),
  workspaceId: z.string().uuid(),
  leaseToken: z.string().uuid(),
  attempts: count,
  deliveredThrough: count,
  events: z.array(claimedEventSchema),
}).strict();
export type ClaimedLane = z.infer<typeof claimedLaneSchema>;
/** What a lane needs to be settled: who, where and which lease. */
export type LaneRef = Pick<ClaimedLane, "subscriber" | "workspaceId" | "leaseToken">;

export const webhookEndpointTargetSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  url: z.string(),
  eventTypes: z.array(appEventTypeSchema),
  secretCiphertext: z.string(),
  createdByKind: z.enum(["business", "agency"]),
  agencyWorkspaceId: z.string().uuid().nullable(),
}).strict();
export type WebhookEndpointTarget = z.infer<typeof webhookEndpointTargetSchema>;

export const claimedReplaySchema = z.object({
  id: z.string().uuid(),
  subscriber: z.string(),
  workspaceId: z.string().uuid(),
  leaseToken: z.string().uuid(),
  event: appEventSchema.extend({ id: z.string().uuid().nullable() }).strict(),
  allowed: z.boolean(),
}).strict();
export type ClaimedReplay = z.infer<typeof claimedReplaySchema>;

export const purgeResultSchema = z.object({ events: count, deadLetters: count, failures: count }).strict();
export type PurgeResult = z.infer<typeof purgeResultSchema>;

export type FailOutcome = "lost" | "dead" | "retry";

export const recentWorkspaces = (limit: number) =>
  call("app_event_recent_workspaces", { p_limit: limit }, z.array(z.string().uuid()));

export const ensureCursors = (pairs: readonly { subscriber: string; workspaceId: string }[]) =>
  call("app_event_ensure_cursors", { p_pairs: pairs }, count);

export const activeWebhookEndpoints = (limit: number) =>
  call("app_event_active_webhook_endpoints", { p_limit: limit }, z.array(webhookEndpointTargetSchema));

export const claimLanes = (input: { subscribers: readonly string[]; limit: number; leaseSeconds: number; batch: number }) =>
  call("app_event_claim_lanes", { p_subscribers: input.subscribers, p_limit: input.limit, p_lease_seconds: input.leaseSeconds, p_batch: input.batch }, z.array(claimedLaneSchema));

export const ackLane = (lane: LaneRef, through: number) =>
  call("app_event_ack", { p_subscriber: lane.subscriber, p_workspace_id: lane.workspaceId, p_lease_token: lane.leaseToken, p_through: through }, z.boolean());

export const failLane = (lane: LaneRef, eventId: string, input: { error: string; permanent: boolean; maxAttempts: number; backoffSeconds: number }) =>
  call("app_event_fail", {
    p_subscriber: lane.subscriber, p_workspace_id: lane.workspaceId, p_lease_token: lane.leaseToken, p_event_id: eventId,
    p_error: input.error, p_permanent: input.permanent, p_max_attempts: input.maxAttempts, p_backoff_seconds: input.backoffSeconds,
  }, z.enum(["lost", "dead", "retry"]));

export const releaseLane = async (lane: LaneRef): Promise<void> => {
  await call("app_event_release", { p_subscriber: lane.subscriber, p_workspace_id: lane.workspaceId, p_lease_token: lane.leaseToken }, anything);
};

export const skipLane = (lane: LaneRef) =>
  call("app_event_skip", { p_subscriber: lane.subscriber, p_workspace_id: lane.workspaceId, p_lease_token: lane.leaseToken }, count);

export const disableEndpoint = async (endpointId: string, reason: "gone" | "authority_removed"): Promise<void> => {
  await call("app_event_disable_endpoint", { p_endpoint_id: endpointId, p_reason: reason }, anything);
};

export const claimReplays = (limit: number, leaseSeconds: number) =>
  call("app_event_claim_replays", { p_limit: limit, p_lease_seconds: leaseSeconds }, z.array(claimedReplaySchema));

export const finishReplay = async (deadLetterId: string, leaseToken: string, ok: boolean, error: string | null): Promise<void> => {
  await call("app_event_finish_replay", { p_dead_letter_id: deadLetterId, p_lease_token: leaseToken, p_ok: ok, p_error: error }, anything);
};

export const purgeAppEvents = (limit: number) => call("purge_app_events", { p_limit: limit }, purgeResultSchema);

export const readAppEventHealth = (): Promise<AppEventHealth> => call("app_event_health", {}, appEventHealthSchema);

export const readCapture = (): Promise<AppEventCapture> => call("read_app_event_capture", {}, appEventCaptureSchema);

export const setCapture = (operatorEmail: string, capture: boolean, reason: string): Promise<AppEventCapture> =>
  call("set_app_event_capture", { p_operator_email: operatorEmail, p_capture: capture, p_reason: reason }, appEventCaptureSchema);

// ---- People side ----

export interface AppEventScopeInput { workspaceId: string; agencyWorkspaceId?: string | null }

const identity = (actor: WorkspaceActor, scope: AppEventScopeInput) => ({
  p_user_id: actor.userId,
  p_verified_email: actor.verifiedEmail,
  p_workspace_id: scope.workspaceId,
  p_agency_id: scope.agencyWorkspaceId ?? null,
});

export const readDeliveries = (actor: WorkspaceActor, scope: AppEventScopeInput): Promise<AppEventDeliveriesView> =>
  call("read_app_event_deliveries", identity(actor, scope), appEventDeliveriesViewSchema);

export const readOperatorDeliveries = (operatorEmail: string, workspaceId: string): Promise<AppEventDeliveriesView> =>
  call("read_operator_app_event_deliveries", { p_operator_email: operatorEmail, p_workspace_id: workspaceId }, appEventDeliveriesViewSchema);

export const retryDeadLetter = (actor: WorkspaceActor, scope: AppEventScopeInput, deadLetterId: string): Promise<AppEventDeliveriesView> =>
  call("retry_app_event_dead_letter", { ...identity(actor, scope), p_dead_letter_id: deadLetterId }, appEventDeliveriesViewSchema);

export const operatorRetryDeadLetter = (operatorEmail: string, deadLetterId: string): Promise<AppEventDeliveriesView> =>
  call("operator_retry_app_event_dead_letter", { p_operator_email: operatorEmail, p_dead_letter_id: deadLetterId }, appEventDeliveriesViewSchema);

export const createWebhookEndpoint = (
  actor: WorkspaceActor,
  scope: AppEventScopeInput,
  input: { url: string; eventTypes: readonly AppEventType[]; secretCiphertext: string; secretHint: string },
): Promise<AppEventEndpointView> =>
  call("create_app_event_webhook_endpoint", {
    ...identity(actor, scope), p_url: input.url, p_event_types: input.eventTypes, p_secret_ciphertext: input.secretCiphertext, p_secret_hint: input.secretHint,
  }, appEventEndpointViewSchema);

/** status null with a new secret rotates it. */
export const setWebhookEndpoint = (
  actor: WorkspaceActor,
  scope: AppEventScopeInput,
  input: { endpointId: string; status: "active" | "paused" | "disabled" | null; secretCiphertext?: string; secretHint?: string },
): Promise<AppEventEndpointView> =>
  call("set_app_event_webhook_endpoint", {
    ...identity(actor, scope), p_endpoint_id: input.endpointId, p_status: input.status,
    p_secret_ciphertext: input.secretCiphertext ?? null, p_secret_hint: input.secretHint ?? null,
  }, appEventEndpointViewSchema);

// ---- Coding agents ----

export const agentReadAppEvents = (input: { tokenHash: string; resource: string; workspaceId: string; after: number; types: readonly AppEventType[] | null; limit: number }): Promise<AppEventAgentRead> =>
  call("agent_read_app_events", {
    p_token_hash: input.tokenHash, p_resource: input.resource, p_workspace_id: input.workspaceId, p_after: input.after, p_types: input.types, p_limit: input.limit,
  }, appEventAgentReadSchema);

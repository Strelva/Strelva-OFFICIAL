/**
 * The policy settings store: read_decision_policies and set_decision_policy
 * for the owner and operator screens, and the operator-only reads. The pure
 * model (view, plans, words) is policy-model.ts and is re-exported here.
 */
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { changeKindSchema, isConfigurableKind, ladderRouteSchema, policyLayerSchema } from "./contracts";
import { REFUSAL_WORDS, type PlanRefusal, type PlannedWrite, type PolicyRows } from "./policy-model";

export * from "./policy-model";

// Store ---------------------------------------------------------------------------

const storedRowSchema = z.object({
  systemId: z.string().uuid().nullable(),
  kind: changeKindSchema,
  layer: policyLayerSchema,
  route: ladderRouteSchema,
  reason: z.string(),
  version: z.number(),
  updatedAt: z.string().nullable().optional(),
}).passthrough();
const historyRowSchema = z.object({
  id: z.string().uuid(),
  systemId: z.string().uuid().nullable(),
  kind: z.string(),
  layer: policyLayerSchema,
  oldRoute: ladderRouteSchema.nullable(),
  newRoute: ladderRouteSchema.nullable(),
  reason: z.string(),
  version: z.number(),
  at: z.string(),
}).passthrough();
const policyRowsSchema = z.object({ settings: z.array(storedRowSchema), history: z.array(historyRowSchema) }).passthrough();

export const notToldRowSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  businessName: z.string(),
  kind: z.string(),
  title: z.string(),
  state: z.string(),
  deliveryState: z.string(),
  openedAt: z.string(),
  expiresAt: z.string(),
  decidedAt: z.string().nullable(),
  recipientKnown: z.boolean(),
  lastDelivery: z.object({ kind: z.string(), status: z.string(), reason: z.string().nullable(), at: z.string() }).nullable(),
}).passthrough();
export type NotToldRow = z.infer<typeof notToldRowSchema>;

export const policyBusinessSchema = z.object({ id: z.string().uuid(), name: z.string(), strelvaRows: z.number(), ownerRows: z.number() });
export type PolicyBusiness = z.infer<typeof policyBusinessSchema>;

export interface PolicySettingsStore {
  read(actor: WorkspaceActor, workspaceId: string): Promise<PolicyRows>;
  write(actor: WorkspaceActor, workspaceId: string, write: Extract<PlannedWrite, { ok: true }>["write"]): Promise<void>;
  notTold(actor: WorkspaceActor, limit: number): Promise<NotToldRow[]>;
  businesses(actor: WorkspaceActor): Promise<PolicyBusiness[]>;
}

type DbError = { message?: string; code?: string } | null;
type Db = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }> };

export class PolicySettingRefusedError extends Error {
  constructor(readonly code: PlanRefusal, message = REFUSAL_WORDS[code]) {
    super(message);
    this.name = "PolicySettingRefusedError";
  }
}

function failure(error: DbError, fallback: string): never {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (/decision_policy_access_denied|owner_decision_access_denied/.test(detail)) throw new WorkspaceAccessError();
  if (detail.includes("decision_policy_version_conflict")) throw new WorkspaceConflictError(REFUSAL_WORDS.stale);
  if (detail.includes("decision_policy_below_floor")) throw new PolicySettingRefusedError("below_floor");
  if (detail.includes("decision_policy_looser_than_default")) throw new PolicySettingRefusedError("looser_than_default");
  if (detail.includes("decision_policy_invalid")) throw new PolicySettingRefusedError("unknown_route");
  throw new WorkspaceStoreError(fallback);
}

export function createPostgresPolicySettingsStore(db: () => Db | null = () => getSupabase() as unknown as Db | null): PolicySettingsStore {
  async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>, fallback: string): Promise<T> {
    const client = db();
    if (!client) throw new WorkspaceStoreError("Policy settings storage is unavailable.");
    const { data, error } = await client.rpc(name, args);
    if (error) failure(error, fallback);
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new WorkspaceStoreError(`${fallback} The response was malformed.`);
    return parsed.data;
  }
  const actorArgs = (actor: WorkspaceActor) => ({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() });
  return {
    async read(actor, workspaceId) {
      const rows = await call("read_decision_policies", { p_workspace_id: workspaceId, ...actorArgs(actor) }, policyRowsSchema, "The settings could not be read.");
      return {
        settings: rows.settings.flatMap(row => isConfigurableKind(row.kind)
          ? [{ layer: row.layer, systemId: row.systemId, kind: row.kind, route: row.route, version: row.version, reason: row.reason, updatedAt: row.updatedAt ?? null }]
          : []),
        history: rows.history.map(row => ({ id: row.id, systemId: row.systemId, kind: row.kind, layer: row.layer, oldRoute: row.oldRoute, newRoute: row.newRoute, reason: row.reason, version: row.version, at: row.at })),
      };
    },
    async write(actor, workspaceId, write) {
      await call("set_decision_policy", {
        p_workspace_id: workspaceId, ...actorArgs(actor), p_layer: write.layer, p_system_id: write.systemId, p_kind: write.kind,
        p_route: write.route, p_reason: write.reason, p_expected_version: write.expectedVersion,
      }, z.unknown(), "The setting could not be saved.");
    },
    notTold: (actor, limit) => call("list_owner_decisions_not_told", { ...actorArgs(actor), p_limit: limit }, z.array(notToldRowSchema), "The owner-not-told list could not be read."),
    businesses: (actor) => call("list_decision_policy_businesses", actorArgs(actor), z.array(policyBusinessSchema), "Businesses could not be listed."),
  };
}

export const PostgresPolicySettingsStore = createPostgresPolicySettingsStore();

/** Read, plan and write one change, refusing before SQL when the plan refuses. */
export async function applyPolicyChange(
  store: PolicySettingsStore,
  actor: WorkspaceActor,
  workspaceId: string,
  plan: (rows: PolicyRows) => PlannedWrite,
): Promise<PolicyRows> {
  const rows = await store.read(actor, workspaceId);
  const planned = plan(rows);
  if (!planned.ok) throw new PolicySettingRefusedError(planned.reason);
  await store.write(actor, workspaceId, planned.write);
  return store.read(actor, workspaceId);
}

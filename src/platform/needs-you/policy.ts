/**
 * Who decides, as settings (needs-you spec sections 3.3, 3.16 and 7).
 *
 * - `buildPolicyView` turns stored rows and their history into what the owner
 *   and the operator screens show for each kind: the route in force, Strelva's
 *   setting, the floor, the owner's own setting, and what can be chosen.
 * - `planOwnerChange` and `planStrelvaChange` turn a request ("make it
 *   stricter", "back to default", "undo my last change") into exactly one
 *   set_decision_policy call, or a refusal. They mirror the SQL rules and run
 *   before any write; the SQL checks again.
 *
 * Pure. The store port and its Postgres adapter sit at the bottom.
 */
import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  KIND_RULES,
  LADDER_ROUTES,
  changeKindSchema,
  isConfigurableKind,
  ladderRouteSchema,
  policyLayerSchema,
  routeRank,
  stricterOf,
  type ConfigurableKind,
  type LadderRoute,
  type PolicyLayer,
  type PolicySetting,
} from "./contracts";
import { ownerRoute, strelvaRoute, validatePolicyChange } from "./evaluator";

// Plain words ---------------------------------------------------------------------

export const ROUTE_WORDS: Record<LadderRoute, { label: string; detail: string }> = {
  handle: { label: "Strelva handles it", detail: "Strelva does it and tells you after." },
  handle_after_notice: { label: "Strelva handles it after notice", detail: "Strelva waits a while so you can stop it, then does it." },
  strelva_reviews: { label: "Strelva reviews it", detail: "A Strelva person checks it before it happens." },
  owner_decides: { label: "You decide", detail: "Nothing happens until you say yes." },
};

/** The kinds the settings screens list, in the order an owner thinks about them. */
export const POLICY_KIND_ORDER: readonly ConfigurableKind[] = [
  "review.reply", "review.reply_critical", "google.post", "google.photo",
  "copy.routine", "copy.marketing", "structure", "fact.owner_stated", "fact.inferred",
  "customer.message", "customer.commitment", "customer.broadcast",
  "system.go_live", "system.change_live", "system.pause",
  "running.approve", "request.scope", "access.grant", "money", "exit",
  "health.fix", "verify.failed",
];

export const KIND_WORDS: Record<ConfigurableKind, { label: string; example: string }> = {
  "review.reply": { label: "Replies to good reviews", example: "Answering a 4 or 5 star Google review" },
  "review.reply_critical": { label: "Replies to bad reviews", example: "Answering a 1 or 2 star Google review" },
  "google.post": { label: "Google posts", example: "A post on your Google listing" },
  "google.photo": { label: "Google photos", example: "A photo on your Google listing" },
  "copy.routine": { label: "Routine website edits", example: "Fixing a typo or refreshing event text" },
  "copy.marketing": { label: "New website copy", example: "A new headline or services description" },
  structure: { label: "Website structure", example: "A new page, navigation or theme" },
  "fact.owner_stated": { label: "Details you gave us", example: "New hours you emailed, pushed to your site and Google" },
  "fact.inferred": { label: "Details Strelva found", example: "A price read off an old page" },
  "customer.message": { label: "Replies to customers", example: "Answering a new inquiry" },
  "customer.commitment": { label: "Promises to customers", example: "Quoting a price or promising a date" },
  "customer.broadcast": { label: "Newsletters", example: "An email to your whole list" },
  "system.go_live": { label: "Putting something live", example: "Launching a new page or booking flow" },
  "system.change_live": { label: "Changing something live", example: "Releasing an update to a live booking page" },
  "system.pause": { label: "Pausing something", example: "Taking a booking page offline" },
  "running.approve": { label: "Ongoing work", example: "Strelva keeping your Google hours in sync" },
  "request.scope": { label: "Agreeing work", example: "Scope and deadline for a request" },
  "access.grant": { label: "Access", example: "Letting an agency or person in" },
  money: { label: "Money", example: "Accepting a job or changing who pays" },
  exit: { label: "Leaving or exporting", example: "Taking your business out of Strelva" },
  "health.fix": { label: "Fixes", example: "Retrying a failed check" },
  "verify.failed": { label: "Unconfirmed changes", example: "Google accepted a change Strelva couldn't read back" },
};

/** Kinds whose route no setting moves (the evaluator's fixed rules). Shown, never offered. */
export const FIXED_KINDS: ReadonlySet<ConfigurableKind> = new Set(["fact.inferred", "access.grant", "money", "exit"]);

// Rows ------------------------------------------------------------------------

export interface StoredPolicyRow extends PolicySetting {
  version: number;
  reason: string;
  updatedAt: string | null;
}

export interface PolicyHistoryRow {
  id: string;
  systemId: string | null;
  kind: string;
  layer: PolicyLayer;
  oldRoute: LadderRoute | null;
  newRoute: LadderRoute | null;
  reason: string;
  version: number;
  at: string;
}

export interface PolicyRows {
  settings: StoredPolicyRow[];
  history: PolicyHistoryRow[];
}

// The view ----------------------------------------------------------------------

export interface PolicyKindView {
  kind: ConfigurableKind;
  systemId: string | null;
  label: string;
  example: string;
  /** The route in force for a change Strelva starts. */
  route: LadderRoute;
  strelvaRoute: LadderRoute;
  /** True when Strelva's route is its code default, not a stored setting. */
  strelvaIsDefault: boolean;
  floor: LadderRoute;
  ownerRoute: LadderRoute | null;
  ownerVersion: number;
  strelvaVersion: number;
  fixed: boolean;
  /** Routes the owner may choose: Strelva's route and anything stricter. */
  ownerChoices: LadderRoute[];
  /** Routes Strelva may set: the floor and anything stricter. */
  strelvaChoices: LadderRoute[];
  /** The owner's last change on this row, when one-tap undo can put it back. */
  ownerUndo: { historyId: string; to: LadderRoute | null; at: string } | null;
}

export interface PolicyView {
  kinds: PolicyKindView[];
  /** Per-System owner or Strelva rows, shown so nothing set is hidden. */
  systemRows: StoredPolicyRow[];
  history: PolicyHistoryRow[];
}

function routesFrom(min: LadderRoute): LadderRoute[] {
  return LADDER_ROUTES.filter(route => routeRank(route) >= routeRank(min));
}

function versionOf(settings: readonly StoredPolicyRow[], layer: PolicyLayer, kind: ConfigurableKind, systemId: string | null): number {
  return settings.find(row => row.layer === layer && row.kind === kind && row.systemId === systemId)?.version ?? 0;
}

/** The latest owner-layer history entry for one row, if undoing it is still allowed. */
function ownerUndo(rows: PolicyRows, kind: ConfigurableKind, systemId: string | null, strelva: LadderRoute): PolicyKindView["ownerUndo"] {
  const last = rows.history
    .filter(entry => entry.layer === "owner" && entry.kind === kind && entry.systemId === systemId)
    .sort((a, b) => b.version - a.version || Date.parse(b.at) - Date.parse(a.at))[0];
  if (!last) return null;
  // The row must still be what that change left, or undo would act on a newer state.
  const current = rows.settings.find(row => row.layer === "owner" && row.kind === kind && row.systemId === systemId) ?? null;
  if ((current?.route ?? null) !== last.newRoute || (current?.version ?? last.version) !== last.version) return null;
  const to = last.oldRoute;
  if (to && (routeRank(to) < routeRank(KIND_RULES[kind].floor) || routeRank(to) < routeRank(strelva))) return null;
  if (to === last.newRoute) return null;
  return { historyId: last.id, to, at: last.at };
}

export function buildPolicyView(rows: PolicyRows, systemId: string | null = null): PolicyView {
  const policies: PolicySetting[] = rows.settings.map(({ layer, systemId: rowSystem, kind, route }) => ({ layer, systemId: rowSystem, kind, route }));
  const kinds = POLICY_KIND_ORDER.map((kind): PolicyKindView => {
    const strelva = strelvaRoute(kind, systemId, policies);
    const floor = KIND_RULES[kind].floor;
    const base = stricterOf(strelva.route, floor);
    const owner = systemId
      ? policies.find(row => row.layer === "owner" && row.kind === kind && row.systemId === systemId)?.route ?? null
      : ownerRoute(kind, null, policies.filter(row => row.systemId === null));
    const effective = ownerRoute(kind, systemId, policies);
    const fixed = FIXED_KINDS.has(kind);
    const route = fixed ? "owner_decides" : effective ? stricterOf(base, effective) : base;
    return {
      kind,
      systemId,
      ...KIND_WORDS[kind],
      route,
      strelvaRoute: strelva.route,
      strelvaIsDefault: !strelva.fromSetting,
      floor,
      ownerRoute: owner,
      ownerVersion: versionOf(rows.settings, "owner", kind, systemId),
      strelvaVersion: versionOf(rows.settings, "strelva", kind, systemId),
      fixed,
      ownerChoices: fixed ? [] : routesFrom(base),
      strelvaChoices: fixed ? [] : routesFrom(floor),
      ownerUndo: fixed ? null : ownerUndo(rows, kind, systemId, base),
    };
  });
  return {
    kinds,
    systemRows: rows.settings.filter(row => row.systemId !== null),
    history: rows.history,
  };
}

// Changes -----------------------------------------------------------------------

export const ownerChangeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set"), kind: changeKindSchema, systemId: z.string().uuid().nullable(), route: ladderRouteSchema, expectedVersion: z.number().int().min(0) }).strict(),
  z.object({ action: z.literal("reset"), kind: changeKindSchema, systemId: z.string().uuid().nullable(), expectedVersion: z.number().int().min(0) }).strict(),
  z.object({ action: z.literal("undo"), kind: changeKindSchema, systemId: z.string().uuid().nullable(), historyId: z.string().uuid(), expectedVersion: z.number().int().min(0) }).strict(),
]);
export type OwnerChange = z.infer<typeof ownerChangeSchema>;

export const STRELVA_REASONS = ["strelva_default", "earned_trust", "seed", "inquiry_promote"] as const;
export const strelvaChangeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set"), kind: changeKindSchema, systemId: z.string().uuid().nullable(), route: ladderRouteSchema, reason: z.enum(STRELVA_REASONS), expectedVersion: z.number().int().min(0) }).strict(),
  z.object({ action: z.literal("reset"), kind: changeKindSchema, systemId: z.string().uuid().nullable(), reason: z.enum(STRELVA_REASONS), expectedVersion: z.number().int().min(0) }).strict(),
]);
export type StrelvaChange = z.infer<typeof strelvaChangeSchema>;

export type PlanRefusal = "fixed" | "not_configurable" | "below_floor" | "looser_than_default" | "unknown_route" | "nothing_to_undo" | "stale";

export type PlannedWrite = { ok: true; write: { layer: PolicyLayer; kind: ConfigurableKind; systemId: string | null; route: LadderRoute | null; reason: string | null; expectedVersion: number } } | { ok: false; reason: PlanRefusal };

export const REFUSAL_WORDS: Record<PlanRefusal, string> = {
  fixed: "This one is always yours to decide. No setting changes it.",
  not_configurable: "That kind of change has no setting.",
  below_floor: "That setting is below what Strelva allows for this kind of change.",
  looser_than_default: "You can loosen this only back to Strelva's default.",
  unknown_route: "That is not a valid setting.",
  nothing_to_undo: "There is no change of yours here to undo.",
  stale: "This setting changed since you opened it. Reload and try again.",
};

function policiesOf(rows: PolicyRows): PolicySetting[] {
  return rows.settings.map(({ layer, systemId, kind, route }) => ({ layer, systemId, kind, route }));
}

/** An owner request as one owner-layer write: only stricter, or back to Strelva's default. */
export function planOwnerChange(rows: PolicyRows, change: OwnerChange): PlannedWrite {
  if (!isConfigurableKind(change.kind)) return { ok: false, reason: "not_configurable" };
  const kind = change.kind;
  if (FIXED_KINDS.has(kind)) return { ok: false, reason: "fixed" };
  const current = versionOf(rows.settings, "owner", kind, change.systemId);
  if (current !== change.expectedVersion) return { ok: false, reason: "stale" };
  let route: LadderRoute | null;
  if (change.action === "set") route = change.route;
  else if (change.action === "reset") route = null;
  else {
    const view = buildPolicyView(rows, change.systemId).kinds.find(item => item.kind === kind);
    if (!view?.ownerUndo || view.ownerUndo.historyId !== change.historyId) return { ok: false, reason: "nothing_to_undo" };
    route = view.ownerUndo.to;
  }
  const valid = validatePolicyChange({ layer: "owner", kind, systemId: change.systemId, route, policies: policiesOf(rows) });
  if (!valid.ok) return { ok: false, reason: valid.reason };
  return { ok: true, write: { layer: "owner", kind, systemId: change.systemId, route, reason: null, expectedVersion: current } };
}

/** An operator request as one Strelva-layer write: never below the floor. */
export function planStrelvaChange(rows: PolicyRows, change: StrelvaChange): PlannedWrite {
  if (!isConfigurableKind(change.kind)) return { ok: false, reason: "not_configurable" };
  const kind = change.kind;
  if (FIXED_KINDS.has(kind)) return { ok: false, reason: "fixed" };
  const current = versionOf(rows.settings, "strelva", kind, change.systemId);
  if (current !== change.expectedVersion) return { ok: false, reason: "stale" };
  const route = change.action === "set" ? change.route : null;
  const valid = validatePolicyChange({ layer: "strelva", kind, systemId: change.systemId, route, policies: policiesOf(rows) });
  if (!valid.ok) return { ok: false, reason: valid.reason };
  return { ok: true, write: { layer: "strelva", kind, systemId: change.systemId, route, reason: change.reason, expectedVersion: current } };
}

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

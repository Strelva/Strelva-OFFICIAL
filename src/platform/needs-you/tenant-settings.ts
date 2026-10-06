/**
 * The two tenant settings that are really policy (needs-you spec section 5,
 * "Retires", and section 6 step 5):
 *
 * - content autonomy (`reb:content-autonomy:{tenant}`) is the route of
 *   `copy.routine`: handle reads as "auto", anything stricter as "approve";
 * - the review reply mode (`reb:reply-voice:{tenant}`, mode only) is the
 *   route of `review.reply`: owner_decides or strelva_reviews read as
 *   "approve", a notice route as "auto". "off" means Strelva drafts nothing;
 *   it is not a route and stays in Redis.
 *
 * The mapping matches `seedPolicyFromTenant` (parity.ts): reply "approve" is
 * an owner row of owner_decides, content autonomy "approve" is Strelva's
 * default, and content autonomy "auto" is never migrated silently.
 *
 * For a tenant linked to a business, decision_policies is authoritative once
 * that kind has an import receipt (the first save or the seed writes one,
 * with today's Redis value). Until then, for an unlinked tenant, with the
 * release off, or when Postgres fails, the Redis key answers exactly as
 * before. The Redis key is always written too, so the frozen `reb:` names
 * stay readable.
 */
import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { KIND_RULES, ladderRouteSchema, routeRank, stricterOf, type LadderRoute } from "./contracts";
import { needsYouReleaseEnabled } from "./release";

export type TenantPolicyKind = "copy.routine" | "review.reply";
export type ContentAutonomyMode = "auto" | "approve";
export type ReplyRouteMode = "auto" | "approve";
export type TenantPolicyLayer = "owner" | "strelva";

const stateSchema = z.object({
  route: ladderRouteSchema,
  strelvaRoute: ladderRouteSchema,
  ownerRoute: ladderRouteSchema.nullable(),
}).passthrough();
export type TenantRouteState = z.infer<typeof stateSchema>;

const routesSchema = z.object({
  workspaceId: z.string().uuid(),
  imported: z.array(z.string()),
  routes: z.object({ "copy.routine": stateSchema, "review.reply": stateSchema }),
}).passthrough();
export type TenantRoutes = z.infer<typeof routesSchema>;

const writeResultSchema = z.object({ workspaceId: z.string().uuid(), state: stateSchema }).passthrough();

export interface TenantSettingWrite {
  tenantId: string;
  actor: { userId: string; verifiedEmail: string };
  layer: TenantPolicyLayer;
  kind: TenantPolicyKind;
  route: LadderRoute | null;
  /** The tenant's Redis value before this write, kept in the import receipt. */
  todayValue: string;
  notMigrated: string | null;
  via: "owner_save" | "operator_save" | "seed";
}

export interface TenantSettingsPort {
  read(tenantId: string): Promise<TenantRoutes | null>;
  write(input: TenantSettingWrite): Promise<{ workspaceId: string; state: TenantRouteState }>;
}

type Db = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };

export class TenantSettingRefusedError extends Error {
  constructor(readonly code: "not_linked" | "access_denied" | "below_floor" | "looser_than_default" | "invalid", message: string) {
    super(message);
    this.name = "TenantSettingRefusedError";
  }
}

export function createPostgresTenantSettings(db: () => Db | null = () => getSupabase() as unknown as Db | null): TenantSettingsPort {
  function client(): Db {
    const value = db();
    if (!value) throw new Error("decision policy storage unavailable");
    return value;
  }
  return {
    async read(tenantId) {
      const { data, error } = await client().rpc("read_tenant_decision_routes", { p_tenant_id: tenantId });
      if (error) throw new Error(error.message || "read_tenant_decision_routes failed");
      if (data === null || data === undefined) return null;
      return routesSchema.parse(data);
    },
    async write(input) {
      const { data, error } = await client().rpc("set_tenant_decision_route", {
        p_tenant_id: input.tenantId, p_user_id: input.actor.userId, p_verified_email: input.actor.verifiedEmail.trim().toLowerCase(),
        p_layer: input.layer, p_kind: input.kind, p_route: input.route, p_today_value: input.todayValue.slice(0, 40),
        p_not_migrated: input.notMigrated, p_via: input.via,
      });
      if (error) {
        const detail = error.message ?? "";
        if (detail.includes("decision_policy_not_linked")) throw new TenantSettingRefusedError("not_linked", "This website is not part of a business yet.");
        if (detail.includes("decision_policy_access_denied")) throw new TenantSettingRefusedError("access_denied", "You can't change this setting.");
        if (detail.includes("decision_policy_below_floor")) throw new TenantSettingRefusedError("below_floor", "That setting is below what Strelva allows.");
        if (detail.includes("decision_policy_looser_than_default")) throw new TenantSettingRefusedError("looser_than_default", "You can loosen this only back to Strelva's default.");
        if (detail.includes("decision_policy_invalid")) throw new TenantSettingRefusedError("invalid", "That is not a valid setting.");
        throw new Error(detail || "set_tenant_decision_route failed");
      }
      return writeResultSchema.parse(data);
    },
  };
}

// Mapping ---------------------------------------------------------------------

export function contentAutonomyFromRoute(route: LadderRoute): ContentAutonomyMode {
  return route === "handle" ? "auto" : "approve";
}

export function replyModeFromRoute(route: LadderRoute): ReplyRouteMode {
  return routeRank(route) <= routeRank("handle_after_notice") ? "auto" : "approve";
}

/** Strelva's route for the kind, raised to its floor: what an owner can loosen back to. */
function baseRoute(kind: TenantPolicyKind, state: TenantRouteState): LadderRoute {
  return stricterOf(state.strelvaRoute, KIND_RULES[kind].floor);
}

export const CONTENT_AUTO_NOT_MIGRATED = "Strelva reviews routine website edits for this business, so they don't go live on their own yet. Your choice is recorded and Strelva can turn it on.";

export interface PlannedSetting {
  /** The route to store on the layer; equal to the current row means no change. */
  route: LadderRoute | null;
  /** Set when the choice can't take effect under the floor or Strelva's default. */
  notMigrated: string | null;
}

/** A content autonomy choice as one write on one layer. */
export function planContentAutonomy(mode: ContentAutonomyMode, layer: TenantPolicyLayer, state: TenantRouteState): PlannedSetting {
  if (layer === "strelva") return { route: mode === "auto" ? "handle" : null, notMigrated: null };
  if (mode === "auto") {
    // Clearing the owner's row is as loose as an owner can go.
    return { route: null, notMigrated: baseRoute("copy.routine", state) === "handle" ? null : CONTENT_AUTO_NOT_MIGRATED };
  }
  // "Ask me first": stricter than Strelva handling it; any stricter row of the owner's stays.
  if (state.ownerRoute) return { route: state.ownerRoute, notMigrated: null };
  return { route: baseRoute("copy.routine", state) === "handle" ? "strelva_reviews" : null, notMigrated: null };
}

/** A reply mode choice ("off" stays in Redis and writes nothing here). */
export function planReplyMode(mode: ReplyRouteMode, layer: TenantPolicyLayer): PlannedSetting {
  if (layer === "strelva") return { route: mode === "approve" ? "owner_decides" : null, notMigrated: null };
  return { route: mode === "approve" ? "owner_decides" : null, notMigrated: null };
}

// Seed ------------------------------------------------------------------------

export interface SeedStep {
  kind: TenantPolicyKind;
  route: LadderRoute | null;
  todayValue: string;
  notMigrated: string | null;
}

/**
 * The seed for one linked tenant: today's Redis values as owner-layer writes,
 * exactly as `seedPolicyFromTenant` reads them, skipping kinds already moved.
 * Reply "off" moves as Strelva's default route; it stays "off" in Redis.
 */
export function planTenantSeed(today: { contentAutonomy: ContentAutonomyMode; replyMode: "off" | "approve" | "auto" }, routes: TenantRoutes): SeedStep[] {
  const steps: SeedStep[] = [];
  if (!routes.imported.includes("copy.routine")) {
    const plan = planContentAutonomy(today.contentAutonomy, "owner", routes.routes["copy.routine"]);
    steps.push({ kind: "copy.routine", route: plan.route, todayValue: today.contentAutonomy, notMigrated: plan.notMigrated });
  }
  if (!routes.imported.includes("review.reply")) {
    const route = today.replyMode === "off" ? routes.routes["review.reply"].ownerRoute : planReplyMode(today.replyMode, "owner").route;
    steps.push({ kind: "review.reply", route, todayValue: today.replyMode, notMigrated: null });
  }
  return steps;
}

// Read and write with fallback ------------------------------------------------------

export interface BridgeOptions {
  enabled?: boolean;
  port?: TenantSettingsPort;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1_500;
let defaultPort: TenantSettingsPort | null = null;
function portOf(options: BridgeOptions): TenantSettingsPort {
  return options.port ?? (defaultPort ??= createPostgresTenantSettings());
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("decision policy read timed out")), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * The route decision_policies holds for this tenant's kind, or null when the
 * Redis key still answers (release off, unlinked, not moved yet, or failure).
 */
export async function readTenantPolicyRoute(tenantId: string, kind: TenantPolicyKind, options: BridgeOptions = {}): Promise<LadderRoute | null> {
  if (!(options.enabled ?? needsYouReleaseEnabled())) return null;
  try {
    const routes = await withTimeout(portOf(options).read(tenantId), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (!routes || !routes.imported.includes(kind)) return null;
    return routes.routes[kind].route;
  } catch {
    return null;
  }
}

export type TenantSettingWriteResult =
  | { stored: "decision_policies"; route: LadderRoute; notMigrated: string | null }
  /** Not linked, release off, or Postgres unavailable: Redis alone holds the choice, as before. */
  | { stored: "redis" };

/** Write one tenant setting to decision_policies, when the tenant is linked and the release is on. */
export async function writeTenantPolicySetting(
  input: Omit<TenantSettingWrite, "route" | "notMigrated"> & { plan: (state: TenantRouteState) => PlannedSetting },
  options: BridgeOptions = {},
): Promise<TenantSettingWriteResult> {
  if (!(options.enabled ?? needsYouReleaseEnabled())) return { stored: "redis" };
  const port = portOf(options);
  let routes: TenantRoutes | null;
  try {
    routes = await withTimeout(port.read(input.tenantId), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch {
    return { stored: "redis" };
  }
  if (!routes) return { stored: "redis" };
  const planned = input.plan(routes.routes[input.kind]);
  try {
    const result = await port.write({ ...input, route: planned.route, notMigrated: planned.notMigrated });
    return { stored: "decision_policies", route: result.state.route, notMigrated: planned.notMigrated };
  } catch (error) {
    // A refusal is an answer, not an outage: the caller must not store the choice in Redis as if it held.
    if (error instanceof TenantSettingRefusedError && error.code !== "not_linked") throw error;
    return { stored: "redis" };
  }
}

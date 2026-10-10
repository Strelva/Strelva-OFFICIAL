/**
 * Content autonomy — how much the owner lets Strelva just handle.
 *
 * The client-facing counterpart to the operator-only earned-trust streak
 * (`autoApproveThreshold`). Same shape as the reviews `ReplyVoice` mode: the owner
 * opts in; the requested choice uses the selected tenant_settings authority.
 * The frozen Redis key remains `reb:content-autonomy:{tenant}`.
 *
 * Needs you (docs/product/specs/needs-you.md): for a tenant linked to a
 * business, with the release on, this is the `copy.routine` route in
 * `decision_policies` once that setting has moved (its first save or the
 * seed). The requested choice follows the selected tenant_settings authority:
 * Redis before cutover, qualified Postgres with best-effort Redis cache after.
 * Policy fallback reads that same selected authority; durable outages fail
 * explicitly (src/platform/needs-you/tenant-settings.ts).
 * An owner can't loosen past Strelva's default, so "auto" may be recorded
 * without taking effect; the save result says so.
 *
 * SAFETY: this ONLY governs low-risk COPY on low-risk sections. The rails in
 * `maybeAutoApprove` are unchanged — high-risk facts (booking/payment links, prices,
 * hours, address, phone, email) NEVER auto-publish, on any mode. "auto" buys faster
 * routine copy edits, never money/contact details.
 */
import { mirrorRecord, readSetting, durableRecordAuthority, writeDurableRecord } from "./client-records";
import { getRedis } from "@/platform/infra/redis";
// The policy bridge (src/platform/needs-you/tenant-settings.ts) through the
// port src/lib declares (Strelva Reborn section 7).
import { workspacePorts, type TenantPolicyLayer, type TenantPolicyOptions as BridgeOptions } from "./workspace-ports";

export type ContentAutonomy = "auto" | "approve";

/** The safe default: the owner approves changes before they go live. */
export const DEFAULT_CONTENT_AUTONOMY: ContentAutonomy = "approve";

function key(tenantId: string): string {
  return `reb:content-autonomy:${tenantId}`;
}

async function readRedis(tenantId: string): Promise<ContentAutonomy> {
  const redis = getRedis();
  if (!redis) return DEFAULT_CONTENT_AUTONOMY;
  try {
    const stored = await redis.get<string>(key(tenantId));
    return stored === "auto" ? "auto" : DEFAULT_CONTENT_AUTONOMY;
  } catch {
    return DEFAULT_CONTENT_AUTONOMY;
  }
}

export async function getContentAutonomy(tenantId: string, options: BridgeOptions = {}): Promise<ContentAutonomy> {
  const policy = await workspacePorts().tenantPolicy();
  const route = await policy.readTenantPolicyRoute(tenantId, "copy.routine", options);
  if (route) return policy.contentAutonomyFromRoute(route);
  return readSetting(tenantId, "content_autonomy", () => readRedis(tenantId), DEFAULT_CONTENT_AUTONOMY);
}

/** Persist under the selected authority. Verified writers use the policy bridge below. */
export async function saveContentAutonomy(tenantId: string, mode: ContentAutonomy): Promise<ContentAutonomy> {
  return persistContentAutonomy(tenantId, mode === "auto" ? "auto" : "approve", await durableRecordAuthority("tenant_settings"));
}

async function persistContentAutonomy(tenantId: string, value: ContentAutonomy, durable: boolean): Promise<ContentAutonomy> {
  if (durable) {
    const status = await writeDurableRecord("tenant_settings", tenantId, "content_autonomy", { value });
    if (status === "kept") throw new Error("Content autonomy update was superseded by a newer change.");
    try { const redis = getRedis(); if (redis) await redis.set(key(tenantId), value); } catch { /* Durable choice already saved; Redis is a cache. */ }
    return value;
  }
  const redis = getRedis();
  if (redis) {
    await redis.set(key(tenantId), value);
    await mirrorRecord("tenant_settings", tenantId, "content_autonomy", { value });
  }
  return value;
}

export interface ContentAutonomyWriter {
  actor: { userId: string; verifiedEmail: string };
  /** "owner" for the client's own choice; "strelva" for an operator. */
  layer: TenantPolicyLayer;
}

export interface ContentAutonomySaveResult {
  /** What is now in force. */
  mode: ContentAutonomy;
  requested: ContentAutonomy;
  /** Why the choice didn't take effect, when it didn't. */
  note: string | null;
  storedIn: "decision_policies" | "tenant_settings" | "redis";
}

/**
 * Save a choice: decision_policies first when the tenant is linked (a
 * refusal throws and nothing is saved), then the selected setting authority.
 * With qualified Postgres, Redis is refreshed only after durable success.
 */
export async function saveContentAutonomySetting(
  tenantId: string,
  requested: ContentAutonomy,
  writer: ContentAutonomyWriter | null,
  options: BridgeOptions = {},
): Promise<ContentAutonomySaveResult> {
  const mode: ContentAutonomy = requested === "auto" ? "auto" : "approve";
  const durable = await durableRecordAuthority("tenant_settings");
  const policy = writer ? await workspacePorts().tenantPolicy() : null;
  const result = writer && policy
    ? await policy.writeTenantPolicySetting({
      tenantId, actor: writer.actor, layer: writer.layer, kind: "copy.routine",
      todayValue: await readRedis(tenantId), via: writer.layer === "owner" ? "owner_save" : "operator_save",
      plan: (state) => policy.planContentAutonomy(mode, writer.layer, state),
    }, options)
    : { stored: "redis" as const };
  await persistContentAutonomy(tenantId, mode, durable);
  if (result.stored === "redis" || !policy) return { mode, requested: mode, note: null, storedIn: durable ? "tenant_settings" : "redis" };
  return { mode: policy.contentAutonomyFromRoute(result.route), requested: mode, note: result.notMigrated, storedIn: "decision_policies" };
}

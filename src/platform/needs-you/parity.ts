/**
 * Parity replay (needs-you spec section 6, step 1). Seed a business's policy
 * from its tenant's current settings, replay the tenant's recent events
 * through the evaluator, and compare each route with what actually happened.
 *
 * - `match`: same route.
 * - `stricter`: the evaluator asks more than today did. Safe; listed for Jacob.
 * - `intended`: a looser route the spec chose on purpose (named rule below).
 * - `blocking`: looser than today with no spec rule behind it. Blocks the move.
 *
 * Pure. The caller supplies the events (Redis plus the unified_events mirror,
 * deduplicated) and the settings; nothing here reads a store.
 */
import type { UnifiedEvent } from "@/lib/types";
import { routeRank, type LadderRoute, type PolicySetting, type Route } from "./contracts";
import { evaluateRoute, type RuleId } from "./evaluator";
import { classifyTenantEvent, observedTenantRoute } from "./tenant-classify";

export interface TenantPolicySettings {
  tenantId: string;
  /** reb:content-autonomy:{tenant} */
  contentAutonomy: "auto" | "approve";
  /** reb:reply-voice:{tenant} mode */
  replyMode: "off" | "approve" | "auto";
  /** tenants.auto_approve_threshold (earned trust), 0 or absent when unset */
  autoApproveThreshold: number;
  /** The tenant's current approval streak, when known. */
  approvalStreak?: number;
}

export interface SeededPolicy {
  policies: PolicySetting[];
  /** Today's settings the new floors or defaults do not carry over. Jacob sees this list before email goes on. */
  notMigrated: { setting: string; today: string; reason: string }[];
}

/** Today's owner choices become owner-layer settings; looser ones are recorded, never migrated silently. */
export function seedPolicyFromTenant(settings: TenantPolicySettings): SeededPolicy {
  const policies: PolicySetting[] = [];
  const notMigrated: SeededPolicy["notMigrated"] = [];
  if (settings.replyMode === "approve") policies.push({ layer: "owner", systemId: null, kind: "review.reply", route: "owner_decides" });
  if (settings.contentAutonomy === "auto") {
    notMigrated.push({
      setting: "reb:content-autonomy",
      today: "auto (hands-off routine updates)",
      reason: "Strelva's default for routine copy is strelva_reviews; an owner can't loosen past it. Strelva may set copy.routine to handle for this business.",
    });
  }
  return { policies, notMigrated };
}

export type ParityVerdict = "match" | "stricter" | "intended" | "blocking";

export interface ParityRow {
  eventId: string;
  kind: string;
  observed: Route;
  evaluated: Route;
  rule: RuleId;
  verdict: ParityVerdict;
  /** The spec rule that makes an intended difference intended. */
  because?: string;
}

export interface ParityReport {
  tenantId: string;
  rows: ParityRow[];
  counts: Record<ParityVerdict, number> & { skipped: number; verifyFailedLeaked: number };
  notMigrated: SeededPolicy["notMigrated"];
  blocked: boolean;
}

function rankOf(route: Route): number {
  return route === "never" ? -1 : routeRank(route as LadderRoute);
}

/** Looser-than-today routes the spec chose deliberately. Anything else looser blocks. */
function intendedLooser(row: { kind: string; observed: Route; evaluated: Route; rule: RuleId }): string | null {
  // Section 4: a suggestion never reaches Needs you.
  if (row.kind === "suggestion" && row.evaluated === "never") return "spec 4: suggestions never appear in Needs you";
  return null;
}

function replyPolicies(policies: readonly PolicySetting[], draftedInAutoMode: boolean): PolicySetting[] {
  const rest = policies.filter(row => row.kind !== "review.reply");
  return draftedInAutoMode ? rest : [...rest, { layer: "owner", systemId: null, kind: "review.reply", route: "owner_decides" }];
}

export function replayTenantParity(settings: TenantPolicySettings, events: readonly UnifiedEvent[]): ParityReport {
  const seeded = seedPolicyFromTenant(settings);
  const rows: ParityRow[] = [];
  const counts = { match: 0, stricter: 0, intended: 0, blocking: 0, skipped: 0, verifyFailedLeaked: 0 };
  const seen = new Set<string>();
  for (const event of events) {
    if (event.tenantId !== settings.tenantId || seen.has(event.id)) { counts.skipped += 1; continue; }
    seen.add(event.id);
    const classification = classifyTenantEvent(event);
    if (!classification) { counts.skipped += 1; continue; }
    // A reply mode of "off" drafts nothing, so a historic draft keeps the mode it was drafted under.
    const observed = observedTenantRoute(event);
    if (observed.verifyFailedLeaked) counts.verifyFailedLeaked += 1;
    // Only routes in force when the change was proposed apply (spec 3.16): a
    // review reply drafted with an auto-post time was drafted in auto mode.
    const policies = classification.kind === "review.reply"
      ? replyPolicies(seeded.policies, typeof event.metadata?.autoPostAt === "string")
      : seeded.policies;
    const evaluation = evaluateRoute({
      kind: classification.kind,
      origin: classification.origin,
      policies,
      signals: {
        ...classification.signals,
        ...(settings.autoApproveThreshold > 0 ? { earnedTrust: { streak: settings.approvalStreak ?? 0, threshold: settings.autoApproveThreshold } } : {}),
      },
    });
    const base = { eventId: event.id, kind: evaluation.kind, observed: observed.route, evaluated: evaluation.route, rule: evaluation.rule };
    let verdict: ParityVerdict;
    let because: string | undefined;
    if (base.observed === base.evaluated) verdict = "match";
    else if (rankOf(base.evaluated) > rankOf(base.observed)) verdict = "stricter";
    else {
      const reason = intendedLooser(base);
      verdict = reason ? "intended" : "blocking";
      because = reason ?? undefined;
    }
    counts[verdict] += 1;
    rows.push({ ...base, verdict, ...(because ? { because } : {}) });
  }
  return { tenantId: settings.tenantId, rows, counts, notMigrated: seeded.notMigrated, blocked: counts.blocking > 0 };
}

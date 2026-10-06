/**
 * The one policy evaluator. A pure function of (change kind, System, origin,
 * business policy, fixed rules) that returns exactly one route and the rule
 * that produced it. Fixed rules come first; settings can only move a route
 * within [floor, owner_decides], and an owner setting only makes it stricter.
 */
import {
  KIND_RULES,
  LADDER_ROUTES,
  NOTICE_WINDOW_MS,
  isConfigurableKind,
  routeRank,
  stricterOf,
  type ChangeKind,
  type ChangeOrigin,
  type ConfigurableKind,
  type LadderRoute,
  type PolicyLayer,
  type PolicySetting,
  type Route,
} from "./contracts";

export type RuleId =
  | "fixed:suggestion"
  | "fixed:owner_action"
  | "fixed:fact_inferred"
  | "fixed:critical_review"
  | "fixed:owner_only_kind"
  | "origin:owner_exact"
  | "origin:owner_asked"
  | "inquiry:block"
  | "inquiry:policy"
  | "earned_trust"
  | "owner_setting"
  | "strelva_setting"
  | "default"
  | "floor";

export interface EvaluationInput {
  kind: ChangeKind;
  systemId?: string | null;
  origin: ChangeOrigin;
  policies?: readonly PolicySetting[];
  signals?: {
    /** Google star rating of the review being answered. 1-2 is critical. */
    reviewRating?: number;
    /** The inquiry ResponsibilityPolicy's decision for this message. */
    inquiryDecision?: "allow" | "approval_required" | "block";
    /** The operator-set approval streak (autoApproveThreshold) on the linked tenant. */
    earnedTrust?: { streak: number; threshold: number };
  };
}

export interface Evaluation {
  kind: ChangeKind;
  route: Route;
  rule: RuleId;
  signInRequired: boolean;
  urgent: boolean;
  /** handle_after_notice only: how long it waits before acting. */
  noticeWindowMs?: number;
}

/** Kinds an owner's exact request never short-circuits: the item itself is still theirs to decide. */
const OWNER_EXACT_EXCLUDED: ReadonlySet<ChangeKind> = new Set([
  "fact.inferred", "customer.commitment", "customer.broadcast", "access.grant", "money", "exit",
  "system.go_live", "running.approve", "request.scope", "verify.failed",
]);

/** Kinds that are never the owner's own ask, or that keep their own route. */
const OWNER_ASKED_EXCLUDED: ReadonlySet<ChangeKind> = new Set(["health.fix", "verify.failed", "customer.message"]);

function result(kind: ChangeKind, route: Route, rule: RuleId): Evaluation {
  const rules = isConfigurableKind(kind) ? KIND_RULES[kind] : null;
  return {
    kind,
    route,
    rule,
    signInRequired: rules?.signInRequired ?? false,
    urgent: route === "owner_decides" && (rules?.urgent ?? false),
    ...(route === "handle_after_notice" && isConfigurableKind(kind) && NOTICE_WINDOW_MS[kind]
      ? { noticeWindowMs: NOTICE_WINDOW_MS[kind] }
      : {}),
  };
}

/** Strelva's layer: the System row, else the business row, else the code default. */
export function strelvaRoute(kind: ConfigurableKind, systemId: string | null | undefined, policies: readonly PolicySetting[] = []): { route: LadderRoute; fromSetting: boolean } {
  const rows = policies.filter(row => row.layer === "strelva" && row.kind === kind);
  const system = systemId ? rows.find(row => row.systemId === systemId) : undefined;
  const business = rows.find(row => row.systemId === null);
  const chosen = system ?? business;
  return chosen ? { route: chosen.route, fromSetting: true } : { route: KIND_RULES[kind].default, fromSetting: false };
}

/** The owner's layer: the strictest of their business-wide and System rows. */
export function ownerRoute(kind: ConfigurableKind, systemId: string | null | undefined, policies: readonly PolicySetting[] = []): LadderRoute | null {
  const rows = policies.filter(row => row.layer === "owner" && row.kind === kind && (row.systemId === null || row.systemId === systemId));
  return rows.reduce<LadderRoute | null>((acc, row) => (acc ? stricterOf(acc, row.route) : row.route), null);
}

export function evaluateRoute(input: EvaluationInput): Evaluation {
  const policies = input.policies ?? [];
  let kind = input.kind;

  // Fixed rules. No setting moves these.
  if (kind === "suggestion") return result(kind, "never", "fixed:suggestion");
  if (kind === "health.owner_action") return result(kind, "never", "fixed:owner_action");
  if (kind === "review.reply" && typeof input.signals?.reviewRating === "number" && input.signals.reviewRating <= 2) {
    kind = "review.reply_critical";
  }
  if (kind === "fact.inferred") return result(kind, "owner_decides", "fixed:fact_inferred");
  if (kind === "access.grant" || kind === "money" || kind === "exit") return result(kind, "owner_decides", "fixed:owner_only_kind");

  if (!isConfigurableKind(kind)) return result(kind, "never", "fixed:suggestion");
  const rules = KIND_RULES[kind];

  // Origin. An exact owner request is handled and reported, within the floor.
  if (input.origin === "owner_exact" && !OWNER_EXACT_EXCLUDED.has(kind)) {
    const route = stricterOf("handle", rules.floor);
    const owner = ownerRoute(kind, input.systemId, policies);
    // The owner's own standing setting still holds over their one-off request.
    if (owner && routeRank(owner) > routeRank(route)) return result(kind, owner, "owner_setting");
    return result(kind, route, route === "handle" ? "origin:owner_exact" : "floor");
  }

  // The owner asked, but Strelva wrote it: it never inherits the owner's
  // authority, so it gets no shortcut, and the owner reviews what was written
  // for them, as today (spec section 6: content previews and Google drafts
  // the owner asked for in chat stay with the owner).
  if (input.origin === "owner_interpreted" && !OWNER_ASKED_EXCLUDED.has(kind)) {
    return result(kind, "owner_decides", "origin:owner_asked");
  }

  // Inquiry messages keep their own policy as Strelva's layer for this kind.
  let base = strelvaRoute(kind, input.systemId, policies);
  let baseRule: RuleId = base.fromSetting ? "strelva_setting" : "default";
  if (kind === "customer.message" && input.signals?.inquiryDecision) {
    if (input.signals.inquiryDecision === "block") return result(kind, "never", "inquiry:block");
    base = { route: input.signals.inquiryDecision === "allow" ? "handle" : "owner_decides", fromSetting: true };
    baseRule = "inquiry:policy";
  }

  // Earned trust promotes routine copy only, and never past an owner setting.
  const trust = input.signals?.earnedTrust;
  if (kind === "copy.routine" && trust && trust.threshold > 0 && trust.streak >= trust.threshold && routeRank(base.route) > routeRank("handle")) {
    base = { route: "handle", fromSetting: true };
    baseRule = "earned_trust";
  }

  let route = base.route;
  let rule = baseRule;
  if (routeRank(rules.floor) > routeRank(route)) {
    route = rules.floor;
    rule = "floor";
  }
  const owner = ownerRoute(kind, input.systemId, policies);
  if (owner && routeRank(owner) > routeRank(route)) {
    route = owner;
    rule = "owner_setting";
  }
  return result(kind, route, rule);
}

export type PolicyRefusal = "not_configurable" | "below_floor" | "looser_than_default" | "unknown_route";

/**
 * Whether a policy write is allowed, mirroring set_decision_policy in SQL.
 * `route: null` clears that layer's row (an owner "loosening back to default").
 */
export function validatePolicyChange(input: {
  layer: PolicyLayer;
  kind: ChangeKind;
  systemId?: string | null;
  route: LadderRoute | null;
  policies?: readonly PolicySetting[];
}): { ok: true } | { ok: false; reason: PolicyRefusal } {
  if (!isConfigurableKind(input.kind)) return { ok: false, reason: "not_configurable" };
  if (input.route === null) return { ok: true };
  if (!(LADDER_ROUTES as readonly string[]).includes(input.route)) return { ok: false, reason: "unknown_route" };
  if (routeRank(input.route) < routeRank(KIND_RULES[input.kind].floor)) return { ok: false, reason: "below_floor" };
  if (input.layer === "owner") {
    const strelva = strelvaRoute(input.kind, input.systemId, input.policies);
    if (routeRank(input.route) < routeRank(strelva.route)) return { ok: false, reason: "looser_than_default" };
  }
  return { ok: true };
}

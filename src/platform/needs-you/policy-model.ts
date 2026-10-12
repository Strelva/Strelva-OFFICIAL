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
 * Pure and client-safe. The store port and its Postgres adapter are in
 * policy.ts.
 */
import { z } from "zod";
import {
  KIND_RULES,
  LADDER_ROUTES,
  changeKindSchema,
  isConfigurableKind,
  ladderRouteSchema,
  routeRank,
  stricterOf,
  type ConfigurableKind,
  type LadderRoute,
  type PolicyLayer,
  type PolicySetting,
} from "./contracts";
import { ownerRoute, strelvaRoute, validatePolicyChange } from "./evaluator";

import { KIND_WORDS, OPERATOR_ONLY_KIND_LIST, POLICY_KIND_ORDER } from "./policy-words";
export { KIND_WORDS, OPERATOR_ONLY_KIND_LIST, POLICY_KIND_ORDER, ROUTE_WORDS } from "./policy-words";

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

const OPERATOR_ONLY_KINDS: ReadonlySet<ConfigurableKind> = new Set(OPERATOR_ONLY_KIND_LIST);

/** An owner request as one owner-layer write: only stricter, or back to Strelva's default. */
export function planOwnerChange(rows: PolicyRows, change: OwnerChange): PlannedWrite {
  if (!isConfigurableKind(change.kind) || OPERATOR_ONLY_KINDS.has(change.kind)) return { ok: false, reason: "not_configurable" };
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

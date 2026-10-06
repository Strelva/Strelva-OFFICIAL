/**
 * Needs you and Strelva handled (docs/product/specs/needs-you.md).
 *
 * Change kinds, routes, floors and defaults. The same table lives in SQL in
 * supabase/migrations/20261007120000_needs_you.sql (needs_you_kind_floor,
 * needs_you_kind_default, needs_you_sign_in_kind); a Vitest parity test reads
 * both and fails if they drift. Only Jacob changes a floor, in code.
 */
import { z } from "zod";

export const CHANGE_KINDS = [
  "fact.owner_stated",
  "fact.inferred",
  "copy.routine",
  "copy.marketing",
  "structure",
  "google.post",
  "google.photo",
  "review.reply",
  "review.reply_critical",
  "customer.message",
  "customer.commitment",
  "customer.broadcast",
  "system.go_live",
  "system.change_live",
  "system.pause",
  "running.approve",
  "request.scope",
  "access.grant",
  "money",
  "exit",
  "health.fix",
  "health.owner_action",
  "verify.failed",
  "suggestion",
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
export const changeKindSchema = z.enum(CHANGE_KINDS);

/** The ladder, least strict first. `never` sits outside it. */
export const LADDER_ROUTES = ["handle", "handle_after_notice", "strelva_reviews", "owner_decides"] as const;
export type LadderRoute = (typeof LADDER_ROUTES)[number];
export type Route = LadderRoute | "never";
export const ladderRouteSchema = z.enum(LADDER_ROUTES);

export function routeRank(route: LadderRoute): number {
  return LADDER_ROUTES.indexOf(route);
}

export function stricterOf(a: LadderRoute, b: LadderRoute): LadderRoute {
  return routeRank(a) >= routeRank(b) ? a : b;
}

export interface KindRule {
  /** Strelva's starting setting for a managed business. */
  default: LadderRoute;
  /** The least strict route allowed. */
  floor: LadderRoute;
  /** Access, money and exit: a signed-in owner only; no one-tap link. */
  signInRequired: boolean;
  /** A customer is waiting: the owner hears at once, not in the morning email. */
  urgent: boolean;
}

/** Kinds a policy can set. `suggestion` and `health.owner_action` are never decisions. */
export const KIND_RULES = {
  "fact.owner_stated": { default: "handle", floor: "handle", signInRequired: false, urgent: false },
  "fact.inferred": { default: "owner_decides", floor: "owner_decides", signInRequired: false, urgent: false },
  "copy.routine": { default: "strelva_reviews", floor: "handle", signInRequired: false, urgent: false },
  "copy.marketing": { default: "strelva_reviews", floor: "strelva_reviews", signInRequired: false, urgent: false },
  structure: { default: "owner_decides", floor: "owner_decides", signInRequired: false, urgent: false },
  "google.post": { default: "strelva_reviews", floor: "handle_after_notice", signInRequired: false, urgent: false },
  "google.photo": { default: "strelva_reviews", floor: "handle_after_notice", signInRequired: false, urgent: false },
  "review.reply": { default: "handle_after_notice", floor: "handle_after_notice", signInRequired: false, urgent: true },
  "review.reply_critical": { default: "owner_decides", floor: "strelva_reviews", signInRequired: false, urgent: true },
  "customer.message": { default: "owner_decides", floor: "strelva_reviews", signInRequired: false, urgent: true },
  "customer.commitment": { default: "owner_decides", floor: "owner_decides", signInRequired: false, urgent: true },
  "customer.broadcast": { default: "owner_decides", floor: "owner_decides", signInRequired: false, urgent: false },
  "system.go_live": { default: "owner_decides", floor: "owner_decides", signInRequired: false, urgent: false },
  "system.change_live": { default: "owner_decides", floor: "strelva_reviews", signInRequired: false, urgent: false },
  "system.pause": { default: "owner_decides", floor: "owner_decides", signInRequired: false, urgent: false },
  "running.approve": { default: "owner_decides", floor: "owner_decides", signInRequired: false, urgent: false },
  "request.scope": { default: "owner_decides", floor: "owner_decides", signInRequired: false, urgent: false },
  "access.grant": { default: "owner_decides", floor: "owner_decides", signInRequired: true, urgent: false },
  money: { default: "owner_decides", floor: "owner_decides", signInRequired: true, urgent: false },
  exit: { default: "owner_decides", floor: "owner_decides", signInRequired: true, urgent: false },
  "health.fix": { default: "handle", floor: "handle", signInRequired: false, urgent: false },
  "verify.failed": { default: "strelva_reviews", floor: "strelva_reviews", signInRequired: false, urgent: false },
} as const satisfies Record<Exclude<ChangeKind, "suggestion" | "health.owner_action">, KindRule>;
export type ConfigurableKind = keyof typeof KIND_RULES;

export function isConfigurableKind(kind: ChangeKind): kind is ConfigurableKind {
  return kind in KIND_RULES;
}

export function signInRequired(kind: ChangeKind): boolean {
  return isConfigurableKind(kind) && KIND_RULES[kind].signInRequired;
}

/** Owner-only kinds the database already restricts to role `owner`; admins never decide them. */
export const OWNER_ONLY_KINDS: ReadonlySet<ChangeKind> = new Set(["access.grant", "money", "exit", "system.go_live"]);

/** How long a handle_after_notice change waits before it acts. Review replies keep today's 12 hours. */
export const NOTICE_WINDOW_MS: Partial<Record<ConfigurableKind, number>> = {
  "review.reply": 12 * 60 * 60 * 1000,
  "google.post": 12 * 60 * 60 * 1000,
  "google.photo": 12 * 60 * 60 * 1000,
  "copy.routine": 12 * 60 * 60 * 1000,
};

/** Chase clock, shared with operator.md section 9: remind on day 3 and day 7, lapse on day 14. */
export const CHASE_CLOCK = { remind1Days: 3, remind2Days: 7, lapseDays: 14 } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Who or what started the change. A change Strelva started never inherits the owner's authority. */
export type ChangeOrigin =
  /** The owner asked, and the change is exactly what they asked for. */
  | "owner_exact"
  /** The owner asked, but Strelva had to interpret or write it. Routes like a Strelva change. */
  | "owner_interpreted"
  | "strelva"
  | "operator"
  | "agency";

export const policyLayerSchema = z.enum(["strelva", "owner"]);
export type PolicyLayer = z.infer<typeof policyLayerSchema>;

/** One stored policy row. `systemId: null` applies to every System of the business. */
export interface PolicySetting {
  layer: PolicyLayer;
  systemId: string | null;
  kind: ConfigurableKind;
  route: LadderRoute;
}

// Items -------------------------------------------------------------------------

export const ITEM_STATES = ["open", "approved", "declined", "expired", "withdrawn", "superseded"] as const;
export type ItemState = (typeof ITEM_STATES)[number];
export const ITEM_OUTCOMES = ["done", "done_unverified", "failed"] as const;
export type ItemOutcome = (typeof ITEM_OUTCOMES)[number];
export const DELIVERY_STATES = ["not_sent", "sent", "suppressed", "bounced", "reminded_1", "reminded_2"] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];
export type Decision = "approve" | "not_yet";

/**
 * The source lifecycles an adapter can resolve. Each keeps its own resolver.
 * Adapters beyond the first two live in ./sources/<lifecycle>.ts.
 */
export const SOURCE_LIFECYCLES = [
  "tenant_event",
  "service_request",
  "provider_delivery",
  "website_document",
  "standing_responsibility",
  "work_responsibility",
  "assignment_offer",
  "agency_grant",
  "application_release",
  "work_plan",
  "work_money",
  "workspace_exit",
  "make_real",
  "version_release",
] as const;
export type SourceLifecycle = (typeof SOURCE_LIFECYCLES)[number];

const isoSchema = z.string().min(1);
export const ownerDecisionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  systemId: z.string().uuid().nullable(),
  kind: changeKindSchema,
  route: z.enum(["strelva_reviews", "owner_decides"]),
  title: z.string(),
  detail: z.string().nullable(),
  approveEffect: z.string(),
  notYetEffect: z.string(),
  sourceLifecycle: z.string(),
  sourceId: z.string(),
  revisionHash: z.string().regex(/^[0-9a-f]{64}$/),
  urgent: z.boolean(),
  signInRequired: z.boolean(),
  adminMayDecide: z.boolean(),
  openHref: z.string().nullable(),
  state: z.enum(ITEM_STATES),
  outcome: z.enum(ITEM_OUTCOMES).nullable(),
  outcomeReason: z.string().nullable(),
  receiptRef: z.string().nullable(),
  decidedByKind: z.string().nullable(),
  decidedAt: isoSchema.nullable(),
  deliveryState: z.enum(DELIVERY_STATES),
  operatorNote: z.string().nullable(),
  openedAt: isoSchema,
  expiresAt: isoSchema,
  reminded1At: isoSchema.nullable(),
  reminded2At: isoSchema.nullable(),
  deliveries: z.array(z.object({
    kind: z.enum(["urgent", "digest", "reminder_1", "reminder_2"]),
    status: z.enum(["sent", "suppressed", "bounced", "failed"]),
    providerMessageId: z.string().nullable(),
    reason: z.string().nullable(),
    at: isoSchema,
  })),
});
export type OwnerDecision = z.infer<typeof ownerDecisionSchema>;

/** What an adapter proposes; the store turns it into an item. */
export interface ProposedItem {
  kind: ChangeKind;
  route: "strelva_reviews" | "owner_decides";
  systemId?: string | null;
  title: string;
  detail?: string | null;
  approveEffect: string;
  notYetEffect: string;
  sourceLifecycle: SourceLifecycle;
  sourceId: string;
  revisionHash: string;
  urgent: boolean;
  adminMayDecide: boolean;
  openHref?: string | null;
  openedAt?: string;
}

// Chase clock -------------------------------------------------------------------

export type ChaseStep = "none" | "reminder_1" | "reminder_2" | "lapse";

/** The single next step the chase clock owes an open owner item. Pure. */
export function nextChaseStep(item: Pick<OwnerDecision, "state" | "route" | "openedAt" | "expiresAt" | "reminded1At" | "reminded2At">, now: number): ChaseStep {
  if (item.state !== "open" || item.route !== "owner_decides") return "none";
  if (now >= Date.parse(item.expiresAt)) return "lapse";
  const age = now - Date.parse(item.openedAt);
  if (age >= CHASE_CLOCK.remind2Days * DAY_MS && !item.reminded2At) return "reminder_2";
  if (age >= CHASE_CLOCK.remind1Days * DAY_MS && !item.reminded1At && !item.reminded2At) return "reminder_1";
  return "none";
}

// Strelva handled ---------------------------------------------------------------

export type UndoState =
  | { state: "undo" }
  | { state: "undo_needs_review"; reason: string }
  | { state: "not_undoable"; reason: string }
  | { state: "undone" };

export interface HandledReceipt {
  id: string;
  store: string;
  systemId: string | null;
  /** Strelva is the subject: "Strelva updated your Friday hours on Google". */
  sentence: string;
  at: string;
  /** What changed, in plain words, when the store records it. */
  changed: string | null;
  /** Outside-write evidence. `null` when the change was inside Strelva. */
  evidence: { providerAccepted: boolean; readBack: "verified" | "not_verified" | "not_checked" } | null;
  undo: UndoState;
}

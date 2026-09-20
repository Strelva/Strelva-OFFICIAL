import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import {
  MAX_PERIOD_SPENDING_CAP_CENTS,
  MAX_WORK_ALLOWANCE_UNITS,
  WORK_ALLOWANCE_UNIT_KINDS,
  type WorkAllowanceUnitKind,
} from "./allowances-types";

const UUID = z.string().uuid();
const STRIPE_ID = z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const CONFIG_KEY = z.string().trim().min(1).max(96).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const DATE_TIME = z.string().datetime({ offset: true });
const STATUS = z.enum(["pending", "active", "trialing", "past_due", "cancelled", "grandfathered", "unavailable"]);
const GRANT = z.object({
  unitKind: z.enum(WORK_ALLOWANCE_UNIT_KINDS),
  units: z.number().int().positive().max(MAX_WORK_ALLOWANCE_UNITS),
}).strict();

export const subscriptionAllowanceEntitlementSchema = z.object({
  version: z.literal(1),
  eventId: STRIPE_ID,
  eventCreated: z.number().int().nonnegative(),
  subscriptionId: STRIPE_ID,
  customerId: STRIPE_ID.nullable(),
  workspaceId: UUID,
  payerId: UUID,
  configKey: CONFIG_KEY,
  status: STATUS,
  periodStart: DATE_TIME,
  periodEnd: DATE_TIME,
  grants: z.array(GRANT).min(1).max(WORK_ALLOWANCE_UNIT_KINDS.length).optional(),
  spendingCapCents: z.number().int().nonnegative().max(MAX_PERIOD_SPENDING_CAP_CENTS).optional(),
}).strict().superRefine((value, context) => {
  const start = Date.parse(value.periodStart);
  const end = Date.parse(value.periodEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 370 * 24 * 60 * 60 * 1000) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["periodEnd"], message: "The subscription allowance period is invalid." });
  }
  const kinds = value.grants?.map((grant) => grant.unitKind) ?? [];
  if (new Set(kinds).size !== kinds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["grants"], message: "Each allowance unit may be configured once." });
  }
  if ((value.status === "active" || value.status === "trialing")
    && (!value.grants?.length || value.spendingCapCents === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "An active subscription entitlement needs explicit allowance terms." });
  }
  if ((value.grants && value.spendingCapCents === undefined) || (!value.grants && value.spendingCapCents !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Allowance units and the operational cap must be configured together." });
  }
});

export type SubscriptionAllowanceEntitlement = z.infer<typeof subscriptionAllowanceEntitlementSchema>;
export type SubscriptionAllowanceEntitlementStatus = z.infer<typeof STATUS>;

export class SubscriptionEntitlementValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionEntitlementValidationError";
  }
}

export class SubscriptionEntitlementPersistenceError extends Error {
  constructor(message = "Subscription allowance synchronization is unavailable.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SubscriptionEntitlementPersistenceError";
  }
}

export interface SubscriptionAllowanceSyncResult {
  disposition: "applied" | "replayed" | "ignored_out_of_order" | "unavailable";
  entitlementId: string;
  allowanceId: string | null;
  status: SubscriptionAllowanceEntitlementStatus;
}

const syncResultSchema = z.object({
  disposition: z.enum(["applied", "replayed", "ignored_out_of_order", "unavailable"]),
  entitlementId: UUID,
  allowanceId: UUID.nullable(),
  status: STATUS,
}).strict();

function parseSyncResult(value: unknown): SubscriptionAllowanceSyncResult {
  const parsed = syncResultSchema.safeParse(value);
  if (!parsed.success) throw new SubscriptionEntitlementPersistenceError("Subscription allowance synchronization returned an invalid receipt.");
  return parsed.data;
}

function parseConfig(): Record<string, unknown> {
  const raw = process.env.STRELVA_SUBSCRIPTION_ALLOWANCE_CONFIG?.trim();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function entitlementConfig(key: string): { grants: Array<{ unitKind: WorkAllowanceUnitKind; units: number }>; spendingCapCents: number } | null {
  const candidate = parseConfig()[key];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const parsed = z.object({
    grants: z.array(GRANT).min(1).max(WORK_ALLOWANCE_UNIT_KINDS.length),
    spendingCapCents: z.number().int().nonnegative().max(MAX_PERIOD_SPENDING_CAP_CENTS),
  }).strict().safeParse(candidate);
  if (!parsed.success || new Set(parsed.data.grants.map((grant) => grant.unitKind)).size !== parsed.data.grants.length) return null;
  return parsed.data;
}

function objectMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const metadata = (value as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return Object.fromEntries(Object.entries(metadata).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : null;
}

/** Stripe snapshots subscription metadata on invoice.parent when using Basil. */
function metadataFromStripeObject(value: Record<string, unknown>): Record<string, string> {
  const parent = nestedRecord(value, "parent");
  const subscriptionDetails = parent ? nestedRecord(parent, "subscription_details") : null;
  const expandedSubscription = nestedRecord(value, "subscription");
  const lines = nestedRecord(value, "lines");
  const lineData = lines && Array.isArray(lines.data) ? lines.data : [];
  const lineMetadata = lineData.reduce<Record<string, string>>((merged, line) => {
    return { ...merged, ...objectMetadata(line) };
  }, {});
  return {
    ...lineMetadata,
    ...(subscriptionDetails ? objectMetadata(subscriptionDetails) : {}),
    ...(expandedSubscription ? objectMetadata(expandedSubscription) : {}),
    ...objectMetadata(value),
  };
}

function unixDate(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return new Date(value * 1000).toISOString();
}

type StripePeriod = { start: string; end: string };

function periodFromPair(startValue: unknown, endValue: unknown): StripePeriod | null {
  const start = unixDate(startValue);
  const end = unixDate(endValue);
  return start && end ? { start, end } : null;
}

/**
 * A subscription can contain several prices with different billing intervals.
 * Until a local price binding exists, only a uniform item period is safe to
 * use for one allowance window. Returning null for an ambiguous collection
 * leaves that event available for reconciliation instead of selecting the
 * first item by array order.
 */
function uniformPeriod(periods: Array<StripePeriod | null>): StripePeriod | null {
  if (periods.length === 0 || periods.some((period) => period === null)) return null;
  const first = periods[0] as StripePeriod;
  return periods.every((period) => period?.start === first.start && period.end === first.end)
    ? first
    : null;
}

function statusFromStripeEvent(type: string, value: Record<string, unknown>): SubscriptionAllowanceEntitlementStatus {
  if (type === "customer.subscription.deleted") return "cancelled";
  if (type === "invoice.payment_failed") return "past_due";
  if (type === "invoice.paid") {
    // A zero-dollar subscription-create invoice starts a trial. Keep the
    // allowance projection aligned with the tenant status until a paid
    // invoice moves the subscription to active.
    if (value.billing_reason === "subscription_create" && value.amount_paid === 0) return "trialing";
    return "active";
  }
  const statusSource = type === "checkout.session.completed" ? nestedRecord(value, "subscription") ?? value : value;
  const raw = typeof statusSource.status === "string" ? statusSource.status : "pending";
  if (raw === "trialing") return "trialing";
  if (raw === "past_due" || raw === "unpaid") return "past_due";
  if (raw === "canceled" || raw === "incomplete_expired") return "cancelled";
  if (raw === "active") return "active";
  return "pending";
}

function subscriptionIdFromStripeEvent(type: string, value: Record<string, unknown>, metadata: Record<string, string>): string | null {
  if (type === "checkout.session.completed") {
    if (typeof value.subscription === "string") return value.subscription;
    const expanded = nestedRecord(value, "subscription");
    return typeof expanded?.id === "string" ? expanded.id : metadata.subscriptionId ?? null;
  }
  if (type === "invoice.paid" || type === "invoice.payment_failed") {
    const parent = nestedRecord(value, "parent");
    const details = parent ? nestedRecord(parent, "subscription_details") : null;
    const subscription = details?.subscription;
    if (typeof subscription === "string") return subscription;
    if (subscription && typeof subscription === "object" && !Array.isArray(subscription)
      && typeof (subscription as { id?: unknown }).id === "string") return (subscription as { id: string }).id;
    // Older invoice payloads exposed the subscription at the top level. The
    // invoice id itself is never a valid subscription id.
    if (typeof value.subscription === "string") return value.subscription;
    return metadata.subscriptionId ?? null;
  }
  return typeof value.id === "string" ? value.id : metadata.subscriptionId ?? null;
}

function periodFromStripeObject(type: string, value: Record<string, unknown>): StripePeriod | null {
  const expanded = type === "checkout.session.completed" ? nestedRecord(value, "subscription") : null;
  const source = expanded ?? value;

  // Stripe Basil removed subscription-level current_period_start/end. The
  // period now belongs to each subscription item. Resolve a single period
  // only when every item agrees; differing intervals need an explicit local
  // price binding/reconciliation and must not depend on array order.
  const items = nestedRecord(source, "items");
  const itemData = items && Array.isArray(items.data) ? items.data : [];
  if (itemData.length > 0) {
    const itemPeriods = itemData.map((item) => {
      const itemRecord = item && typeof item === "object" && !Array.isArray(item)
        ? item as Record<string, unknown>
        : {};
      return periodFromPair(itemRecord.current_period_start, itemRecord.current_period_end)
        ?? periodFromPair(itemRecord.period_start, itemRecord.period_end);
    });
    if (itemPeriods.some((period) => period !== null)) return uniformPeriod(itemPeriods);
  }

  // Keep compatibility with pre-Basil subscription payloads and checkout
  // fixtures that expose the legacy top-level period.
  const currentPeriod = periodFromPair(source.current_period_start, source.current_period_end);
  if (currentPeriod) return currentPeriod;
  const legacyPeriod = periodFromPair(source.period_start, source.period_end);
  if (legacyPeriod) return legacyPeriod;

  const lines = nestedRecord(value, "lines");
  const lineData = lines && Array.isArray(lines.data) ? lines.data : [];
  const linePeriods: Array<StripePeriod | null> = [];
  for (const line of lineData) {
    const period = nestedRecord(line, "period");
    linePeriods.push(periodFromPair(period?.start, period?.end));
  }
  return uniformPeriod(linePeriods.filter((period): period is StripePeriod => period !== null));
}

/**
 * Resolve only an explicitly configured entitlement from a signed Stripe
 * event. No plan key, Stripe price, amount, or local allowance is interpreted
 * as included work. Missing configuration returns an unavailable projection so
 * the customer remains in a pending state.
 */
export function subscriptionAllowanceFromStripeEvent(event: unknown): SubscriptionAllowanceEntitlement | null {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const candidate = event as { id?: unknown; created?: unknown; type?: unknown; data?: { object?: unknown } };
  if (typeof candidate.id !== "string" || typeof candidate.created !== "number" || typeof candidate.type !== "string") return null;
  const allowedTypes = new Set(["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"]);
  if (!allowedTypes.has(candidate.type)) return null;
  const value = candidate.data?.object;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  const metadata = metadataFromStripeObject(object);
  const subscriptionId = subscriptionIdFromStripeEvent(candidate.type, object, metadata);
  const workspaceId = metadata.workspaceId;
  const payerId = metadata.payerId;
  // A signed event can identify the business and payer without carrying a
  // selected included-work configuration. Preserve that known subscription as
  // an unavailable projection instead of silently turning it into “no billing
  // record”; no allowance or price is inferred from the Stripe event.
  const configKey = metadata.allowanceConfigKey ?? "unavailable";
  if (!subscriptionId || !workspaceId || !payerId) return null;
  const status = statusFromStripeEvent(candidate.type, object);
  const period = periodFromStripeObject(candidate.type, object);
  if (!period) return null;
  const terms = entitlementConfig(configKey);
  const parsed = subscriptionAllowanceEntitlementSchema.safeParse({
    version: 1,
    eventId: candidate.id,
    eventCreated: candidate.created,
    subscriptionId,
    customerId: typeof object.customer === "string"
      ? object.customer
      : (nestedRecord(object, "subscription")?.customer && typeof nestedRecord(object, "subscription")?.customer === "string"
        ? nestedRecord(object, "subscription")?.customer as string
        : metadata.customerId ?? null),
    workspaceId,
    payerId,
    configKey,
    status: terms && (status === "active" || status === "trialing") ? status : terms ? status : "unavailable",
    periodStart: period.start,
    periodEnd: period.end,
    ...(terms ? terms : {}),
  });
  return parsed.success ? parsed.data : null;
}

type SubscriptionEntitlementDatabase = { public: {
  Tables: Record<string, never>;
  Views: Record<string, never>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
  Functions: {
    sync_subscription_allowance_entitlement: { Args: { p_entitlement: unknown }; Returns: unknown };
  };
} };

/** Apply one trusted, already-resolved entitlement through its idempotent SQL projection. */
export async function syncSubscriptionAllowanceEntitlement(value: unknown): Promise<SubscriptionAllowanceSyncResult> {
  const parsed = subscriptionAllowanceEntitlementSchema.safeParse(value);
  if (!parsed.success) throw new SubscriptionEntitlementValidationError("The subscription allowance entitlement is invalid.");
  const client = getSupabase();
  if (!client) throw new SubscriptionEntitlementPersistenceError("Subscription allowance synchronization is not configured.");
  const result = await (client as unknown as import("@supabase/supabase-js").SupabaseClient<SubscriptionEntitlementDatabase>).rpc(
    "sync_subscription_allowance_entitlement",
    { p_entitlement: parsed.data },
  );
  if (result.error) throw new SubscriptionEntitlementPersistenceError("Subscription allowance synchronization failed.", { cause: result.error });
  return parseSyncResult(result.data);
}

/** Webhook seam. Missing mapping/configuration deliberately leaves billing pending. */
export async function syncConfiguredSubscriptionAllowance(event: unknown): Promise<SubscriptionAllowanceSyncResult | null> {
  const entitlement = subscriptionAllowanceFromStripeEvent(event);
  return entitlement ? syncSubscriptionAllowanceEntitlement(entitlement) : null;
}

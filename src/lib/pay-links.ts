/**
 * Pay-links — per-client "pay before work starts" checkout links for the
 * two-door website offer (docs/strategy/website-offer-two-door.md).
 *
 * A pay-link is a small Redis-backed record Jacob mints per client (via the
 * super-admin POST /api/admin/pay-links route) that powers the public
 * /pay/[slug] page + POST /api/pay/[slug] Stripe checkout.
 *
 * Two doors:
 *  - "build"         — Door 1: a one-time build payment ($1,500–2,500), which
 *                      includes the first 3 months of management ($99/mo after).
 *  - "managed_start" — Door 2: the $499 start payment that opens a $199/mo,
 *                      12-month-minimum managed plan (own-the-site after month 12).
 *
 * Both doors create a Stripe Checkout session in mode:"payment" (the start /
 * build payment only). The recurring side is provisioned separately — this
 * record captures the up-front charge that must clear before work begins.
 *
 * NOTE: this is a NEW mechanism. The grandfathered /pay/rohlax page
 * (src/lib/rohlax-payment.ts) is intentionally separate and untouched.
 */

import { getRedis } from "./redis";
import { formatWholeDollarsUsd } from "./currency";

/**
 * Persistent Redis keys follow the repo's `reb:` convention (AGENTS.md) — wire-
 * level / persistent-data prefixes are intentionally NOT renamed to scaffold/
 * strelva.
 */
export const PAY_LINK_PREFIX = "reb:paylink:";
/** Sorted/unordered set of every minted slug, so the admin can list links. */
export const PAY_LINK_INDEX_KEY = "reb:paylink:index";
/** Pay links are long-lived (payment can precede tenant provisioning). 1 year. */
export const PAY_LINK_TTL_SECONDS = 60 * 60 * 24 * 365;

/** Hard guardrails so a malformed mint can never create a $0 or absurd charge. */
export const PAY_LINK_MIN_CENTS = 5_000; // $50 floor
export const PAY_LINK_MAX_CENTS = 1_000_000; // $10,000 ceiling
/** The slider moves in $50 steps; a range's span must be a whole multiple of it. */
export const PAY_LINK_RANGE_STEP_CENTS = 5_000; // $50

export const PAY_LINK_DOORS = ["build", "managed_start"] as const;
export type PayLinkDoor = (typeof PAY_LINK_DOORS)[number];

/** Stripe metadata.paymentPurpose value the billing webhook keys off of, per door. */
export const PAY_LINK_PURPOSE: Record<PayLinkDoor, "build_payment" | "managed_start"> = {
  build: "build_payment",
  managed_start: "managed_start",
};

export interface PayLinkConfig {
  /** URL slug, e.g. "acme-coffee". Lowercase letters, numbers, hyphens. */
  slug: string;
  /** Client-facing display name shown on the page, e.g. "Acme Coffee". */
  clientName: string;
  /** Which door this link sells. */
  door: PayLinkDoor;
  /**
   * Resolved tenant id, when the tenant already exists. Optional: payment can
   * precede tenant provisioning, so a pre-tenant lead has no tenant id yet.
   */
  tenantId?: string;
  /** Pre-tenant lead slug/handle for links minted before the tenant exists. */
  leadSlug?: string;
  /** Fixed price in cents. Mutually exclusive with min/max. */
  amountCents?: number;
  /** Lower bound (cents) for a slider/range link. Requires maxCents. */
  minCents?: number;
  /** Upper bound (cents) for a slider/range link. Requires minCents. */
  maxCents?: number;
  /** Optional extra copy line shown under the door-specific terms. */
  customCopy?: string;
  /** Where the "back" link/header points (e.g. the client's marketing site). */
  returnUrl?: string;
  /** ISO timestamp the record was created. */
  createdAt: string;
  /** Email of the super-admin who minted the link, for the trail. */
  createdBy?: string;
}

export class PayLinkValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayLinkValidationError";
  }
}

export class PayLinkStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PayLinkStorageError";
  }
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizePayLinkSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

function isDoor(value: unknown): value is PayLinkDoor {
  return typeof value === "string" && PAY_LINK_DOORS.includes(value as PayLinkDoor);
}

/**
 * Coerce an admin-supplied cents value. Absent (undefined/null/"") -> undefined.
 * Present but non-numeric -> throws PayLinkValidationError (no NaN sentinel), so
 * every value this returns is a finite integer.
 */
function coerceCents(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) {
    throw new PayLinkValidationError(`${field} must be a number of cents.`);
  }
  return Math.round(n);
}

function trimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  return s ? s : undefined;
}

/** True when the link presents a fixed price (vs. a min/max slider). */
export function isFixedAmount(config: PayLinkConfig): boolean {
  return typeof config.amountCents === "number";
}

/**
 * Format cents as a whole-dollar USD string (no cents), matching the
 * Rohlax page's customer-facing presentation.
 */
export function formatPayLinkAmount(cents: number): string {
  return formatWholeDollarsUsd(cents);
}

/**
 * Resolve the integer cents to charge for a submitted amount, or null if it is
 * rejected.
 *
 * UNITS CONTRACT (single, type-agnostic): the submitted amount is always in
 * WHOLE DOLLARS, whether it arrives as a JSON number (750) or a numeric string
 * ("750") — the public form sends whole dollars. Both are multiplied by 100 to
 * get cents. This removes the prior number-vs-string ambiguity where a numeric
 * 750 was misread as $7.50.
 *
 * - Fixed-amount links: the submitted dollars must equal amountCents.
 * - Range links: the resulting cents must fall within [minCents, maxCents].
 */
export function resolvePayLinkChargeCents(
  config: PayLinkConfig,
  submitted: unknown,
): number | null {
  let dollars: number;
  if (typeof submitted === "number") {
    if (!Number.isFinite(submitted)) return null;
    dollars = submitted;
  } else if (typeof submitted === "string") {
    const parsed = Number.parseFloat(submitted.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(parsed)) return null;
    dollars = parsed;
  } else {
    return null;
  }

  const cents = Math.round(dollars * 100);
  if (!Number.isFinite(cents)) return null;

  if (isFixedAmount(config)) {
    return cents === config.amountCents ? cents : null;
  }

  if (typeof config.minCents === "number" && typeof config.maxCents === "number") {
    return cents >= config.minCents && cents <= config.maxCents ? cents : null;
  }

  return null;
}

/**
 * Raw, untrusted input shape (e.g. a parsed admin JSON body). Every field is
 * optional + unknown because validation happens entirely at runtime in
 * buildPayLinkConfig; this lets callers spread an arbitrary record in.
 */
export interface PayLinkConfigInput {
  slug?: unknown;
  clientName?: unknown;
  door?: unknown;
  tenantId?: unknown;
  leadSlug?: unknown;
  amountCents?: unknown;
  minCents?: unknown;
  maxCents?: unknown;
  customCopy?: unknown;
  returnUrl?: unknown;
  createdBy?: unknown;
}

/**
 * Build a validated PayLinkConfig from raw (admin-supplied) input. Throws a
 * PayLinkValidationError on any malformed field. Does NOT persist.
 */
export function buildPayLinkConfig(input: PayLinkConfigInput): PayLinkConfig {
  const slug = normalizePayLinkSlug(input.slug);
  if (!slug) {
    throw new PayLinkValidationError(
      "Invalid slug. Use lowercase letters, numbers, and hyphens (e.g. acme-coffee).",
    );
  }

  const clientName = trimmedString(input.clientName);
  if (!clientName) {
    throw new PayLinkValidationError("clientName is required.");
  }

  if (!isDoor(input.door)) {
    throw new PayLinkValidationError(`door must be one of: ${PAY_LINK_DOORS.join(", ")}.`);
  }
  const door = input.door;

  // coerceCents throws on present-but-invalid input, so each result here is
  // either undefined (absent) or a finite integer — no NaN sentinel to re-check.
  const amountCents = coerceCents(input.amountCents, "amountCents");
  const minCents = coerceCents(input.minCents, "minCents");
  const maxCents = coerceCents(input.maxCents, "maxCents");

  const hasFixed = amountCents !== undefined;
  const hasRange = minCents !== undefined || maxCents !== undefined;

  if (hasFixed && hasRange) {
    throw new PayLinkValidationError("Provide either amountCents OR minCents/maxCents, not both.");
  }
  if (!hasFixed && !hasRange) {
    throw new PayLinkValidationError("Provide amountCents, or both minCents and maxCents.");
  }

  if (hasFixed) {
    if ((amountCents as number) < PAY_LINK_MIN_CENTS || (amountCents as number) > PAY_LINK_MAX_CENTS) {
      throw new PayLinkValidationError(
        `amountCents must be between ${PAY_LINK_MIN_CENTS} and ${PAY_LINK_MAX_CENTS} cents.`,
      );
    }
  } else {
    if (minCents === undefined || maxCents === undefined) {
      throw new PayLinkValidationError("A range link requires both minCents and maxCents.");
    }
    if (minCents < PAY_LINK_MIN_CENTS || maxCents > PAY_LINK_MAX_CENTS || minCents > maxCents) {
      throw new PayLinkValidationError(
        `minCents/maxCents must satisfy ${PAY_LINK_MIN_CENTS} <= minCents <= maxCents <= ${PAY_LINK_MAX_CENTS}.`,
      );
    }
    // The slider moves in fixed $50 steps from minCents. If the span isn't a
    // whole multiple of that step, the advertised maxCents is unreachable — so
    // reject the mint rather than ship a link whose ceiling can't be paid.
    if ((maxCents - minCents) % PAY_LINK_RANGE_STEP_CENTS !== 0) {
      throw new PayLinkValidationError(
        `maxCents − minCents must be a whole multiple of ${PAY_LINK_RANGE_STEP_CENTS} cents ($50) so the slider can reach the maximum.`,
      );
    }
  }

  const tenantId = trimmedString(input.tenantId);
  const leadSlug = trimmedString(input.leadSlug);
  if (!tenantId && !leadSlug) {
    throw new PayLinkValidationError("Provide a tenantId or a leadSlug to attribute the payment.");
  }

  const returnUrl = trimmedString(input.returnUrl);
  if (returnUrl) {
    try {
      const url = new URL(returnUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("bad protocol");
      }
    } catch {
      throw new PayLinkValidationError("returnUrl must be a valid http(s) URL.");
    }
  }

  return {
    slug,
    clientName,
    door,
    ...(tenantId ? { tenantId } : {}),
    ...(leadSlug ? { leadSlug } : {}),
    ...(hasFixed ? { amountCents: amountCents as number } : {}),
    ...(hasRange ? { minCents: minCents as number, maxCents: maxCents as number } : {}),
    ...(trimmedString(input.customCopy) ? { customCopy: trimmedString(input.customCopy) } : {}),
    ...(returnUrl ? { returnUrl } : {}),
    createdAt: new Date().toISOString(),
    ...(trimmedString(input.createdBy) ? { createdBy: trimmedString(input.createdBy) } : {}),
  };
}

/** Thrown by savePayLink when a slug already exists and overwrite wasn't allowed. */
export class PayLinkConflictError extends Error {
  constructor(slug: string) {
    super(`A pay link with slug "${slug}" already exists. Pass overwrite to replace it.`);
    this.name = "PayLinkConflictError";
  }
}

export interface SavePayLinkOptions {
  /** Allow replacing an existing slug. Defaults to false (refuse to overwrite). */
  overwrite?: boolean;
}

export async function savePayLink(
  config: PayLinkConfig,
  options: SavePayLinkOptions = {},
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    throw new PayLinkStorageError("Redis is not configured for pay-link storage.");
  }
  const key = `${PAY_LINK_PREFIX}${config.slug}`;

  if (!options.overwrite) {
    // Atomic create: SET NX so two concurrent mints of the same slug can't both
    // pass a get()-check and clobber each other (the prior get-then-set was a
    // TOCTOU — the conflict guard was illusory under concurrency).
    const created: unknown = await redis.set(key, config, { ex: PAY_LINK_TTL_SECONDS, nx: true });
    if (created === null || created === undefined || created === false) {
      throw new PayLinkConflictError(config.slug);
    }
    await redis.sadd(PAY_LINK_INDEX_KEY, config.slug);
    return;
  }

  const result: unknown = await redis.set(key, config, { ex: PAY_LINK_TTL_SECONDS });
  if (result === null || result === undefined || result === false) {
    throw new PayLinkStorageError(`Redis did not confirm pay-link storage for ${config.slug}.`);
  }
  // Track the slug so the admin can list every minted link. Best-effort: a
  // failed index write must not undo a successful record write.
  await redis.sadd(PAY_LINK_INDEX_KEY, config.slug);
}

export async function getPayLink(slug: string): Promise<PayLinkConfig | null> {
  const normalized = normalizePayLinkSlug(slug);
  if (!normalized) return null;
  const redis = getRedis();
  if (!redis) return null;
  const key = `${PAY_LINK_PREFIX}${normalized}`;
  return redis.get<PayLinkConfig>(key);
}

/**
 * List every minted pay link (admin-only). Reads the slug index set, then the
 * config for each slug. Slugs whose record has expired/been deleted are skipped
 * (and pruned from the index). Sorted newest-first by createdAt.
 */
export async function listPayLinks(): Promise<PayLinkConfig[]> {
  const redis = getRedis();
  if (!redis) return [];
  const slugs = await redis.smembers(PAY_LINK_INDEX_KEY);
  if (!slugs || slugs.length === 0) return [];

  const keys = slugs.map((slug) => `${PAY_LINK_PREFIX}${slug}`);
  const records = await redis.mget<(PayLinkConfig | null)[]>(...keys);

  const links: PayLinkConfig[] = [];
  const stale: string[] = [];
  records.forEach((record, i) => {
    if (record) links.push(record);
    else stale.push(slugs[i]);
  });

  if (stale.length > 0) {
    // Prune expired/missing slugs from the index. Best-effort.
    await redis.srem(PAY_LINK_INDEX_KEY, ...stale);
  }

  return links.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Revoke a pay link: delete its record and drop it from the index. Returns true
 * if a record was removed. Idempotent — revoking an already-gone slug is a no-op
 * that still cleans the index.
 */
export async function deletePayLink(slug: string): Promise<boolean> {
  const normalized = normalizePayLinkSlug(slug);
  if (!normalized) return false;
  const redis = getRedis();
  if (!redis) {
    throw new PayLinkStorageError("Redis is not configured for pay-link storage.");
  }
  const removed = await redis.del(`${PAY_LINK_PREFIX}${normalized}`);
  await redis.srem(PAY_LINK_INDEX_KEY, normalized);
  return removed > 0;
}

import { promises as fs } from "fs";
import path from "path";
import type { DomainClaim, TenantConfig, TemplateId, TenantFeature, IntegrationProvider, TenantDeliveryModel } from "./types";
import { ALL_TENANT_FEATURES } from "./types";
import { getRedis } from "./redis";
import { decryptSecret, encryptSecret } from "./crypto/secrets";
import { assignUserToTenant, findUserIdByEmail } from "./auth";
import { isProductionEnv } from "./production-guard";
import { buildTenantDomainMap } from "./tenant-domain-map";
import { tenantsSourceIsPostgres } from "./db/source-flags";
import {
  listAllTenants,
  getTenant as getTenantRow,
  upsertTenant,
} from "./db/repositories";
import {
  domainClaimToRow,
  listAllDomainClaims,
  listDomainClaims,
  replaceDomainClaims,
  rowToDomainClaim,
} from "./db/domain-claims";
import type { Row, Insert } from "./db/client";

/**
 * Postgres `tenants` row -> TenantConfig (the spine mapper). The Postgres table
 * is 45 individual snake_case columns. subdomain has no column (== id).
 * Domain claims are attached separately by loadTenants/getTenantWithClaims.
 */
export function rowToTenant(r: Row<"tenants">): TenantConfig {
  return {
    id: r.id,
    subdomain: r.id,
    stableId: r.stable_id ?? undefined,
    siteName: r.site_name,
    ownerName: r.owner_name ?? "",
    ownerEmail: r.owner_email ?? undefined,
    industry: r.industry ?? "",
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    template: (r.template ?? "wellness") as TemplateId,
    deliveryModel: (r.delivery_model as TenantDeliveryModel) ?? undefined,
    customRepo: (r.custom_repo as TenantConfig["customRepo"]) ?? undefined,
    siteCapabilities: (r.site_capabilities as TenantConfig["siteCapabilities"]) ?? undefined,
    features: r.features?.filter(
      (feature): feature is TenantFeature =>
        (ALL_TENANT_FEATURES as readonly string[]).includes(feature),
    ) ?? undefined,
    integrations: (r.integrations as IntegrationProvider[]) ?? undefined,
    customDomains: r.custom_domains ?? undefined,
    domainClaims: [],
    productionDomain: r.production_domain ?? undefined,
    adminDomain: r.admin_domain ?? undefined,
    stripeCustomerId: r.stripe_customer_id ?? undefined,
    subscriptionStatus: (r.subscription_status as TenantConfig["subscriptionStatus"]) ?? undefined,
    stripeSubscriptionId: r.stripe_subscription_id ?? undefined,
    subscriptionPlan: (r.subscription_plan as TenantConfig["subscriptionPlan"]) ?? undefined,
    planMonthlyCents: r.plan_monthly_cents ?? undefined,
    planCurrency: r.plan_currency ?? undefined,
    subscriptionStartedAt: r.subscription_started_at ?? undefined,
    commitmentEndsAt: r.commitment_ends_at ?? undefined,
    planOverride: (r.plan_override as TenantConfig["planOverride"]) ?? undefined,
    // billing_type is a newer column; cast so the mapper doesn't depend on a type regen.
    billingType:
      (((r as { billing_type?: string | null }).billing_type as TenantConfig["billingType"]) ?? undefined),
    subscriptionPastDueSince: r.subscription_past_due_since ?? undefined,
    bookingProvider: r.booking_provider ?? undefined,
    bookingUrl: r.booking_url ?? undefined,
    resendDomain: r.resend_domain ?? undefined,
    siteUrl: r.site_url ?? undefined,
    ownerPhone: r.owner_phone ?? undefined,
    referredBy: r.referred_by ?? undefined,
    autoPublish: r.auto_publish ?? undefined,
    autoApproveThreshold: r.auto_approve_threshold ?? null,
    beholdFeedId: r.behold_feed_id ?? undefined,
    socialConfig: (r.social_config as TenantConfig["socialConfig"]) ?? undefined,
    reviewsConfig: (r.reviews_config as TenantConfig["reviewsConfig"]) ?? undefined,
    businessRules: r.business_rules ?? undefined,
    personality: r.personality ?? undefined,
    businessHours: (r.business_hours as unknown as TenantConfig["businessHours"]) ?? undefined,
    slackWebhookUrl: decryptSecret(r.slack_webhook_url) ?? undefined,
    googleSearchConsoleKey: decryptSecret(r.google_search_console_key) ?? undefined,
    instagramAccessToken: decryptSecret(r.instagram_access_token) ?? undefined,
    revalidateUrl: r.revalidate_url ?? undefined,
    revalidationSecret: decryptSecret(r.revalidation_secret) ?? undefined,
    branding: (r.branding as TenantConfig["branding"]) ?? undefined,
    visibility: (r.visibility as unknown as TenantConfig["visibility"]) ?? undefined,
  };
}

async function getTenantWithClaims(id: string): Promise<TenantConfig | null> {
  const [row, claims] = await Promise.all([getTenantRow(id), listDomainClaims(id)]);
  if (!row) return null;
  return { ...rowToTenant(row), domainClaims: claims.map(rowToDomainClaim) };
}

/** TenantConfig -> Postgres insert/upsert row. Inverse of rowToTenant; only
 *  defined fields are set so a partial update doesn't clobber columns. */
export function tenantToRow(t: Partial<TenantConfig> & { id: string }): Insert<"tenants"> {
  const j = (v: unknown) => (v ?? null) as Insert<"tenants">["custom_repo"];
  // NOTE: site_name + created_at are set unconditionally because the generated
  // Insert type requires site_name (NOT NULL, no default). A PARTIAL update must
  // therefore backfill these from the existing row before calling this (see
  // updateTenant) so an unrelated edit doesn't blank the name / reset created_at
  // (which feeds milestone.ts's 90-day baseline). createTenant always passes both.
  const row: Insert<"tenants"> = {
    id: t.id,
    site_name: t.siteName ?? "",
    created_at: t.createdAt ?? new Date().toISOString().slice(0, 10),
    // Stamp the last-write time on every upsert (the column existed but was
    // never set, so updated_at was frozen at row creation).
    updated_at: new Date().toISOString(),
  };
  if (t.siteName !== undefined) row.site_name = t.siteName;
  if (t.ownerName !== undefined) row.owner_name = t.ownerName;
  if (t.ownerEmail !== undefined) row.owner_email = t.ownerEmail;
  if (t.industry !== undefined) row.industry = t.industry;
  if (t.active !== undefined) row.active = t.active;
  if (t.template !== undefined) row.template = t.template;
  if (t.deliveryModel !== undefined) row.delivery_model = t.deliveryModel;
  if (t.customRepo !== undefined) row.custom_repo = j(t.customRepo);
  if (t.siteCapabilities !== undefined) row.site_capabilities = j(t.siteCapabilities);
  if (t.features !== undefined) row.features = t.features;
  if (t.integrations !== undefined) row.integrations = t.integrations;
  if (t.customDomains !== undefined) row.custom_domains = t.customDomains;
  if (t.productionDomain !== undefined) row.production_domain = t.productionDomain;
  if (t.adminDomain !== undefined) row.admin_domain = t.adminDomain;
  if (t.stripeCustomerId !== undefined) row.stripe_customer_id = t.stripeCustomerId;
  if (t.subscriptionStatus !== undefined) row.subscription_status = t.subscriptionStatus;
  if (t.stripeSubscriptionId !== undefined) row.stripe_subscription_id = t.stripeSubscriptionId;
  if (t.subscriptionPlan !== undefined) row.subscription_plan = t.subscriptionPlan;
  if (t.planMonthlyCents !== undefined) row.plan_monthly_cents = t.planMonthlyCents;
  if (t.planCurrency !== undefined) row.plan_currency = t.planCurrency;
  if (t.subscriptionStartedAt !== undefined) row.subscription_started_at = t.subscriptionStartedAt;
  if (t.commitmentEndsAt !== undefined) row.commitment_ends_at = t.commitmentEndsAt;
  if (t.planOverride !== undefined) row.plan_override = t.planOverride;
  if (t.billingType !== undefined) (row as Record<string, unknown>).billing_type = t.billingType;
  if (t.subscriptionPastDueSince !== undefined) row.subscription_past_due_since = t.subscriptionPastDueSince;
  if (t.bookingProvider !== undefined) row.booking_provider = t.bookingProvider;
  if (t.bookingUrl !== undefined) row.booking_url = t.bookingUrl;
  if (t.resendDomain !== undefined) row.resend_domain = t.resendDomain;
  if (t.siteUrl !== undefined) row.site_url = t.siteUrl;
  if (t.ownerPhone !== undefined) row.owner_phone = t.ownerPhone;
  if (t.referredBy !== undefined) row.referred_by = t.referredBy;
  if (t.autoPublish !== undefined) row.auto_publish = t.autoPublish;
  if (t.autoApproveThreshold !== undefined) row.auto_approve_threshold = t.autoApproveThreshold;
  if (t.beholdFeedId !== undefined) row.behold_feed_id = t.beholdFeedId;
  if (t.socialConfig !== undefined) row.social_config = j(t.socialConfig);
  if (t.reviewsConfig !== undefined) row.reviews_config = j(t.reviewsConfig);
  if (t.businessRules !== undefined) row.business_rules = t.businessRules;
  if (t.personality !== undefined) row.personality = t.personality;
  if (t.businessHours !== undefined) row.business_hours = j(t.businessHours);
  if (t.slackWebhookUrl !== undefined) row.slack_webhook_url = encryptSecret(t.slackWebhookUrl);
  if (t.googleSearchConsoleKey !== undefined) row.google_search_console_key = encryptSecret(t.googleSearchConsoleKey);
  if (t.instagramAccessToken !== undefined) row.instagram_access_token = encryptSecret(t.instagramAccessToken);
  if (t.revalidateUrl !== undefined) row.revalidate_url = t.revalidateUrl;
  if (t.revalidationSecret !== undefined) row.revalidation_secret = encryptSecret(t.revalidationSecret);
  if (t.branding !== undefined) row.branding = j(t.branding);
  if (t.visibility !== undefined) row.visibility = j(t.visibility);
  // stable_id is immutable (DB default gen_random_uuid on insert); only ever
  // written when a caller explicitly carries it (never mutated after mint).
  if (t.stableId !== undefined) row.stable_id = t.stableId;
  return row;
}

const DEV_TENANTS_PATH = path.join(process.cwd(), "dev-tenants.json");

const REDIS_KEY = "reb:tenants:all";
const CACHE_TTL_SECONDS = 60;

// In-memory fallback when Redis is not configured
let _memCache: TenantConfig[] | null = null;
let _memCacheTime = 0;

async function loadTenants(): Promise<TenantConfig[]> {
  const redis = getRedis();

  // Try Redis cache first
  if (redis) {
    try {
      const cached = await redis.get<TenantConfig[]>(REDIS_KEY);
      if (cached) return cached;
    } catch {
      // Redis failed — continue to source of truth
    }
  }

  // In-memory fallback TTL check (used when Redis is down or not configured)
  const now = Date.now();
  if (_memCache && now - _memCacheTime < CACHE_TTL_SECONDS * 1000) return _memCache;

  let tenants: TenantConfig[] | undefined;

  // Postgres is the source of truth when TENANTS_SOURCE=postgres; the dev-file
  // path is local-only.
  if (tenantsSourceIsPostgres()) {
    const [rows, claims] = await Promise.all([listAllTenants(), listAllDomainClaims()]);
    const claimsByTenant = new Map<string, DomainClaim[]>();
    for (const row of claims) {
      const current = claimsByTenant.get(row.tenant_id) ?? [];
      current.push(rowToDomainClaim(row));
      claimsByTenant.set(row.tenant_id, current);
    }
    tenants = rows.map((row) => ({
      ...rowToTenant(row),
      domainClaims: claimsByTenant.get(row.id) ?? [],
    }));
  }

  if (!tenants) {
    // No Postgres source: prod must never silently serve the dev file.
    if (isProductionEnv()) {
      throw new Error("[PRODUCTION] TENANTS_SOURCE must be postgres — refusing dev-file fallback");
    }
    tenants = await loadFromDevFile();
  }

  tenants ??= [];

  // Cache ONLY a non-empty result. `listAllTenants` swallows a transient Postgres
  // error to `[]` (indistinguishable from a genuinely-empty platform), so caching
  // `[]` would turn a momentary DB blip into a full CACHE_TTL platform-wide outage
  // that persists even after Postgres recovers. Skipping the cache on empty means
  // the next request re-queries and self-heals; a truly-empty prod DB (never the
  // case with live tenants) just costs one extra query per request.
  if (tenants.length > 0) {
    if (redis) {
      try {
        await redis.set(REDIS_KEY, tenants, { ex: CACHE_TTL_SECONDS });
      } catch {
        // Redis write failed — not fatal
      }
    }
    _memCache = tenants;
    _memCacheTime = Date.now();
  }

  return tenants;
}

async function loadFromDevFile(): Promise<TenantConfig[]> {
  try {
    const raw = await fs.readFile(DEV_TENANTS_PATH, "utf-8");
    return JSON.parse(raw) as TenantConfig[];
  } catch {
    return [];
  }
}

function invalidateCache() {
  _memCache = null;
  _memCacheTime = 0;

  const redis = getRedis();
  if (redis) {
    redis.del(REDIS_KEY).catch(() => {
      // Redis delete failed — TTL will expire it
    });
  }
}


export async function getTenantConfig(
  tenantId: string
): Promise<TenantConfig | undefined> {
  const tenants = await loadTenants();
  return tenants.find((t) => t.id === tenantId);
}

export async function getAllTenants(): Promise<TenantConfig[]> {
  return loadTenants();
}

/**
 * Resolve a tenant by the Stripe subscription id stored on it at checkout
 * (Postgres `stripe_subscription_id` -> TenantConfig.stripeSubscriptionId).
 * The billing webhook's stripe-id fallback: when a Basil invoice event carries
 * no tenantId metadata, this recovers the tenant so a renewal/failure is never
 * silently dropped. Scans the same Redis-cached list as getTenantConfig.
 */
export async function getTenantByStripeSubscriptionId(
  subscriptionId: string
): Promise<TenantConfig | undefined> {
  if (!subscriptionId) return undefined;
  const tenants = await loadTenants();
  return tenants.find((t) => t.stripeSubscriptionId === subscriptionId);
}

/**
 * Resolve a tenant by the Stripe customer id (Postgres `stripe_customer_id` ->
 * TenantConfig.stripeCustomerId). Last-resort fallback for the billing webhook
 * when neither the invoice metadata nor the subscription id resolves.
 */
export async function getTenantByStripeCustomerId(
  customerId: string
): Promise<TenantConfig | undefined> {
  if (!customerId) return undefined;
  const tenants = await loadTenants();
  return tenants.find((t) => t.stripeCustomerId === customerId);
}

export function isActiveTenant(tenant: Pick<TenantConfig, "active">): boolean {
  return tenant.active !== false;
}

export async function getActiveTenants(): Promise<TenantConfig[]> {
  const tenants = await loadTenants();
  return tenants.filter(isActiveTenant);
}

// ---------------------------------------------------------------------------
// Domain-based tenant lookup (for proxy custom domain resolution)
// ---------------------------------------------------------------------------

const DOMAIN_CACHE_KEY = "reb:domain-map";
const DOMAIN_CACHE_TTL = 60;

let _domainMapCache: Record<string, { tenantId: string; isAdmin: boolean }> | null = null;
let _domainMapCacheTime = 0;

/** Build the trusted domain map from tenant configuration and verified claims. */
async function buildDomainMap(): Promise<Record<string, { tenantId: string; isAdmin: boolean }>> {
  return buildTenantDomainMap(await loadTenants());
}

/**
 * Look up tenant by custom domain. Returns null if no match.
 * Uses Redis cache when available, falls back to in-memory cache.
 */
/**
 * Static last-resort domain map from the CUSTOM_DOMAIN_MAP env var
 * (domain -> tenantId JSON). Depends on neither Redis nor Sanity, so it keeps
 * custom-domain routing alive when both are down. Mirrors getEnvDomainMap in
 * proxy.ts (kept local to avoid a proxy<->tenants import cycle).
 */
function envDomainLookup(
  normalized: string,
  lower: string
): { tenantId: string; isAdmin: boolean } | null {
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(process.env.CUSTOM_DOMAIN_MAP || "{}");
  } catch {
    return null;
  }
  const tenantId = parsed[normalized] || parsed[lower];
  if (!tenantId) return null;
  return { tenantId, isAdmin: lower.startsWith("admin.") };
}

export async function getTenantByDomain(
  domain: string
): Promise<{ tenantId: string; isAdmin: boolean } | null> {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  const lower = domain.toLowerCase();
  const redis = getRedis();

  // Try Redis cache
  if (redis) {
    try {
      const cached = await redis.get<Record<string, { tenantId: string; isAdmin: boolean }>>(DOMAIN_CACHE_KEY);
      if (cached) {
        return cached[normalized] || cached[lower] || null;
      }
    } catch {
      // Redis failed, continue to rebuild
    }
  }

  // Check in-memory cache
  const now = Date.now();
  if (_domainMapCache && now - _domainMapCacheTime < DOMAIN_CACHE_TTL * 1000) {
    return _domainMapCache[normalized] || _domainMapCache[lower] || null;
  }

  // Rebuild map from the source of truth (Postgres/dev via loadTenants). If that
  // ALSO throws (Postgres down at the same time as Redis), do NOT break all
  // custom-domain routing — serve the last-known-good in-memory map even if
  // stale, then fall back to the static env map.
  let map: Record<string, { tenantId: string; isAdmin: boolean }>;
  try {
    map = await buildDomainMap();
  } catch (err) {
    console.error("[tenants] domain-map rebuild failed; serving stale/env fallback:", err);
    if (_domainMapCache) {
      const stale = _domainMapCache[normalized] || _domainMapCache[lower];
      if (stale) return stale;
    }
    return envDomainLookup(normalized, lower);
  }

  // Cache ONLY a non-empty map. An empty map means `loadTenants()` returned []
  // (a transient Postgres error, swallowed to [] upstream) — caching it would
  // black out ALL custom-domain routing for the full TTL even after Postgres
  // recovers. Skipping the cache on empty lets the next request self-heal
  // (mirrors the loadTenants guard). A genuinely-empty map (fresh/local env with
  // no custom domains) just costs a rebuild per request. This request still
  // resolves via the static env map below.
  if (Object.keys(map).length > 0) {
    if (redis) {
      try {
        await redis.set(DOMAIN_CACHE_KEY, map, { ex: DOMAIN_CACHE_TTL });
      } catch {
        // Redis write failed, not fatal
      }
    }
    _domainMapCache = map;
    _domainMapCacheTime = Date.now();
  }

  // A domain present only in the static env map (e.g. a freshly-pointed domain
  // not yet in the tenant record) still resolves.
  return map[normalized] || map[lower] || envDomainLookup(normalized, lower);
}

/**
 * Invalidate domain map cache (call after tenant domain changes)
 */
export function invalidateDomainMapCache(): void {
  _domainMapCache = null;
  _domainMapCacheTime = 0;

  const redis = getRedis();
  if (redis) {
    redis.del(DOMAIN_CACHE_KEY).catch(() => {});
  }
}

export async function createTenant(
  config: Omit<TenantConfig, "id" | "createdAt" | "active" | "subscriptionStatus">
): Promise<TenantConfig> {
  const tenant: TenantConfig = {
    ...config,
    id: config.subdomain,
    active: true,
    createdAt: new Date().toISOString().slice(0, 10),
    subscriptionStatus: "none",
  };

  if (tenantsSourceIsPostgres()) {
    const existing = await getTenantRow(tenant.id);
    if (existing) throw new Error(`Tenant "${tenant.id}" already exists`);
    await upsertTenant(tenantToRow(tenant));
    invalidateCache();
  } else {
    const tenants = await loadTenants();
    if (tenants.find((t) => t.id === tenant.id)) {
      throw new Error(`Tenant "${tenant.id}" already exists`);
    }

    tenants.push(tenant);
    await fs.writeFile(DEV_TENANTS_PATH, JSON.stringify(tenants, null, 2));
    invalidateCache();
  }

  // Auto-assign owner if they already have an account.
  if (config.ownerEmail) {
    try {
      const ownerId = await findUserIdByEmail(config.ownerEmail);
      if (ownerId) {
        await assignUserToTenant(ownerId, tenant.id);
      }
    } catch {
      // Owner has no account yet; they'll be assigned when they sign up.
    }
  }

  return tenant;
}

export async function updateTenant(
  id: string,
  updates: Partial<TenantConfig>
): Promise<TenantConfig | null> {
  if (tenantsSourceIsPostgres()) {
    const existing = await getTenantRow(id);
    if (!existing) return null;
    // The Postgres upsert overwrites exactly the columns tenantToRow emits, and
    // tenantToRow ALWAYS emits site_name + created_at (the Insert type requires
    // site_name). So a partial update that doesn't touch them would blank the
    // business name / reset created_at (which feeds milestone.ts's 90-day
    // baseline). Backfill both from the existing row unless the update changes them.
    const existingConfig = rowToTenant(existing);
    if (updates.domainClaims !== undefined) {
      await replaceDomainClaims(id, updates.domainClaims.map(domainClaimToRow));
    }
    await upsertTenant(
      tenantToRow({
        ...updates,
        id,
        siteName: updates.siteName ?? existingConfig.siteName,
        createdAt: updates.createdAt ?? existingConfig.createdAt,
      }),
    );
    invalidateCache();
    return getTenantWithClaims(id);
  }

  const tenants = await loadTenants();
  const idx = tenants.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  tenants[idx] = { ...tenants[idx], ...updates, id };
  await fs.writeFile(DEV_TENANTS_PATH, JSON.stringify(tenants, null, 2));
  invalidateCache();
  return tenants[idx];
}

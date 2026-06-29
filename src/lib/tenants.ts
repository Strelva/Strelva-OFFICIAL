import { promises as fs } from "fs";
import path from "path";
import type { TenantConfig, TemplateId, TenantFeature, IntegrationProvider, TenantDeliveryModel } from "./types";
import { getRedis } from "./redis";
import { assignUserToTenant, findUserIdByEmail } from "./auth";
import { isProductionEnv } from "./production-guard";
import { getTenantPrimaryDomain, normalizeTenantDomain } from "./tenant-urls";
import { tenantsSourceIsPostgres } from "./db/source-flags";
import { listAllTenants, getTenant as getTenantRow, upsertTenant } from "./db/repositories";
import type { Row, Insert } from "./db/client";

/**
 * Postgres `tenants` row -> TenantConfig (the spine mapper). The Postgres table
 * is 45 individual snake_case columns. subdomain has no column (== id), and
 * domainClaims live in the separate `domain_claims` table (currently empty;
 * routing uses production_domain/custom_domains, so [] is correct).
 */
export function rowToTenant(r: Row<"tenants">): TenantConfig {
  return {
    id: r.id,
    subdomain: r.id,
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
    features: (r.features as TenantFeature[]) ?? undefined,
    integrations: (r.integrations as IntegrationProvider[]) ?? undefined,
    customDomains: r.custom_domains ?? undefined,
    domainClaims: [],
    productionDomain: r.production_domain ?? undefined,
    adminDomain: r.admin_domain ?? undefined,
    stripeCustomerId: r.stripe_customer_id ?? undefined,
    subscriptionStatus: (r.subscription_status as TenantConfig["subscriptionStatus"]) ?? undefined,
    stripeSubscriptionId: r.stripe_subscription_id ?? undefined,
    subscriptionStartedAt: r.subscription_started_at ?? undefined,
    commitmentEndsAt: r.commitment_ends_at ?? undefined,
    planOverride: (r.plan_override as TenantConfig["planOverride"]) ?? undefined,
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
    slackWebhookUrl: r.slack_webhook_url ?? undefined,
    googleSearchConsoleKey: r.google_search_console_key ?? undefined,
    instagramAccessToken: r.instagram_access_token ?? undefined,
    revalidateUrl: r.revalidate_url ?? undefined,
    revalidationSecret: r.revalidation_secret ?? undefined,
    branding: (r.branding as TenantConfig["branding"]) ?? undefined,
    visibility: (r.visibility as unknown as TenantConfig["visibility"]) ?? undefined,
  };
}

/** TenantConfig -> Postgres insert/upsert row. Inverse of rowToTenant; only
 *  defined fields are set so a partial update doesn't clobber columns. */
export function tenantToRow(t: Partial<TenantConfig> & { id: string }): Insert<"tenants"> {
  const j = (v: unknown) => (v ?? null) as Insert<"tenants">["custom_repo"];
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
  if (t.subscriptionStartedAt !== undefined) row.subscription_started_at = t.subscriptionStartedAt;
  if (t.commitmentEndsAt !== undefined) row.commitment_ends_at = t.commitmentEndsAt;
  if (t.planOverride !== undefined) row.plan_override = t.planOverride;
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
  if (t.slackWebhookUrl !== undefined) row.slack_webhook_url = t.slackWebhookUrl;
  if (t.googleSearchConsoleKey !== undefined) row.google_search_console_key = t.googleSearchConsoleKey;
  if (t.instagramAccessToken !== undefined) row.instagram_access_token = t.instagramAccessToken;
  if (t.revalidateUrl !== undefined) row.revalidate_url = t.revalidateUrl;
  if (t.revalidationSecret !== undefined) row.revalidation_secret = t.revalidationSecret;
  if (t.branding !== undefined) row.branding = j(t.branding);
  if (t.visibility !== undefined) row.visibility = j(t.visibility);
  return row;
}

const hasSanity = !!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID && !!process.env.SANITY_API_TOKEN;
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

  // Postgres is the source of truth when TENANTS_SOURCE=postgres. Fall through to
  // Sanity only if Postgres has no rows (so a misconfig can't blank the platform).
  if (tenantsSourceIsPostgres()) {
    const rows = await listAllTenants();
    if (rows.length > 0) tenants = rows.map(rowToTenant);
  }

  if (!tenants) {
    if (hasSanity) {
      const { getSanityClient } = await import("./sanity");
      const docs = await getSanityClient().fetch(
        `*[_type == "tenant"] | order(createdAt desc)`
      );
      const fromSanity = (docs || []).map(sanityToTenant);
      if (fromSanity.length > 0) {
        tenants = fromSanity;
        if (!isProductionEnv()) {
          const devTenants = await loadFromDevFile();
          const existingIds = new Set(fromSanity.map((tenant: TenantConfig) => tenant.id));
          tenants = [
            ...fromSanity,
            ...devTenants.filter((tenant) => !existingIds.has(tenant.id)),
          ];
        }
      } else if (isProductionEnv() && !tenantsSourceIsPostgres()) {
        throw new Error("[PRODUCTION] Sanity returned no tenants — cannot fall back to dev file");
      } else {
        tenants = await loadFromDevFile();
      }
    } else if (isProductionEnv() && !tenantsSourceIsPostgres()) {
      throw new Error("[PRODUCTION] Sanity not configured — cannot fall back to dev file");
    } else {
      tenants = await loadFromDevFile();
    }
  }

  tenants ??= [];

  // Write to Redis cache (fire-and-forget)
  if (redis) {
    try {
      await redis.set(REDIS_KEY, tenants, { ex: CACHE_TTL_SECONDS });
    } catch {
      // Redis write failed — not fatal
    }
  }

  // Always update in-memory fallback
  _memCache = tenants;
  _memCacheTime = Date.now();
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanityToTenant(doc: any): TenantConfig {
  const { _id, _rev, _type, _createdAt, _updatedAt, ...rest } = doc;
  return rest as TenantConfig;
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

/**
 * Build a domain -> tenant mapping from all tenants.
 * Includes productionDomain, adminDomain, and customDomains.
 */
async function buildDomainMap(): Promise<Record<string, { tenantId: string; isAdmin: boolean }>> {
  const tenants = await loadTenants();
  const map: Record<string, { tenantId: string; isAdmin: boolean }> = {};

  for (const tenant of tenants) {
    if (!isActiveTenant(tenant)) continue;

    // Production domain
    const primaryDomain = getTenantPrimaryDomain(tenant);
    if (primaryDomain) {
      const prod = primaryDomain.toLowerCase();
      map[prod] = { tenantId: tenant.id, isAdmin: false };
      map[`www.${prod}`] = { tenantId: tenant.id, isAdmin: false };
    }

    // Admin domain (explicit or derived from the tenant's real public domain)
    const adminCustomDomain = tenant.customDomains
      ?.map((domain) => normalizeTenantDomain(domain))
      .find((domain): domain is string => !!domain && domain.startsWith("admin."));
    const adminDomain = normalizeTenantDomain(tenant.adminDomain)
      || adminCustomDomain
      || (primaryDomain ? `admin.${primaryDomain}` : null);
    if (adminDomain) {
      map[adminDomain.toLowerCase()] = { tenantId: tenant.id, isAdmin: true };
    }

    // Legacy customDomains array (for backward compatibility)
    for (const domain of tenant.customDomains ?? []) {
      const d = normalizeTenantDomain(domain);
      if (!d) continue;
      if (!map[d]) {
        const isAdmin = d.startsWith("admin.");
        map[d] = { tenantId: tenant.id, isAdmin };
      }
    }

    for (const claim of tenant.domainClaims ?? []) {
      // Only route a domain whose ownership is VERIFIED. A self-service claim
      // starts as "pending"; mapping it before verification would let a tenant
      // claim someone else's domain (or a lapsed one) and receive that host's
      // traffic/auth context on the control plane (domain takeover).
      if (claim.status !== "verified") continue;
      const d = normalizeTenantDomain(claim.domain);
      if (!d) continue;
      map[d] = { tenantId: tenant.id, isAdmin: claim.role === "admin" || d.startsWith("admin.") };
      if (!d.startsWith("www.") && claim.role !== "admin") {
        map[`www.${d}`] = { tenantId: tenant.id, isAdmin: false };
      }
    }
  }

  return map;
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

  // Rebuild map from the source of truth (Sanity/dev via loadTenants). If that
  // ALSO fails (Sanity down at the same time as Redis), do NOT throw and break
  // all custom-domain routing — serve the last-known-good in-memory map even if
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

  // Write to Redis
  if (redis) {
    try {
      await redis.set(DOMAIN_CACHE_KEY, map, { ex: DOMAIN_CACHE_TTL });
    } catch {
      // Redis write failed, not fatal
    }
  }

  // Update in-memory cache
  _domainMapCache = map;
  _domainMapCacheTime = Date.now();

  // A domain present only in the static env map (e.g. a freshly-pointed domain
  // not yet in Sanity) still resolves.
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
  }

  if (hasSanity) {
    const { getSanityClient } = await import("./sanity");
    const existing = await getSanityClient().fetch(
      `*[_type == "tenant" && id == $id][0]._id`,
      { id: tenant.id }
    );
    if (existing && !tenantsSourceIsPostgres()) throw new Error(`Tenant "${tenant.id}" already exists`);

    await getSanityClient().create({ _type: "tenant", ...tenant });
    invalidateCache();
  } else if (!tenantsSourceIsPostgres()) {
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
    await upsertTenant(tenantToRow({ ...updates, id }));
    invalidateCache();
    // Dual-write to Sanity during the transition so a rollback stays current.
    if (hasSanity) {
      try {
        const { getSanityClient } = await import("./sanity");
        const docId = await getSanityClient().fetch(`*[_type == "tenant" && id == $id][0]._id`, { id });
        if (docId) await getSanityClient().patch(docId).set(updates).commit();
      } catch {
        // Sanity mirror is best-effort during the transition.
      }
    }
    const merged = await getTenantRow(id);
    return merged ? rowToTenant(merged) : null;
  }

  if (hasSanity) {
    const { getSanityClient } = await import("./sanity");
    const docId = await getSanityClient().fetch(
      `*[_type == "tenant" && id == $id][0]._id`,
      { id }
    );
    if (!docId) return null;

    await getSanityClient().patch(docId).set(updates).commit();
    invalidateCache();
    const updated = await getSanityClient().fetch(
      `*[_type == "tenant" && id == $id][0]`,
      { id }
    );
    return updated ? sanityToTenant(updated) : null;
  }

  const tenants = await loadTenants();
  const idx = tenants.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  tenants[idx] = { ...tenants[idx], ...updates, id };
  await fs.writeFile(DEV_TENANTS_PATH, JSON.stringify(tenants, null, 2));
  invalidateCache();
  return tenants[idx];
}

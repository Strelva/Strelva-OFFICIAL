import { promises as fs } from "fs";
import path from "path";
import type { TenantConfig } from "./types";
import { getRedis } from "./redis";

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

  let tenants: TenantConfig[];

  if (hasSanity) {
    const { getSanityClient } = await import("./sanity");
    const docs = await getSanityClient().fetch(
      `*[_type == "tenant"] | order(createdAt desc)`
    );
    const fromSanity = (docs || []).map(sanityToTenant);
    if (fromSanity.length > 0) {
      tenants = fromSanity;
    } else {
      // Fall through to dev file if Sanity has no tenant data
      tenants = await loadFromDevFile();
    }
  } else {
    tenants = await loadFromDevFile();
  }

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

  if (hasSanity) {
    const { getSanityClient } = await import("./sanity");
    const existing = await getSanityClient().fetch(
      `*[_type == "tenant" && id == $id][0]._id`,
      { id: tenant.id }
    );
    if (existing) throw new Error(`Tenant "${tenant.id}" already exists`);

    await getSanityClient().create({ _type: "tenant", ...tenant });
    invalidateCache();
    return tenant;
  }

  const tenants = await loadTenants();
  if (tenants.find((t) => t.id === tenant.id)) {
    throw new Error(`Tenant "${tenant.id}" already exists`);
  }

  tenants.push(tenant);
  await fs.writeFile(DEV_TENANTS_PATH, JSON.stringify(tenants, null, 2));
  invalidateCache();
  return tenant;
}

// In-memory map of when a domain was added to a tenant, keyed "tenantId:domain".
// Used by the dashboard to show "Pending DNS" for domains added in the last 5 minutes.
// Intentionally not persisted — on restart, all domains revert to "Connected".
const _domainAddedAt = new Map<string, number>();

export function markDomainAdded(tenantId: string, domain: string): void {
  _domainAddedAt.set(`${tenantId}:${domain}`, Date.now());
}

export function getDomainAddedAt(tenantId: string, domain: string): number | undefined {
  return _domainAddedAt.get(`${tenantId}:${domain}`);
}

const DOMAIN_REGEX = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,}$/i;

export function isValidDomain(domain: string): boolean {
  if (typeof domain !== "string") return false;
  return DOMAIN_REGEX.test(domain.trim());
}

export async function addCustomDomain(tenantId: string, domain: string): Promise<
  | { ok: true; tenant: TenantConfig }
  | { ok: false; status: 400 | 404 | 409; error: string }
> {
  const normalized = domain.trim().toLowerCase();
  if (!isValidDomain(normalized)) {
    return { ok: false, status: 400, error: "Invalid domain format" };
  }
  const tenant = await getTenantConfig(tenantId);
  if (!tenant) return { ok: false, status: 404, error: "Tenant not found" };

  const current = tenant.customDomains ?? [];
  if (current.includes(normalized)) {
    return { ok: false, status: 409, error: "Domain already connected" };
  }
  const next = [...current, normalized];
  const updated = await updateTenant(tenantId, { customDomains: next });
  if (!updated) return { ok: false, status: 404, error: "Tenant not found" };
  markDomainAdded(tenantId, normalized);
  return { ok: true, tenant: updated };
}

export async function removeCustomDomain(tenantId: string, domain: string): Promise<
  | { ok: true; tenant: TenantConfig }
  | { ok: false; status: 404 | 422; error: string }
> {
  const normalized = domain.trim().toLowerCase();
  const tenant = await getTenantConfig(tenantId);
  if (!tenant) return { ok: false, status: 404, error: "Tenant not found" };

  const current = tenant.customDomains ?? [];
  if (!current.includes(normalized)) {
    return { ok: false, status: 404, error: "Domain not found on tenant" };
  }
  if (current.length <= 1) {
    return {
      ok: false,
      status: 422,
      error: "Cannot remove the last domain — tenants need at least one way to be reachable",
    };
  }
  const next = current.filter((d) => d !== normalized);
  const updated = await updateTenant(tenantId, { customDomains: next });
  if (!updated) return { ok: false, status: 404, error: "Tenant not found" };
  _domainAddedAt.delete(`${tenantId}:${normalized}`);
  return { ok: true, tenant: updated };
}

export async function updateTenant(
  id: string,
  updates: Partial<TenantConfig>
): Promise<TenantConfig | null> {
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

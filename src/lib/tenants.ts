import { promises as fs } from "fs";
import path from "path";
import type { TenantConfig } from "./types";

const DEV_TENANTS_PATH = path.join(process.cwd(), "dev-tenants.json");

let _cache: TenantConfig[] | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000;

async function loadTenants(): Promise<TenantConfig[]> {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;

  try {
    const raw = await fs.readFile(DEV_TENANTS_PATH, "utf-8");
    _cache = JSON.parse(raw) as TenantConfig[];
  } catch {
    _cache = [];
  }
  _cacheTime = now;
  return _cache;
}

function invalidateCache() {
  _cache = null;
  _cacheTime = 0;
}

export async function getTenantConfig(
  tenantId: string
): Promise<TenantConfig | undefined> {
  const tenants = await loadTenants();
  return tenants.find((t) => t.id === tenantId);
}

export async function getCustomDomainMap(): Promise<Record<string, string>> {
  const tenants = await loadTenants();
  const map: Record<string, string> = {};
  for (const t of tenants) {
    for (const domain of t.customDomains ?? []) {
      map[domain] = t.id;
    }
  }
  return map;
}

export async function getAllTenants(): Promise<TenantConfig[]> {
  return loadTenants();
}

export async function createTenant(
  config: Omit<TenantConfig, "id" | "createdAt" | "active" | "subscriptionStatus">
): Promise<TenantConfig> {
  const tenants = await loadTenants();
  const tenant: TenantConfig = {
    ...config,
    id: config.subdomain,
    active: true,
    createdAt: new Date().toISOString().slice(0, 10),
    subscriptionStatus: "none",
  };

  if (tenants.find((t) => t.id === tenant.id)) {
    throw new Error(`Tenant "${tenant.id}" already exists`);
  }

  tenants.push(tenant);
  await fs.writeFile(DEV_TENANTS_PATH, JSON.stringify(tenants, null, 2));
  invalidateCache();
  return tenant;
}

export async function updateTenant(
  id: string,
  updates: Partial<TenantConfig>
): Promise<TenantConfig | null> {
  const tenants = await loadTenants();
  const idx = tenants.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  tenants[idx] = { ...tenants[idx], ...updates, id };
  await fs.writeFile(DEV_TENANTS_PATH, JSON.stringify(tenants, null, 2));
  invalidateCache();
  return tenants[idx];
}

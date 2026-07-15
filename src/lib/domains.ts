import { getRedis } from "./redis";
import type { DomainClaim, DomainClaimRole, TenantConfig } from "./types";
import type { SiteConfig } from "./tenant/models";
import { getAllTenants, getTenantConfig, invalidateDomainMapCache, isActiveTenant, updateTenant } from "./tenants";
import { normalizeTenantDomain } from "./tenant-urls";

const CLAIMS_REDIS_KEY = "reb:domain-claims";
const DOMAIN_REGEX = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,}$/i;
const RESERVED_SUFFIXES = [".localhost", ".vercel.app", ".strelva.com"];
const RESERVED_DOMAINS = new Set(["localhost", "strelva.com", "www.strelva.com"]);

type VercelDomainResponse = {
  name?: string;
  verified?: boolean;
  verification?: Array<{ type?: string; domain?: string; value?: string; reason?: string }>;
  error?: { message?: string };
};

type VercelConfigResponse = {
  configuredBy?: string | null;
  acceptedChallenges?: string[];
  misconfigured?: boolean;
  error?: { message?: string };
};

type DomainResult =
  | { ok: true; tenant: TenantConfig; claim: DomainClaim }
  | { ok: false; status: 400 | 404 | 409 | 422; error: string };

function nowIso(): string {
  return new Date().toISOString();
}

function withoutWww(domain: string): string {
  return domain.replace(/^www\./, "");
}

function claimKey(domain: string): string {
  return withoutWww(domain);
}

function getVercelProjectId(): string | null {
  return process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME || null;
}

function getVercelTeamQuery(): string {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : "";
}

function hasVercelDomainApi(): boolean {
  return Boolean(process.env.VERCEL_API_TOKEN && getVercelProjectId());
}

export function normalizeCustomDomain(domain: string | undefined): string | null {
  return normalizeTenantDomain(domain)?.replace(/:\d+$/, "") ?? null;
}

export function isValidDomain(domain: string): boolean {
  const normalized = normalizeCustomDomain(domain);
  if (!normalized) return false;
  if (!DOMAIN_REGEX.test(normalized)) return false;
  if (RESERVED_DOMAINS.has(normalized)) return false;
  return !RESERVED_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function domainAliases(domain: string): string[] {
  const normalized = withoutWww(domain);
  return [normalized, `www.${normalized}`];
}

function domainsFromTenant(tenant: SiteConfig): Array<{ domain: string; role: DomainClaimRole }> {
  const domains: Array<{ domain: string; role: DomainClaimRole }> = [];
  const productionDomain = normalizeCustomDomain(tenant.productionDomain);
  const adminDomain = normalizeCustomDomain(tenant.adminDomain);

  if (productionDomain) domains.push({ domain: productionDomain, role: "production" });
  if (adminDomain) domains.push({ domain: adminDomain, role: "admin" });
  if (!adminDomain && productionDomain) domains.push({ domain: `admin.${productionDomain}`, role: "admin" });

  for (const domain of tenant.customDomains ?? []) {
    const normalized = normalizeCustomDomain(domain);
    if (normalized) domains.push({ domain: normalized, role: "additional" });
  }

  for (const claim of tenant.domainClaims ?? []) {
    const normalized = normalizeCustomDomain(claim.domain);
    if (normalized) domains.push({ domain: normalized, role: claim.role });
  }

  return domains;
}

export async function findDomainCollision(
  domain: string,
  ownerTenantId?: string
): Promise<{ tenantId: string; domain: string; role: DomainClaimRole } | null> {
  const normalized = normalizeCustomDomain(domain);
  if (!normalized) return null;
  const aliases = new Set(domainAliases(normalized));
  const tenants = await getAllTenants();

  for (const tenant of tenants) {
    if (!isActiveTenant(tenant)) continue;
    if (ownerTenantId === tenant.id) continue;
    for (const entry of domainsFromTenant(tenant)) {
      if (aliases.has(entry.domain) || aliases.has(claimKey(entry.domain))) {
        return { tenantId: tenant.id, domain: entry.domain, role: entry.role };
      }
    }
  }

  return null;
}

export async function validateTenantDomains(
  tenant: TenantConfig
): Promise<Array<{ domain: string; role: DomainClaimRole; error: string }>> {
  const errors: Array<{ domain: string; role: DomainClaimRole; error: string }> = [];

  for (const entry of domainsFromTenant(tenant)) {
    if (!isValidDomain(entry.domain)) {
      errors.push({ ...entry, error: "Invalid or reserved domain" });
      continue;
    }

    const collision = await findDomainCollision(entry.domain, tenant.id);
    if (collision) {
      errors.push({
        ...entry,
        error: "This domain is already connected to another site",
      });
    }
  }

  return errors;
}

async function getRedisClaims(): Promise<Record<string, DomainClaim>> {
  const redis = getRedis();
  if (!redis) return {};

  try {
    return (await redis.get<Record<string, DomainClaim>>(CLAIMS_REDIS_KEY)) ?? {};
  } catch {
    return {};
  }
}

async function saveRedisClaim(claim: DomainClaim): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const claims = await getRedisClaims();
    claims[claimKey(claim.domain)] = claim;
    await redis.set(CLAIMS_REDIS_KEY, claims);
  } catch {
    // Tenant config remains the durable fallback if Redis is unavailable.
  }
}

async function deleteRedisClaim(domain: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const claims = await getRedisClaims();
    delete claims[claimKey(domain)];
    await redis.set(CLAIMS_REDIS_KEY, claims);
  } catch {
    // Tenant config remains the durable fallback if Redis is unavailable.
  }
}

/**
 * Remove every Redis domain-claim owned by a tenant. The claims live in ONE map
 * keyed by domain, so we delete just this tenant's domains rather than dropping
 * the whole map. Returns the domains that had a claim. With `apply=false` it
 * reports what it would clear without writing (for the deprovision dry run). The
 * Postgres `domain_claims` rows are removed separately by the caller.
 */
export async function clearTenantDomainClaims(
  tenant: TenantConfig,
  apply = true
): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const claims = await getRedisClaims();
    const cleared: string[] = [];
    for (const { domain } of domainsFromTenant(tenant)) {
      const key = claimKey(domain);
      if (key in claims) {
        cleared.push(domain);
        if (apply) delete claims[key];
      }
    }
    if (apply && cleared.length) {
      await redis.set(CLAIMS_REDIS_KEY, claims);
      invalidateDomainMapCache();
    }
    return cleared;
  } catch {
    return [];
  }
}

async function addDomainToVercel(domain: string): Promise<Partial<DomainClaim>> {
  const projectId = getVercelProjectId();
  if (!hasVercelDomainApi() || !projectId) {
    return { status: "pending", dnsStatus: "unknown", sslStatus: "unknown" };
  }

  const response = await fetch(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/domains${getVercelTeamQuery()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
    }
  );
  const data = (await response.json().catch(() => ({}))) as VercelDomainResponse;

  if (!response.ok && response.status !== 409) {
    return {
      status: "error",
      dnsStatus: "unknown",
      sslStatus: "error",
      error: data.error?.message || "Vercel domain registration failed",
    };
  }

  return {
    vercelProjectId: projectId,
    status: data.verified ? "verified" : "pending",
    dnsStatus: data.verified ? "configured" : "unknown",
    sslStatus: data.verified ? "issued" : "pending",
    verification: data.verification?.map((item) =>
      [item.type, item.domain, item.value || item.reason].filter(Boolean).join(" ")
    ),
  };
}

async function inspectVercelDomain(domain: string): Promise<Partial<DomainClaim>> {
  const projectId = getVercelProjectId();
  if (!hasVercelDomainApi() || !projectId) {
    return {};
  }

  const domainResponse = await fetch(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}${getVercelTeamQuery()}`,
    {
      headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` },
    }
  );
  const domainData = (await domainResponse.json().catch(() => ({}))) as VercelDomainResponse;

  const configResponse = await fetch(
    `https://api.vercel.com/v6/domains/${encodeURIComponent(domain)}/config${getVercelTeamQuery()}`,
    {
      headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` },
    }
  );
  const configData = (await configResponse.json().catch(() => ({}))) as VercelConfigResponse;

  if (!domainResponse.ok || !configResponse.ok) {
    return {
      status: "error",
      dnsStatus: "unknown",
      sslStatus: "error",
      error: domainData.error?.message || configData.error?.message || "Vercel domain lookup failed",
    };
  }

  const dnsStatus = configData.misconfigured ? "misconfigured" : "configured";
  const sslStatus = domainData.verified ? "issued" : "pending";

  return {
    vercelProjectId: projectId,
    status: configData.misconfigured ? "misconfigured" : domainData.verified ? "verified" : "pending",
    dnsStatus,
    sslStatus,
    verification: domainData.verification?.map((item) =>
      [item.type, item.domain, item.value || item.reason].filter(Boolean).join(" ")
    ),
    error: configData.misconfigured ? "DNS is not pointed at this Vercel project" : undefined,
  };
}

function mergeClaims(existing: DomainClaim[] | undefined, claim: DomainClaim): DomainClaim[] {
  const filtered = (existing ?? []).filter((item) => claimKey(item.domain) !== claimKey(claim.domain));
  return [...filtered, claim];
}

export function serializeDomainClaim(claim: DomainClaim) {
  return {
    domain: claim.domain,
    status: claim.status,
    dnsStatus: claim.dnsStatus,
    sslStatus: claim.sslStatus,
    role: claim.role,
    isApex: claim.domain.split(".").length === 2,
    verification: claim.verification ?? [],
    error: claim.error,
    updatedAt: claim.updatedAt,
  };
}

export async function listTenantDomainClaims(tenantId: string): Promise<DomainClaim[]> {
  const tenant = await getTenantConfig(tenantId);
  if (!tenant) return [];

  const claimsByDomain = new Map<string, DomainClaim>();
  for (const claim of tenant.domainClaims ?? []) {
    claimsByDomain.set(claimKey(claim.domain), claim);
  }

  for (const domain of tenant.customDomains ?? []) {
    const normalized = normalizeCustomDomain(domain);
    if (!normalized || claimsByDomain.has(claimKey(normalized))) continue;
    const createdAt = nowIso();
    claimsByDomain.set(claimKey(normalized), {
      domain: normalized,
      tenantId,
      role: "additional",
      status: "pending",
      dnsStatus: "unknown",
      sslStatus: "unknown",
      createdAt,
      updatedAt: createdAt,
    });
  }

  return [...claimsByDomain.values()];
}

export async function addCustomDomain(
  tenantId: string,
  domain: string,
  role: DomainClaimRole = "additional"
): Promise<DomainResult> {
  const normalized = normalizeCustomDomain(domain);
  if (!normalized || !isValidDomain(normalized)) {
    return { ok: false, status: 400, error: "Invalid domain format" };
  }
  if (role === "admin" && !normalized.startsWith("admin.")) {
    return { ok: false, status: 422, error: "Admin domains must use the admin. prefix" };
  }

  const tenant = await getTenantConfig(tenantId);
  if (!tenant) return { ok: false, status: 404, error: "Tenant not found" };

  const current = tenant.customDomains ?? [];
  if (current.some((item) => claimKey(normalizeCustomDomain(item) ?? item) === claimKey(normalized))) {
    return { ok: false, status: 409, error: "Domain already connected" };
  }

  const collision = await findDomainCollision(normalized, tenantId);
  if (collision) {
    return { ok: false, status: 409, error: "This domain is already connected to another site" };
  }

  const createdAt = nowIso();
  const vercelState = await addDomainToVercel(normalized);
  const claim: DomainClaim = {
    domain: normalized,
    tenantId,
    role,
    status: vercelState.status ?? "pending",
    dnsStatus: vercelState.dnsStatus ?? "unknown",
    sslStatus: vercelState.sslStatus ?? "unknown",
    createdAt,
    updatedAt: createdAt,
    verification: vercelState.verification,
    vercelProjectId: vercelState.vercelProjectId,
    error: vercelState.error,
  };

  const nextDomains = [...current, normalized];
  const updated = await updateTenant(tenantId, {
    customDomains: nextDomains,
    domainClaims: mergeClaims(tenant.domainClaims, claim),
  });
  if (!updated) return { ok: false, status: 404, error: "Tenant not found" };

  await saveRedisClaim(claim);
  invalidateDomainMapCache();
  return { ok: true, tenant: updated, claim };
}

export async function refreshDomainClaim(tenantId: string, domain: string): Promise<DomainResult> {
  const normalized = normalizeCustomDomain(domain);
  if (!normalized) return { ok: false, status: 400, error: "Invalid domain format" };

  const tenant = await getTenantConfig(tenantId);
  if (!tenant) return { ok: false, status: 404, error: "Tenant not found" };

  const existing = (await listTenantDomainClaims(tenantId)).find(
    (claim) => claimKey(claim.domain) === claimKey(normalized)
  );
  if (!existing) return { ok: false, status: 404, error: "Domain not found on tenant" };

  const collision = await findDomainCollision(normalized, tenantId);
  const inspection = collision
    ? { status: "conflict" as const, error: "This domain is already connected to another site" }
    : await inspectVercelDomain(normalized);
  const claim: DomainClaim = {
    ...existing,
    ...inspection,
    updatedAt: nowIso(),
  };

  const updated = await updateTenant(tenantId, { domainClaims: mergeClaims(tenant.domainClaims, claim) });
  if (!updated) return { ok: false, status: 404, error: "Tenant not found" };

  await saveRedisClaim(claim);
  invalidateDomainMapCache();
  return { ok: true, tenant: updated, claim };
}

export async function removeCustomDomain(tenantId: string, domain: string): Promise<
  | { ok: true; tenant: TenantConfig }
  | { ok: false; status: 404 | 422; error: string }
> {
  const normalized = normalizeCustomDomain(domain);
  const tenant = await getTenantConfig(tenantId);
  if (!tenant || !normalized) return { ok: false, status: 404, error: "Tenant not found" };

  const current = tenant.customDomains ?? [];
  if (!current.some((item) => claimKey(normalizeCustomDomain(item) ?? item) === claimKey(normalized))) {
    return { ok: false, status: 404, error: "Domain not found on tenant" };
  }
  if (current.length <= 1) {
    return {
      ok: false,
      status: 422,
      error: "Cannot remove the last domain - tenants need at least one way to be reachable",
    };
  }

  const next = current.filter((item) => claimKey(normalizeCustomDomain(item) ?? item) !== claimKey(normalized));
  const nextClaims = (tenant.domainClaims ?? []).filter((claim) => claimKey(claim.domain) !== claimKey(normalized));
  const updated = await updateTenant(tenantId, { customDomains: next, domainClaims: nextClaims });
  if (!updated) return { ok: false, status: 404, error: "Tenant not found" };

  await deleteRedisClaim(normalized);
  invalidateDomainMapCache();
  return { ok: true, tenant: updated };
}

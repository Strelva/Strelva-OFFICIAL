import { isPlatformDomain } from "@/platform/infra/brand";
import { getRedis } from "@/platform/infra/redis";
import type { DomainClaim, DomainClaimRole, TenantConfig } from "./types";
import type { SiteConfig } from "./tenant/models";
import { getAllTenants, getTenantConfig, invalidateDomainMapCache, isActiveTenant, updateTenant } from "./tenants";
import { normalizeTenantDomain } from "./tenant-urls";
// Outside-write receipts (src/platform/operator-queue) through the port
// src/lib declares (Strelva Reborn section 7).
import { workspacePorts } from "./workspace-ports";

const CLAIMS_REDIS_KEY = "reb:domain-claims";
const DOMAIN_REGEX = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,}$/i;
const RESERVED_SUFFIXES = [".localhost", ".vercel.app"];
const RESERVED_DOMAINS = new Set(["localhost"]);

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
  if (RESERVED_DOMAINS.has(normalized) || isPlatformDomain(normalized)) return false;
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

async function addDomainToVercel(domain: string, reconcileBeforeWrite = false, beforeWrite?: () => Promise<void>): Promise<Partial<DomainClaim>> {
  const projectId = getVercelProjectId();
  if (!hasVercelDomainApi() || !projectId) {
    return { status: "pending", dnsStatus: "unknown", sslStatus: "unknown" };
  }

  if (reconcileBeforeWrite) {
    // An accepted registration can outlive a failed local claim write. Resolve
    // the provider's current project binding before issuing another POST.
    const existing = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}${getVercelTeamQuery()}`, {
      headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (existing.ok) {
      const data = await existing.json() as VercelDomainResponse;
      if (data.name !== domain || typeof data.verified !== "boolean") throw new Error("The hosting provider's domain binding could not be confirmed.");
      return { registrationAttempt:"confirmed", vercelProjectId: projectId, status: data.verified ? "verified" : "pending", dnsStatus: data.verified ? "configured" : "unknown", sslStatus: data.verified ? "issued" : "pending", verification: data.verification?.map(item => [item.type,item.domain,item.value || item.reason].filter(Boolean).join(" ")) };
    }
    // Unavailability is not proof that the previous registration was rejected.
    if (existing.status !== 404) throw new Error("The hosting provider's domain binding could not be checked. Reopen its status before retrying.");
  }

  await beforeWrite?.();
  const response = await fetch(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/domains${getVercelTeamQuery()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
      ...(reconcileBeforeWrite ? { redirect: "error" as const, signal: AbortSignal.timeout(10000) } : {}),
    }
  );
  const data = (await response.json().catch(() => ({}))) as VercelDomainResponse;

  if (!response.ok && response.status !== 409) {
    return {
      status: "error",
      dnsStatus: "unknown",
      sslStatus: "error",
      ...(reconcileBeforeWrite ? { registrationAttempt: response.status >= 400 && response.status < 500 && ![408,429].includes(response.status) ? "rejected" as const : "unknown" as const } : {}),
      error: data.error?.message || "Vercel domain registration failed",
    };
  }

  return {
    ...(reconcileBeforeWrite ? { registrationAttempt: response.status === 409 ? "unknown" as const : "confirmed" as const } : {}),
    vercelProjectId: projectId,
    status: data.verified ? "verified" : "pending",
    dnsStatus: data.verified ? "configured" : "unknown",
    sslStatus: data.verified ? "issued" : "pending",
    verification: data.verification?.map((item) =>
      [item.type, item.domain, item.value || item.reason].filter(Boolean).join(" ")
    ),
  };
}

/**
 * Read-back for a domain add: one GET of the project binding. Never a write,
 * and never followed by a retry of the add.
 */
async function readBackVercelDomain(domain: string): Promise<{ result: "matched" | "differs" | "failed"; detail: string }> {
  const projectId = getVercelProjectId();
  if (!hasVercelDomainApi() || !projectId) return { result: "failed", detail: "Vercel is not configured, so the binding could not be read back." };
  try {
    const response = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}${getVercelTeamQuery()}`, {
      headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { result: "failed", detail: `Vercel answered ${response.status} on read-back.` };
    const data = await response.json().catch(() => ({})) as VercelDomainResponse;
    return data.name === domain
      ? { result: "matched", detail: "The domain is bound to the project in Vercel." }
      : { result: "differs", detail: "Vercel returned a different binding." };
  } catch {
    return { result: "failed", detail: "The Vercel binding could not be read back." };
  }
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
  role: DomainClaimRole = "additional",
  options: { reconcileProviderBeforeWrite?: boolean; authorizeWrite?: () => Promise<void>; actor?: string } = {}
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
  const prior = tenant.domainClaims?.find(claim => claimKey(claim.domain) === claimKey(normalized));
  const retryable = options.reconcileProviderBeforeWrite === true && (prior?.registrationAttempt === "not_submitted" || prior?.registrationAttempt === "rejected");
  if (!retryable && current.some((item) => claimKey(normalizeCustomDomain(item) ?? item) === claimKey(normalized))) {
    return { ok: false, status: 409, error: "Domain already connected" };
  }

  const collision = await findDomainCollision(normalized, tenantId);
  if (collision) {
    return { ok: false, status: 409, error: "This domain is already connected to another site" };
  }

  const createdAt = nowIso();
  const nextDomains = [...new Set([...current, normalized])];
  const vercelState = await addDomainToVercel(normalized,options.reconcileProviderBeforeWrite === true,options.reconcileProviderBeforeWrite ? async () => {
    // A saved intent is retryable until the submission boundary is durably
    // unknown. Once unknown, a lost response or revoked owner cannot cause a
    // second POST; only provider confirmation or a definite rejection resolves it.
    const pending: DomainClaim = { domain:normalized,tenantId,role,status:"pending",dnsStatus:"unknown",sslStatus:"pending",createdAt,updatedAt:createdAt,registrationAttempt:"not_submitted" };
    await options.authorizeWrite?.();
    const saved = await updateTenant(tenantId,{ customDomains:nextDomains,domainClaims:mergeClaims(tenant.domainClaims,pending) });
    if (!saved) throw new Error("The domain registration intent could not be saved.");
    await options.authorizeWrite?.();
    const unknown = { ...pending, registrationAttempt:"unknown" as const };
    const bounded = await updateTenant(tenantId,{ domainClaims:mergeClaims(saved.domainClaims,unknown) });
    if (!bounded) throw new Error("The domain submission boundary could not be saved.");
    await saveRedisClaim(unknown); invalidateDomainMapCache();
    await options.authorizeWrite?.();
  } : undefined);
  // One receipt per Vercel add that reached the provider. Without Vercel
  // configured nothing left Strelva, so there is nothing to record.
  if (vercelState.vercelProjectId || vercelState.status === "error") {
    const acceptance = vercelState.status === "error"
      ? (vercelState.registrationAttempt === "unknown" ? "unknown" as const : "rejected" as const)
      : "accepted" as const;
    const receipts = await workspacePorts().outsideWriteReceipts();
    await receipts.recordDomainAdd({
      tenantId, domain: normalized, role, at: createdAt, actor: options.actor ?? "strelva",
      acceptance, detail: vercelState.error ?? null, providerRef: vercelState.vercelProjectId ?? null,
      ...(acceptance === "accepted" ? { readback: await readBackVercelDomain(normalized) } : {}),
    });
  }

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
    ...(vercelState.registrationAttempt ? { registrationAttempt:vercelState.registrationAttempt } : {}),
    error: vercelState.error,
  };

  await options.authorizeWrite?.();
  const updated = await updateTenant(tenantId, {
    customDomains: nextDomains,
    domainClaims: mergeClaims(tenant.domainClaims, claim),
  });
  if (!updated) return { ok: false, status: 404, error: "Tenant not found" };

  await saveRedisClaim(claim);
  invalidateDomainMapCache();
  return { ok: true, tenant: updated, claim };
}

export async function refreshDomainClaim(tenantId: string, domain: string, options: { authorizeWrite?: () => Promise<void> } = {}): Promise<DomainResult> {
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
    ...(existing.registrationAttempt && inspection.status && !["error","conflict"].includes(inspection.status) ? { registrationAttempt:"confirmed" as const } : {}),
    updatedAt: nowIso(),
  };

  await options.authorizeWrite?.();
  const updated = await updateTenant(tenantId, { domainClaims: mergeClaims(tenant.domainClaims, claim) });
  if (!updated) return { ok: false, status: 404, error: "Tenant not found" };

  await saveRedisClaim(claim);
  invalidateDomainMapCache();
  return { ok: true, tenant: updated, claim };
}

/**
 * Removes Strelva's claim only. No Vercel call is made: Strelva never removes
 * a Vercel domain. The receipt reads the tenant back to confirm the claim is
 * gone, and says plainly that there is no undo.
 */
export async function removeCustomDomain(tenantId: string, domain: string, options: { actor?: string } = {}): Promise<
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
  const prior = (tenant.domainClaims ?? []).find((claim) => claimKey(claim.domain) === claimKey(normalized));
  const readBack = await getTenantConfig(tenantId).catch(() => null);
  const stillClaimed = readBack
    ? (readBack.customDomains ?? []).some((item) => claimKey(normalizeCustomDomain(item) ?? item) === claimKey(normalized))
    : null;
  const receipts = await workspacePorts().outsideWriteReceipts();
  await receipts.recordDomainClaimRemoval({
    tenantId, domain: normalized, actor: options.actor ?? "strelva", at: nowIso(),
    before: prior ? { role: prior.role, status: prior.status } : null,
    readback: stillClaimed === null
      ? { result: "failed", detail: "The tenant could not be read back." }
      : stillClaimed
        ? { result: "differs", detail: "The domain is still listed on the tenant." }
        : { result: "matched", detail: "Strelva's claim is gone. The domain was not touched in Vercel." },
  });
  return { ok: true, tenant: updated };
}

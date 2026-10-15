import { getTenantConfig, updateTenant } from "@/lib/tenants";
import { revalidateClientSite } from "@/lib/revalidate-client";
import { siteCapabilityManifestSchema } from "@/lib/schemas";
import { isSafeFetchUrl } from "@/platform/infra/safe-fetch";
import { logAuditEvent } from "@/lib/storage";
import type { TenantConfig } from "@/lib/types";

/**
 * What a site says about itself, read from its own capability manifest: where
 * its content lives and which commit is live. Strelva never takes a person's or
 * an agent's word for either. Server only.
 */
export type ReadBack = "confirmed" | "not_confirmed" | "not_checked";
export interface SiteDeclaration { reachable: boolean; contentSource: "strelva" | "repo" | null; liveCommit: string | null }
export interface SiteReleaseCheck { readBack: ReadBack; revalidated: boolean; declaration: SiteDeclaration }

type DeclaredTenant = Pick<TenantConfig, "id" | "customRepo"> | undefined;
export interface SiteDeclarationDeps {
  tenantConfig?: (tenantId: string) => Promise<DeclaredTenant>;
  fetch?: typeof fetch;
  persist?: (tenantId: string, customRepo: NonNullable<TenantConfig["customRepo"]>) => Promise<unknown>;
}
export interface SiteReleaseDeps extends SiteDeclarationDeps {
  revalidate?: (tenantId: string, paths: "all") => Promise<{ success: boolean }>;
  sleep?: (ms: number) => Promise<void>;
}

const SHA = /^[0-9a-f]{7,40}$/;
const RETRIES = 2;
const RETRY_MS = 3000;

/** A short sha and a full one name the same commit when one starts with the other. */
export function sameCommit(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim().toLowerCase();
  const right = b?.trim().toLowerCase();
  if (!left || !right || !SHA.test(left) || !SHA.test(right)) return false;
  return left.length >= right.length ? left.startsWith(right) : right.startsWith(left);
}

const UNREACHED: SiteDeclaration = { reachable: false, contentSource: null, liveCommit: null };

export async function readSiteDeclaration(tenantId: string, deps: SiteDeclarationDeps = {}): Promise<SiteDeclaration> {
  const config = await (deps.tenantConfig ?? getTenantConfig)(tenantId).catch(() => undefined);
  return declarationFrom(config?.customRepo?.capabilityManifestUrl, deps);
}

async function declarationFrom(url: string | undefined, deps: SiteDeclarationDeps): Promise<SiteDeclaration> {
  if (!url || !isSafeFetchUrl(url)) return UNREACHED;
  try {
    // Same guard as getSiteCapabilityManifest: no redirects, since only the literal URL was validated.
    const res = await (deps.fetch ?? fetch)(url, { headers: { Accept: "application/json" }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(2500) });
    if (!res.ok) return UNREACHED;
    const parsed = siteCapabilityManifestSchema.safeParse(await res.json());
    if (!parsed.success) return UNREACHED;
    return { reachable: true, contentSource: parsed.data.contentSource ?? null, liveCommit: parsed.data.release?.commitSha?.toLowerCase() ?? null };
  } catch {
    return UNREACHED;
  }
}

/** Keeps customRepo.contentSource current. A site that declares nothing never clears a stored value. */
async function persistDeclaredSource(tenantId: string, config: DeclaredTenant, declaration: SiteDeclaration, deps: SiteDeclarationDeps): Promise<void> {
  const declared = declaration.contentSource;
  const stored = config?.customRepo?.contentSource;
  if (!config || !declared || declared === stored) return;
  await (deps.persist ?? ((id, customRepo) => updateTenant(id, { customRepo })))(tenantId, { ...(config.customRepo ?? {}), contentSource: declared, declarationCheckedAt: new Date().toISOString() });
  await logAuditEvent({
    tenant: tenantId, action: "tenant.content-source.declared", targetType: "tenant", targetId: tenantId,
    actor: { userId: null, email: null, type: "system", isSuperAdmin: false },
    metadata: { from: stored ?? null, to: declared },
  }).catch(() => {});
}

export async function refreshSiteDeclaration(tenantId: string, deps: SiteDeclarationDeps = {}): Promise<SiteDeclaration> {
  const config = await (deps.tenantConfig ?? getTenantConfig)(tenantId).catch(() => undefined);
  const declaration = await declarationFrom(config?.customRepo?.capabilityManifestUrl, deps);
  await persistDeclaredSource(tenantId, config, declaration, deps);
  return declaration;
}

/**
 * Refreshes the live site, then compares the commit it declares with the one the
 * coding agent reported. Never throws. Production may still be rolling out, so a
 * differing commit is read again, at most twice, 3s apart.
 */
export async function verifySiteRelease(tenantId: string, commitSha: string, deps: SiteReleaseDeps = {}): Promise<SiteReleaseCheck> {
  const revalidated = (await (deps.revalidate ?? revalidateClientSite)(tenantId, "all").catch(() => ({ success: false }))).success === true;
  const config = await (deps.tenantConfig ?? getTenantConfig)(tenantId).catch(() => undefined);
  const url = config?.customRepo?.capabilityManifestUrl;
  let declaration = await declarationFrom(url, deps);
  for (let attempt = 0; attempt < RETRIES && declaration.reachable && declaration.liveCommit !== null && !sameCommit(declaration.liveCommit, commitSha); attempt++) {
    await (deps.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(RETRY_MS);
    declaration = await declarationFrom(url, deps);
  }
  await persistDeclaredSource(tenantId, config, declaration, deps).catch(() => {});
  const readBack: ReadBack = !url ? "not_checked"
    : !declaration.reachable ? "not_confirmed"
    : declaration.liveCommit === null ? "not_checked"
    : sameCommit(declaration.liveCommit, commitSha) ? "confirmed" : "not_confirmed";
  return { readBack, revalidated, declaration };
}

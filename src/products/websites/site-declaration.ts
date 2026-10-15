import { isSafeFetchUrl } from "@/platform/infra/safe-fetch";

/**
 * What a site says about itself, read from its own capability manifest: where
 * its content lives and which commit is live. Strelva never takes a person's or
 * an agent's word for either. Server only.
 *
 * The tenant record, the manifest schema, revalidation and the audit log belong
 * to the tenant model (src/lib), so this module takes them as ports; the app
 * edge wires them in src/app/api/_site-declaration.ts.
 */
export type ReadBack = "confirmed" | "not_confirmed" | "not_checked";
export interface SiteDeclaration { reachable: boolean; contentSource: "strelva" | "repo" | null; liveCommit: string | null }
export interface SiteReleaseCheck { readBack: ReadBack; revalidated: boolean; declaration: SiteDeclaration }

/** The slice of a tenant this module reads. */
export interface DeclaredTenant { id: string; customRepo?: { capabilityManifestUrl?: string; contentSource?: "strelva" | "repo" } | null }

export interface SiteDeclarationPorts {
  tenantConfig(tenantId: string): Promise<DeclaredTenant | undefined>;
  /** The manifest's two declarations, or null when it isn't a valid manifest. */
  parseManifest(raw: unknown): { contentSource: "strelva" | "repo" | null; commitSha: string | null } | null;
  /** Merge a changed declaration into the tenant's customRepo. */
  persist(tenantId: string, declared: { contentSource: "strelva" | "repo"; declarationCheckedAt: string }): Promise<unknown>;
  /** Record that a site's declared content source changed. */
  audit(entry: { tenantId: string; from: "strelva" | "repo" | null; to: "strelva" | "repo" }): Promise<unknown>;
  revalidate(tenantId: string): Promise<{ success: boolean }>;
  fetch?: typeof fetch;
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

async function declarationFrom(url: string | undefined, ports: SiteDeclarationPorts): Promise<SiteDeclaration> {
  if (!url || !isSafeFetchUrl(url)) return UNREACHED;
  try {
    // Same guard as getSiteCapabilityManifest: no redirects, since only the literal URL was validated.
    const res = await (ports.fetch ?? fetch)(url, { headers: { Accept: "application/json" }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(2500) });
    if (!res.ok) return UNREACHED;
    const parsed = ports.parseManifest(await res.json());
    if (!parsed) return UNREACHED;
    return { reachable: true, contentSource: parsed.contentSource, liveCommit: parsed.commitSha?.toLowerCase() ?? null };
  } catch {
    return UNREACHED;
  }
}

export async function readSiteDeclaration(tenantId: string, ports: SiteDeclarationPorts): Promise<SiteDeclaration> {
  const config = await ports.tenantConfig(tenantId).catch(() => undefined);
  return declarationFrom(config?.customRepo?.capabilityManifestUrl, ports);
}

/** Keeps customRepo.contentSource current. A site that declares nothing never clears a stored value. */
async function persistDeclaredSource(tenantId: string, config: DeclaredTenant | undefined, declaration: SiteDeclaration, ports: SiteDeclarationPorts): Promise<void> {
  const declared = declaration.contentSource;
  const stored = config?.customRepo?.contentSource ?? null;
  if (!config || !declared || declared === stored) return;
  await ports.persist(tenantId, { contentSource: declared, declarationCheckedAt: new Date().toISOString() });
  await ports.audit({ tenantId, from: stored, to: declared }).catch(() => {});
}

export async function refreshSiteDeclaration(tenantId: string, ports: SiteDeclarationPorts): Promise<SiteDeclaration> {
  const config = await ports.tenantConfig(tenantId).catch(() => undefined);
  const declaration = await declarationFrom(config?.customRepo?.capabilityManifestUrl, ports);
  await persistDeclaredSource(tenantId, config, declaration, ports);
  return declaration;
}

/**
 * Refreshes the live site, then compares the commit it declares with the one the
 * coding agent reported. Never throws. Production may still be rolling out, so a
 * differing commit is read again, at most twice, 3s apart.
 */
export async function verifySiteRelease(tenantId: string, commitSha: string, ports: SiteDeclarationPorts): Promise<SiteReleaseCheck> {
  const revalidated = (await ports.revalidate(tenantId).catch(() => ({ success: false }))).success === true;
  const config = await ports.tenantConfig(tenantId).catch(() => undefined);
  const url = config?.customRepo?.capabilityManifestUrl;
  let declaration = await declarationFrom(url, ports);
  for (let attempt = 0; attempt < RETRIES && declaration.reachable && declaration.liveCommit !== null && !sameCommit(declaration.liveCommit, commitSha); attempt++) {
    await (ports.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(RETRY_MS);
    declaration = await declarationFrom(url, ports);
  }
  await persistDeclaredSource(tenantId, config, declaration, ports).catch(() => {});
  const readBack: ReadBack = !url ? "not_checked"
    : !declaration.reachable ? "not_confirmed"
    : declaration.liveCommit === null ? "not_checked"
    : sameCommit(declaration.liveCommit, commitSha) ? "confirmed" : "not_confirmed";
  return { readBack, revalidated, declaration };
}

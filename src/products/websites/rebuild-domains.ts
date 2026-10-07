import { z } from "zod";
import { addCustomDomain, isValidDomain, listTenantDomainClaims, normalizeCustomDomain, refreshDomainClaim } from "@/lib/domains";
import { WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import type { WebsiteDomainView } from "./rebuild-contracts";
import type { DomainClaim } from "@/lib/types";
import { WebsiteDomainEffectUnconfirmedError } from "@/platform/needs-you/sources/website-domain-store";

const configSchema = z.object({
  recommendedIPv4: z.array(z.object({ rank: z.number().optional(), value: z.array(z.string()) })).optional(),
  recommendedCNAME: z.array(z.object({ rank: z.number().optional(), value: z.string() })).optional(),
}).passthrough();
const projectSchema = z.object({ verification: z.array(z.object({ type: z.string().optional(), domain: z.string().optional(), value: z.string().optional() })).optional() }).passthrough();

/** DNS recommendations are provider responses, never hard-coded IPs or CNAMEs. */
export async function readHostedDomainRecords(domain: string, fetcher: typeof fetch = fetch, options: { allowUnattached?: boolean } = {}): Promise<WebsiteDomainView["records"]> {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME;
  if (!token || !projectId) throw new WorkspaceStoreError("Domain setup is unavailable until the hosting provider is configured.");
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : "";
  const headers = { Authorization: `Bearer ${token}` };
  const [configResponse, projectResponse] = await Promise.all([
    fetcher(`https://api.vercel.com/v6/domains/${encodeURIComponent(domain)}/config${team}`, { headers, signal: AbortSignal.timeout(10000), cache: "no-store" }),
    fetcher(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}${team}`, { headers, signal: AbortSignal.timeout(10000), cache: "no-store" }),
  ]);
  if (!configResponse.ok || (!projectResponse.ok && !(options.allowUnattached && projectResponse.status === 404))) throw new WorkspaceStoreError("The hosting provider could not return this domain's DNS records.");
  const config = configSchema.parse(await configResponse.json());
  const project = projectResponse.ok ? projectSchema.parse(await projectResponse.json()) : {};
  const records: WebsiteDomainView["records"] = [];
  const cnames = [...(config.recommendedCNAME ?? [])].sort((a,b) => (a.rank ?? 0) - (b.rank ?? 0));
  const ips = [...(config.recommendedIPv4 ?? [])].sort((a,b) => (a.rank ?? 0) - (b.rank ?? 0));
  // The API chooses the recommended record kind for this particular hostname.
  if (cnames[0]) records.push({ type: "CNAME", name: domain, value: cnames[0].value });
  else for (const value of ips[0]?.value ?? []) records.push({ type: "A", name: domain, value });
  for (const item of project.verification ?? []) if (item.type && item.domain && item.value) records.push({ type: item.type, name: item.domain, value: item.value });
  return records;
}

export async function readHostedDomains(tenantId: string): Promise<{ domain: (WebsiteDomainView & { registrationAttempt?: DomainClaim["registrationAttempt"] }) | null; domains: Array<WebsiteDomainView & { registrationAttempt?: DomainClaim["registrationAttempt"] }> }> {
  const claims = await listTenantDomainClaims(tenantId);
  const domains = await Promise.all(claims.filter(claim => claim.role !== "admin").map(async claim => {
    let records: WebsiteDomainView["records"] = []; let error = claim.error;
    try { records = await readHostedDomainRecords(claim.domain); } catch { error = "DNS records could not be checked. Retry to get the exact provider records."; }
    return { hostname: claim.domain, status: claim.status, checkedAt: claim.updatedAt, records, registrationAttempt: claim.registrationAttempt, ...(error ? { error } : {}) };
  }));
  return { domain: domains[0] ?? null, domains };
}
export async function changeHostedDomain(tenantId: string, raw: unknown, options: { authorizeWrite?: () => Promise<void> } = {}): Promise<{ domain: WebsiteDomainView | null; domains: WebsiteDomainView[]; registrationAttempt?: DomainClaim["registrationAttempt"] }> {
  const input = z.object({ domain: z.string().trim().min(1).max(253), action: z.enum(["attach", "refresh"]) }).strict().parse(raw);
  const domain = normalizeCustomDomain(input.domain);
  if (!domain || !isValidDomain(domain)) throw new WorkspaceConflictError("Enter a valid domain you control.");
  if (!process.env.VERCEL_API_TOKEN || !(process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME)) throw new WorkspaceStoreError("Domain setup is unavailable until the hosting provider is configured.");
  let registrationAttempt: DomainClaim["registrationAttempt"];
  let attachmentStarted = false;
  try {
    if (input.action === "attach") {
      const existing = (await listTenantDomainClaims(tenantId)).find(claim => claim.domain === domain);
      registrationAttempt = existing?.registrationAttempt;
      if (!existing || registrationAttempt === "not_submitted" || registrationAttempt === "rejected") {
        attachmentStarted = true;
        const result = await addCustomDomain(tenantId, domain,"additional",{ reconcileProviderBeforeWrite:true, authorizeWrite:options.authorizeWrite });
        if (!result.ok) throw new WorkspaceConflictError(result.error);
        registrationAttempt = result.claim.registrationAttempt;
      }
    }
    const result = await refreshDomainClaim(tenantId, domain,options);
    if (!result.ok) throw new WorkspaceConflictError(result.error);
    registrationAttempt = result.claim.registrationAttempt ?? registrationAttempt;
    return { ...await readHostedDomains(tenantId), registrationAttempt };
  } catch (error) {
    // Inspect the durable submission boundary. A known rejection or a saved
    // not-submitted intent is a failure; confirmed and unknown are observation
    // failures and must never offer another attachment as the recovery path.
    try { registrationAttempt = (await listTenantDomainClaims(tenantId)).find(claim => claim.domain === domain)?.registrationAttempt ?? registrationAttempt; }
    catch { if (attachmentStarted && !registrationAttempt) registrationAttempt = "unknown"; }
    if (registrationAttempt === "confirmed" || registrationAttempt === "unknown") throw new WebsiteDomainEffectUnconfirmedError(registrationAttempt);
    throw error;
  }
}

export function validateHostedDomain(raw: string): string {
  const hostname = normalizeCustomDomain(raw);
  if (!hostname || !isValidDomain(hostname)) throw new WorkspaceConflictError("Enter a valid domain you control.");
  return hostname;
}

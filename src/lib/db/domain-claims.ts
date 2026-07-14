import type { DomainClaim } from "../types";
import { getSupabase, type Insert, type Row } from "./client";

export function rowToDomainClaim(r: Row<"domain_claims">): DomainClaim {
  return {
    tenantId: r.tenant_id,
    domain: r.domain,
    role: r.role as DomainClaim["role"],
    status: r.status as DomainClaim["status"],
    dnsStatus: (r.dns_status ?? "unknown") as DomainClaim["dnsStatus"],
    sslStatus: (r.ssl_status ?? "unknown") as DomainClaim["sslStatus"],
    verification: r.verification ?? undefined,
    vercelProjectId: r.vercel_project_id ?? undefined,
    error: r.error ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function domainClaimToRow(claim: DomainClaim): Insert<"domain_claims"> {
  return {
    tenant_id: claim.tenantId,
    domain: claim.domain,
    role: claim.role,
    status: claim.status,
    dns_status: claim.dnsStatus,
    ssl_status: claim.sslStatus,
    verification: claim.verification ?? null,
    vercel_project_id: claim.vercelProjectId ?? null,
    error: claim.error ?? null,
    created_at: claim.createdAt,
    updated_at: claim.updatedAt,
  };
}

export async function listAllDomainClaims(): Promise<Row<"domain_claims">[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db.from("domain_claims").select("*");
  if (error) {
    console.error("[db] listAllDomainClaims failed:", error.message);
    return [];
  }
  return data ?? [];
}

export async function listDomainClaims(tenantId: string): Promise<Row<"domain_claims">[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db.from("domain_claims").select("*").eq("tenant_id", tenantId);
  if (error) {
    console.error(`[db] listDomainClaims ${tenantId} failed:`, error.message);
    return [];
  }
  return data ?? [];
}

/** Claims are written before obsolete rows are removed, so a failed upsert
 * cannot erase the last-known verification state. */
export async function replaceDomainClaims(
  tenantId: string,
  claims: Insert<"domain_claims">[],
): Promise<void> {
  const db = getSupabase();
  if (!db) throw new Error(`[db] replaceDomainClaims ${tenantId} failed: Supabase is not configured`);

  if (claims.length > 0) {
    const { error } = await db.from("domain_claims").upsert(claims, { onConflict: "tenant_id,domain" });
    if (error) throw error;
  }
  const keep = new Set(claims.map((claim) => claim.domain));
  const { data: existing, error: readError } = await db
    .from("domain_claims")
    .select("domain")
    .eq("tenant_id", tenantId);
  if (readError) throw readError;
  const obsolete = (existing ?? []).map((row) => row.domain).filter((domain) => !keep.has(domain));
  if (obsolete.length > 0) {
    const { error } = await db.from("domain_claims").delete().eq("tenant_id", tenantId).in("domain", obsolete);
    if (error) throw error;
  }
}

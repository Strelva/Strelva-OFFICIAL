import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { logAuditEvent } from "@/lib/storage";
import { getTenantConfig } from "@/lib/tenants";
import {
  addCustomDomain,
  listTenantDomainClaims,
  refreshDomainClaim,
  removeCustomDomain,
  serializeDomainClaim,
} from "@/lib/domains";
import type { DomainClaimRole } from "@/lib/types";

/**
 * Super-admin domain management for a specific tenant. Unlike /api/tenant/domains
 * (which resolves the tenant from the x-tenant host header for the client
 * dashboard), this takes the tenant explicitly from the route so the operator
 * can manage any client's domains from Mission Control. Every mutation is
 * audit-logged.
 */

function parseRole(role: unknown): DomainClaimRole | undefined {
  if (role === "production" || role === "admin" || role === "additional") return role;
  return undefined;
}

async function guard(id: string) {
  if (!(await isSuperAdmin())) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const config = await getTenantConfig(id);
  if (!config) {
    return { error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }) };
  }
  return { error: null as null };
}

async function serialized(tenantId: string) {
  const claims = await listTenantDomainClaims(tenantId);
  return claims.map(serializeDomainClaim);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;
  return NextResponse.json({ domains: await serialized(id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;

  const body = await req.json().catch(() => null);
  const domain = body && typeof body.domain === "string" ? body.domain : "";
  if (!domain) return NextResponse.json({ error: "Domain is required" }, { status: 400 });

  const role = parseRole(body?.role);
  const result = await addCustomDomain(id, domain, role);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await logAuditEvent({
    tenant: id,
    action: "domain.add",
    targetType: "domain",
    targetId: domain,
    actor: await getActorContext(id),
    metadata: { role: role ?? "additional" },
  });
  return NextResponse.json({ domains: await serialized(id) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;

  const body = await req.json().catch(() => null);
  const domain = body && typeof body.domain === "string" ? body.domain : "";
  if (!domain) return NextResponse.json({ error: "Domain is required" }, { status: 400 });

  const result = await refreshDomainClaim(id, domain);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await logAuditEvent({
    tenant: id,
    action: "domain.refresh",
    targetType: "domain",
    targetId: domain,
    actor: await getActorContext(id),
  });
  return NextResponse.json({ domains: await serialized(id) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;

  const domain = new URL(req.url).searchParams.get("domain") || "";
  if (!domain) return NextResponse.json({ error: "Domain is required" }, { status: 400 });

  const result = await removeCustomDomain(id, domain);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await logAuditEvent({
    tenant: id,
    action: "domain.remove",
    targetType: "domain",
    targetId: domain,
    actor: await getActorContext(id),
  });
  return NextResponse.json({ domains: await serialized(id) });
}

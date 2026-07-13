import { NextResponse } from "next/server";
import { requireTenantFromHeaders } from "@/lib/tenant";
import { requireTenantPermission } from "@/lib/auth";
import {
  addCustomDomain,
  listTenantDomainClaims,
  refreshDomainClaim,
  removeCustomDomain,
  serializeDomainClaim,
} from "@/lib/domains";
import { getTenantConfig } from "@/lib/tenants";
import type { DomainClaimRole } from "@/lib/types";

async function serialize(tenantId: string) {
  const claims = await listTenantDomainClaims(tenantId);
  return claims.map(serializeDomainClaim);
}

function parseRole(role: unknown): DomainClaimRole | undefined {
  if (role === "production" || role === "admin" || role === "additional") return role;
  return undefined;
}

function missingTenantResponse(err: unknown): NextResponse | null {
  if (err instanceof Error && err.message === "Missing x-tenant header") {
    return NextResponse.json({ error: "Missing x-tenant header" }, { status: 400 });
  }
  return null;
}

export async function GET() {
  try {
    const tenant = await requireTenantFromHeaders();
    const blocked = await requireTenantPermission(tenant, "domains:manage");
    if (blocked) return blocked;

    const config = await getTenantConfig(tenant);
    if (!config) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    return NextResponse.json({ domains: await serialize(tenant) });
  } catch (err) {
    const missingTenant = missingTenantResponse(err);
    if (missingTenant) return missingTenant;

    console.error("[tenant domains GET]", err);
    return NextResponse.json({ error: "Failed to load domains" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await requireTenantFromHeaders();
    const blocked = await requireTenantPermission(tenant, "domains:manage");
    if (blocked) return blocked;

    const body = await request.json().catch(() => null);
    const domain = body && typeof body.domain === "string" ? body.domain : "";
    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    const result = await addCustomDomain(tenant, domain, parseRole(body?.role));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ domains: await serialize(tenant) });
  } catch (err) {
    const missingTenant = missingTenantResponse(err);
    if (missingTenant) return missingTenant;

    console.error("[tenant domains POST]", err);
    return NextResponse.json({ error: "Failed to add domain" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const tenant = await requireTenantFromHeaders();
    const blocked = await requireTenantPermission(tenant, "domains:manage");
    if (blocked) return blocked;

    const body = await request.json().catch(() => null);
    const domain = body && typeof body.domain === "string" ? body.domain : "";
    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    const result = await refreshDomainClaim(tenant, domain);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ domains: await serialize(tenant) });
  } catch (err) {
    const missingTenant = missingTenantResponse(err);
    if (missingTenant) return missingTenant;

    console.error("[tenant domains PATCH]", err);
    return NextResponse.json({ error: "Failed to refresh domain" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const tenant = await requireTenantFromHeaders();
    const blocked = await requireTenantPermission(tenant, "domains:manage");
    if (blocked) return blocked;

    const url = new URL(request.url);
    const domain = url.searchParams.get("domain") || "";
    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    const result = await removeCustomDomain(tenant, domain);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ domains: await serialize(tenant) });
  } catch (err) {
    const missingTenant = missingTenantResponse(err);
    if (missingTenant) return missingTenant;

    console.error("[tenant domains DELETE]", err);
    return NextResponse.json({ error: "Failed to remove domain" }, { status: 500 });
  }
}

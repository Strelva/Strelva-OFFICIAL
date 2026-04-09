import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess } from "@/lib/auth";
import {
  getTenantConfig,
  addCustomDomain,
  removeCustomDomain,
  getDomainAddedAt,
} from "@/lib/tenants";

const PENDING_WINDOW_MS = 5 * 60 * 1000;

type DomainStatus = "connected" | "pending";

function statusFor(tenantId: string, domain: string): DomainStatus {
  const addedAt = getDomainAddedAt(tenantId, domain);
  if (!addedAt) return "connected";
  return Date.now() - addedAt < PENDING_WINDOW_MS ? "pending" : "connected";
}

function serialize(tenantId: string, domains: string[]) {
  return domains.map((domain) => ({
    domain,
    status: statusFor(tenantId, domain),
    isApex: domain.split(".").length === 2,
  }));
}

export async function GET() {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const config = await getTenantConfig(tenant);
    if (!config) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    const domains = config.customDomains ?? [];
    return NextResponse.json({ domains: serialize(tenant, domains) });
  } catch (err) {
    console.error("[domains GET]", err);
    return NextResponse.json({ error: "Failed to load domains" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const domain = body && typeof body.domain === "string" ? body.domain : "";
    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    const result = await addCustomDomain(tenant, domain);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      domains: serialize(tenant, result.tenant.customDomains ?? []),
    });
  } catch (err) {
    console.error("[domains POST]", err);
    return NextResponse.json({ error: "Failed to add domain" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const url = new URL(request.url);
    const domain = url.searchParams.get("domain") || "";
    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    const result = await removeCustomDomain(tenant, domain);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      domains: serialize(tenant, result.tenant.customDomains ?? []),
    });
  } catch (err) {
    console.error("[domains DELETE]", err);
    return NextResponse.json({ error: "Failed to remove domain" }, { status: 500 });
  }
}

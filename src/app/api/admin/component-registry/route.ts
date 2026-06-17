import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { readJsonObject } from "@/lib/request-body";
import { getSiteCapabilityManifest } from "@/lib/site-capabilities";
import { customComponentCapabilitySchema } from "@/lib/schemas";
import { logAuditEvent } from "@/lib/storage";
import { getTenantConfig, updateTenant } from "@/lib/tenants";
import type { CustomComponentCapability } from "@/lib/types";

function cleanTenant(value: string | null): string {
  return value && /^[a-z0-9-]+$/.test(value) ? value : "";
}

export async function GET(req: Request) {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = cleanTenant(new URL(req.url).searchParams.get("tenant"));
  if (!tenant) {
    return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  }

  const manifest = await getSiteCapabilityManifest(tenant);
  return NextResponse.json({ tenant, components: manifest.customComponents });
}

export async function PUT(req: Request) {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  const tenant = cleanTenant(typeof body?.tenant === "string" ? body.tenant : null);
  if (!tenant) {
    return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  }

  const rawComponents = Array.isArray(body?.components) ? body.components : null;
  if (!rawComponents) {
    return NextResponse.json({ error: "Missing components" }, { status: 400 });
  }

  const components: CustomComponentCapability[] = [];
  for (const component of rawComponents) {
    const parsed = customComponentCapabilitySchema.safeParse(component);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid component registry" },
        { status: 400 }
      );
    }
    components.push({ ...parsed.data, adminOnly: true });
  }

  const tenantConfig = await getTenantConfig(tenant);
  if (!tenantConfig) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const updated = await updateTenant(tenant, {
    siteCapabilities: {
      ...tenantConfig.siteCapabilities,
      customComponents: components,
    },
  });

  if (!updated) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  await logAuditEvent({
    tenant,
    action: "tenant.update_components",
    targetType: "tenant",
    targetId: tenant,
    actor: await getActorContext(tenant),
    metadata: { componentCount: components.length },
  });

  return NextResponse.json({ tenant, components });
}

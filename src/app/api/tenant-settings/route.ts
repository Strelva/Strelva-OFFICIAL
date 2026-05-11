import { NextResponse } from "next/server";
import { getTenantFromHeaders } from "@/lib/tenant";
import {
  getActorContext,
  requireTenantAccess,
  requireTenantPermission,
  type TenantPermission,
} from "@/lib/auth";
import { getTenantConfig, updateTenant, invalidateDomainMapCache } from "@/lib/tenants";
import { normalizeTenantDomain } from "@/lib/tenant-urls";
import { validateTenantDomains } from "@/lib/domains";
import { logAuditEvent } from "@/lib/storage";
import { readJsonObject } from "@/lib/request-body";
import { siteCapabilityManifestSchema } from "@/lib/schemas";
import type { BusinessHours, SiteCapabilityManifest } from "@/lib/types";

/** Tenant-level settings: businessRules, personality, businessHours */

export async function GET() {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;

    const config = await getTenantConfig(tenant);
    if (!config) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    return NextResponse.json({
      businessRules: config.businessRules || "",
      personality: config.personality || "",
      businessHours: config.businessHours || null,
      autoPublish: config.autoPublish !== false,
      productionDomain: config.productionDomain || "",
      adminDomain: config.adminDomain || "",
      customRepo: config.customRepo || null,
      siteCapabilities: config.siteCapabilities || null,
      // Connection status flags (presence of config = connected)
      connections: {
        googleSearchConsole: !!config.googleSearchConsoleKey,
        googleAnalytics: false,
        newsletter: !!config.resendDomain,
        googleBusiness: !!config.reviewsConfig?.googlePlaceId,
        instagram: !!(config.instagramAccessToken || config.beholdFeedId),
        calendly: !!config.bookingUrl,
        yelp: !!config.reviewsConfig?.yelpBusinessId,
      },
    });
  } catch (err) {
    console.error("[tenant-settings GET]", err);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    const actor = await getActorContext(tenant);
    const currentConfig = await getTenantConfig(tenant);
    if (!currentConfig) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    let domainsTouched = false;

    const sensitivePermissions = new Set<TenantPermission>();
    if (typeof body.autoPublish === "boolean") sensitivePermissions.add("publishing:manage");
    if (typeof body.productionDomain === "string" || typeof body.adminDomain === "string") {
      sensitivePermissions.add("domains:manage");
    }
    for (const permission of sensitivePermissions) {
      const blocked = await requireTenantPermission(tenant, permission);
      if (blocked) return blocked;
    }
    if (sensitivePermissions.size === 0) {
      const blocked = await requireTenantPermission(tenant, "settings:write");
      if (blocked) return blocked;
    }

    if (typeof body.businessRules === "string") {
      updates.businessRules = body.businessRules.slice(0, 2000);
    }
    if (typeof body.personality === "string") {
      updates.personality = body.personality.slice(0, 500);
    }
    if (body.businessHours !== undefined) {
      if (body.businessHours === null) {
        updates.businessHours = undefined;
      } else {
        const bh = body.businessHours as BusinessHours;
        if (Array.isArray(bh.schedule)) {
          updates.businessHours = {
            schedule: bh.schedule.slice(0, 7).map((d) => ({
              day: Number(d.day),
              open: String(d.open || "09:00"),
              close: String(d.close || "17:00"),
              closed: Boolean(d.closed),
            })),
            holidays: Array.isArray(bh.holidays)
              ? bh.holidays.slice(0, 50).map((h) => ({
                  date: String(h.date),
                  label: String(h.label),
                }))
              : [],
            timezone: typeof bh.timezone === "string" ? bh.timezone : undefined,
          };
        }
      }
    }
    if (typeof body.autoPublish === "boolean") {
      updates.autoPublish = body.autoPublish;
    }
    if (body.siteCapabilities !== undefined) {
      const parsed = siteCapabilityManifestSchema.partial().safeParse(body.siteCapabilities);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Invalid site capabilities" },
          { status: 400 }
        );
      }
      updates.siteCapabilities = {
        ...(currentConfig.siteCapabilities || {}),
        ...(parsed.data as Partial<SiteCapabilityManifest>),
      };
    }
    // Google Search Console key (JSON string)
    if (typeof body.googleSearchConsoleKey === "string") {
      // Store as-is (JSON string) or clear if empty
      updates.googleSearchConsoleKey = body.googleSearchConsoleKey.trim() || undefined;
    }
    // Domain fields (lowercase, trim)
    if (typeof body.productionDomain === "string") {
      domainsTouched = true;
      updates.productionDomain = normalizeTenantDomain(body.productionDomain) || undefined;
    }
    if (typeof body.adminDomain === "string") {
      domainsTouched = true;
      updates.adminDomain = normalizeTenantDomain(body.adminDomain) || undefined;
    }

    if (domainsTouched) {
      const hasProductionUpdate = Object.prototype.hasOwnProperty.call(updates, "productionDomain");
      const hasAdminUpdate = Object.prototype.hasOwnProperty.call(updates, "adminDomain");
      const domainErrors = await validateTenantDomains({
        ...currentConfig,
        productionDomain: hasProductionUpdate
          ? (updates.productionDomain as string | undefined)
          : currentConfig.productionDomain,
        adminDomain: hasAdminUpdate
          ? (updates.adminDomain as string | undefined)
          : currentConfig.adminDomain,
      });
      if (domainErrors.length > 0) {
        return NextResponse.json(
          {
            error: domainErrors[0].error,
            domain: domainErrors[0].domain,
            role: domainErrors[0].role,
          },
          { status: domainErrors[0].error.startsWith("Domain already claimed") ? 409 : 400 }
        );
      }
    }

    const updated = await updateTenant(tenant, updates);
    if (!updated) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Invalidate domain map cache if domain fields were updated
    if (domainsTouched) {
      invalidateDomainMapCache();
    }
    if (actor.isImpersonating) {
      await logAuditEvent({
        tenant,
        actor,
        action: "tenant_settings.updated",
        targetType: "tenant",
        targetId: tenant,
        metadata: { fields: Object.keys(updates) },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[tenant-settings PUT]", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

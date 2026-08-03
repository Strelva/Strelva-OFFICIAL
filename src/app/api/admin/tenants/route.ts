import { NextResponse } from "next/server";
import { z } from "zod";
import { getActorContext, isSuperAdmin } from "@/lib/auth";
import { logAuditEvent } from "@/lib/storage";
import { readJsonObject } from "@/lib/request-body";
import { getAllTenants, createTenant, updateTenant, isActiveTenant, getTenantConfig } from "@/lib/tenants";
import { applyFeatureChange, cleanTenantFeatureIds, FeatureGuardError } from "@/lib/features/registry";
import { normalizeTenantDomain } from "@/lib/tenant-urls";
import { CUSTOM_REPO_CONTRACT_VERSION, DEFAULT_DELIVERY_MODEL } from "@/lib/custom-repos";
import { isSafeFetchUrl } from "@/lib/safe-fetch";
import type { DesignTokenScope, TenantConfig, TenantDeliveryModel, TenantFeature } from "@/lib/types";

const DELIVERY_MODELS = new Set<TenantDeliveryModel>(["custom_repo", "platform_template"]);
const DESIGN_TOKENS = new Set<DesignTokenScope>(["colors", "fonts", "buttons", "spacing", "radius", "motion", "imagery"]);

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanFeatures(value: unknown): TenantFeature[] {
  return cleanTenantFeatureIds(value);
}

function cleanDesignTokens(value: unknown): DesignTokenScope[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((token): token is DesignTokenScope => DESIGN_TOKENS.has(token as DesignTokenScope));
}

export async function GET(req: Request) {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "true";
  const tenants = await getAllTenants();
  return NextResponse.json(includeArchived ? tenants : tenants.filter(isActiveTenant));
}

export async function POST(req: Request) {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    siteName: rawSiteName,
    ownerName: rawOwnerName,
    ownerEmail: rawOwnerEmail,
    industry: rawIndustry,
    template: rawTemplate,
    subdomain: rawSubdomain,
    features,
    productionDomain,
    adminDomain,
    deliveryModel: rawDeliveryModel,
    customRepo,
  } = body;
  const siteName = cleanString(rawSiteName);
  const ownerName = cleanString(rawOwnerName);
  const ownerEmail = cleanString(rawOwnerEmail);
  const industry = cleanString(rawIndustry);
  const template = cleanString(rawTemplate);
  const subdomain = cleanString(rawSubdomain);
  const deliveryModel = DELIVERY_MODELS.has(rawDeliveryModel as TenantDeliveryModel)
    ? rawDeliveryModel as TenantDeliveryModel
    : DEFAULT_DELIVERY_MODEL;
  const cleanCustomRepo = customRepo && typeof customRepo === "object" && !Array.isArray(customRepo)
    ? customRepo as Record<string, unknown>
    : {};
  
  // Light validation: if a repoUrl is provided, ensure it's a valid HTTPS URL.
  const repoUrl = cleanString(cleanCustomRepo.repoUrl);
  if (repoUrl && !isSafeFetchUrl(repoUrl)) {
    return NextResponse.json(
      { error: "Invalid customRepo.repoUrl: must be a valid HTTPS URL" },
      { status: 400 }
    );
  }

  if (!siteName || !ownerName || !industry || !template || !subdomain) {
    return NextResponse.json(
      { error: "Missing required fields: siteName, ownerName, industry, template, subdomain" },
      { status: 400 }
    );
  }

  try {
    const tenant = await createTenant({
      siteName,
      ownerName,
      ownerEmail: ownerEmail || undefined,
      industry,
      template,
      deliveryModel,
      subdomain,
      features: cleanFeatures(features),
      productionDomain: typeof productionDomain === "string" ? normalizeTenantDomain(productionDomain) || undefined : undefined,
      adminDomain: typeof adminDomain === "string" ? normalizeTenantDomain(adminDomain) || undefined : undefined,
      customRepo: deliveryModel === "custom_repo" ? {
        repoName: cleanString(cleanCustomRepo.repoName) || subdomain,
        repoUrl: cleanString(cleanCustomRepo.repoUrl) || undefined,
        localPath: cleanString(cleanCustomRepo.localPath) || undefined,
        capabilityManifestUrl: cleanString(cleanCustomRepo.capabilityManifestUrl) || undefined,
        supportedDesignTokens: cleanDesignTokens(cleanCustomRepo.supportedDesignTokens),
        supportsPageConfig: typeof cleanCustomRepo.supportsPageConfig === "boolean" ? cleanCustomRepo.supportsPageConfig : true,
        supportsDraftPreview: typeof cleanCustomRepo.supportsDraftPreview === "boolean" ? cleanCustomRepo.supportsDraftPreview : true,
        supportsInlineEditing: typeof cleanCustomRepo.supportsInlineEditing === "boolean" ? cleanCustomRepo.supportsInlineEditing : true,
        contractVersion: cleanString(cleanCustomRepo.contractVersion) || CUSTOM_REPO_CONTRACT_VERSION,
        productionUrl: typeof productionDomain === "string" && normalizeTenantDomain(productionDomain)
          ? `https://${normalizeTenantDomain(productionDomain)}`
          : undefined,
        revalidationHealth: "unknown",
      } : undefined,
    });
    await logAuditEvent({
      tenant: tenant.id,
      action: "tenant.create",
      targetType: "tenant",
      targetId: tenant.id,
      actor: await getActorContext(tenant.id),
      metadata: { siteName: tenant.siteName, deliveryModel: tenant.deliveryModel },
    });
    return NextResponse.json(tenant, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create tenant" },
      { status: 409 }
    );
  }
}

export async function PATCH(req: Request) {
  const admin = await isSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonObject(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id: rawId, ...updates } = body;
  const id = cleanString(rawId);
  if (!id) {
    return NextResponse.json({ error: "Missing tenant id" }, { status: 400 });
  }

  // Whitelist + type-check the mutable fields. Without this, an arbitrary
  // (super-admin) body wrote unchecked keys/types straight into the tenant
  // source-of-truth in Sanity.
  const updateSchema = z
    .object({
      siteName: z.string().max(200),
      ownerName: z.string().max(200),
      ownerEmail: z.string().email(),
      ownerPhone: z.string().max(50),
      referredBy: z.string().max(200),
      bookingProvider: z.string().max(100),
      bookingUrl: z.string().max(2048),
      productionDomain: z.string().max(253),
      adminDomain: z.string().max(253),
      revalidateUrl: z.string().max(2048),
      // Operator-settable when wiring a client's revalidation (super-admin gated).
      revalidationSecret: z.string().max(512),
      siteUrl: z.string().max(2048),
      active: z.boolean(),
      subscriptionStatus: z.enum(["none", "active", "trialing", "past_due", "cancelled"]),
      // Operator-set billing classification. "" from the UI means "none" (unset).
      billingType: z.enum(["", "none", "tier", "custom"]),
      // Which tier when billingType==="tier"; "" clears it.
      subscriptionPlan: z.enum(["", "presence", "growth", "scale"]),
      // Custom monthly amount in cents (billingType==="custom"); null clears it. Capped for sanity.
      planMonthlyCents: z.number().int().min(0).max(1_000_000).nullable(),
      planOverride: z.literal(""),
      // The enabled dashboard features. Validated + core-guarded below (not billing).
      features: z.array(z.string()).max(64),
      // Operator-settable TenantConfig fields (super-admin gated). These flow
      // straight through updateTenant() → tenantToRow (industry / auto_publish /
      // auto_approve_threshold / reviews_config / visibility columns). For the
      // JSON columns (reviewsConfig / visibility) the UI sends the FULL object,
      // so a save REPLACES the stored value — intentional.
      industry: z.string().max(120),
      // Operator-editable AI persona + rules (feed the agent system prompt).
      personality: z.string().max(4000),
      businessRules: z.string().max(4000),
      autoPublish: z.boolean(),
      autoApproveThreshold: z.number().int().min(0).max(50).nullable(),
      reviewsConfig: z
        .object({
          googlePlaceId: z.string().max(200).optional(),
          yelpBusinessId: z.string().max(200).optional(),
        })
        .strict(),
      visibility: z
        .object({
          trade: z.string().max(120).optional(),
          towns: z.array(z.string().max(120)).max(52).optional(),
          competitors: z
            .array(
              z.object({
                name: z.string().max(200),
                domain: z.string().max(253).optional(),
              }),
            )
            .max(3)
            .optional(),
          queriesPerWeek: z.number().int().min(1).max(52).optional(),
          enabled: z.boolean().optional(),
        })
        .partial(),
    })
    .partial();
  // Non-strict: unknown keys are stripped (not rejected) so this can't break a
  // caller that sends an extra field, while still keeping arbitrary keys/types
  // out of the tenant doc.
  const parsedUpdates = updateSchema.safeParse(updates);
  if (!parsedUpdates.success) {
    return NextResponse.json(
      { error: "Invalid tenant update", details: parsedUpdates.error.issues },
      { status: 400 }
    );
  }

  const data = parsedUpdates.data as Partial<TenantConfig> & { features?: string[] };

  // Feature toggle: validate + expand sets + refuse to remove a locked core feature.
  if (data.features !== undefined) {
    const currentTenant = await getTenantConfig(id);
    if (!currentTenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    try {
      data.features = cleanTenantFeatureIds(
        applyFeatureChange(currentTenant.features ?? [], data.features),
      );
    } catch (err) {
      if (err instanceof FeatureGuardError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }

  // Billing normalization: the UI sends "" for the unset states. Map them to the
  // stored shape ("none" for billingType; cleared plan) so the CHECK constraint is
  // satisfied and clearing actually persists.
  const billingData = data as Record<string, unknown>;
  if (billingData.billingType === "") billingData.billingType = "none";
  if (billingData.subscriptionPlan === "") billingData.subscriptionPlan = null;
  // Guard: a custom plan must carry a positive monthly amount. Without this,
  // an operator could save billingType:"custom" with $0 and silently corrupt MRR.
  // tier/none legitimately have zero/null cents, so the guard is
  // scoped to "custom" only (matching the POST /provision path).
  if (billingData.billingType === "custom") {
    const cents = billingData.planMonthlyCents;
    if (cents === undefined || cents === null || (typeof cents === "number" && cents <= 0)) {
      return NextResponse.json(
        { error: "A custom plan needs a monthly amount above $0." },
        { status: 400 }
      );
    }
  }

  const updated = await updateTenant(id, data as Partial<TenantConfig>);
  if (!updated) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  await logAuditEvent({
    tenant: id,
    action: "tenant.update",
    targetType: "tenant",
    targetId: id,
    actor: await getActorContext(id),
    metadata: { fields: Object.keys(updates) },
  });

  return NextResponse.json(updated);
}

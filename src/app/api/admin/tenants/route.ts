import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { readJsonObject } from "@/lib/request-body";
import { getAllTenants, createTenant, updateTenant, isActiveTenant } from "@/lib/tenants";
import { normalizeTenantDomain } from "@/lib/tenant-urls";
import { CUSTOM_REPO_CONTRACT_VERSION, DEFAULT_DELIVERY_MODEL } from "@/lib/custom-repos";
import type { TenantConfig, TenantDeliveryModel, TenantFeature } from "@/lib/types";

const TENANT_FEATURES = new Set<TenantFeature>(["commerce", "booking", "newsletter"]);
const DELIVERY_MODELS = new Set<TenantDeliveryModel>(["custom_repo", "platform_template"]);

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanFeatures(value: unknown): TenantFeature[] {
  if (!Array.isArray(value)) return [];
  return value.filter((feature): feature is TenantFeature => TENANT_FEATURES.has(feature as TenantFeature));
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
        contractVersion: cleanString(cleanCustomRepo.contractVersion) || CUSTOM_REPO_CONTRACT_VERSION,
        productionUrl: typeof productionDomain === "string" && normalizeTenantDomain(productionDomain)
          ? `https://${normalizeTenantDomain(productionDomain)}`
          : undefined,
        revalidationHealth: "unknown",
      } : undefined,
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

  const updated = await updateTenant(id, updates as Partial<TenantConfig>);
  if (!updated) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

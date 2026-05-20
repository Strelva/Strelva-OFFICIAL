import type {
  CustomChangeRequestMetadata,
  CustomRepoDependencySeverity,
  CustomRepoDependencyStatus,
  CustomRepoExternalDependency,
  CustomRepoMetadata,
  TenantConfig,
  TenantDeliveryModel,
} from "./types";

// Every paid client gets a hand-built custom repo (no template-rendered
// in-app fallback). Self-serve auto-provisioning is gated off; the only path
// to a public site is Jacob building the repo and the access-request intake
// at /access-request. The `platform_template` delivery model still exists in
// the type so existing tenant records remain readable, but new tenants
// default to "custom_repo".
export const DEFAULT_DELIVERY_MODEL: TenantDeliveryModel = "custom_repo";
export const CUSTOM_REPO_CONTRACT_VERSION = "v1";

const STATUS_RANK: Record<CustomRepoDependencyStatus, number> = {
  healthy: 0,
  unknown: 1,
  degraded: 2,
  failing: 3,
  paused: 4,
};

const SEVERITY_RANK: Record<CustomRepoDependencySeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

const GLDF_SUPABASE_PAUSE: CustomRepoExternalDependency = {
  id: "gldf-supabase",
  name: "GLDF Supabase",
  provider: "Supabase",
  purpose: "Rewards, customer account, and cart data for the GLDF custom storefront.",
  status: "paused",
  severity: "critical",
  detectedAt: "2026-05-06",
  source: "Amy May 6 GLDF Supabase pause email",
  notes: "Supabase is paused. Resume or replace this dependency before storefront features that read Supabase fail silently.",
};

export function getTenantDeliveryModel(
  tenant: Pick<TenantConfig, "deliveryModel"> | undefined
): TenantDeliveryModel {
  return tenant?.deliveryModel ?? DEFAULT_DELIVERY_MODEL;
}

export function getCustomRepoMetadata(
  tenant: Pick<TenantConfig, "id" | "subdomain" | "productionDomain" | "siteUrl" | "customRepo"> | undefined
): CustomRepoMetadata {
  if (!tenant) return { contractVersion: CUSTOM_REPO_CONTRACT_VERSION };

  return {
    contractVersion: CUSTOM_REPO_CONTRACT_VERSION,
    repoName: tenant.customRepo?.repoName ?? tenant.id,
    productionUrl:
      tenant.customRepo?.productionUrl ??
      tenant.siteUrl ??
      (tenant.productionDomain ? `https://${tenant.productionDomain}` : undefined),
    ...tenant.customRepo,
  };
}

function mergeDependencyDefaults(
  tenant: Pick<TenantConfig, "id" | "customRepo"> | undefined,
  dependencies: CustomRepoExternalDependency[]
): CustomRepoExternalDependency[] {
  if (tenant?.id !== "gldf") return dependencies;

  const hasSupabase = dependencies.some((dependency) => {
    const provider = dependency.provider.toLowerCase();
    const id = dependency.id.toLowerCase();
    return provider === "supabase" || id.includes("supabase");
  });

  return hasSupabase ? dependencies : [GLDF_SUPABASE_PAUSE, ...dependencies];
}

export function getCustomRepoDependencies(
  tenant: Pick<TenantConfig, "id" | "deliveryModel" | "customRepo"> | undefined
): CustomRepoExternalDependency[] {
  if (getTenantDeliveryModel(tenant) !== "custom_repo") return [];
  const dependencies = tenant?.customRepo?.externalDependencies ?? [];
  return mergeDependencyDefaults(tenant, dependencies);
}

export function getBlockingCustomRepoDependencies(
  tenant: Pick<TenantConfig, "id" | "deliveryModel" | "customRepo"> | undefined
): CustomRepoExternalDependency[] {
  return getCustomRepoDependencies(tenant).filter(
    (dependency) => dependency.severity === "critical" || dependency.status === "paused" || dependency.status === "failing"
  );
}

export function getWorstCustomRepoDependencyStatus(
  dependencies: CustomRepoExternalDependency[]
): { status: CustomRepoDependencyStatus; severity: CustomRepoDependencySeverity } {
  return dependencies.reduce(
    (worst, dependency) => ({
      status: STATUS_RANK[dependency.status] > STATUS_RANK[worst.status] ? dependency.status : worst.status,
      severity:
        SEVERITY_RANK[dependency.severity] > SEVERITY_RANK[worst.severity]
          ? dependency.severity
          : worst.severity,
    }),
    { status: "healthy" as CustomRepoDependencyStatus, severity: "info" as CustomRepoDependencySeverity }
  );
}

export function getTenantEditablePreviewUrl(
  tenant: Pick<TenantConfig, "id" | "subdomain" | "productionDomain" | "siteUrl" | "deliveryModel" | "customRepo"> | undefined,
  fallback: { requestOrigin?: string; siteUrl?: string } = {}
): string {
  if (getTenantDeliveryModel(tenant) !== "custom_repo") {
    return fallback.requestOrigin || fallback.siteUrl || "";
  }

  const repo = getCustomRepoMetadata(tenant);
  if (repo.supportsDraftPreview === false) {
    return fallback.siteUrl || repo.productionUrl || fallback.requestOrigin || "";
  }

  return repo.productionUrl || fallback.siteUrl || fallback.requestOrigin || "";
}

export function getTriageDueAt(requestedAt = new Date()): string {
  const due = new Date(requestedAt);
  due.setDate(due.getDate() + (due.getDay() === 5 ? 3 : due.getDay() === 6 ? 2 : 1));
  return due.toISOString();
}

export function summarizeCustomRepo(repo: CustomRepoMetadata | undefined): string {
  if (!repo) return "No repo metadata";
  return [repo.repoName, repo.productionUrl, repo.contractVersion]
    .filter(Boolean)
    .join(" · ") || "Repo metadata pending";
}

export function isCustomChangeRequestMetadata(
  metadata: Record<string, unknown> | undefined
): metadata is Record<string, unknown> & CustomChangeRequestMetadata {
  return metadata?.kind === "custom_code_or_design_request";
}

import type {
  CustomChangeRequestMetadata,
  CustomRepoMetadata,
  TenantConfig,
  TenantDeliveryModel,
} from "./types";

export const DEFAULT_DELIVERY_MODEL: TenantDeliveryModel = "custom_repo";
export const CUSTOM_REPO_CONTRACT_VERSION = "v1";

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

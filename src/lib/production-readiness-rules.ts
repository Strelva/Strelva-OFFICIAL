export type ReadinessStatus = "ok" | "warn" | "fail" | "skip";

export interface TenantReadinessInput {
  id: string;
  active?: boolean;
  productionDomain?: string;
  adminDomain?: string;
  customDomains?: string[];
  revalidateUrl?: string;
  revalidationSecret?: string;
}

export interface TenantReadinessResult {
  name: string;
  status: ReadinessStatus;
  message: string;
}

export function normalizeReadinessDomain(domain: string | undefined): string {
  return domain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "";
}

function mustStartWith(prefix: string) {
  return (value: string) => value.startsWith(prefix) ? null : `Must start with ${prefix} for production launch`;
}

function mustBeHttps(value: string) {
  return value.startsWith("https://") ? null : "Must be an https:// URL for production launch";
}

function mustNotBeLocalhost(value: string) {
  return /localhost|127\.0\.0\.1|\[::1\]/i.test(value) ? "Must not point at localhost for production launch" : null;
}

function allOf(...validators: Array<(value: string) => string | null>) {
  return (value: string) => validators.map((validator) => validator(value)).find(Boolean) || null;
}

const productionEnvValidators: Record<string, (value: string) => string | null> = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: mustStartWith("pk_live_"),
  CLERK_SECRET_KEY: mustStartWith("sk_live_"),
  CLERK_WEBHOOK_SECRET: mustStartWith("whsec_"),
  UPSTASH_REDIS_REST_URL: mustBeHttps,
  STRIPE_SECRET_KEY: mustStartWith("sk_live_"),
  STRIPE_SCAFFOLD_PRICE_ID: mustStartWith("price_"),
  STRIPE_WEBHOOK_SECRET: mustStartWith("whsec_"),
  RESEND_API_KEY: mustStartWith("re_"),
  NEXT_PUBLIC_SITE_URL: allOf(mustBeHttps, mustNotBeLocalhost),
};

export function validateProductionEnvValue(name: string, value: string): string | null {
  return productionEnvValidators[name]?.(value) || null;
}

export function getTenantLaunchReadinessResults(tenant: TenantReadinessInput): TenantReadinessResult[] {
  const tenantIsActive = tenant.active !== false;
  const productionDomain = normalizeReadinessDomain(tenant.productionDomain);
  const adminDomain = normalizeReadinessDomain(tenant.adminDomain);
  const clientCustomDomains = tenant.customDomains?.map(normalizeReadinessDomain).filter((domain) =>
    domain && !domain.startsWith("admin.") && !domain.endsWith(".scaffoldweb.com") && !domain.endsWith(".vercel.app")
  );
  const results: TenantReadinessResult[] = [];
  const hasClientDomain = !!productionDomain || !!clientCustomDomains?.length;

  results.push(hasClientDomain ? {
    name: `Tenant ${tenant.id} client domain`,
    status: "ok",
    message: productionDomain || clientCustomDomains?.join(", ") || "Configured",
  } : {
    name: `Tenant ${tenant.id} client domain`,
    status: tenantIsActive ? "fail" : "warn",
    message: tenantIsActive
      ? "Active tenant has no customer-facing productionDomain/customDomains entry configured"
      : "Inactive tenant has no customer-facing productionDomain/customDomains entry configured",
  });

  const derivedAdminDomain = productionDomain ? `admin.${productionDomain}` : "";
  results.push(adminDomain || derivedAdminDomain ? {
    name: `Tenant ${tenant.id} admin domain`,
    status: "ok",
    message: adminDomain || derivedAdminDomain,
  } : {
    name: `Tenant ${tenant.id} admin domain`,
    status: tenantIsActive ? "fail" : "warn",
    message: tenantIsActive
      ? "Active tenant has no admin domain and none can be derived"
      : "Inactive tenant has no admin domain and none can be derived",
  });

  if (tenant.revalidateUrl) {
    results.push(tenant.revalidationSecret ? {
      name: `Tenant ${tenant.id} revalidation`,
      status: "ok",
      message: "URL set, secret configured",
    } : {
      name: `Tenant ${tenant.id} revalidation`,
      status: tenantIsActive ? "fail" : "warn",
      message: tenantIsActive
        ? "Active tenant URL set but NO SECRET (generate with: openssl rand -hex 32)"
        : "Inactive tenant URL set but NO SECRET (generate with: openssl rand -hex 32)",
    });
  } else {
    results.push({
      name: `Tenant ${tenant.id} revalidation`,
      status: tenantIsActive ? "fail" : "skip",
      message: tenantIsActive
        ? "Active tenant has no revalidateUrl configured"
        : "Inactive tenant has no revalidateUrl configured",
    });
  }

  return results;
}

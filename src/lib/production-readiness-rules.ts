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

export function getLaunchBlockerError(content: string, path = "docs/launch-blockers.md"): string | null {
  const currentBlockers = content.match(/## Current Blockers([\s\S]*?)(?=\n## |\s*$)/i)?.[1] || "";
  const waivedBlockers = content.match(/## Waived Blockers([\s\S]*?)(?=\n## |\s*$)/i)?.[1] || "";
  const currentBlockerNames = [...currentBlockers.matchAll(/^###\s+(.+)$/gim)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  const hasUnwaivedBlocker =
    /Status:\s*blocked/i.test(currentBlockers) ||
    currentBlockerNames.length > 0 ||
    /Required Production Env Vars/i.test(currentBlockers) ||
    /Stripe Price/i.test(currentBlockers);
  const waiverEntries = waivedBlockers.split(/\n(?=###\s+)/).filter((entry) => /^###\s+/m.test(entry));
  const malformedWaivers = waiverEntries.filter((entry) =>
    !/Status:\s*waived/i.test(entry) ||
    !/Owner:/i.test(entry) ||
    !/(Release note|Ticket|Reference):/i.test(entry) ||
    !/(Expiration|Follow-up|Follow up):/i.test(entry) ||
    !/Reason:/i.test(entry)
  );

  if (hasUnwaivedBlocker) {
    const blockerList = currentBlockerNames.length
      ? ` (${currentBlockerNames.join(", ")})`
      : "";
    return `${path} contains unresolved blockers${blockerList}; clear them or move them to Waived Blockers with Status, Owner, release/ticket reference, Follow-up, and Reason`;
  }

  if (malformedWaivers.length) {
    return `${path} contains waived blockers without status, owner, release/ticket reference, follow-up date, and reason`;
  }

  return null;
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

function mustEqual(expected: string) {
  return (value: string) => value === expected ? null : `Must be ${expected} for production launch`;
}

function mustBeAtLeastLength(length: number) {
  return (value: string) => value.length >= length ? null : `Must be at least ${length} characters for production launch`;
}

function mustMatch(pattern: RegExp, message: string) {
  return (value: string) => pattern.test(value) ? null : message;
}

function mustBeEmailList(value: string) {
  const emails = value.split(",").map((email) => email.trim()).filter(Boolean);
  const valid = emails.length > 0 && emails.every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  return valid ? null : "Must be a comma-separated list of valid emails for production launch";
}

function mustBeBareDomain(value: string) {
  const valid = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(value);
  return valid ? null : "Must be a bare domain like updates.scaffoldweb.com for production launch";
}

function mustBeScaffoldSenderDomain(value: string) {
  return value === "updates.scaffoldweb.com" || value.endsWith(".scaffoldweb.com")
    ? null
    : "Must use a verified Scaffold Web sender domain like updates.scaffoldweb.com";
}

function isBareDomain(value: string) {
  return mustBeBareDomain(value) === null;
}

function mustBeDomainList(value: string) {
  const domains = value.split(",").map((domain) => domain.trim()).filter(Boolean);
  const valid = domains.length > 0 && domains.every(isBareDomain);
  return valid ? null : "Must be a comma-separated list of bare domains for production launch";
}

function mustBeDomainMap(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "Must be a JSON object mapping bare domains to tenant IDs for production launch";
    }

    const entries = Object.entries(parsed);
    const valid = entries.length > 0 && entries.every(([domain, tenant]) =>
      isBareDomain(domain) && typeof tenant === "string" && /^[a-z0-9-]+$/.test(tenant)
    );
    return valid ? null : "Must map bare domains to tenant IDs like {\"example.com\":\"tenant-id\"}";
  } catch {
    return "Must be valid JSON mapping bare domains to tenant IDs for production launch";
  }
}

function allOf(...validators: Array<(value: string) => string | null>) {
  return (value: string) => validators.map((validator) => validator(value)).find(Boolean) || null;
}

const productionEnvValidators: Record<string, (value: string) => string | null> = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: mustStartWith("pk_live_"),
  CLERK_SECRET_KEY: mustStartWith("sk_live_"),
  CLERK_WEBHOOK_SECRET: mustStartWith("whsec_"),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: mustEqual("/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: mustEqual("/sign-up"),
  SUPER_ADMIN_EMAILS: mustBeEmailList,
  GOOGLE_GENERATIVE_AI_API_KEY: mustStartWith("AIza"),
  NEXT_PUBLIC_SANITY_PROJECT_ID: mustMatch(/^[a-z0-9]+$/, "Must be a Sanity project id for production launch"),
  SANITY_API_TOKEN: mustBeAtLeastLength(20),
  SANITY_WEBHOOK_SECRET: mustBeAtLeastLength(16),
  OAUTH_STATE_SECRET: mustBeAtLeastLength(32),
  UPSTASH_REDIS_REST_URL: mustBeHttps,
  STRIPE_SECRET_KEY: mustStartWith("sk_live_"),
  STRIPE_SCAFFOLD_PRICE_ID: mustStartWith("price_"),
  STRIPE_WEBHOOK_SECRET: mustStartWith("whsec_"),
  RESEND_API_KEY: mustStartWith("re_"),
  RESEND_DOMAIN: allOf(mustBeBareDomain, mustBeScaffoldSenderDomain),
  SENTRY_DSN: allOf(mustBeHttps, mustNotBeLocalhost),
  NEXT_PUBLIC_SENTRY_DSN: allOf(mustBeHttps, mustNotBeLocalhost),
  NEXT_PUBLIC_SITE_URL: allOf(mustBeHttps, mustNotBeLocalhost),
  NEXT_PUBLIC_APP_URL: allOf(mustBeHttps, mustNotBeLocalhost),
  CUSTOM_DOMAIN_MAP: mustBeDomainMap,
  MARKETING_DOMAINS: mustBeDomainList,
};

export function validateProductionEnvValue(name: string, value: string): string | null {
  if (value.includes("\\n")) {
    return "Must not include a literal \\n; remove copied newline text in Vercel";
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return "Must not include wrapping quotes in the stored Vercel value";
  }

  if (/\.\.\.|<[^>]+>|your[-_]/i.test(value)) {
    return "Must replace placeholder value for production launch";
  }

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

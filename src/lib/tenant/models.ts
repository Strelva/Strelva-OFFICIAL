/**
 * Ontology Phase 1 — additive tenant sub-models.
 *
 * `TenantConfig` (in `../types`) is the historical ~45-field monolith that every
 * consumer reads today. This file decomposes it into four typed sub-models plus a
 * container, WITHOUT changing `TenantConfig` or any consumer. Each sub-model owns a
 * disjoint slice of the fields; together they cover every field exactly once, so a
 * `TenantConfig` can be projected to/from them losslessly (see `./projection`).
 *
 * Every field reuses its EXACT type + optionality from `TenantConfig`. Fields whose
 * type is an inline anonymous object or a local union on the interface (branding,
 * socialConfig, reviewsConfig, subscriptionStatus, planOverride) are referenced via
 * indexed-access (`TenantConfig["field"]`) rather than redefined, so the two can
 * never drift. Named nested types are imported and reused directly.
 */
import type {
  TenantConfig,
  TemplateId,
  TenantDeliveryModel,
  CustomRepoMetadata,
  SiteCapabilityManifest,
  TenantFeature,
  IntegrationProvider,
  DomainClaim,
  CommercialPlanKey,
  BusinessHours,
  TenantVisibilityConfig,
} from "../types";

/** The stable spine — the identifiers and lifecycle timestamps a tenant is keyed by. */
export interface TenantIdentity {
  id: string;
  subdomain: string;
  siteName: string;
  createdAt: string;
  updatedAt?: string;
  active: boolean;
}

/** Who the business is — owner, industry, hours, voice, and presence config. */
export interface BusinessProfile {
  ownerName: string;
  ownerEmail?: string;
  ownerPhone?: string;
  industry: string;
  businessHours?: BusinessHours;
  branding?: TenantConfig["branding"];
  personality?: string;
  businessRules?: string;
  socialConfig?: TenantConfig["socialConfig"];
  reviewsConfig?: TenantConfig["reviewsConfig"];
  referredBy?: string;
}

/** How the site is built + served — template, delivery, capabilities, domains, routing. */
export interface SiteConfig {
  template: TemplateId;
  deliveryModel?: TenantDeliveryModel;
  customRepo?: CustomRepoMetadata;
  siteCapabilities?: Partial<SiteCapabilityManifest>;
  features?: TenantFeature[];
  integrations?: IntegrationProvider[];
  customDomains?: string[];
  domainClaims?: DomainClaim[];
  productionDomain?: string;
  adminDomain?: string;
  siteUrl?: string;
  revalidateUrl?: string;
  revalidationSecret?: string;
  resendDomain?: string;
  visibility?: TenantVisibilityConfig;
}

/** The money — Stripe linkage, subscription state, plan, and billing overrides. */
export interface CommercialSnapshot {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: TenantConfig["subscriptionStatus"];
  subscriptionStartedAt?: string;
  subscriptionPastDueSince?: string | null;
  commitmentEndsAt?: string;
  planOverride?: TenantConfig["planOverride"];
  subscriptionPlan?: CommercialPlanKey;
  planMonthlyCents?: number;
  planCurrency?: string;
}

/** Automation + integration knobs — publish policy, booking, and provider secrets. */
export interface AutomationPolicy {
  autoPublish?: boolean;
  autoApproveThreshold?: number | null;
  bookingProvider?: string;
  bookingUrl?: string;
  beholdFeedId?: string;
  slackWebhookUrl?: string;
  googleSearchConsoleKey?: string;
  instagramAccessToken?: string;
}

/** The four sub-models a `TenantConfig` decomposes into. */
export interface DecomposedTenant {
  identity: TenantIdentity;
  profile: BusinessProfile;
  site: SiteConfig;
  commercial: CommercialSnapshot;
  policy: AutomationPolicy;
}

/**
 * Ontology Phase 1 — the lossless projection between `TenantConfig` and its four
 * sub-models (`./models`).
 *
 * `decomposeTenantConfig` splits a `TenantConfig` into `{ identity, profile, site,
 * commercial, policy }`; `composeTenantConfig` merges them back. Because each field
 * lives in exactly one sub-model, the merge is a plain spread with no key collisions,
 * and the round-trip is lossless:
 *
 *   composeTenantConfig(decomposeTenantConfig(tc))  deep-equals  tc
 *
 * This is the compatibility bridge: consumers migrate onto the sub-models one at a
 * time while `TenantConfig` stays the read-projection, until the last consumer moves
 * off it (Phase 6). No consumer, mapper, or DB shape changes here — this is additive.
 */
import type { TenantConfig } from "../types";
import type { DecomposedTenant } from "./models";

/** Split a `TenantConfig` into its four typed sub-models. Inverse of `composeTenantConfig`. */
export function decomposeTenantConfig(tc: TenantConfig): DecomposedTenant {
  const {
    // identity
    id,
    subdomain,
    siteName,
    createdAt,
    updatedAt,
    active,
    // profile
    ownerName,
    ownerEmail,
    ownerPhone,
    industry,
    businessHours,
    branding,
    personality,
    businessRules,
    socialConfig,
    reviewsConfig,
    referredBy,
    // site
    template,
    deliveryModel,
    customRepo,
    siteCapabilities,
    features,
    integrations,
    customDomains,
    domainClaims,
    productionDomain,
    adminDomain,
    siteUrl,
    revalidateUrl,
    revalidationSecret,
    resendDomain,
    visibility,
    // commercial
    stripeCustomerId,
    stripeSubscriptionId,
    subscriptionStatus,
    subscriptionStartedAt,
    subscriptionPastDueSince,
    commitmentEndsAt,
    planOverride,
    subscriptionPlan,
    planMonthlyCents,
    planCurrency,
    // policy
    autoPublish,
    autoApproveThreshold,
    bookingProvider,
    bookingUrl,
    beholdFeedId,
    slackWebhookUrl,
    googleSearchConsoleKey,
    instagramAccessToken,
  } = tc;

  return {
    identity: { id, subdomain, siteName, createdAt, updatedAt, active },
    profile: {
      ownerName,
      ownerEmail,
      ownerPhone,
      industry,
      businessHours,
      branding,
      personality,
      businessRules,
      socialConfig,
      reviewsConfig,
      referredBy,
    },
    site: {
      template,
      deliveryModel,
      customRepo,
      siteCapabilities,
      features,
      integrations,
      customDomains,
      domainClaims,
      productionDomain,
      adminDomain,
      siteUrl,
      revalidateUrl,
      revalidationSecret,
      resendDomain,
      visibility,
    },
    commercial: {
      stripeCustomerId,
      stripeSubscriptionId,
      subscriptionStatus,
      subscriptionStartedAt,
      subscriptionPastDueSince,
      commitmentEndsAt,
      planOverride,
      subscriptionPlan,
      planMonthlyCents,
      planCurrency,
    },
    policy: {
      autoPublish,
      autoApproveThreshold,
      bookingProvider,
      bookingUrl,
      beholdFeedId,
      slackWebhookUrl,
      googleSearchConsoleKey,
      instagramAccessToken,
    },
  };
}

/** Merge the four sub-models back into a `TenantConfig`. Inverse of `decomposeTenantConfig`. */
export function composeTenantConfig(parts: DecomposedTenant): TenantConfig {
  return {
    ...parts.identity,
    ...parts.profile,
    ...parts.site,
    ...parts.commercial,
    ...parts.policy,
  };
}

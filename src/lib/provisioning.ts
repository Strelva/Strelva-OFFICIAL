/**
 * Operator onboarding orchestrator. Automates everything AROUND a site Jacob
 * hand-builds: the tenant record (with a generated revalidation secret and
 * computed URLs), the owner invite, and the per-tenant Vercel project + env +
 * domain. It does NOT generate or deploy the site — that stays Jacob's
 * hand-built repo connected to the created Vercel project.
 *
 * Every step is best-effort and reported in a status object so the onboard UI
 * can show a live checklist and surface what still needs a human.
 */

import { randomBytes } from "node:crypto";
import { createTenant, getTenantConfig } from "./tenants";
import { createInvite } from "./invites";
import { getStoredContent, setContent } from "./storage";
import { setAnalyticsConfig, deriveScDomain } from "./analytics";
import { defaults } from "./defaults";
import { CUSTOM_REPO_CONTRACT_VERSION } from "./custom-repos";
import { CONTROL_PLANE_URL } from "./brand";
import type { ContentSection, ContentMap, BillingType, CommercialPlanKey, PresenceProfile } from "./types";
import {
  createVercelProject,
  getVercelProject,
  setVercelEnv,
  addVercelDomain,
  isVercelConfigured,
} from "./vercel";

export interface ProvisionInput {
  subdomain: string;
  siteName: string;
  ownerName: string;
  ownerEmail?: string;
  industry: string;
  template?: string;
  productionDomain?: string;
  adminDomain?: string;
  /** Operator-set billing classification. Undefined = not configured (born as "none"). */
  billingType?: BillingType;
  /** When billingType==="tier": which of the 3 published tiers. */
  subscriptionPlan?: CommercialPlanKey;
  /** When billingType==="custom": the negotiated monthly amount in cents. */
  planMonthlyCents?: number;
  /** How the business is found — drives which presence surfaces show on the dashboard. */
  presence?: PresenceProfile;
}

export type StepStatus = "ok" | "failed" | "skipped";

export interface ProvisionStep {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

export interface ProvisionResult {
  tenantId: string;
  siteUrl: string;
  steps: ProvisionStep[];
  manualNext: string[];
  /** The env vars the hand-built client repo needs (incl. the revalidation
   *  secret). Shown to the operator so Jacob can paste them into the repo. */
  clientEnv: Record<string, string>;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// The control-plane host the client repo pulls /api/v1/* from.
// Cutover DONE (2026-06-26): prod sets CONTROL_PLANE_API_URL=https://app.strelva.com,
// so new clients now bake app.strelva.com (the canonical control plane). app.strelva.com
// + scaffoldweb.com are the same Vercel project during the soak; strelva.com is the
// marketing site and does NOT serve the v1 contract.
// Legacy repos keep their deployed REB_/SCAFFOLD env names and existing values;
// newly provisioned repos use the canonical app host unless an operator supplies
// an explicit compatibility endpoint.
const CONTROL_PLANE_API =
  process.env.CONTROL_PLANE_API_URL || CONTROL_PLANE_URL;

// FAILURE / PARTIAL-PROVISION MODEL (read before adding auto-rollback):
// Provisioning is forward-recovery, not transactional. Steps run sequentially
// (tenant -> content -> invite -> Vercel project -> env -> domain); each is
// reported in the returned `steps[]` with ok/failed/skipped. On a mid-flow
// failure earlier steps persist by design — re-running provisionTenant is
// IDEMPOTENT (existing tenant/env/domain are treated as success), so the
// operator recovers by fixing the cause and re-running, not by rolling back.
// Auto-rollback is deliberately NOT done here: deleting a Vercel project / tenant
// on any transient error is far more dangerous (it can destroy a live client's
// resources) than leaving a resumable partial. To MANUALLY tear down a failed
// test tenant, run `scripts/deprovision-tenant.ts <id>` (purges Postgres + Redis
// and, unless --keep-vercel, the Vercel project) — the returned steps[] say
// exactly what was created.
export async function provisionTenant(input: ProvisionInput): Promise<ProvisionResult> {
  const steps: ProvisionStep[] = [];
  const subdomain = input.subdomain.trim();
  const productionDomain = input.productionDomain?.trim() || undefined;
  const adminDomain =
    input.adminDomain?.trim() || (productionDomain ? `admin.${productionDomain}` : undefined);
  const siteUrl = productionDomain
    ? `https://${productionDomain}`
    : `https://${subdomain}.strelva.com`;
  const revalidateUrl = `${siteUrl}/api/v1/revalidate`;
  let tenantId = subdomain;
  let tenantWasCreated = false;
  let revalidationSecret: string | undefined;

  const baseClientEnv: Record<string, string> = {
    TENANT_ID: subdomain,
    SCAFFOLD_API_URL: CONTROL_PLANE_API,
    NEXT_PUBLIC_SCAFFOLD_API_URL: CONTROL_PLANE_API,
    NEXT_PUBLIC_TENANT_ID: subdomain,
    NEXT_PUBLIC_SITE_NAME: input.siteName,
    NEXT_PUBLIC_SITE_URL: siteUrl,
    OWNER_EMAIL: input.ownerEmail || "",
  };
  // Do not manufacture a client secret before we know whether this is a new
  // tenant or a resume. An existing tenant's decrypted persisted secret is the
  // only value a retry may use.
  let clientEnv: Record<string, string> = baseClientEnv;

  // 1. Tenant record — the hard prerequisite. Bail if it fails.
  try {
    // Generate a high-entropy secret only for a genuinely new tenant. A retry
    // must reuse the value already persisted through the tenant encryption
    // boundary; creating a replacement here would make the storefront and
    // control plane disagree about signed revalidation.
    const generatedRevalidationSecret = randomBytes(32).toString("hex");
    const tenant = await createTenant({
      subdomain,
      siteName: input.siteName,
      ownerName: input.ownerName,
      ownerEmail: input.ownerEmail || undefined,
      industry: input.industry,
      template: input.template || input.industry,
      deliveryModel: "custom_repo",
      productionDomain,
      adminDomain,
      siteUrl,
      revalidateUrl,
      revalidationSecret: generatedRevalidationSecret,
      // Billing — set at provision time so the tenant is never born with "No plan set"
      // when the operator already knows how this client is billed.
      billingType: input.billingType,
      subscriptionPlan: input.subscriptionPlan,
      planMonthlyCents: input.planMonthlyCents,
      customRepo: {
        repoName: subdomain,
        contractVersion: CUSTOM_REPO_CONTRACT_VERSION,
        revalidationHealth: "unknown",
        // Auto-wire the connect-back so a new tenant needs no manual step: the
        // starter serves /api/capabilities, so point the manifest at it now. It
        // fails-soft to the base manifest until the site is live, then reflects
        // the repo's real capabilities (so a custom-repo storefront reads as a
        // store instead of getting "enable e-commerce" nudges).
        productionUrl: siteUrl,
        capabilityManifestUrl: `${siteUrl}/api/capabilities`,
      },
      branding: { initials: initials(input.siteName) },
    });
    tenantId = tenant.id;
    tenantWasCreated = true;
    revalidationSecret = tenant.revalidationSecret ?? generatedRevalidationSecret;
    clientEnv = { ...baseClientEnv, REVALIDATION_SECRET: revalidationSecret };
    steps.push({
      key: "tenant",
      label: "Create tenant record",
      status: "ok",
      detail: `Revalidation secret generated · ${siteUrl}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    // Resume-safe: if the tenant record already exists (a prior run that failed
    // AFTER creating the record but before finishing Vercel/domain/assign),
    // continue with the remaining steps instead of bailing — otherwise a
    // half-provisioned tenant can never be completed by re-running provision.
    const existing = /already exists/i.test(msg)
      ? await getTenantConfig(subdomain).catch(() => null)
      : null;
    if (existing) {
      tenantId = existing.id;
      revalidationSecret = existing.revalidationSecret;
      if (revalidationSecret) {
        clientEnv = { ...baseClientEnv, REVALIDATION_SECRET: revalidationSecret };
      }
      steps.push({
        key: "tenant",
        label: "Create tenant record",
        status: revalidationSecret ? "skipped" : "failed",
        detail: revalidationSecret
          ? "Tenant already exists — reused its persisted revalidation secret"
          : "Tenant already exists, but its persisted revalidation secret is unavailable; refusing to rotate it",
      });
    } else {
      steps.push({
        key: "tenant",
        label: "Create tenant record",
        status: "failed",
        detail: msg,
      });
      return { tenantId, siteUrl, steps, manualNext: [], clientEnv };
    }
  }

  // 2. Seed an editable content baseline so the dashboard starts from real
  //    documents (versions/edits/AI agent all work from a known base) instead
  //    of read-time fallback defaults.
  const SEED_SECTIONS: ContentSection[] = [
    "hero", "services", "story", "testimonials", "events",
    "providers", "contact", "settings", "faq",
  ];
  // Seed baseline = the shared defaults, but with the few wellness-flavored
  // placeholder strings neutralized so a non-wellness client (HVAC, legal,
  // restaurant) doesn't open their dashboard to yoga copy. The rest of the
  // defaults are already industry-agnostic ("What We Offer", "Your story goes
  // here"). Real per-vertical seed content is a separate content effort.
  const seedDefaults: ContentMap = {
    ...defaults,
    hero: { ...defaults.hero, headline: "Your headline\ngoes here.", ctaText: "Get in touch" },
    providers: { ...defaults.providers, description: "People and partners you trust and recommend." },
    // Bake the presence/businessModel into the seeded settings so the dashboard's
    // "Tell us how customers find you" first-run checklist is pre-answered and the
    // correct surfaces show (Google Business + Reviews for local, skipped for online).
    settings: {
      ...defaults.settings,
      ...(input.presence ? { businessModel: input.presence } : {}),
    },
  };
  // New tenants need the complete baseline. A retry must inspect the storage
  // source first: getContent intentionally resolves defaults, so using it here
  // would mistake an absent section for a saved customer edit. Only write a
  // section when storage confirms it is absent.
  let seeded = 0;
  let preserved = 0;
  const seedFailures: string[] = [];
  let sectionsToSeed: ContentSection[] = SEED_SECTIONS;
  if (!tenantWasCreated) {
    // Preflight every section before writing any of them. If the source is
    // unavailable, a null-like result must never let a later iteration write
    // defaults into a customer tenant.
    sectionsToSeed = [];
    for (const section of SEED_SECTIONS) {
      try {
        const stored = await getStoredContent(section, tenantId);
        if (stored !== null) {
          preserved++;
        } else {
          sectionsToSeed.push(section);
        }
      } catch (err) {
        seedFailures.push(`${section} (${err instanceof Error ? err.message : String(err)})`);
      }
    }
  }
  if (seedFailures.length === 0) {
    for (const section of sectionsToSeed) {
      try {
        await setContent(section, seedDefaults[section], tenantId);
        seeded++;
      } catch (err) {
        seedFailures.push(`${section} (${err instanceof Error ? err.message : String(err)})`);
      }
    }
  }
  const allSeeded = seedFailures.length === 0;
  steps.push({
    key: "seed",
    label: "Seed starter content",
    // Flag any shortfall as failed so it isn't silently "3/9 looks fine" — the
    // unseeded sections fall back to read-time defaults and have no edit base.
    status: allSeeded ? "ok" : "failed",
    detail: allSeeded
      ? tenantWasCreated
        ? `${seeded}/${SEED_SECTIONS.length} sections`
        : `${seeded} missing sections seeded · ${preserved} existing sections preserved`
      : `${seeded} seeded · ${preserved} existing preserved — failed: ${seedFailures.join(", ")}. Re-run provision to retry missing sections.`,
  });

  // 2b. Analytics config — persist the siteUrl-derived GSC property (and leave a
  //     GA4 field ready to fill) so the reporting service account read works with
  //     NO manual admin step. getAnalyticsConfig already DERIVES this default at
  //     read time; we persist it explicitly here so a newly provisioned tenant
  //     has a concrete, stored config from day one (the "we host, so analytics
  //     sets itself up" promise). Best-effort + fail-soft: setAnalyticsConfig
  //     degrades to defaults without Redis and never throws, but we still guard
  //     so a config-store hiccup can't abort onboarding.
  const gscProperty = deriveScDomain(siteUrl);
  try {
    await setAnalyticsConfig(tenantId, { gscProperty, ga4PropertyId: null });
    steps.push({
      key: "analytics",
      label: "Configure analytics reads",
      status: "ok",
      detail: gscProperty
        ? `GSC property ${gscProperty} persisted · GA4 property ready to fill`
        : "GA4 property ready to fill (no GSC property derivable from siteUrl)",
    });
  } catch (err) {
    // Non-fatal: reads fall back to the derived default even if the write failed.
    steps.push({
      key: "analytics",
      label: "Configure analytics reads",
      status: "failed",
      detail: err instanceof Error ? err.message : "Unknown error",
    });
  }

  // 3. Owner invite (createTenant already assigns if they already have an account).
  if (input.ownerEmail) {
    try {
      await createInvite(input.ownerEmail, tenantId, "operator-onboard", "owner");
      steps.push({
        key: "invite",
        label: "Create owner invite",
        status: "ok",
        detail: input.ownerEmail,
      });
    } catch (err) {
      steps.push({
        key: "invite",
        label: "Create owner invite",
        status: "failed",
        detail: err instanceof Error ? err.message : "Unknown error",
      });
    }
  } else {
    steps.push({ key: "invite", label: "Create owner invite", status: "skipped", detail: "No owner email" });
  }

  // 4. Vercel project.
  let projectId: string | null = null;
  const projectName = `${tenantId}-site`;
  if (!isVercelConfigured()) {
    steps.push({
      key: "vercel_project",
      label: "Create Vercel project",
      status: "skipped",
      detail: "VERCEL_API_TOKEN not set",
    });
  } else {
    const r = await createVercelProject(projectName);
    if (r.ok) {
      projectId = r.data.id;
      steps.push({ key: "vercel_project", label: "Create Vercel project", status: "ok", detail: r.data.name });
    } else {
      // A prior run may have created the project before losing its response.
      // Resolve the exact project identity before continuing; an existence
      // error alone is not enough to safely configure env or domains.
      const recovered = await getVercelProject(projectName);
      if (recovered.ok) {
        projectId = recovered.data.id;
        steps.push({
          key: "vercel_project",
          label: "Create Vercel project",
          status: "ok",
          detail: `Recovered existing project ${recovered.data.name} (${recovered.data.id})`,
        });
      } else {
        steps.push({
          key: "vercel_project",
          label: "Create Vercel project",
          status: "failed",
          detail: `${r.error}; project identity recovery failed: ${recovered.error}`,
        });
      }
    }
  }

  // 5. Vercel env (needs the project).
  if (!revalidationSecret) {
    steps.push({
      key: "vercel_env",
      label: "Set Vercel env vars",
      status: "failed",
      detail: "Persisted revalidation secret unavailable; refusing to configure a mismatched secret",
    });
  } else if (projectId) {
    const r = await setVercelEnv(projectId, clientEnv);
    steps.push(
      r.ok
        ? { key: "vercel_env", label: "Set Vercel env vars", status: "ok", detail: `${r.data.set.length} vars set` }
        : { key: "vercel_env", label: "Set Vercel env vars", status: "failed", detail: r.error }
    );
  } else {
    steps.push({ key: "vercel_env", label: "Set Vercel env vars", status: "skipped", detail: "No Vercel project" });
  }

  // 6. Vercel domain (needs the project + a production domain).
  if (projectId && productionDomain) {
    const r = await addVercelDomain(projectId, productionDomain);
    steps.push(
      r.ok
        ? { key: "vercel_domain", label: "Attach production domain", status: "ok", detail: productionDomain }
        : { key: "vercel_domain", label: "Attach production domain", status: "failed", detail: r.error }
    );
  } else {
    steps.push({
      key: "vercel_domain",
      label: "Attach production domain",
      status: "skipped",
      detail: productionDomain ? "No Vercel project" : "No production domain (uses subdomain)",
    });
  }

  const manualNext = [
    ...(!revalidationSecret
      ? [
          "CRITICAL:revalidation-secret|Restore the tenant's persisted revalidation secret|Provisioning will not rotate or guess this credential during recovery.",
        ]
      : []),
    // Phase: deploy — DNS + repo connect
    productionDomain
      ? `DEPLOY:dns|Point ${productionDomain} at Vercel|A 76.76.21.21 (root) or CNAME cname.vercel-dns.com (www). Verify in the Vercel dashboard.`
      : `DEPLOY:dns|Subdomain routes automatically|${subdomain}.strelva.com is live once the control plane is up — no DNS step needed.`,
    `DEPLOY:repo|Connect the repo to Vercel|Link the hand-built ${tenantId} repo to the "${tenantId}-site" project (git integration), then trigger a deploy.`,
    // Phase: tracking & analytics — beacon (load-bearing) + GSC/GA4 grants
    // The whole "proof it's working" value prop (dashboard stats + weekly report
    // lead number) is downstream of this ONE signal. No beacon = dashboard reads 0
    // forever. Verify before handing over.
    `CRITICAL:beacon|Confirm the tracking beacon fires|Load the live site, then check /admin/clients/${tenantId} shows a page-view. The repo must include ScaffoldTracker with NEXT_PUBLIC_SCAFFOLD_API_URL + NEXT_PUBLIC_TENANT_ID set.`,
    // Search Console read access is a one-time manual grant — no safe public API
    // to add another account as a user.
    `ANALYTICS:gsc|Grant Search Console access|In the ${gscProperty ?? "client's"} GSC property → Settings → Users and permissions, add strelva-reporting@strelva.iam.gserviceaccount.com as a Full/Restricted user (one-time).`,
    `ANALYTICS:ga4|Connect GA4 (optional)|Paste the Measurement ID + property ID in /admin/clients/${tenantId} → Analytics config.`,
    // Phase: launch — content + owner invite
    `LAUNCH:content|Customize the seeded content|Update headline, services, story, and contact details via the dashboard or AI agent.`,
    input.ownerEmail
      ? `LAUNCH:invite|Send the owner invite|Fire the invite email from /admin/clients/${tenantId} when the site is ready to hand over.`
      : `LAUNCH:invite|Add owner email + send invite|No email was set at provision — add it in /admin/clients/${tenantId} before sending the invite.`,
  ];

  return { tenantId, siteUrl, steps, manualNext, clientEnv };
}

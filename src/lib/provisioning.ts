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
import { setContent } from "./storage";
import { setAnalyticsConfig, deriveScDomain } from "./analytics";
import { defaults } from "./defaults";
import { CUSTOM_REPO_CONTRACT_VERSION } from "./custom-repos";
import type { ContentSection, ContentMap } from "./types";
import {
  createVercelProject,
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
// The literal default stays scaffoldweb.com on purpose: it is the operational wire-level
// endpoint that already-deployed legacy client repos expect, and it keeps working until
// scaffoldweb is decommissioned (post-soak). Wire-level REB_*/SCAFFOLD env *names* stay
// frozen; only the value moves, via the env var above. Do NOT change this default literal.
const CONTROL_PLANE_API =
  process.env.CONTROL_PLANE_API_URL || "https://scaffoldweb.com";

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
// test tenant: deactivate it in Sanity (active:false) and, if a Vercel project
// was created, remove it via the Vercel dashboard/CLI — the returned steps[]
// say exactly what was created.
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
  // Generate a high-entropy secret for signed revalidation requests from the custom repo.
  // Rotate this secret if a client repo key material is suspected compromised; see
  // `src/lib/scaffold-contracts.ts` for the verification/signing contract.
  const revalidationSecret = randomBytes(32).toString("hex");

  let tenantId = subdomain;

  // The env the client repo (and its Vercel project) needs. Computed up front so
  // it's returned even if a later step fails — the secret is the load-bearing
  // value Jacob pastes into the hand-built repo.
  const clientEnv: Record<string, string> = {
    TENANT_ID: subdomain,
    SCAFFOLD_API_URL: CONTROL_PLANE_API,
    NEXT_PUBLIC_SCAFFOLD_API_URL: CONTROL_PLANE_API,
    NEXT_PUBLIC_TENANT_ID: subdomain,
    REVALIDATION_SECRET: revalidationSecret,
    NEXT_PUBLIC_SITE_NAME: input.siteName,
    NEXT_PUBLIC_SITE_URL: siteUrl,
    OWNER_EMAIL: input.ownerEmail || "",
  };

  // 1. Tenant record — the hard prerequisite. Bail if it fails.
  try {
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
      revalidationSecret,
      customRepo: {
        repoName: subdomain,
        contractVersion: CUSTOM_REPO_CONTRACT_VERSION,
        revalidationHealth: "unknown",
      },
      branding: { initials: initials(input.siteName) },
    });
    tenantId = tenant.id;
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
      steps.push({
        key: "tenant",
        label: "Create tenant record",
        status: "skipped",
        detail: "Tenant already exists — resuming the remaining steps",
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
  };
  // setContent is an idempotent upsert, so re-running provision to recover a
  // partial seed is safe (it overwrites, never duplicates). We capture the
  // reason for each failed section so the operator sees WHY, not just a count.
  let seeded = 0;
  const seedFailures: string[] = [];
  for (const section of SEED_SECTIONS) {
    try {
      await setContent(section, seedDefaults[section], tenantId);
      seeded++;
    } catch (err) {
      seedFailures.push(`${section} (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  const allSeeded = seeded === SEED_SECTIONS.length;
  steps.push({
    key: "seed",
    label: "Seed starter content",
    // Flag any shortfall as failed so it isn't silently "3/9 looks fine" — the
    // unseeded sections fall back to read-time defaults and have no edit base.
    status: allSeeded ? "ok" : "failed",
    detail: allSeeded
      ? `${seeded}/${SEED_SECTIONS.length} sections`
      : `${seeded}/${SEED_SECTIONS.length} sections — failed: ${seedFailures.join(", ")}. Re-run provision to retry (safe; overwrites).`,
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
  if (!isVercelConfigured()) {
    steps.push({
      key: "vercel_project",
      label: "Create Vercel project",
      status: "skipped",
      detail: "VERCEL_API_TOKEN not set",
    });
  } else {
    const r = await createVercelProject(`${tenantId}-site`);
    if (r.ok) {
      projectId = r.data.id;
      steps.push({ key: "vercel_project", label: "Create Vercel project", status: "ok", detail: r.data.name });
    } else {
      steps.push({ key: "vercel_project", label: "Create Vercel project", status: "failed", detail: r.error });
    }
  }

  // 5. Vercel env (needs the project).
  if (projectId) {
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
    productionDomain
      ? `Point ${productionDomain} DNS at Vercel (A 76.76.21.21, or CNAME cname.vercel-dns.com) and verify`
      : `${subdomain}.strelva.com routes automatically once the control plane is live`,
    `Connect the hand-built ${tenantId} repo to the "${tenantId}-site" Vercel project (git integration) and deploy`,
    // The whole "proof it's working" value prop (dashboard stats + the weekly
    // report's lead number) is downstream of this ONE signal. If the repo ships
    // without ScaffoldTracker, the dashboard reads 0 forever and the weekly
    // email says "no visits" every week — the client pays and the product looks
    // dead, with no alert. Verify it BEFORE handing over the dashboard.
    `CRITICAL: confirm the tracking beacon fires — load the live ${tenantId} site, then check /admin/tenants/${tenantId} shows a page-view (the repo must include ScaffoldTracker with NEXT_PUBLIC_SCAFFOLD_API_URL + NEXT_PUBLIC_TENANT_ID set)`,
    // Search Console read access is a one-time manual grant on purpose — there is
    // no safe public API to add another account as a *user* (auto-verification
    // could mis-verify a property). Since we host, this is a single click.
    `Grant Search Console reads: in the ${gscProperty ?? "client's"} property → Settings → Users and permissions, add strelva-reporting@strelva.iam.gserviceaccount.com as a Full/Restricted user (one-time; GA4: paste the Measurement ID + property id in /admin/tenants/${tenantId})`,
    `Customize the seeded starter content in the dashboard or via the AI agent`,
    input.ownerEmail
      ? `Send the owner invite email from /admin/tenants/${tenantId}`
      : `Add an owner email + invite from /admin/tenants/${tenantId}`,
  ];

  return { tenantId, siteUrl, steps, manualNext, clientEnv };
}

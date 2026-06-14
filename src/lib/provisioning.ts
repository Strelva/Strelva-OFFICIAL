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
import { createTenant } from "./tenants";
import { createInvite } from "./invites";
import { setContent } from "./storage";
import { defaults } from "./defaults";
import { CUSTOM_REPO_CONTRACT_VERSION } from "./custom-repos";
import type { ContentSection } from "./types";
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

// The control-plane host the client repo pulls /api/v1/* from. Verified live:
// the control plane serves on scaffoldweb.com (strelva.com is now the marketing
// site and does NOT serve the v1 contract). Flips to app.strelva.com at the
// cutover (T004) — env-driven so that flip needs no code change. Wire-level
// REB_*/SCAFFOLD env *names* stay frozen; only this value moves.
// NOTE: scripts/provision-tenant.ts still prints the stale strelva.com value.
const CONTROL_PLANE_API =
  process.env.CONTROL_PLANE_API_URL || "https://scaffoldweb.com";

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
    steps.push({
      key: "tenant",
      label: "Create tenant record",
      status: "failed",
      detail: err instanceof Error ? err.message : "Unknown error",
    });
    return { tenantId, siteUrl, steps, manualNext: [], clientEnv };
  }

  // 2. Seed an editable content baseline so the dashboard starts from real
  //    documents (versions/edits/AI agent all work from a known base) instead
  //    of read-time fallback defaults.
  const SEED_SECTIONS: ContentSection[] = [
    "hero", "services", "story", "testimonials", "events",
    "providers", "contact", "settings", "faq",
  ];
  let seeded = 0;
  for (const section of SEED_SECTIONS) {
    try {
      await setContent(section, defaults[section], tenantId);
      seeded++;
    } catch {
      // best-effort; a failed section just falls back to read-time defaults
    }
  }
  steps.push({
    key: "seed",
    label: "Seed starter content",
    status: seeded > 0 ? "ok" : "failed",
    detail: `${seeded}/${SEED_SECTIONS.length} sections`,
  });

  // 3. Owner invite (createTenant already assigns if they exist in Clerk).
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
    `Customize the seeded starter content in the dashboard or via the AI agent`,
    input.ownerEmail
      ? `Send the owner invite email from /admin/tenants/${tenantId}`
      : `Add an owner email + invite from /admin/tenants/${tenantId}`,
  ];

  return { tenantId, siteUrl, steps, manualNext, clientEnv };
}

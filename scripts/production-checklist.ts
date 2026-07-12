#!/usr/bin/env npx tsx
/**
 * Production Readiness Checklist for Strelva
 *
 * Run with: npx tsx scripts/production-checklist.ts
 *
 * Validates all external dependencies, env vars, and webhook configurations.
 */

import { Redis } from "@upstash/redis";
import Stripe from "stripe";
import { execFileSync } from "node:child_process";
import { resolve4, resolveCname, resolveNs } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import {
  getLaunchBlockerError,
  getTenantLaunchReadinessResults,
  validateProductionEnvValue,
  type ReadinessStatus,
} from "../src/lib/production-readiness-rules";
import { DEFAULT_MARKETING_HOSTS, parseMarketingDomains } from "../src/lib/marketing-hosts";
import { getAllTenants } from "../src/lib/tenants";

for (const path of [".env.production.local", ".env.local", ".env"]) {
  if (!existsSync(path)) continue;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (process.env[key]) continue;
    process.env[key] = valueParts.join("=").replace(/^['"]|['"]$/g, "");
  }
}

interface CheckResult {
  name: string;
  status: ReadinessStatus;
  message: string;
}

const results: CheckResult[] = [];
const failedEnvVars = new Set<string>();
const warnedEnvVars = new Set<string>();

const locallyGeneratedSecrets = new Set([
  "CRON_SECRET",
  "INTERNAL_API_SECRET",
  "OAUTH_STATE_SECRET",
  "SCAFFOLD_CUSTOM_REQUEST_SECRET",
  "REB_CUSTOM_REQUEST_SECRET",
]);

const scaffoldWebDomainAction =
  "Point strelva.com at Vercel project scaffold-web with A strelva.com 76.76.21.21 or Vercel nameservers, and remove Porkbun/l.ink forwarding.";
const VERCEL_APP_URL = "https://strelva.com";
const EXPECTED_SIGN_IN_TITLE = "Dashboard access | Strelva";
// Billing price is intentionally undecided: client sites are free for now and
// the admin-side price has not been set. If STRIPE_SCAFFOLD_PRICE_ID is
// configured, we validate the *shape* (recurring monthly USD), not a specific
// amount. Re-pin a specific cents amount here when pricing is committed.
const SCAFFOLD_MONTHLY_PRICE_CURRENCY = "usd";

const envSourceHints: Record<string, string> = {
  CALENDLY_CLIENT_ID: "Calendly OAuth app client ID",
  CALENDLY_CLIENT_SECRET: "Calendly OAuth app client secret",
  CALENDLY_WEBHOOK_SECRET: "Calendly webhook signing secret",
  GOOGLE_GENERATIVE_AI_API_KEY: "Google AI Studio production API key",
  GOOGLE_CLIENT_ID: "Google Cloud OAuth client ID",
  GOOGLE_CLIENT_SECRET: "Google Cloud OAuth client secret",
  INSTAGRAM_CLIENT_ID: "Meta app Instagram OAuth client ID",
  INSTAGRAM_CLIENT_SECRET: "Meta app Instagram OAuth client secret",
  NEXT_PUBLIC_APP_URL: "https://strelva.com or the deployed control-plane URL used for OAuth callbacks",
  NEXT_PUBLIC_SITE_URL: "https://strelva.com",
  NEXT_PUBLIC_SUPABASE_URL: "Supabase project URL (Project Settings → API)",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "Supabase anon/publishable key (Project Settings → API)",
  SUPABASE_SERVICE_ROLE_KEY: "Supabase service-role key (Project Settings → API) — server-only, bypasses RLS",
  SCAFFOLD_CUSTOM_REQUEST_SECRET: "Shared high-entropy bearer secret for custom storefront /api/reb-custom-request endpoints. Canonical name; the agent route falls back to REB_CUSTOM_REQUEST_SECRET if this is unset.",
  REB_CUSTOM_REQUEST_SECRET: "Legacy alias for SCAFFOLD_CUSTOM_REQUEST_SECRET. Kept readable so deployed custom repos that still set the REB_ name keep working.",
  RESEND_API_KEY: "Resend production API key",
  RESEND_DOMAIN: "Verified Resend sending domain",
  SENTRY_DSN: "Sentry project DSN",
  NEXT_PUBLIC_SENTRY_DSN: "Sentry browser/client DSN",
  STRIPE_SCAFFOLD_PRICE_ID: "Optional. Stripe live recurring monthly USD price id when admin-side billing is turned on. Leave unset while client sites are free.",
  STRIPE_SECRET_KEY: "Stripe live secret key",
  STRIPE_WEBHOOK_SECRET: "Stripe billing webhook signing secret",
  SUPER_ADMIN_EMAILS: "Comma-separated owner/admin email addresses",
  UPSTASH_REDIS_REST_TOKEN: "Upstash Redis REST token",
  UPSTASH_REDIS_REST_URL: "Upstash Redis REST URL",
};

function log(result: CheckResult) {
  const icons = { ok: "✓", warn: "⚠", fail: "✗", skip: "○" };
  const colors = { ok: "\x1b[32m", warn: "\x1b[33m", fail: "\x1b[31m", skip: "\x1b[90m" };
  console.log(`${colors[result.status]}${icons[result.status]}\x1b[0m ${result.name}: ${result.message}`);
  results.push(result);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENV VAR CHECKS
// ─────────────────────────────────────────────────────────────────────────────

function checkEnvVar(name: string, required: boolean, secret = true): boolean {
  const value = process.env[name];
  if (!value) {
    log({
      name: `ENV: ${name}`,
      status: required ? "fail" : "skip",
      message: required ? "Not set (REQUIRED)" : "Not set (optional)",
    });
    if (required) failedEnvVars.add(name);
    return false;
  }
  const validationError = validateProductionEnvValue(name, value);
  if (validationError) {
    log({ name: `ENV: ${name}`, status: required ? "fail" : "warn", message: validationError });
    if (required) failedEnvVars.add(name);
    else warnedEnvVars.add(name);
    return false;
  }
  const display = secret ? `${value.slice(0, 8)}...` : value;
  log({ name: `ENV: ${name}`, status: "ok", message: `Set (${display})` });
  return true;
}

function checkRequiredWhen(condition: boolean, name: string, reason: string, secret = true): boolean {
  if (!condition) return false;
  const ok = checkEnvVar(name, true, secret);
  if (!ok && process.env[name]) {
    return false;
  }
  if (ok) {
    log({ name: `Dependency: ${name}`, status: "ok", message: reason });
  }
  return ok;
}

function checkOptionalPair(idName: string, secretName: string, label: string): boolean {
  const hasId = checkEnvVar(idName, false, false);
  const hasSecret = checkEnvVar(secretName, false);
  const partiallyConfigured = Boolean(process.env[idName]) !== Boolean(process.env[secretName]);

  if (partiallyConfigured) {
    if (!process.env[idName]) failedEnvVars.add(idName);
    if (!process.env[secretName]) failedEnvVars.add(secretName);
    log({
      name: `${label} OAuth pair`,
      status: "fail",
      message: `${idName} and ${secretName} must either both be set or both be omitted`,
    });
  }

  return hasId && hasSecret && !partiallyConfigured;
}

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  Strelva Production Readiness Checklist");
console.log("═══════════════════════════════════════════════════════════════\n");

console.log("─── Core Auth (Supabase) ────────────────────────────────────────");
checkEnvVar("NEXT_PUBLIC_SUPABASE_URL", true);
// Supabase renamed the anon key to "publishable"; the app reads either name.
{
  const hasPublicKey = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  log({
    name: "ENV: NEXT_PUBLIC_SUPABASE_ANON_KEY (or PUBLISHABLE)",
    status: hasPublicKey ? "ok" : "fail",
    message: hasPublicKey ? "Set." : "Missing — set the Supabase anon/publishable key.",
  });
}
checkEnvVar("SUPABASE_SERVICE_ROLE_KEY", true);
checkEnvVar("SUPER_ADMIN_EMAILS", true, false);

// Dev-access bypass must never be enabled on a deployed environment: when
// REB_DEV_UNGATED_ACCESS=1 (and NODE_ENV!=="production"), isSuperAdmin /
// verifyAuth / hasTenantAccess all return true — a fully ungated preview deploy.
{
  const devBypass =
    process.env.SCAFFOLD_DEV_UNGATED_ACCESS ?? process.env.REB_DEV_UNGATED_ACCESS;
  const enabled = Boolean(devBypass) && devBypass !== "0";
  log({
    name: "ENV: SCAFFOLD_DEV_UNGATED_ACCESS (or legacy REB_DEV_UNGATED_ACCESS)",
    status: enabled ? "fail" : "ok",
    message: enabled
      ? `Set to "${devBypass}" — this ungates auth and super-admin. It MUST be unset (or 0) on every preview/production deploy.`
      : "Not set — auth is enforced.",
  });
}

console.log("\n─── Launch Governance ───────────────────────────────────────────");
function checkFileContains(path: string, name: string, requiredTerms: string[]) {
  if (!existsSync(path)) {
    log({ name, status: "fail", message: `${path} is missing` });
    return;
  }

  const content = readFileSync(path, "utf8").toLowerCase();
  const missing = requiredTerms.filter((term) => !content.includes(term.toLowerCase()));
  if (missing.length) {
    log({ name, status: "warn", message: `Missing guidance for: ${missing.join(", ")}` });
    return;
  }

  log({ name, status: "ok", message: `${path} covers required launch guidance` });
}

checkFileContains("docs/design-kit.md", "Design kit", [
  "WCAG 2.2 AA",
  "Core Web Vitals",
  "AI Surfaces",
  "Template Expansion Rules",
]);
checkFileContains("docs/domain-setup.md", "Domain setup doc", [
  "scaffold-web",
  "A     strelva.com    76.76.21.21",
  "cname.vercel-dns.com",
  "MARKETING_DOMAINS=strelva.com,www.strelva.com",
  "scaffoldweb-com.l.ink",
  "pnpm check:prod",
]);
checkFileContains("docs/production-readiness.md", "Production readiness doc", [
  "Tenant Deployment Checklist",
  "Incident And Rollback Runbook",
  "Content Schema Rollback Plan",
  "pnpm check:release",
  "Waived Blockers",
  "Status: waived",
  "Customer Access Handoff",
  "/api/admin/invites",
  "exact invited email",
  "vercel deploy --prod",
  "git status --short",
  "dirty local working tree",
  "PLAYWRIGHT_BASE_URL=https://strelva.com",
  "https://strelva.com/api/health",
  "curl -i https://strelva.com/api/cron/maintenance",
  "root marketing hosts",
  "/account",
  "Use invited email",
  "signed-out `/dashboard` and `/no-access` redirect to `/sign-in`",
  "admin.greatlakesdriedfruit.com",
]);
checkFileContains(".env.production.example", "Production env template", [
  "pk_live_",
  "sk_live_",
  "whsec_",
  "NEXT_PUBLIC_SITE_URL",
  "CRON_SECRET",
]);

function checkReleaseManifestEnv(manifestPath: string, checklistPath: string, readinessPath: string) {
  const missingFiles = [manifestPath, checklistPath, readinessPath].filter((path) => !existsSync(path));
  if (missingFiles.length) {
    log({ name: "Release manifest env", status: "fail", message: `${missingFiles.join(", ")} missing` });
    return;
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      requiredEnv?: unknown;
    };
    const requiredEnv = Array.isArray(manifest.requiredEnv)
      ? manifest.requiredEnv.filter((name): name is string => typeof name === "string")
      : [];
    const checklist = readFileSync(checklistPath, "utf8");
    const productionReadiness = readFileSync(readinessPath, "utf8");
    const checkedRequiredEnv = new Set(
      [...checklist.matchAll(/checkEnvVar\("([^"]+)", true/g)].map((match) => match[1]),
    );
    const missing = requiredEnv.filter((name) => {
      const checkedByControlPlane = checkedRequiredEnv.has(name);
      const documentedAsStorefrontEnv =
        productionReadiness.includes(`storefront \`${name}\``) ||
        productionReadiness.includes(`client site ${name}`);
      return !checkedByControlPlane && !documentedAsStorefrontEnv;
    });

    if (!requiredEnv.length || missing.length) {
      log({
        name: "Release manifest env",
        status: "fail",
        message: `${manifestPath} requiredEnv entries must be enforced by check:prod or documented as storefront-owned: ${missing.join(", ") || "none found"}`,
      });
      return;
    }

    log({
      name: "Release manifest env",
      status: "ok",
      message: `${manifestPath} requiredEnv entries are covered by check:prod or storefront handoff docs`,
    });
  } catch (err) {
    log({
      name: "Release manifest env",
      status: "fail",
      message: `Could not parse ${manifestPath}: ${(err as Error).message}`,
    });
  }
}

checkReleaseManifestEnv("release-manifest.json", "scripts/production-checklist.ts", "docs/production-readiness.md");

function checkLaunchBlockers(path: string) {
  if (!existsSync(path)) {
    log({ name: "Launch blockers", status: "fail", message: `${path} is missing` });
    return;
  }

  const content = readFileSync(path, "utf8");
  const blockerError = getLaunchBlockerError(content, path);
  if (blockerError) {
    log({
      name: "Launch blockers",
      status: "fail",
      message: blockerError,
    });
    return;
  }

  log({ name: "Launch blockers", status: "ok", message: `${path} has no unresolved blockers` });
}

checkLaunchBlockers("docs/launch-blockers.md");

function checkLaunchBlockerActionability(path: string) {
  if (!existsSync(path)) {
    log({ name: "Launch blocker actionability", status: "fail", message: `${path} is missing` });
    return;
  }

  const content = readFileSync(path, "utf8");
  const requiredTerms = [
    "Required owner action",
    "Minimum production values to confirm in Vercel",
    "Copyable Vercel env commands",
    "vercel env add CLERK_WEBHOOK_SECRET production",
    "vercel env add UPSTASH_REDIS_REST_URL production",
    "vercel env add UPSTASH_REDIS_REST_TOKEN production",
    "vercel env add SENTRY_DSN production",
    "vercel env add NEXT_PUBLIC_SENTRY_DSN production",
    "Provider value sources",
    "Clerk Dashboard -> Webhooks",
    "Upstash Redis database -> REST API section",
    "Sentry project settings -> Client Keys / DSN",
    "Stripe live-mode Products",
    "vercel env add NEXT_PUBLIC_APP_URL production",
    "Do not overwrite the values already passing the checker",
    "openssl rand -hex 32",
    "vercel env pull .env.production.local --environment=production",
    "pnpm check:prod",
    "vercel deploy --prod",
    "git status --short",
    "dirty local working tree",
    "PLAYWRIGHT_BASE_URL=https://strelva.com",
    "signed-out dashboard customers",
    "https://strelva.com/sign-in",
    "Sign in to Strelva | Strelva",
    "Production Live Verification",
    "PLAYWRIGHT_BASE_URL=https://strelva.com",
    "https://strelva.com/api/cron/maintenance",
    "https://strelva.com/api/health",
    "Clerk/Stripe webhook deliveries",
    "curl -i https://strelva.com/api/cron/maintenance",
    'curl -i -H "Authorization: Bearer $CRON_SECRET" https://strelva.com/api/cron/maintenance',
    "cron 401",
    "Status: waived",
    "Owner:",
    "Release note:",
    "Follow-up:",
    "Reason:",
  ];
  const missing = requiredTerms.filter((term) => !content.includes(term));

  if (missing.length) {
    log({
      name: "Launch blocker actionability",
      status: "fail",
      message: `${path} must include owner actions, env pull/recheck steps, generated-secret guidance, production live-verification steps, and a waiver template`,
    });
    return;
  }

  log({ name: "Launch blocker actionability", status: "ok", message: `${path} has owner-ready blocker actions` });
}

checkLaunchBlockerActionability("docs/launch-blockers.md");

// Note: the self-referential `checkCompletionAudit` (a 62KB markdown file
// that the checker parsed for stringly-typed evidence of its own assertions)
// was removed alongside docs/completion-audit.md. Launch evidence lives in
// the live check:prod output, not in a doc that paraphrases the checker.

function checkReleaseWorkflow(path: string) {
  if (!existsSync(path)) {
    log({ name: "Release workflow", status: "fail", message: `${path} is missing` });
    return;
  }

  const content = readFileSync(path, "utf8");
  const requiredTerms = [
    "launch_gate",
    "check-release-passed",
    "owner-waived-blockers",
    "release_note_ref",
    "release_note_ref must be a real release note, PR, or ticket reference",
    "Owner-waived releases must reference waiver metadata",
    "contents: write",
    "git tag \"$VERSION\"",
    "git push origin \"$VERSION\"",
  ];
  const missing = requiredTerms.filter((term) => !content.includes(term));

  if (missing.length) {
    log({
      name: "Release workflow",
      status: "fail",
      message: `${path} is missing launch gate controls: ${missing.join(", ")}`,
    });
    return;
  }

  log({ name: "Release workflow", status: "ok", message: `${path} enforces release gate confirmation` });
}

checkReleaseWorkflow(".github/workflows/release.yml");

function checkPackageReleaseScripts(path: string) {
  if (!existsSync(path)) {
    log({ name: "Package release scripts", status: "fail", message: `${path} is missing` });
    return;
  }

  try {
    const packageJson = JSON.parse(readFileSync(path, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const expectedLaunch = "pnpm lint && pnpm typecheck && pnpm test && pnpm audit && pnpm build && PLAYWRIGHT_BUILT_APP=1 REB_DEV_UNGATED_ACCESS=0 pnpm smoke";
    const expectedRelease = "pnpm lint && pnpm typecheck && pnpm test && pnpm audit && pnpm build && pnpm check:prod && PLAYWRIGHT_BUILT_APP=1 REB_DEV_UNGATED_ACCESS=0 pnpm smoke";

    if (packageJson.scripts?.["check:launch"] !== expectedLaunch || packageJson.scripts?.["check:release"] !== expectedRelease) {
      log({
        name: "Package release scripts",
        status: "fail",
        message: `${path} must keep check:launch/check:release aligned with lint, typecheck, test, audit, build, check:prod, and gated smoke`,
      });
      return;
    }

    log({ name: "Package release scripts", status: "ok", message: `${path} release gates are aligned` });
  } catch (err) {
    log({
      name: "Package release scripts",
      status: "fail",
      message: `Could not parse ${path}: ${(err as Error).message}`,
    });
  }
}

checkPackageReleaseScripts("package.json");

function checkCiWorkflow(path: string) {
  if (!existsSync(path)) {
    log({ name: "CI workflow", status: "fail", message: `${path} is missing` });
    return;
  }

  const content = readFileSync(path, "utf8");
  const requiredTerms = [
    "pnpm lint",
    "pnpm tsc --noEmit",
    "pnpm test",
    "pnpm audit",
    "pnpm build",
    "pnpm smoke",
    "REB_DEV_UNGATED_ACCESS",
  ];
  const missing = requiredTerms.filter((term) => !content.includes(term));

  // NOTE: do NOT fail on `--audit-level` — the CI deliberately runs
  // `pnpm audit --audit-level high` (gate on HIGH+ only). The old check here
  // flagged the workflow as broken precisely because it was configured correctly,
  // which blocked check:prod / check:release.
  if (missing.length) {
    log({
      name: "CI workflow",
      status: "fail",
      message: `${path} must run lint, typecheck, tests, full audit, build, and gated smoke`,
    });
    return;
  }

  log({ name: "CI workflow", status: "ok", message: `${path} runs launch-aligned checks` });
}

checkCiWorkflow(".github/workflows/ci.yml");

function checkAccessSmokeCoverage(customerPath: string, smokePath: string) {
  const missingFiles = [customerPath, smokePath].filter((path) => !existsSync(path));
  if (missingFiles.length) {
    log({ name: "Access smoke coverage", status: "fail", message: `${missingFiles.join(", ")} missing` });
    return;
  }

  const customerSmoke = readFileSync(customerPath, "utf8");
  const smoke = readFileSync(smokePath, "utf8");
  const content = `${customerSmoke}\n${smoke}`;
  const requiredTerms = [
    "signed-out dashboard customers get the sign-in flow",
    "signed-out account handoff returns users to sign-in",
    "admin tenant host starts at the dashboard sign-in flow",
    "admin tenant host sign-in keeps the invited email context",
    "admin tenant host sign-up uses the tenant invite context",
    "signed-out no-access recovery returns users to sign-in",
    "signup page explains invited email recovery",
    "cron maintenance endpoint is not public",
    "/api/cron/maintenance",
    "process.env.PLAYWRIGHT_BASE_URL",
    "not.toHaveURL(/\\/app/)",
  ];
  const missing = requiredTerms.filter((term) => !content.includes(term));
  const signupNoAppOk =
    smoke.includes('"signup page explains invited email recovery"') &&
    smoke.indexOf('"signup page explains invited email recovery"') <
      smoke.indexOf("not.toHaveURL(/\\/app/)");

  if (missing.length || !signupNoAppOk) {
    log({
      name: "Access smoke coverage",
      status: "fail",
      message: `${customerPath} and ${smokePath} must cover sign-in, sign-up, account handoff, no-access, admin-host, invited-email, cron protection, and no /app regressions, including public sign-up`,
    });
    return;
  }

  log({ name: "Access smoke coverage", status: "ok", message: `${customerPath} and ${smokePath} cover sign-in/sign-up recovery paths, account handoff, admin-host, and cron protection` });
}

checkAccessSmokeCoverage("tests/customer-frontend.spec.ts", "tests/smoke.spec.ts");

function checkAuthAccessPages(
  signInPagePath: string,
  signUpPath: string,
  noAccessPath: string,
  accountPath: string,
  recoveryButtonPath: string,
) {
  const missingFiles = [signInPagePath, signUpPath, noAccessPath, accountPath, recoveryButtonPath].filter((path) => !existsSync(path));
  if (missingFiles.length) {
    log({ name: "Auth access pages", status: "fail", message: `${missingFiles.join(", ")} missing` });
    return;
  }

  const signInPage = readFileSync(signInPagePath, "utf8");
  const signUp = readFileSync(signUpPath, "utf8");
  const noAccess = readFileSync(noAccessPath, "utf8");
  const account = readFileSync(accountPath, "utf8");
  const recoveryButton = readFileSync(recoveryButtonPath, "utf8");
  // Supabase Auth (magic link + Google OAuth). Both auth pages render
  // <SupabaseSignIn>, prefill the invited email, send marketing-host auth to
  // /account and tenant/admin-host auth to /dashboard via host-aware fallback.
  const authPagesOk =
    signInPage.includes("SupabaseSignIn") &&
    signInPage.includes("getInvite") &&
    signInPage.includes("prefillEmail={invite.email}") &&
    signInPage.includes("getClientFallbackRoot(requestHeaders)") &&
    signInPage.includes('withClientFallbackRoot(tenantAuth.clientFallbackRoot, "/dashboard")') &&
    signInPage.includes('next="/account"') &&
    signUp.includes("SupabaseSignIn") &&
    signUp.includes("getInvite") &&
    signUp.includes("prefillEmail={invite.email}") &&
    signUp.includes("getTenantConfig") &&
    signUp.includes("getClientFallbackRoot(requestHeaders)") &&
    signUp.includes('withClientFallbackRoot(tenantAuth.clientFallbackRoot, "/dashboard")') &&
    signUp.includes('next="/account"') &&
    signUp.includes("/access-request") &&
    [signInPage, signUp].every((content) => !content.includes('"/app"'));
  const metadataOk =
    signInPage.includes("AuthDocumentTitle") &&
    signInPage.includes("Sign in to ${tenantAuth.siteName}") &&
    signUp.includes("AuthDocumentTitle") &&
    signUp.includes("Create access for ${tenantAuth.siteName}");
  const noAccessOk =
    noAccess.includes("UseInvitedEmailButton") &&
    noAccess.includes("signs you out so you can choose that account") &&
    noAccess.includes('withClientFallbackRoot(clientFallbackRoot, "/sign-in")') &&
    noAccess.includes("mailto:jacob@strelva.com") &&
    noAccess.includes('href="/account"') &&
    noAccess.includes("Choose another site") &&
    !noAccess.includes('href="/"');
  const accountRecoveryOk =
    account.includes("No invited sites on this account") &&
    account.includes("UseInvitedEmailButton") &&
    account.includes("signs you out so you can choose that account") &&
    account.includes("Request your build") &&
    account.includes("mailto:jacob@strelva.com") &&
    account.includes("!tenantConfigs.some(({ config }) => config)") &&
    account.includes("return <NoAccessState />");
  const recoveryButtonOk =
    recoveryButton.includes("createBrowserSupabase") &&
    recoveryButton.includes("supabase.auth.signOut()") &&
    recoveryButton.includes('redirectUrl = "/sign-in"') &&
    recoveryButton.includes("Use invited email");

  if (!authPagesOk || !metadataOk || !noAccessOk || !accountRecoveryOk || !recoveryButtonOk) {
    log({
      name: "Auth access pages",
      status: "fail",
      message: "Auth pages must render SupabaseSignIn, prefill the invited email, route marketing-host auth through /account, route tenant/admin auth to /dashboard via host-aware redirects, avoid /app, and keep no-access/account recovery paths focused on the invited email",
    });
    return;
  }

  log({ name: "Auth access pages", status: "ok", message: "Sign-in, sign-up, and no-access recovery use Supabase auth with invited-email context and host-aware redirects" });
}

checkAuthAccessPages(
  "src/app/sign-in/[[...sign-in]]/page.tsx",
  "src/app/sign-up/[[...sign-up]]/page.tsx",
  "src/app/no-access/page.tsx",
  "src/app/(marketing)/account/page.tsx",
  "src/components/auth/UseInvitedEmailButton.tsx",
);

function checkAdminInviteFlow(adminPagePath: string, inviteButtonPath: string, inviteRoutePath: string) {
  const missingFiles = [adminPagePath, inviteButtonPath, inviteRoutePath].filter((path) => !existsSync(path));
  if (missingFiles.length) {
    log({ name: "Admin invite flow", status: "fail", message: `${missingFiles.join(", ")} missing` });
    return;
  }

  const adminPage = readFileSync(adminPagePath, "utf8");
  const inviteButton = readFileSync(inviteButtonPath, "utf8");
  const inviteRoute = readFileSync(inviteRoutePath, "utf8");
  const expectedTenantSignUpUrl = 'getTenantDashboardUrl(tenantConfig, "/sign-up", "production")';
  const expectedInviteEmailHtml = "buildInviteEmailHtml({ email, siteName: tenantConfig.siteName, signUpUrl })";
  const expectedInviteEmailText = "buildInviteEmailText({ email, siteName: tenantConfig.siteName, signUpUrl })";
  // The invite flow moved from the admin overview table onto the per-client
  // detail page in the console redesign; validate it there.
  const adminOk =
    adminPage.includes("<InviteButton") &&
    adminPage.includes("ownerEmail={tenant.ownerEmail}") &&
    adminPage.includes("tenantId={tenant.id}");
  const inviteOk =
    inviteButton.includes('fetch("/api/admin/invites"') &&
    inviteButton.includes("email.trim()") &&
    inviteButton.includes("Access is assigned to this exact email on signup") &&
    inviteButton.includes("signUpUrl?: string") &&
    inviteButton.includes("data.signUpUrl") &&
    inviteButton.includes("Open manual signup link") &&
    inviteButton.includes("Share this link only with") &&
    inviteButton.includes("Access is tied to that exact email") &&
    inviteButton.includes("navigator.clipboard.writeText") &&
    inviteButton.includes("Copy failed. Select the manual signup link above.") &&
    inviteButton.includes("Copy signup link") &&
    inviteButton.includes('role="dialog"') &&
    inviteButton.includes('htmlFor="invite-email"') &&
    inviteButton.includes('role="status"') &&
    inviteButton.includes("Send Invite");
  const routeOk =
    inviteRoute.includes(expectedTenantSignUpUrl) &&
    inviteRoute.includes("getInviteSignUpUrl(") &&
    inviteRoute.includes("url.searchParams.set(\"email\", email)") &&
    inviteRoute.includes(expectedInviteEmailHtml) &&
    inviteRoute.includes(expectedInviteEmailText);

  if (!adminOk || !inviteOk || !routeOk) {
    log({
      name: "Admin invite flow",
      status: "fail",
      message: `${adminPagePath}, ${inviteButtonPath}, and ${inviteRoutePath} must keep owner-email invites wired to /api/admin/invites with exact-email guidance and tenant/admin sign-up links`,
    });
    return;
  }

  log({
    name: "Admin invite flow",
    status: "ok",
    message: "Admin tenant rows expose owner-email invites through /api/admin/invites",
  });
}

checkAdminInviteFlow("src/app/admin/clients/[id]/page.tsx", "src/app/admin/InviteButton.tsx", "src/app/api/admin/invites/route.ts");

function checkTenantDomainAccess(aliasPath: string, tenantRoutePath: string) {
  const missingFiles = [aliasPath, tenantRoutePath].filter((path) => !existsSync(path));
  if (missingFiles.length) {
    log({ name: "Tenant domain access", status: "fail", message: `${missingFiles.join(", ")} missing` });
    return;
  }

  const aliasRoute = readFileSync(aliasPath, "utf8");
  const tenantRoute = readFileSync(tenantRoutePath, "utf8");
  const aliasOk = aliasRoute.trim() === 'export { DELETE, GET, PATCH, POST } from "@/app/api/tenant/domains/route";';
  const tenantAccessOk =
    tenantRoute.includes("requireTenantFromHeaders") &&
    tenantRoute.includes("requireTenantAccess(tenant)") &&
    tenantRoute.includes('requireTenantPermission(tenant, "domains:manage")') &&
    tenantRoute.includes("addCustomDomain(tenant") &&
    !tenantRoute.includes("body.tenant");

  if (!aliasOk || !tenantAccessOk) {
    log({
      name: "Tenant domain access",
      status: "fail",
      message: `${aliasPath} must stay a thin alias to ${tenantRoutePath}, and tenant domain mutations must use x-tenant plus domains:manage permission instead of trusting request bodies`,
    });
    return;
  }

  log({
    name: "Tenant domain access",
    status: "ok",
    message: "/api/admin/domains remains a compatibility alias for the tenant-scoped domains:manage route",
  });
}

checkTenantDomainAccess("src/app/api/admin/domains/route.ts", "src/app/api/tenant/domains/route.ts");

function checkPublicStorefrontApi(paths: {
  v1Content: string;
  v1PageConfig: string;
  v1SiteCapabilities: string;
}) {
  const missingFiles = Object.values(paths).filter((path) => !existsSync(path));
  if (missingFiles.length) {
    log({ name: "Public storefront API", status: "fail", message: `${missingFiles.join(", ")} missing` });
    return;
  }

  const v1Content = readFileSync(paths.v1Content, "utf8");
  const v1PageConfig = readFileSync(paths.v1PageConfig, "utf8");
  const v1SiteCapabilities = readFileSync(paths.v1SiteCapabilities, "utf8");

  // v1 owns the public storefront contract directly — no `/api/public/*`
  // re-export alias. Each handler must validate the tenant slug, require an
  // active tenant, and call the canonical storage/capability libs so a future
  // v2 can diverge from v1 without silent breakage.
  const contentOk =
    v1Content.includes("/^[a-z0-9-]+$/.test(tenant)") &&
    v1Content.includes("getTenantConfig(tenant)") &&
    v1Content.includes("config.active === false") &&
    // Public reads validate against the known section set, not the capability
    // manifest — the manifest gates the editing UI, not what a deployed client
    // repo can fetch (see the route's own comment).
    v1Content.includes("section in SECTION_TO_TYPE") &&
    v1Content.includes("getContent(") &&
    !v1Content.includes("@/app/api/public/");
  const pageConfigOk =
    v1PageConfig.includes("/^[a-z0-9-]+$/.test(tenant)") &&
    v1PageConfig.includes("getTenantConfig(tenant)") &&
    v1PageConfig.includes("config.active === false") &&
    v1PageConfig.includes("getSiteCapabilityManifest(tenant)") &&
    v1PageConfig.includes("getPageConfig(tenant)") &&
    !v1PageConfig.includes("@/app/api/public/");
  const siteCapabilitiesOk =
    v1SiteCapabilities.includes("/^[a-z0-9-]+$/.test(tenant)") &&
    v1SiteCapabilities.includes("getTenantConfig(tenant)") &&
    v1SiteCapabilities.includes("config.active === false") &&
    v1SiteCapabilities.includes("getSiteCapabilityManifest(tenant)") &&
    !v1SiteCapabilities.includes("@/app/api/public/");

  if (!contentOk || !pageConfigOk || !siteCapabilitiesOk) {
    log({
      name: "Public storefront API",
      status: "fail",
      message: "/api/v1 storefront APIs must own the contract directly (no @/app/api/public/* re-exports) and validate tenant slugs, active tenants, and allowed content sections before reading storage",
    });
    return;
  }

  log({
    name: "Public storefront API",
    status: "ok",
    message: "/api/v1 storefront APIs own the contract directly with tenant and section validation",
  });
}

checkPublicStorefrontApi({
  v1Content: "src/app/api/v1/content/[tenant]/[section]/route.ts",
  v1PageConfig: "src/app/api/v1/page-config/[tenant]/route.ts",
  v1SiteCapabilities: "src/app/api/v1/site-capabilities/[tenant]/route.ts",
});

function checkOAuthCallbackState(callbackPaths: string[]) {
  const missingFiles = callbackPaths.filter((path) => !existsSync(path));
  if (missingFiles.length) {
    log({ name: "OAuth callback state", status: "fail", message: `${missingFiles.join(", ")} missing` });
    return;
  }

  const insecureRoutes = callbackPaths.filter((path) => {
    const source = readFileSync(path, "utf8");
    return !(
      source.includes("verifyOAuthState(state)") &&
      source.includes("if (!verifiedState)") &&
      source.includes("const tenantId = verifiedState.tenantId") &&
      source.includes("saveConnection({") &&
      !source.includes("Buffer.from(state") &&
      !source.includes("JSON.parse(state")
    );
  });

  if (insecureRoutes.length) {
    log({
      name: "OAuth callback state",
      status: "fail",
      message: `${insecureRoutes.join(", ")} must verify signed OAuth state and derive tenantId from verifiedState before saving connections`,
    });
    return;
  }

  log({
    name: "OAuth callback state",
    status: "ok",
    message: "OAuth callbacks verify signed state before saving tenant connections",
  });
}

checkOAuthCallbackState([
  "src/app/api/oauth/calendly/callback/route.ts",
  "src/app/api/oauth/google/callback/route.ts",
  "src/app/api/oauth/instagram/callback/route.ts",
]);

// The Clerk webhook route (src/app/api/clerk/webhook) was removed with the
// Clerk→Supabase Auth migration (#83). New-user provisioning is now the
// Supabase `handle_new_user` Postgres trigger plus SUPER_ADMIN_EMAILS seeding
// (SUPER_ADMIN_EMAILS is enforced as a required env var in the Core Auth
// section above), so there is no signed-webhook route to assert here.

function checkStripeBillingWebhookRoute(path: string) {
  if (!existsSync(path)) {
    log({ name: "Stripe billing webhook route", status: "fail", message: `${path} is missing` });
    return;
  }

  const content = readFileSync(path, "utf8");
  const requiredTerms = [
    "STRIPE_WEBHOOK_SECRET",
    "Webhook secret not configured",
    "stripe-signature",
    "stripe.webhooks.constructEvent",
    "Invalid signature",
    "checkout.session.completed",
    "invoice.paid",
    "invoice.payment_failed",
    "customer.subscription.deleted",
    "claimStripeEvent",
  ];
  const missing = requiredTerms.filter((term) => !content.includes(term));
  const insecurePatterns = ["if (webhookSecret && signature)", "return true; // Skip if not configured"];
  const insecureMatch = insecurePatterns.find((term) => content.includes(term));

  if (missing.length || insecureMatch) {
    log({
      name: "Stripe billing webhook route",
      status: "fail",
      message: `${path} must fail closed, verify Stripe signatures, handle subscription events, and retain idempotency`,
    });
    return;
  }

  log({
    name: "Stripe billing webhook route",
    status: "ok",
    message: `${path} verifies signed billing events and handles subscription status updates`,
  });
}

checkStripeBillingWebhookRoute("src/app/api/billing/webhook/route.ts");

function checkCronAuthCoverage(vercelPath: string, proxyPath: string) {
  if (!existsSync(vercelPath) || !existsSync(proxyPath)) {
    log({
      name: "Cron auth coverage",
      status: "fail",
      message: `${vercelPath} and ${proxyPath} are required to verify cron auth coverage`,
    });
    return;
  }

  try {
    const vercelConfig = JSON.parse(readFileSync(vercelPath, "utf8")) as {
      crons?: Array<{ path?: string; schedule?: string }>;
    };
    const proxy = readFileSync(proxyPath, "utf8");
    const crons = vercelConfig.crons || [];
    const invalidCron = crons.find((cron) => !cron.path?.startsWith("/api/cron/") || !cron.schedule);
    const missingRoute = crons.find((cron) => {
      const routePath = `src/app${cron.path}/route.ts`;
      return !existsSync(routePath);
    });
    const proxyCoversCron =
      proxy.includes("export function isCronRoute") &&
      proxy.includes("path.startsWith(\"/api/cron/\")") &&
      proxy.includes("validateCronRequest(process.env.CRON_SECRET") &&
      proxy.includes("CRON_SECRET not configured") &&
      proxy.includes("return { allowed: false, status: 401, message: \"Unauthorized\" }");

    if (!crons.length || invalidCron || missingRoute || !proxyCoversCron) {
      log({
        name: "Cron auth coverage",
        status: "fail",
        message: `${vercelPath} cron paths must map to /api/cron route files and ${proxyPath} must fail closed with CRON_SECRET validation`,
      });
      return;
    }

    log({
      name: "Cron auth coverage",
      status: "ok",
      message: `${crons.length} Vercel cron route(s) are covered by proxy CRON_SECRET validation`,
    });
  } catch (err) {
    log({
      name: "Cron auth coverage",
      status: "fail",
      message: `Could not verify cron auth coverage: ${(err as Error).message}`,
    });
  }
}

checkCronAuthCoverage("vercel.json", "src/proxy.ts");

function checkDependencyAudit() {
  try {
    // Gate on HIGH+ only, matching the deliberate CI policy (`pnpm audit
    // --audit-level high`). Transitive moderate/low advisories in dev tooling
    // (eslint, sentry) with no upstream fix don't block a release.
    execFileSync("pnpm", ["audit", "--audit-level", "high"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    });
    log({
      name: "Dependency audit",
      status: "ok",
      message: "pnpm audit found no HIGH or CRITICAL vulnerabilities",
    });
  } catch (err) {
    const output = `${(err as { stdout?: string }).stdout || ""}\n${(err as { stderr?: string }).stderr || ""}`
      .replace(/\x1b\[[0-9;]*m/g, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8)
      .join("; ");
    log({
      name: "Dependency audit",
      status: "fail",
      message: output
        ? `pnpm audit reported vulnerabilities; resolve them before release: ${output}`
        : "pnpm audit reported vulnerabilities; resolve them before release",
    });
  }
}

checkDependencyAudit();

function checkVercelProjectLink(path: string) {
  if (!existsSync(path)) {
    log({
      name: "Vercel project link",
      status: "fail",
      message: `${path} is missing; run vercel link before production verification`,
    });
    return;
  }

  try {
    const link = JSON.parse(readFileSync(path, "utf8")) as {
      projectId?: string;
      orgId?: string;
      projectName?: string;
    };
    if (!link.projectId || !link.orgId) {
      log({
        name: "Vercel project link",
        status: "fail",
        message: `${path} must include projectId and orgId`,
      });
      return;
    }

    log({
      name: "Vercel project link",
      status: "ok",
      message: `${link.projectName || "project"} (${link.projectId}) in ${link.orgId}`,
    });
  } catch (err) {
    log({
      name: "Vercel project link",
      status: "fail",
      message: `Could not parse ${path}: ${(err as Error).message}`,
    });
  }
}

checkVercelProjectLink(".vercel/project.json");

console.log("\n─── AI Agent ────────────────────────────────────────────────────");
checkEnvVar("GOOGLE_GENERATIVE_AI_API_KEY", true);

console.log("\n─── Data backbone (Supabase Postgres + Auth) ────────────────────");
// Supabase is the live source of truth (auth + tenant + content + ops data).
// A deploy missing these — or with the source flags not set to "postgres" —
// silently falls back to the dev-file/defaults, which is the worst kind of bug
// (looks fine, serves old data). So these are hard prod requirements now.
checkEnvVar("NEXT_PUBLIC_SUPABASE_URL", true, false);
const hasSupabaseKey = !!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
log({
  name: "ENV: Supabase anon/publishable key",
  status: hasSupabaseKey ? "ok" : "fail",
  message: hasSupabaseKey ? "set" : "Set NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
});
checkEnvVar("SUPABASE_SERVICE_ROLE_KEY", true);
for (const flag of ["CONTENT_SOURCE", "TENANTS_SOURCE", "DATA_SOURCE"]) {
  const v = process.env[flag];
  log({
    name: `ENV: ${flag}`,
    status: v === "postgres" ? "ok" : "fail",
    message: v === "postgres" ? "postgres" : `must be "postgres" in prod (is "${v ?? "unset"}")`,
  });
}

console.log("\n─── Redis (Upstash) ─────────────────────────────────────────────");
const hasRedisUrl = checkEnvVar("UPSTASH_REDIS_REST_URL", true, false);
const hasRedisToken = checkEnvVar("UPSTASH_REDIS_REST_TOKEN", true);

console.log("\n─── Billing (Stripe) ────────────────────────────────────────────");
const hasStripeKey = checkEnvVar("STRIPE_SECRET_KEY", true);
// Optional while admin-side pricing is undecided. Mark required again when
// the price is committed and billing is turned on.
checkEnvVar("STRIPE_SCAFFOLD_PRICE_ID", false, false);
checkEnvVar("STRIPE_WEBHOOK_SECRET", true);

console.log("\n─── Email (Resend) ──────────────────────────────────────────────");
checkEnvVar("RESEND_API_KEY", true);
checkEnvVar("RESEND_DOMAIN", true, false);

console.log("\n─── Image Upload (Vercel Blob) ──────────────────────────────────");
checkEnvVar("BLOB_READ_WRITE_TOKEN", false);

console.log("\n─── Cron & Internal API Security ────────────────────────────────");
checkEnvVar("CRON_SECRET", true);
checkEnvVar("INTERNAL_API_SECRET", true);
checkEnvVar("OAUTH_STATE_SECRET", true);
// Either SCAFFOLD_CUSTOM_REQUEST_SECRET (canonical) or REB_CUSTOM_REQUEST_SECRET
// (legacy alias) satisfies the bearer-secret requirement. Don't fail the gate
// when only the legacy name is set; the agent reads both.
const hasScaffoldCustomRequest = checkEnvVar("SCAFFOLD_CUSTOM_REQUEST_SECRET", false, false);
const hasLegacyCustomRequest = checkEnvVar("REB_CUSTOM_REQUEST_SECRET", false, false);
if (!hasScaffoldCustomRequest && !hasLegacyCustomRequest) {
  log({
    name: "ENV: SCAFFOLD_CUSTOM_REQUEST_SECRET",
    status: "fail",
    message: "Set SCAFFOLD_CUSTOM_REQUEST_SECRET (or legacy REB_CUSTOM_REQUEST_SECRET)",
  });
  failedEnvVars.add("SCAFFOLD_CUSTOM_REQUEST_SECRET");
}

console.log("\n─── Monitoring & Notifications ──────────────────────────────────");
checkEnvVar("SENTRY_DSN", true, false);
checkEnvVar("NEXT_PUBLIC_SENTRY_DSN", true, false);
checkEnvVar("SLACK_WEBHOOK_URL", false, false);

console.log("\n─── OAuth Connections ───────────────────────────────────────────");
const hasGoogleOAuth = checkOptionalPair("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "Google");
const hasInstagramOAuth = checkOptionalPair("INSTAGRAM_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET", "Instagram");
const hasCalendlyOAuth = checkOptionalPair("CALENDLY_CLIENT_ID", "CALENDLY_CLIENT_SECRET", "Calendly");
const hasAnyOAuth = hasGoogleOAuth || hasInstagramOAuth || hasCalendlyOAuth;
checkRequiredWhen(hasAnyOAuth, "NEXT_PUBLIC_APP_URL", "OAuth redirects need the deployed app URL", false);

console.log("\n─── External Webhook Secrets ────────────────────────────────────");
checkRequiredWhen(hasCalendlyOAuth, "CALENDLY_WEBHOOK_SECRET", "Calendly OAuth registers booking webhooks");
if (!hasCalendlyOAuth) checkEnvVar("CALENDLY_WEBHOOK_SECRET", false);

console.log("\n─── Site Configuration ──────────────────────────────────────────");
checkEnvVar("NEXT_PUBLIC_SITE_URL", true, false);
checkEnvVar("NEXT_PUBLIC_APP_URL", false, false);
checkEnvVar("CUSTOM_DOMAIN_MAP", false, false);
checkEnvVar("MARKETING_DOMAINS", false, false);

function checkMarketingDomainCoverage() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl || validateProductionEnvValue("NEXT_PUBLIC_SITE_URL", siteUrl)) {
    log({ name: "Marketing domain coverage", status: "skip", message: "NEXT_PUBLIC_SITE_URL is not ready" });
    return;
  }

  const siteHost = new URL(siteUrl).host.toLowerCase();
  const marketingHosts = new Set([
    ...DEFAULT_MARKETING_HOSTS,
    ...parseMarketingDomains(process.env.MARKETING_DOMAINS || ""),
  ]);

  if (!marketingHosts.has(siteHost)) {
    log({
      name: "Marketing domain coverage",
      status: "fail",
      message: `MARKETING_DOMAINS must include ${siteHost} so root-domain auth returns customers to /account`,
    });
    return;
  }

  log({
    name: "Marketing domain coverage",
    status: "ok",
    message: `${siteHost} is treated as a marketing host for /account auth handoff`,
  });
}

checkMarketingDomainCoverage();

console.log("\n─── AI & Launch Flags ───────────────────────────────────────────");
checkEnvVar("AI_AUTO_PUBLISH", false, false);

console.log("\n─── Google Search Console ───────────────────────────────────────");
checkEnvVar("GOOGLE_SEARCH_CONSOLE_KEY", false);

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTIVITY CHECKS
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  Connectivity Checks");
console.log("═══════════════════════════════════════════════════════════════\n");

async function checkRedis() {
  if (!hasRedisUrl || !hasRedisToken) {
    log({ name: "Redis connectivity", status: "skip", message: "Missing credentials" });
    return;
  }

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const pong = await redis.ping();
    log({ name: "Redis connectivity", status: "ok", message: `Connected (PING: ${pong})` });

    // Check for tenant cache
    const tenantCache = await redis.get("reb:tenants:all");
    if (tenantCache) {
      log({ name: "Redis tenant cache", status: "ok", message: "Cache populated" });
    } else {
      log({ name: "Redis tenant cache", status: "warn", message: "Cache empty (will populate on first request)" });
    }
  } catch (err) {
    log({ name: "Redis connectivity", status: "fail", message: `Error: ${(err as Error).message}` });
  }
}

async function checkStripe() {
  if (!hasStripeKey) {
    log({ name: "Stripe connectivity", status: "skip", message: "Missing credentials" });
    return;
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion,
    });

    // Verify API key works
    await stripe.balance.retrieve();
    log({ name: "Stripe connectivity", status: "ok", message: "API key valid" });

    // Check price ID shape only. Specific amount is intentionally not pinned
    // while admin-side pricing is undecided. If the env var is unset we skip.
    const priceId = process.env.STRIPE_SCAFFOLD_PRICE_ID;
    if (priceId) {
      try {
        const price = await stripe.prices.retrieve(priceId);
        const amount = price.unit_amount || 0;
        const interval = price.recurring?.interval;
        const currency = price.currency;
        const productId =
          typeof price.product === "string" ? price.product : price.product?.id || "unknown_product";
        const priceSummary = `price=${price.id}, product=${productId}, livemode=${price.livemode}, active=${price.active}, amount=${amount || "custom"}, currency=${currency}, interval=${interval || "one-time"}`;
        if (interval !== "month" || currency !== SCAFFOLD_MONTHLY_PRICE_CURRENCY) {
          failedEnvVars.add("STRIPE_SCAFFOLD_PRICE_ID");
          log({
            name: "Stripe price ID",
            status: "fail",
            message: `Expected a recurring monthly USD Stripe price; got ${amount ? `$${amount / 100}` : "custom"}/${interval || "one-time"} ${currency.toUpperCase()}. Current Stripe price details: ${priceSummary}.`,
          });
          return;
        }
        log({
          name: "Stripe price ID",
          status: "ok",
          message: `Valid recurring monthly USD price ($${(amount / 100).toFixed(2)}/month)`,
        });
      } catch {
        failedEnvVars.add("STRIPE_SCAFFOLD_PRICE_ID");
        log({ name: "Stripe price ID", status: "fail", message: "Invalid price ID" });
      }
    } else {
      log({
        name: "Stripe price ID",
        status: "skip",
        message: "STRIPE_SCAFFOLD_PRICE_ID not set — admin-side billing is off",
      });
    }
  } catch (err) {
    log({ name: "Stripe connectivity", status: "fail", message: `Error: ${(err as Error).message}` });
  }
}

/**
 * The 402 cliff guard. The moment STRIPE_SCAFFOLD_PRICE_ID is set, billing turns
 * on (isBillingEnabled() in src/lib/subscription.ts) and requireActiveSubscription
 * starts returning HTTP 402 for every tenant whose effective status is not
 * active/trialing. Existing free tenants have subscriptionStatus "none", so unless
 * they are grandfathered (STRIPE_BILLING_GRANDFATHER_TENANTS) or carry a
 * planOverride/active subscriptionStatus, they get locked out of their dashboard
 * the instant this env var ships.
 *
 * So: if the price id is set, require that either the grandfather list is
 * non-empty, OR every active tenant already has planOverride==="founder_comp"
 * or an active/trialing subscriptionStatus. Otherwise fail with a remediation that
 * names the cliff.
 */
async function checkBillingGrandfathering() {
  const priceId = process.env.STRIPE_SCAFFOLD_PRICE_ID;
  if (!priceId) {
    // Billing is off; the gate short-circuits to "active" so there is no cliff.
    return;
  }

  const grandfathered = (process.env.STRIPE_BILLING_GRANDFATHER_TENANTS || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // Coverage MUST be verified against the live tenant list (Postgres) — a
  // non-empty grandfather env var is NOT proof of safety (it can be incomplete
  // or have a typo'd id, leaving a real active tenant to get 402'd the moment
  // billing flips). So always cross-check the source of truth: a tenant is
  // "covered" if it is in the grandfather set OR has planOverride=founder_comp
  // OR an active/trialing sub.
  try {
    const tenants = (await getAllTenants()).map((t) => ({
      id: t.id,
      active: t.active,
      planOverride: t.planOverride,
      subscriptionStatus: t.subscriptionStatus,
    }));

    const grandfatheredSet = new Set(grandfathered);
    const activeTenants = tenants.filter((t) => t.active !== false);
    const uncovered = activeTenants.filter(
      (t) =>
        !grandfatheredSet.has(t.id) &&
        t.planOverride !== "founder_comp" &&
        t.subscriptionStatus !== "active" &&
        t.subscriptionStatus !== "trialing"
    );

    if (uncovered.length > 0) {
      failedEnvVars.add("STRIPE_BILLING_GRANDFATHER_TENANTS");
      log({
        name: "Billing grandfathering",
        status: "fail",
        message: `STRIPE_SCAFFOLD_PRICE_ID is set but ${uncovered.length} active tenant(s) (${uncovered
          .map((t) => t.id)
          .join(", ")}) are not in STRIPE_BILLING_GRANDFATHER_TENANTS and have neither planOverride nor an active/trialing subscription. They would get a 402 the moment billing turns on — add them to STRIPE_BILLING_GRANDFATHER_TENANTS (comma-separated) in the SAME deploy as STRIPE_SCAFFOLD_PRICE_ID, or set their planOverride/subscriptionStatus first.`,
      });
      return;
    }

    log({
      name: "Billing grandfathering",
      status: "ok",
      message: `All ${activeTenants.length} active tenant(s) are covered (grandfather list + planOverride/subscriptionStatus) — no 402 cliff`,
    });
  } catch (err) {
    // Couldn't verify against the live tenant list (Postgres). A non-empty
    // grandfather list is a soft pass (warn); an empty list with the price id
    // set stays a hard fail so billing can't flip on unguarded.
    if (grandfathered.length > 0) {
      log({
        name: "Billing grandfathering",
        status: "warn",
        message: `STRIPE_BILLING_GRANDFATHER_TENANTS lists ${grandfathered.length} tenant(s), but the live tenant list (Postgres) could not be read to verify it covers EVERY active tenant (${(err as Error).message}). Double-check the list is complete (no missing/typo'd ids) before flipping billing on.`,
      });
      return;
    }
    failedEnvVars.add("STRIPE_BILLING_GRANDFATHER_TENANTS");
    log({
      name: "Billing grandfathering",
      status: "fail",
      message: `STRIPE_SCAFFOLD_PRICE_ID is set but STRIPE_BILLING_GRANDFATHER_TENANTS is empty and the live tenant list (Postgres) could not be verified (${(err as Error).message}). Every existing tenant gets a 402 the moment billing turns on — set STRIPE_BILLING_GRANDFATHER_TENANTS to a comma-separated list of all existing tenant ids in the SAME deploy as STRIPE_SCAFFOLD_PRICE_ID.`,
    });
  }
}

async function checkProductionSiteUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!baseUrl || validateProductionEnvValue("NEXT_PUBLIC_SITE_URL", baseUrl)) {
    log({ name: "Production site URL", status: "skip", message: "NEXT_PUBLIC_SITE_URL is not ready" });
    return;
  }

  try {
    const healthUrl = new URL("/api/health", baseUrl).toString();
    const res = await fetch(healthUrl, { redirect: "follow" });
    const finalUrl = new URL(res.url);
    const expectedHost = new URL(baseUrl).host;
    const server = res.headers.get("server") || "";
    const vercelId = res.headers.get("x-vercel-id") || "";
    const contentType = res.headers.get("content-type") || "";
    const reachesExpectedHost = finalUrl.host === expectedHost;
    const reachesVercel = server.toLowerCase().includes("vercel") || Boolean(vercelId);

    if (!res.ok || !reachesExpectedHost || !reachesVercel || !contentType.includes("application/json")) {
      const dnsContext = await getDnsContext(expectedHost);
      log({
        name: "Production site URL",
        status: "fail",
        message: `${healthUrl} must resolve to the Vercel Next.js app; got HTTP ${res.status} at ${res.url || healthUrl} via ${server || "unknown server"}. ${dnsContext} ${scaffoldWebDomainAction}`,
      });
      return;
    }

    log({
      name: "Production site URL",
      status: "ok",
      message: `${healthUrl} resolves to the Vercel Next.js app`,
    });
  } catch (err) {
    log({
      name: "Production site URL",
      status: "fail",
      message: `Could not verify NEXT_PUBLIC_SITE_URL: ${(err as Error).message}`,
    });
  }
}

async function checkVercelAppFreshness() {
  try {
    const signInUrl = new URL("/sign-in", VERCEL_APP_URL).toString();
    const res = await fetch(signInUrl, { redirect: "follow" });
    const html = await res.text();
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || "missing title";
    const server = res.headers.get("server") || "";
    const vercelId = res.headers.get("x-vercel-id") || "";
    const reachesVercel = server.toLowerCase().includes("vercel") || Boolean(vercelId);

    if (!res.ok || !reachesVercel || title !== EXPECTED_SIGN_IN_TITLE) {
      log({
        name: "Vercel app freshness",
        status: "fail",
        message: `${signInUrl} must serve the current invite-focused sign-in title "${EXPECTED_SIGN_IN_TITLE}"; got "${title}". Deploy a clean release branch containing the current launch-readiness fixes before live customer-access verification; do not only redeploy the existing stale production artifact.`,
      });
      return;
    }

    log({
      name: "Vercel app freshness",
      status: "ok",
      message: `${signInUrl} serves current sign-in title`,
    });
  } catch (err) {
    log({
      name: "Vercel app freshness",
      status: "fail",
      message: `Could not verify ${VERCEL_APP_URL} sign-in freshness: ${(err as Error).message}`,
    });
  }
}

async function getDnsContext(host: string): Promise<string> {
  const bareHost = host.toLowerCase().split(":")[0];
  const [aRecords, nsRecords] = await Promise.all([
    resolve4(bareHost).catch(() => [] as string[]),
    resolveNs(bareHost).catch(() => [] as string[]),
  ]);
  const a = aRecords.length ? aRecords.join(", ") : "none";
  const ns = nsRecords.length ? nsRecords.join(", ") : "none";
  return `Current DNS: A=${a}; NS=${ns}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK URL REFERENCE
// ─────────────────────────────────────────────────────────────────────────────

function printWebhookUrls() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://strelva.com";

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Webhook URLs (configure in external services)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("Stripe Webhook:");
  console.log(`  URL: ${baseUrl}/api/billing/webhook`);
  console.log("  Events: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted");
  console.log("  Secret: Set STRIPE_WEBHOOK_SECRET to match\n");

  console.log("Calendly Webhook (if using):");
  console.log(`  URL: ${baseUrl}/api/webhooks/calendly`);
  console.log("  Secret: Set CALENDLY_WEBHOOK_SECRET to match\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// VERCEL DOMAIN MAPPING
// ─────────────────────────────────────────────────────────────────────────────

function printDomainChecklist() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Vercel Domain Mapping Checklist");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("For each custom domain, ensure:");
  console.log("  1. Domain is added to Vercel project (vercel domains add <domain>)");
  console.log("  2. DNS is configured (CNAME to cname.vercel-dns.com or A records)");
  console.log("  3. SSL certificate is provisioned (automatic after DNS propagation)");
  console.log("  4. Domain is in tenant config: productionDomain or customDomains[]");
  console.log("  5. For www redirects: both apex and www domains added to Vercel\n");

  const customDomainMap = process.env.CUSTOM_DOMAIN_MAP;
  if (customDomainMap) {
    try {
      const map = JSON.parse(customDomainMap);
      console.log("CUSTOM_DOMAIN_MAP entries (env var fallback):");
      for (const [domain, tenant] of Object.entries(map)) {
        console.log(`  ${domain} → ${tenant}`);
      }
    } catch {
      console.log("  (Could not parse CUSTOM_DOMAIN_MAP)");
    }
  } else {
    console.log("  CUSTOM_DOMAIN_MAP not set (custom domains resolved from tenant config)");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TENANT REVALIDATION SECRETS
// ─────────────────────────────────────────────────────────────────────────────

async function checkTenantRevalidation() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Per-Tenant Revalidation Secrets");
  console.log("═══════════════════════════════════════════════════════════════\n");

  try {
    const tenants = await getAllTenants();

    for (const tenant of tenants) {
      for (const result of getTenantLaunchReadinessResults(tenant)) log(result);
      if (tenant.active !== false) {
        await checkTenantDomainDns(tenant);
      }
    }
  } catch (err) {
    console.log(`  Error fetching tenants: ${(err as Error).message}\n`);
  }
}

async function checkTenantDomainDns(tenant: {
  id: string;
  productionDomain?: string;
  adminDomain?: string;
  customDomains?: string[];
}) {
  const productionDomain = normalizeDomainForDns(tenant.productionDomain);
  const adminDomain = normalizeDomainForDns(tenant.adminDomain || (productionDomain ? `admin.${productionDomain}` : ""));
  const wwwDomain = productionDomain && !productionDomain.startsWith("www.") ? `www.${productionDomain}` : "";
  // The canonical domain + admin host are hard requirements; `www` is an optional
  // redirect. When the canonical apex serves, a non-routable `www` is a warning
  // (a nice-to-have redirect), not a launch blocker.
  const domains: Array<{ domain: string; required: boolean }> = [
    { domain: productionDomain, required: true },
    { domain: adminDomain, required: true },
    { domain: wwwDomain, required: false },
  ].filter((d) => d.domain);

  for (const { domain, required } of domains) {
    const records = await resolve4(domain).catch(() => [] as string[]);
    if (records.length) {
      log({ name: `Tenant ${tenant.id} DNS ${domain}`, status: "ok", message: records.join(", ") });
      continue;
    }

    const cnameRecords = (await resolveCname(domain).catch(() => [] as string[])).map(formatDnsRecord);
    const dnsContext = cnameRecords.length
      ? `${domain} has CNAME ${cnameRecords.join(", ")} but no routable A record from resolve4/curl.`
      : `${domain} does not resolve.`;

    log({
      name: `Tenant ${tenant.id} DNS ${domain}`,
      status: required ? "fail" : "warn",
      message: required
        ? `${dnsContext} Add the domain in Vercel and create DNS record "A ${domain} 76.76.21.21" before treating tenant ${tenant.id} as production-routable.`
        : `${dnsContext} Optional www redirect — canonical domain serves; add "A ${domain} 76.76.21.21" at the registrar when convenient.`,
    });
  }
}

function normalizeDomainForDns(domain: string | undefined) {
  return domain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "";
}

function formatDnsRecord(record: string) {
  const normalized = record.trim();
  return normalized.endsWith("/") ? `${normalized.slice(0, -1)}.` : normalized;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRON JOBS
// ─────────────────────────────────────────────────────────────────────────────

function printCronJobs() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Vercel Cron Jobs");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const crons = [
    { path: "/api/cron/maintenance", schedule: "0 3 * * *", desc: "Maintenance cleanup (daily 3am UTC)" },
    { path: "/api/cron/weekly-report", schedule: "0 14 * * 1", desc: "Weekly reports (Mon 2pm UTC)" },
    { path: "/api/cron/staleness", schedule: "0 6 * * *", desc: "Content staleness check (daily 6am UTC)" },
    { path: "/api/cron/search-console", schedule: "0 7 * * *", desc: "Search console sync (daily 7am UTC)" },
    { path: "/api/cron/daily-summary", schedule: "0 8 * * *", desc: "Daily summary (daily 8am UTC)" },
    { path: "/api/cron/poll-yelp", schedule: "0 6 * * *", desc: "Yelp reviews (daily 6am UTC)" },
    { path: "/api/cron/poll-google-reviews", schedule: "0 6 * * *", desc: "Google reviews (daily 6am UTC)" },
    { path: "/api/cron/poll-instagram", schedule: "0 6 * * *", desc: "Instagram feed (daily 6am UTC)" },
  ];

  console.log("Defined in vercel.json:");
  for (const cron of crons) {
    console.log(`  ${cron.path}`);
    console.log(`    Schedule: ${cron.schedule}`);
    console.log(`    Purpose: ${cron.desc}\n`);
  }

  console.log("All cron routes require Authorization: Bearer <CRON_SECRET> header.");
  console.log("Vercel automatically sends this header when CRON_SECRET is set.\n");
}

function printReleaseActions() {
  const failedEnvs = [...failedEnvVars].sort();
  const warnedEnvs = [...warnedEnvVars].sort();
  if (!failedEnvs.length && !warnedEnvs.length && !results.some((result) => result.status === "fail")) return;
  const launchBlockers = existsSync("docs/launch-blockers.md")
    ? readFileSync("docs/launch-blockers.md", "utf8")
    : "";

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Required Release Actions");
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (failedEnvs.length) {
    const generated = failedEnvs.filter((name) => locallyGeneratedSecrets.has(name));
    const external = failedEnvs.filter((name) => !locallyGeneratedSecrets.has(name));
    const replacementEnvs = new Set<string>();
    if (failedEnvs.includes("STRIPE_SCAFFOLD_PRICE_ID")) {
      replacementEnvs.add("STRIPE_SCAFFOLD_PRICE_ID");
    }

    console.log("Set or fix these Vercel Production env vars:");
    for (const name of failedEnvs) {
      if (replacementEnvs.has(name)) continue;
      console.log(`  vercel env add ${name} production`);
    }
    if (failedEnvs.includes("STRIPE_SCAFFOLD_PRICE_ID")) {
      console.log("  # STRIPE_SCAFFOLD_PRICE_ID already exists but points at the wrong price; remove the old value first if Vercel will not overwrite it:");
      console.log("  vercel env rm STRIPE_SCAFFOLD_PRICE_ID production --yes");
      console.log("  vercel env add STRIPE_SCAFFOLD_PRICE_ID production");
    }
    console.log();

    if (generated.length) {
      console.log("Generate strong local secrets before adding them:");
      for (const name of generated) {
        console.log(`  ${name}=$(openssl rand -hex 32)`);
      }
      console.log();
    }

    if (external.length) {
      console.log("Fetch these from production vendor dashboards:");
      for (const name of external) {
        const hint = envSourceHints[name] || "Production provider dashboard";
        console.log(`  ${name}: ${hint}`);
      }
      console.log();
    }

    console.log("After setting Vercel Production env vars, verify the same values locally:");
    console.log("  vercel env pull .env.production.local --environment=production");
    console.log("  pnpm check:prod");
    console.log("  # When env checks pass, redeploy before live verification:");
    console.log("  git status --short");
    console.log("  vercel deploy --prod");
    console.log("  PLAYWRIGHT_BASE_URL=https://strelva.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm exec playwright test tests/customer-frontend.spec.ts -g \"signed-out dashboard customers\"");
    console.log();
  }

  if (warnedEnvs.length) {
    console.log("Review or clean up these warning Vercel Production env vars:");
    for (const name of warnedEnvs) {
      console.log(`  vercel env add ${name} production`);
    }
    console.log("  Remove copied quotes, literal \\n text, localhost-only domains, or other non-production formatting before re-adding.");
    console.log();
  }

  const supabaseAuthFailed =
    failedEnvs.includes("NEXT_PUBLIC_SUPABASE_URL") ||
    failedEnvs.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    failedEnvs.includes("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseAuthFailed) {
    console.log("- Supabase Auth: set the project URL plus the anon/publishable and service-role keys, then verify signed-out /dashboard and /no-access reach /sign-in, root marketing-host auth finishes at /account, and admin.greatlakesdriedfruit.com reaches the same invited-email sign-in flow before finishing at /dashboard.");
  }
  if (supabaseAuthFailed || failedEnvs.includes("RESEND_API_KEY") || failedEnvs.includes("RESEND_DOMAIN")) {
    console.log("- Customer access: after Supabase Auth and Resend are live, open /admin as a super admin, use Invite for each tenant ownerEmail, and verify the customer signs up or signs in with the exact invited email (magic link or Google OAuth), the email stays prefilled when switching between sign-up and sign-in, strelva.com auth reaches /account, and admin.greatlakesdriedfruit.com auth reaches /dashboard/site.");
  }
  if (failedEnvs.includes("STRIPE_WEBHOOK_SECRET")) {
    console.log("- Stripe webhook: configure https://strelva.com/api/billing/webhook for checkout.session.completed, invoice.paid, invoice.payment_failed, and customer.subscription.deleted with the matching STRIPE_WEBHOOK_SECRET.");
  }
  if (failedEnvs.includes("UPSTASH_REDIS_REST_URL") || failedEnvs.includes("UPSTASH_REDIS_REST_TOKEN")) {
    console.log("- Redis: provision Upstash REST credentials before enabling production queues, rate limits, and reports.");
  }
  if (results.some((result) => result.name === "Launch blockers" && result.status === "fail")) {
    if (launchBlockers.includes("Vercel Project Access")) {
      console.log("- Vercel access: grant access to project scaffold-web (prj_AzaQBS8jM9E5RVgHuMWnQju0GIxb) in team_66XTGId41AJGh9vLvkiyXqkZ, then run `vercel whoami`, `vercel env pull .env.production.local --environment=production`, and `pnpm check:prod` from that account.");
    }
    if (launchBlockers.includes("Vercel app freshness")) {
      console.log("- Vercel app freshness: push/deploy a clean release branch containing the current launch-readiness fixes; do not only redeploy the existing stale production artifact. Then rerun `pnpm check:prod` and the app-host smoke probe:");
      console.log("  PLAYWRIGHT_BASE_URL=https://strelva.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm exec playwright test tests/customer-frontend.spec.ts -g \"signed-out dashboard customers\"");
    }
    if (launchBlockers.includes("Production Live Verification")) {
      console.log("- Production live verification: after env, redeploy, and DNS are resolved, run `PLAYWRIGHT_BASE_URL=https://strelva.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm check:release`, verify root marketing auth reaches /account, invited-owner /dashboard/site access works on admin.greatlakesdriedfruit.com, content edit/preview refresh succeeds, Clerk/Stripe webhook deliveries are successful, and cron 401/success behavior works with CRON_SECRET.");
      console.log("  Cron auth commands:");
      console.log("    curl -i https://strelva.com/api/cron/maintenance");
      console.log('    curl -i -H "Authorization: Bearer $CRON_SECRET" https://strelva.com/api/cron/maintenance');
    }
    console.log("- Launch blockers: clear docs/launch-blockers.md Current Blockers or move each approved waiver to Waived Blockers with Status, Owner, Release note/Ticket/Reference, Follow-up, and Reason.");
  }
  const tenantDnsFailures = results.filter((result) => result.status === "fail" && /^Tenant .+ DNS /.test(result.name));
  const tenantConfigurationFailures = results.filter(
    (result) => result.status === "fail" && /^Tenant .+ (client domain|admin domain|revalidation)$/.test(result.name),
  );
  if (tenantConfigurationFailures.length) {
    console.log("- Tenant configuration: update active tenants before release, or deactivate test tenants that should not be customer-facing:");
    for (const result of tenantConfigurationFailures) {
      console.log(`  ${result.name}: ${result.message}`);
    }
    console.log("  Active launch tenants need a customer-facing productionDomain/customDomains entry, an adminDomain or derivable admin.<productionDomain>, and revalidateUrl plus revalidationSecret.");
  }
  if (tenantDnsFailures.length) {
    console.log("- Tenant DNS: add the missing Vercel/Cloudflare DNS records, wait for propagation, then rerun `pnpm check:prod`:");
    for (const result of tenantDnsFailures) {
      console.log(`  ${result.message}`);
    }
  }
  if (results.some((result) => result.name === "Production site URL" && result.status === "fail")) {
    console.log(`- Production domain routing: ${scaffoldWebDomainAction} Wait for DNS/SSL propagation, then rerun \`pnpm check:prod\`.`);
    console.log("  DNS verification commands:");
    console.log("    vercel domains inspect strelva.com");
    console.log("    dig +short strelva.com A");
    console.log("    dig +short strelva.com NS");
    console.log("    dig +short '*.strelva.com' CNAME");
    console.log("    curl -I -L https://strelva.com/api/health");
  }
  console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  await checkRedis();
  await checkStripe();
  await checkBillingGrandfathering();
  await checkProductionSiteUrl();
  await checkVercelAppFreshness();

  printWebhookUrls();
  printDomainChecklist();
  await checkTenantRevalidation();
  printCronJobs();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const failed = results.filter(r => r.status === "fail").length;
  const warned = results.filter(r => r.status === "warn").length;
  const passed = results.filter(r => r.status === "ok").length;
  const skipped = results.filter(r => r.status === "skip").length;

  console.log(`  Passed:  ${passed}`);
  console.log(`  Warned:  ${warned}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log();

  if (failed > 0) {
    printReleaseActions();
    console.log("\x1b[31m  PRODUCTION NOT READY - Fix the failed checks above.\x1b[0m\n");
    process.exit(1);
  } else if (warned > 0) {
    printReleaseActions();
    console.log("\x1b[33m  PRODUCTION READY (with warnings) - Review warnings above.\x1b[0m\n");
    process.exit(0);
  } else {
    console.log("\x1b[32m  PRODUCTION READY\x1b[0m\n");
    process.exit(0);
  }
}

run().catch(err => {
  console.error("Checklist failed:", err);
  process.exit(1);
});

#!/usr/bin/env npx tsx
/**
 * Production Readiness Checklist for Scaffold Web
 *
 * Run with: npx tsx scripts/production-checklist.ts
 *
 * Validates all external dependencies, env vars, and webhook configurations.
 */

import { createClient } from "@sanity/client";
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
  "REB_CUSTOM_REQUEST_SECRET",
]);

const scaffoldWebDomainAction =
  "Point scaffoldweb.com at Vercel project scaffold-web with A scaffoldweb.com 76.76.21.21 or Vercel nameservers, and remove Porkbun/l.ink forwarding.";
const VERCEL_APP_URL = "https://scaffoldweb.com";
const EXPECTED_SIGN_IN_TITLE = "Sign in to Scaffold Web | Scaffold Web";
const SCAFFOLD_MONTHLY_PRICE_CENTS = 14900;
const SCAFFOLD_MONTHLY_PRICE_CURRENCY = "usd";

const envSourceHints: Record<string, string> = {
  CALENDLY_CLIENT_ID: "Calendly OAuth app client ID",
  CALENDLY_CLIENT_SECRET: "Calendly OAuth app client secret",
  CALENDLY_WEBHOOK_SECRET: "Calendly webhook signing secret",
  CLERK_SECRET_KEY: "Clerk dashboard live instance matching NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  CLERK_WEBHOOK_SECRET: "Clerk webhook endpoint signing secret from the same live Clerk instance as the publishable/secret keys",
  GOOGLE_GENERATIVE_AI_API_KEY: "Google AI Studio production API key",
  GOOGLE_CLIENT_ID: "Google Cloud OAuth client ID",
  GOOGLE_CLIENT_SECRET: "Google Cloud OAuth client secret",
  INSTAGRAM_CLIENT_ID: "Meta app Instagram OAuth client ID",
  INSTAGRAM_CLIENT_SECRET: "Meta app Instagram OAuth client secret",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "Clerk dashboard live instance",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "Set to /sign-in",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: "Set to /sign-up",
  NEXT_PUBLIC_APP_URL: "https://scaffoldweb.com or the deployed control-plane URL used for OAuth callbacks",
  NEXT_PUBLIC_SANITY_PROJECT_ID: "Sanity production project ID",
  NEXT_PUBLIC_SITE_URL: "https://scaffoldweb.com",
  REB_CUSTOM_REQUEST_SECRET: "Shared high-entropy bearer secret for custom storefront /api/reb-custom-request endpoints",
  RESEND_API_KEY: "Resend production API key",
  RESEND_DOMAIN: "Verified Resend sending domain",
  SANITY_API_TOKEN: "Sanity production API token with content read/write permissions",
  SANITY_WEBHOOK_SECRET: "Sanity webhook secret you configure for /api/sanity/webhook",
  SENTRY_DSN: "Sentry project DSN",
  NEXT_PUBLIC_SENTRY_DSN: "Sentry browser/client DSN",
  STRIPE_SCAFFOLD_PRICE_ID: "Stripe live recurring monthly USD price id for exactly $149/month",
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
console.log("  Scaffold Web Production Readiness Checklist");
console.log("═══════════════════════════════════════════════════════════════\n");

console.log("─── Core Auth (Clerk) ───────────────────────────────────────────");
checkEnvVar("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", true);
checkEnvVar("CLERK_SECRET_KEY", true);
checkEnvVar("CLERK_WEBHOOK_SECRET", true);
checkEnvVar("NEXT_PUBLIC_CLERK_SIGN_IN_URL", true, false);
checkEnvVar("NEXT_PUBLIC_CLERK_SIGN_UP_URL", true, false);
checkEnvVar("SUPER_ADMIN_EMAILS", true, false);

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
  "A     scaffoldweb.com    76.76.21.21",
  "cname.vercel-dns.com",
  "MARKETING_DOMAINS=scaffoldweb.com,www.scaffoldweb.com",
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
  "PLAYWRIGHT_BASE_URL=https://scaffoldweb.com",
  "https://scaffoldweb.com/api/health",
  "curl -i https://scaffoldweb.com/api/cron/maintenance",
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
    "vercel env add SANITY_WEBHOOK_SECRET production",
    "vercel env add UPSTASH_REDIS_REST_URL production",
    "vercel env add UPSTASH_REDIS_REST_TOKEN production",
    "vercel env add SENTRY_DSN production",
    "vercel env add NEXT_PUBLIC_SENTRY_DSN production",
    "exactly $149/month",
    "Provider value sources",
    "Clerk Dashboard -> Webhooks",
    "Sanity project webhook settings",
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
    "PLAYWRIGHT_BASE_URL=https://scaffoldweb.com",
    "signed-out dashboard customers",
    "https://scaffoldweb.com/sign-in",
    "Sign in to Scaffold Web | Scaffold Web",
    "Production Live Verification",
    "PLAYWRIGHT_BASE_URL=https://scaffoldweb.com",
    "https://scaffoldweb.com/api/cron/maintenance",
    "https://scaffoldweb.com/api/health",
    "Clerk/Sanity/Stripe webhook deliveries",
    "curl -i https://scaffoldweb.com/api/cron/maintenance",
    'curl -i -H "Authorization: Bearer $CRON_SECRET" https://scaffoldweb.com/api/cron/maintenance',
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

function checkCompletionAudit(path: string) {
  if (!existsSync(path)) {
    log({ name: "Completion audit", status: "fail", message: `${path} is missing` });
    return;
  }

  const content = readFileSync(path, "utf8");
  const requiredTerms = [
    "Current failures from the latest `pnpm check:prod` run",
    "Latest observed checklist summary",
    "Required Production Env Vars",
    "Production Live Verification",
    "Production Domain Routing",
    "Vercel app freshness",
    "inactive internal demo tenant",
    "Rohlax Cloudflare DNS",
    "CLERK_WEBHOOK_SECRET",
    "SANITY_WEBHOOK_SECRET",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "SENTRY_DSN",
    "NEXT_PUBLIC_SENTRY_DSN",
    "price_1TVgq0D99ZGeTugfVuSggW3o",
    "prod_UKnWPSG3QOtOUz",
    "$149/month USD",
    "https://scaffoldweb.com/sign-in",
    "Sign in to Scaffold Web | Scaffold Web",
    "https://scaffoldweb-com.l.ink/",
    "openresty",
    "Full `pnpm check:launch` was rerun",
  ];
  const missing = requiredTerms.filter((term) => !content.includes(term));

  if (missing.length) {
    log({
      name: "Completion audit",
      status: "fail",
      message: `${path} must mirror the current check:prod blockers and latest local launch evidence`,
    });
    return;
  }

  log({ name: "Completion audit", status: "ok", message: `${path} mirrors current production blocker evidence` });
}

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

  if (missing.length || content.includes("--audit-level")) {
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
    "toHaveTitle(/Sign in to Scaffold Web",
    "toHaveTitle(/Sign in to Great Lakes Dried Fruit",
    "toHaveTitle(/Create your dashboard account",
    "toHaveTitle(/Create your Great Lakes Dried Fruit dashboard account",
    "Use the exact email address that received your invite",
    "sign-in page allows Clerk JS to load",
    "cron maintenance endpoint is not public",
    "/api/cron/maintenance",
    "process.env.PLAYWRIGHT_BASE_URL",
    "https://clerk.scaffoldweb.com",
    "not.toHaveURL(/\\/app/)",
  ];
  const missing = requiredTerms.filter((term) => !content.includes(term));
  const signupNoAppOk =
    smoke.includes('test("signup page explains invited email recovery"') &&
    smoke.indexOf('test("signup page explains invited email recovery"') <
      smoke.indexOf("not.toHaveURL(/\\/app/)");

  if (missing.length || !signupNoAppOk) {
    log({
      name: "Access smoke coverage",
      status: "fail",
      message: `${customerPath} and ${smokePath} must cover sign-in, sign-up, account handoff, no-access, admin-host, invited-email, Clerk JS CSP, cron protection, and no /app regressions, including public sign-up`,
    });
    return;
  }

  log({ name: "Access smoke coverage", status: "ok", message: `${customerPath} and ${smokePath} cover sign-in/sign-up recovery paths, account handoff, Clerk JS CSP, and cron protection` });
}

checkAccessSmokeCoverage("tests/customer-frontend.spec.ts", "tests/smoke.spec.ts");

function checkAuthAccessPages(
  signInClientPath: string,
  signInPagePath: string,
  signUpPath: string,
  noAccessPath: string,
  accountPath: string,
  recoveryButtonPath: string,
) {
  const missingFiles = [signInClientPath, signInPagePath, signUpPath, noAccessPath, accountPath, recoveryButtonPath].filter((path) => !existsSync(path));
  if (missingFiles.length) {
    log({ name: "Auth access pages", status: "fail", message: `${missingFiles.join(", ")} missing` });
    return;
  }

  const signIn = readFileSync(signInClientPath, "utf8");
  const signInPage = readFileSync(signInPagePath, "utf8");
  const signUp = readFileSync(signUpPath, "utf8");
  const noAccess = readFileSync(noAccessPath, "utf8");
  const account = readFileSync(accountPath, "utf8");
  const recoveryButton = readFileSync(recoveryButtonPath, "utf8");
  const authPagesOk =
    signIn.includes("forceRedirectUrl={postSignInUrl}") &&
    signIn.includes("fallbackRedirectUrl={postSignInUrl}") &&
    signIn.includes('signUpUrl={getAuthSwitchUrl("/sign-up", invitedEmail)}') &&
    signIn.includes("initialValues={invitedEmail ? { emailAddress: invitedEmail } : undefined}") &&
    signIn.includes("Invited email:") &&
    signInPage.includes("getInvitedEmail(params)") &&
    signInPage.includes("getClientFallbackRoot(requestHeaders)") &&
    signInPage.includes('withClientFallbackRoot(clientFallbackRoot, "/dashboard")') &&
    signInPage.includes('"/account"') &&
    signInPage.includes('"/dashboard"') &&
    signUp.includes("forceRedirectUrl={postSignUpUrl}") &&
    signUp.includes("fallbackRedirectUrl={postSignUpUrl}") &&
    signUp.includes('signInUrl={getAuthSwitchUrl("/sign-in", invitedEmail)}') &&
    signUp.includes("initialValues={invitedEmail ? { emailAddress: invitedEmail } : undefined}") &&
    signUp.includes("Invited email:") &&
    signUp.includes("getTenantFromHeaders") &&
    signUp.includes("getTenantConfig") &&
    signUp.includes("getSignUpTitle(siteName)") &&
    signUp.includes("getClientFallbackRoot(requestHeaders)") &&
    signUp.includes('withClientFallbackRoot(clientFallbackRoot, "/dashboard")') &&
    signUp.includes('"/account"') &&
    signUp.includes('"/dashboard"') &&
    [signIn, signUp].every((content) =>
      content.includes("mailto:jacob@scaffoldweb.com") &&
      content.includes("form is not loading") &&
      !content.includes('"/app"')
    );
  const metadataOk =
    signInPage.includes("Sign in to ${siteName}") &&
    signInPage.includes("email address from your invite") &&
    signUp.includes("title: getSignUpTitle(siteName)") &&
    signUp.includes("exact email address from your ${siteName} invite");
  const noAccessOk =
    noAccess.includes("UseInvitedEmailButton") &&
    noAccess.includes("signs you out so you can choose that account") &&
    noAccess.includes('withClientFallbackRoot(clientFallbackRoot, "/sign-in")') &&
    noAccess.includes("mailto:jacob@scaffoldweb.com") &&
    noAccess.includes('href="/account"') &&
    noAccess.includes("Choose another site") &&
    !noAccess.includes('href="/"');
  const accountRecoveryOk =
    account.includes("No invited sites on this account") &&
    account.includes("UseInvitedEmailButton") &&
    account.includes("signs you out so you can choose that account") &&
    account.includes("Request a free site") &&
    account.includes("mailto:jacob@scaffoldweb.com") &&
    account.includes("!tenantConfigs.some(({ config }) => config)") &&
    account.includes("return <NoAccessState />");
  const recoveryButtonOk =
    recoveryButton.includes("SignOutButton") &&
    recoveryButton.includes('redirectUrl = "/sign-in"') &&
    recoveryButton.includes("redirectUrl={redirectUrl}") &&
    recoveryButton.includes("{button}</SignOutButton>") &&
    recoveryButton.includes("Use invited email");

  if (!authPagesOk || !metadataOk || !noAccessOk || !accountRecoveryOk || !recoveryButtonOk) {
    log({
      name: "Auth access pages",
      status: "fail",
      message: "Auth pages must route marketing-host auth through /account, route tenant/admin auth to /dashboard, avoid /app, include support email, provide tenant-aware invite-focused metadata, and keep no-access/account recovery paths focused on the invited email",
    });
    return;
  }

  log({ name: "Auth access pages", status: "ok", message: "Sign-in, sign-up, and no-access recovery are aligned with invite-focused metadata and host-aware redirects" });
}

checkAuthAccessPages(
  "src/app/sign-in/[[...sign-in]]/SignInClient.tsx",
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
  const adminOk =
    adminPage.includes("<InviteButton") &&
    adminPage.includes("ownerEmail={t.ownerEmail}") &&
    adminPage.includes("tenantId={t.id}");
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

checkAdminInviteFlow("src/app/admin/page.tsx", "src/app/admin/InviteButton.tsx", "src/app/api/admin/invites/route.ts");

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
  publicContent: string;
  publicPageConfig: string;
  publicSiteCapabilities: string;
  v1Content: string;
  v1PageConfig: string;
  v1SiteCapabilities: string;
}) {
  const missingFiles = Object.values(paths).filter((path) => !existsSync(path));
  if (missingFiles.length) {
    log({ name: "Public storefront API", status: "fail", message: `${missingFiles.join(", ")} missing` });
    return;
  }

  const publicContent = readFileSync(paths.publicContent, "utf8");
  const publicPageConfig = readFileSync(paths.publicPageConfig, "utf8");
  const publicSiteCapabilities = readFileSync(paths.publicSiteCapabilities, "utf8");
  const v1Content = readFileSync(paths.v1Content, "utf8");
  const v1PageConfig = readFileSync(paths.v1PageConfig, "utf8");
  const v1SiteCapabilities = readFileSync(paths.v1SiteCapabilities, "utf8");
  const contentOk =
    publicContent.includes("/^[a-z0-9-]+$/.test(tenant)") &&
    publicContent.includes("getTenantConfig(tenant)") &&
    publicContent.includes("config.active === false") &&
    publicContent.includes("isValidSection(section, tenant)") &&
    publicContent.includes("getSiteCapabilityManifest(tenant)") &&
    publicContent.includes("getContent(section as ContentSection, tenant");
  const pageConfigOk =
    publicPageConfig.includes("/^[a-z0-9-]+$/.test(tenant)") &&
    publicPageConfig.includes("getTenantConfig(tenant)") &&
    publicPageConfig.includes("config.active === false") &&
    publicPageConfig.includes("getSiteCapabilityManifest(tenant)") &&
    publicPageConfig.includes("getPageConfig(tenant)");
  const siteCapabilitiesOk =
    publicSiteCapabilities.includes("/^[a-z0-9-]+$/.test(tenant)") &&
    publicSiteCapabilities.includes("getTenantConfig(tenant)") &&
    publicSiteCapabilities.includes("config.active === false") &&
    publicSiteCapabilities.includes("getSiteCapabilityManifest(tenant)");
  const aliasesOk =
    v1Content.includes('from "@/app/api/public/content/[tenant]/[section]/route"') &&
    v1Content.includes("return publicContentGET(") &&
    v1PageConfig.includes('from "@/app/api/public/page-config/[tenant]/route"') &&
    v1PageConfig.includes("return publicPageConfigGET(") &&
    v1SiteCapabilities.includes('from "@/app/api/public/site-capabilities/[tenant]/route"') &&
    v1SiteCapabilities.includes("return publicSiteCapabilitiesGET(");

  if (!contentOk || !pageConfigOk || !siteCapabilitiesOk || !aliasesOk) {
    log({
      name: "Public storefront API",
      status: "fail",
      message: "/api/v1 storefront APIs must stay thin aliases to public routes, and public routes must validate tenant slugs, active tenants, and allowed content sections before reading storage",
    });
    return;
  }

  log({
    name: "Public storefront API",
    status: "ok",
    message: "/api/v1 storefront APIs remain public read-only aliases with tenant and section validation",
  });
}

checkPublicStorefrontApi({
  publicContent: "src/app/api/public/content/[tenant]/[section]/route.ts",
  publicPageConfig: "src/app/api/public/page-config/[tenant]/route.ts",
  publicSiteCapabilities: "src/app/api/public/site-capabilities/[tenant]/route.ts",
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

function checkClerkWebhookRoute(path: string) {
  if (!existsSync(path)) {
    log({ name: "Clerk webhook route", status: "fail", message: `${path} is missing` });
    return;
  }

  const content = readFileSync(path, "utf8");
  const requiredTerms = [
    "CLERK_WEBHOOK_SECRET",
    "Webhook secret not configured",
    "svix-id",
    "svix-timestamp",
    "svix-signature",
    "wh.verify",
    "Invalid signature",
    "user.created",
    "consumeInvite",
    "assignUserToTenant",
  ];
  const missing = requiredTerms.filter((term) => !content.includes(term));

  if (missing.length) {
    log({
      name: "Clerk webhook route",
      status: "fail",
      message: `${path} must fail closed and auto-assign invited users from signed Clerk user.created events`,
    });
    return;
  }

  log({ name: "Clerk webhook route", status: "ok", message: `${path} verifies signed user.created events` });
}

checkClerkWebhookRoute("src/app/api/clerk/webhook/route.ts");

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
      proxy.includes("const isCronRoute = createRouteMatcher([\"/api/cron/(.*)\"]);") &&
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
    execFileSync("pnpm", ["audit"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    });
    log({
      name: "Dependency audit",
      status: "ok",
      message: "pnpm audit found no known vulnerabilities",
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

console.log("\n─── Content Storage (Sanity) ────────────────────────────────────");
const hasSanityProject = checkEnvVar("NEXT_PUBLIC_SANITY_PROJECT_ID", true, false);
checkEnvVar("NEXT_PUBLIC_SANITY_DATASET", false, false);
const hasSanityToken = checkEnvVar("SANITY_API_TOKEN", true);
checkEnvVar("SANITY_WEBHOOK_SECRET", true);

console.log("\n─── Redis (Upstash) ─────────────────────────────────────────────");
const hasRedisUrl = checkEnvVar("UPSTASH_REDIS_REST_URL", true, false);
const hasRedisToken = checkEnvVar("UPSTASH_REDIS_REST_TOKEN", true);

console.log("\n─── Billing (Stripe) ────────────────────────────────────────────");
const hasStripeKey = checkEnvVar("STRIPE_SECRET_KEY", true);
checkEnvVar("STRIPE_SCAFFOLD_PRICE_ID", true, false);
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
checkEnvVar("REB_CUSTOM_REQUEST_SECRET", true);

console.log("\n─── Monitoring & Notifications ──────────────────────────────────");
checkEnvVar("SENTRY_DSN", true, false);
checkEnvVar("NEXT_PUBLIC_SENTRY_DSN", true, false);
checkEnvVar("SLACK_WEBHOOK_URL", false, false);
checkEnvVar("FOUNDER_CLERK_USER_ID", false, false);

console.log("\n─── SMS (Twilio) ────────────────────────────────────────────────");
const hasTwilioSid = checkEnvVar("TWILIO_ACCOUNT_SID", false, false);
const hasTwilioToken = checkEnvVar("TWILIO_AUTH_TOKEN", false);
checkEnvVar("TWILIO_PHONE_NUMBER", false, false);
checkEnvVar("SMS_SUGGESTIONS_ENABLED", false, false);

console.log("\n─── OAuth Connections ───────────────────────────────────────────");
const hasGoogleOAuth = checkOptionalPair("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "Google");
const hasInstagramOAuth = checkOptionalPair("INSTAGRAM_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET", "Instagram");
const hasCalendlyOAuth = checkOptionalPair("CALENDLY_CLIENT_ID", "CALENDLY_CLIENT_SECRET", "Calendly");
const hasAnyOAuth = hasGoogleOAuth || hasInstagramOAuth || hasCalendlyOAuth;
checkRequiredWhen(hasAnyOAuth, "NEXT_PUBLIC_APP_URL", "OAuth redirects need the deployed app URL", false);

console.log("\n─── External Webhook Secrets ────────────────────────────────────");
checkEnvVar("VEGARO_WEBHOOK_SECRET", false);
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

async function checkSanity() {
  if (!hasSanityProject || !hasSanityToken) {
    log({ name: "Sanity connectivity", status: "skip", message: "Missing credentials" });
    return;
  }

  try {
    const client = createClient({
      projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
      dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
      apiVersion: "2024-01-01",
      useCdn: false,
      token: process.env.SANITY_API_TOKEN,
    });

    const count = await client.fetch<number>(`count(*[_type == "tenant"])`);
    log({ name: "Sanity connectivity", status: "ok", message: `Connected (${count} tenants)` });

    // Check if dataset exists and has tenant data
    if (count === 0) {
      log({ name: "Sanity dataset health", status: "warn", message: "No tenants in dataset" });
    } else {
      log({ name: "Sanity dataset health", status: "ok", message: `${count} tenant(s) configured` });
    }
  } catch (err) {
    log({ name: "Sanity connectivity", status: "fail", message: `Error: ${(err as Error).message}` });
  }
}

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

    // Check price ID
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
        if (
          amount !== SCAFFOLD_MONTHLY_PRICE_CENTS ||
          interval !== "month" ||
          currency !== SCAFFOLD_MONTHLY_PRICE_CURRENCY
        ) {
          failedEnvVars.add("STRIPE_SCAFFOLD_PRICE_ID");
          log({
            name: "Stripe price ID",
            status: "fail",
            message: `Expected $149/month USD for Scaffold Web; got ${amount ? `$${amount / 100}` : "custom"}/${interval || "one-time"} ${currency.toUpperCase()}. Current Stripe price details: ${priceSummary}. Create or select the live $149 monthly Stripe price and update STRIPE_SCAFFOLD_PRICE_ID.`,
          });
          return;
        }
        log({
          name: "Stripe price ID",
          status: "ok",
          message: "Valid ($149/month USD)",
        });
      } catch {
        failedEnvVars.add("STRIPE_SCAFFOLD_PRICE_ID");
        log({ name: "Stripe price ID", status: "fail", message: "Invalid price ID" });
      }
    }
  } catch (err) {
    log({ name: "Stripe connectivity", status: "fail", message: `Error: ${(err as Error).message}` });
  }
}

async function checkTwilio() {
  if (!hasTwilioSid || !hasTwilioToken) {
    log({ name: "Twilio connectivity", status: "skip", message: "Not configured" });
    return;
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (res.ok) {
      const data = await res.json();
      log({ name: "Twilio connectivity", status: "ok", message: `Account: ${data.friendly_name}` });
    } else {
      log({ name: "Twilio connectivity", status: "fail", message: `HTTP ${res.status}` });
    }
  } catch (err) {
    log({ name: "Twilio connectivity", status: "fail", message: `Error: ${(err as Error).message}` });
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
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://scaffoldweb.com";

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Webhook URLs (configure in external services)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("Clerk Webhook:");
  console.log(`  URL: ${baseUrl}/api/clerk/webhook`);
  console.log("  Events: user.created");
  console.log("  Secret: Set CLERK_WEBHOOK_SECRET to match\n");

  console.log("Stripe Webhook:");
  console.log(`  URL: ${baseUrl}/api/billing/webhook`);
  console.log("  Events: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted");
  console.log("  Secret: Set STRIPE_WEBHOOK_SECRET to match\n");

  console.log("Sanity Webhook:");
  console.log(`  URL: ${baseUrl}/api/sanity/webhook`);
  console.log("  Trigger: on create/update/delete");
  console.log("  Filter: _type in ['tenant', 'hero', 'services', 'story', ...] && defined(tenant)");
  console.log("  Secret: Set SANITY_WEBHOOK_SECRET to match\n");

  console.log("Twilio SMS Webhook:");
  console.log(`  URL: ${baseUrl}/api/sms/webhook`);
  console.log("  Method: HTTP POST");
  console.log("  Note: Signature validated via TWILIO_AUTH_TOKEN\n");

  console.log("Calendly Webhook (if using):");
  console.log(`  URL: ${baseUrl}/api/webhooks/calendly`);
  console.log("  Secret: Set CALENDLY_WEBHOOK_SECRET to match\n");

  console.log("Vegaro Webhook (if using):");
  console.log(`  URL: ${baseUrl}/api/webhooks/vegaro`);
  console.log("  Secret: Set VEGARO_WEBHOOK_SECRET to match\n");
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

  if (!hasSanityProject || !hasSanityToken) {
    console.log("  (Skipped - Sanity not configured)\n");
    return;
  }

  try {
    const client = createClient({
      projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
      dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
      apiVersion: "2024-01-01",
      useCdn: false,
      token: process.env.SANITY_API_TOKEN,
    });

    const tenants = await client.fetch<Array<{
      id: string;
      name: string;
      active?: boolean;
      productionDomain?: string;
      adminDomain?: string;
      siteUrl?: string;
      customDomains?: string[];
      revalidateUrl?: string;
      revalidationSecret?: string;
    }>>(`*[_type == "tenant"] { id, name, active, productionDomain, adminDomain, siteUrl, customDomains, revalidateUrl, revalidationSecret }`);

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
  const domains = [productionDomain, wwwDomain, adminDomain].filter(Boolean);

  for (const domain of domains) {
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
      status: "fail",
      message: `${dnsContext} Add the domain in Vercel and create DNS record "A ${domain} 76.76.21.21" before treating tenant ${tenant.id} as production-routable.`,
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
    { path: "/api/cron/sms-suggestion", schedule: "0 15 * * 1", desc: "SMS suggestions (Mon 3pm UTC)" },
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
    console.log("  PLAYWRIGHT_BASE_URL=https://scaffoldweb.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm exec playwright test tests/customer-frontend.spec.ts -g \"signed-out dashboard customers\"");
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

  if (failedEnvs.includes("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") || failedEnvs.includes("CLERK_SECRET_KEY")) {
    console.log("- Clerk: switch to live keys, then verify signed-out /dashboard and /no-access reach /sign-in, root marketing-host auth finishes at /account, and admin.greatlakesdriedfruit.com reaches the same invited-email sign-in flow before finishing at /dashboard.");
  }
  if (
    failedEnvs.includes("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") ||
    failedEnvs.includes("CLERK_SECRET_KEY") ||
    failedEnvs.includes("CLERK_WEBHOOK_SECRET") ||
    failedEnvs.includes("RESEND_API_KEY") ||
    failedEnvs.includes("RESEND_DOMAIN")
  ) {
    console.log("- Customer access: after Clerk and Resend are live, open /admin as a super admin, use Invite for each tenant ownerEmail, and verify the customer signs up or signs in with the exact invited email, the email stays prefilled when switching between sign-up and sign-in, scaffoldweb.com auth reaches /account, and admin.greatlakesdriedfruit.com auth reaches /dashboard/site.");
  }
  if (failedEnvs.includes("CLERK_WEBHOOK_SECRET")) {
    console.log("- Clerk webhook: configure https://scaffoldweb.com/api/clerk/webhook for user.created.");
  }
  if (failedEnvs.includes("SANITY_WEBHOOK_SECRET")) {
    console.log("- Sanity webhook: configure https://scaffoldweb.com/api/sanity/webhook for content create/update/delete events with the matching SANITY_WEBHOOK_SECRET.");
  }
  if (failedEnvs.includes("STRIPE_WEBHOOK_SECRET")) {
    console.log("- Stripe webhook: configure https://scaffoldweb.com/api/billing/webhook for checkout.session.completed, invoice.paid, invoice.payment_failed, and customer.subscription.deleted with the matching STRIPE_WEBHOOK_SECRET.");
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
      console.log("  PLAYWRIGHT_BASE_URL=https://scaffoldweb.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm exec playwright test tests/customer-frontend.spec.ts -g \"signed-out dashboard customers\"");
    }
    if (launchBlockers.includes("Production Live Verification")) {
      console.log("- Production live verification: after env, redeploy, and DNS are resolved, run `PLAYWRIGHT_BASE_URL=https://scaffoldweb.com PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com pnpm check:release`, verify root marketing auth reaches /account, invited-owner /dashboard/site access works on admin.greatlakesdriedfruit.com, content edit/preview refresh succeeds, Clerk/Sanity/Stripe webhook deliveries are successful, and cron 401/success behavior works with CRON_SECRET.");
      console.log("  Cron auth commands:");
      console.log("    curl -i https://scaffoldweb.com/api/cron/maintenance");
      console.log('    curl -i -H "Authorization: Bearer $CRON_SECRET" https://scaffoldweb.com/api/cron/maintenance');
    }
    console.log("- Launch blockers: clear docs/launch-blockers.md Current Blockers or move each approved waiver to Waived Blockers with Status, Owner, Release note/Ticket/Reference, Follow-up, and Reason.");
  }
  const tenantDnsFailures = results.filter((result) => result.status === "fail" && /^Tenant .+ DNS /.test(result.name));
  const tenantConfigurationFailures = results.filter(
    (result) => result.status === "fail" && /^Tenant .+ (client domain|admin domain|revalidation)$/.test(result.name),
  );
  if (tenantConfigurationFailures.length) {
    console.log("- Tenant configuration: update active Sanity tenants before release, or deactivate test tenants that should not be customer-facing:");
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
    console.log("    vercel domains inspect scaffoldweb.com");
    console.log("    dig +short scaffoldweb.com A");
    console.log("    dig +short scaffoldweb.com NS");
    console.log("    dig +short '*.scaffoldweb.com' CNAME");
    console.log("    curl -I -L https://scaffoldweb.com/api/health");
  }
  console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  await checkSanity();
  await checkRedis();
  await checkStripe();
  await checkTwilio();
  await checkProductionSiteUrl();
  await checkVercelAppFreshness();

  printWebhookUrls();
  printDomainChecklist();
  await checkTenantRevalidation();
  printCronJobs();
  checkCompletionAudit("docs/completion-audit.md");

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

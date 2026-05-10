import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getLaunchBlockerError,
  getTenantLaunchReadinessResults,
  validateProductionEnvValue,
} from "../lib/production-readiness-rules";

describe("production readiness rules", () => {
  it("rejects Clerk test keys for production launch", () => {
    expect(validateProductionEnvValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_example"))
      .toBe("Must start with pk_live_ for production launch");
    expect(validateProductionEnvValue("CLERK_SECRET_KEY", "sk_test_example"))
      .toBe("Must start with sk_live_ for production launch");
  });

  it("rejects copied production placeholder values", () => {
    expect(validateProductionEnvValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_..."))
      .toBe("Must replace placeholder value for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_SITE_URL", "https://<deployment-url>"))
      .toBe("Must replace placeholder value for production launch");
    expect(validateProductionEnvValue("SANITY_API_TOKEN", "your_sanity_token"))
      .toBe("Must replace placeholder value for production launch");
  });

  it("rejects copied Vercel values with wrapping quotes or literal newline text", () => {
    expect(validateProductionEnvValue("NEXT_PUBLIC_SITE_URL", "\"https://scaffoldweb.com\""))
      .toBe("Must not include wrapping quotes in the stored Vercel value");
    expect(validateProductionEnvValue("CUSTOM_DOMAIN_MAP", "{\"example.com\":\"demo\"}\\n"))
      .toBe("Must not include a literal \\n; remove copied newline text in Vercel");
  });

  it("requires Clerk to use the app-owned access routes", () => {
    expect(validateProductionEnvValue("NEXT_PUBLIC_CLERK_SIGN_IN_URL", "/app"))
      .toBe("Must be /sign-in for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_CLERK_SIGN_UP_URL", "/app"))
      .toBe("Must be /sign-up for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_CLERK_SIGN_IN_URL", "/sign-in")).toBeNull();
    expect(validateProductionEnvValue("NEXT_PUBLIC_CLERK_SIGN_UP_URL", "/sign-up")).toBeNull();
  });

  it("requires a strong OAuth state signing secret", () => {
    expect(validateProductionEnvValue("OAUTH_STATE_SECRET", "short"))
      .toBe("Must be at least 32 characters for production launch");
    expect(validateProductionEnvValue("OAUTH_STATE_SECRET", "0123456789abcdef0123456789abcdef")).toBeNull();
  });

  it("accepts live-shaped production credentials", () => {
    expect(validateProductionEnvValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_example")).toBeNull();
    expect(validateProductionEnvValue("CLERK_SECRET_KEY", "sk_live_example")).toBeNull();
    expect(validateProductionEnvValue("CLERK_WEBHOOK_SECRET", "whsec_example")).toBeNull();
    expect(validateProductionEnvValue("SUPER_ADMIN_EMAILS", "owner@example.com,admin@example.com")).toBeNull();
    expect(validateProductionEnvValue("GOOGLE_GENERATIVE_AI_API_KEY", "AIzaSyExample")).toBeNull();
    expect(validateProductionEnvValue("NEXT_PUBLIC_SANITY_PROJECT_ID", "abc123")).toBeNull();
    expect(validateProductionEnvValue("SANITY_API_TOKEN", "s".repeat(20))).toBeNull();
    expect(validateProductionEnvValue("SANITY_WEBHOOK_SECRET", "s".repeat(16))).toBeNull();
    expect(validateProductionEnvValue("STRIPE_SECRET_KEY", "sk_live_example")).toBeNull();
    expect(validateProductionEnvValue("STRIPE_SCAFFOLD_PRICE_ID", "price_example")).toBeNull();
    expect(validateProductionEnvValue("RESEND_API_KEY", "re_example")).toBeNull();
    expect(validateProductionEnvValue("RESEND_DOMAIN", "updates.scaffoldweb.com")).toBeNull();
    expect(validateProductionEnvValue("SENTRY_DSN", "https://public@sentry.example.com/1")).toBeNull();
    expect(validateProductionEnvValue("NEXT_PUBLIC_SENTRY_DSN", "https://public@sentry.example.com/1")).toBeNull();
  });

  it("rejects malformed production identity and provider values", () => {
    expect(validateProductionEnvValue("SUPER_ADMIN_EMAILS", "not-an-email"))
      .toBe("Must be a comma-separated list of valid emails for production launch");
    expect(validateProductionEnvValue("GOOGLE_GENERATIVE_AI_API_KEY", "not-google"))
      .toBe("Must start with AIza for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_SANITY_PROJECT_ID", "abc-123"))
      .toBe("Must be a Sanity project id for production launch");
    expect(validateProductionEnvValue("SANITY_API_TOKEN", "short"))
      .toBe("Must be at least 20 characters for production launch");
    expect(validateProductionEnvValue("SANITY_WEBHOOK_SECRET", "short"))
      .toBe("Must be at least 16 characters for production launch");
    expect(validateProductionEnvValue("RESEND_DOMAIN", "https://updates.scaffoldweb.com"))
      .toBe("Must be a bare domain like updates.scaffoldweb.com for production launch");
    expect(validateProductionEnvValue("SENTRY_DSN", "http://sentry.example.com/1"))
      .toBe("Must be an https:// URL for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_SENTRY_DSN", "https://localhost/1"))
      .toBe("Must not point at localhost for production launch");
  });

  it("rejects local or non-HTTPS production URLs", () => {
    expect(validateProductionEnvValue("NEXT_PUBLIC_SITE_URL", "http://scaffoldweb.com"))
      .toBe("Must be an https:// URL for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_SITE_URL", "https://localhost:3000"))
      .toBe("Must not point at localhost for production launch");
    expect(validateProductionEnvValue("UPSTASH_REDIS_REST_URL", "http://redis.example.com"))
      .toBe("Must be an https:// URL for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_APP_URL", "http://scaffoldweb.com"))
      .toBe("Must be an https:// URL for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_APP_URL", "https://127.0.0.1:3100"))
      .toBe("Must not point at localhost for production launch");
  });

  it("validates optional domain routing env values when present", () => {
    expect(validateProductionEnvValue("CUSTOM_DOMAIN_MAP", '{"greatlakesdriedfruit.com":"gldf"}')).toBeNull();
    expect(validateProductionEnvValue("MARKETING_DOMAINS", "scaffoldweb.com,www.scaffoldweb.com")).toBeNull();

    expect(validateProductionEnvValue("CUSTOM_DOMAIN_MAP", "not json"))
      .toBe("Must be valid JSON mapping bare domains to tenant IDs for production launch");
    expect(validateProductionEnvValue("CUSTOM_DOMAIN_MAP", '{"https://example.com":"tenant"}'))
      .toBe('Must map bare domains to tenant IDs like {"example.com":"tenant-id"}');
    expect(validateProductionEnvValue("CUSTOM_DOMAIN_MAP", '{"example.com":"Tenant ID"}'))
      .toBe('Must map bare domains to tenant IDs like {"example.com":"tenant-id"}');
    expect(validateProductionEnvValue("MARKETING_DOMAINS", "https://scaffoldweb.com"))
      .toBe("Must be a comma-separated list of bare domains for production launch");
  });

  it("classifies launch blockers and waiver metadata", () => {
    expect(getLaunchBlockerError(`
## Current Blockers

### Missing env

- Status: blocked.

## Waived Blockers
`)).toContain("contains unresolved blockers (Missing env)");

    expect(getLaunchBlockerError(`
## Current Blockers

### Stripe Price

STRIPE_SCAFFOLD_PRICE_ID is wrong.

## Waived Blockers
`)).toContain("contains unresolved blockers (Stripe Price)");

    expect(getLaunchBlockerError(`
## Current Blockers

## Waived Blockers

### Missing env

- Status: waived
- Owner: owner@example.com
- Reason: accepted for this release
`)).toContain("contains waived blockers without status, owner, release/ticket reference, follow-up date, and reason");

    expect(getLaunchBlockerError(`
## Current Blockers

## Waived Blockers

### Missing env

- Status: waived
- Owner: owner@example.com
- Release note: PR-123
- Follow-up: 2026-05-15
- Reason: accepted for this release
`)).toBeNull();
  });

  it("fails active tenants without launch domains or revalidation", () => {
    const results = getTenantLaunchReadinessResults({ id: "demo", active: true });

    expect(results).toEqual([
      {
        name: "Tenant demo client domain",
        status: "fail",
        message: "Active tenant has no customer-facing productionDomain/customDomains entry configured",
      },
      {
        name: "Tenant demo admin domain",
        status: "fail",
        message: "Active tenant has no admin domain and none can be derived",
      },
      {
        name: "Tenant demo revalidation",
        status: "fail",
        message: "Active tenant has no revalidateUrl configured",
      },
    ]);
  });

  it("passes configured active tenant launch domains and revalidation", () => {
    const results = getTenantLaunchReadinessResults({
      id: "gldf",
      active: true,
      productionDomain: "https://greatlakesdriedfruit.com/store",
      revalidateUrl: "https://greatlakesdriedfruit.com/api/v1/revalidate",
      revalidationSecret: "secret",
    });

    expect(results).toEqual([
      {
        name: "Tenant gldf client domain",
        status: "ok",
        message: "greatlakesdriedfruit.com",
      },
      {
        name: "Tenant gldf admin domain",
        status: "ok",
        message: "admin.greatlakesdriedfruit.com",
      },
      {
        name: "Tenant gldf revalidation",
        status: "ok",
        message: "URL set, secret configured",
      },
    ]);
  });

  it("keeps sensitive tenant write routes behind role permissions", () => {
    const permissionProtectedWriteRoutes = [
      "src/app/api/agent/route.ts",
      "src/app/api/booking/[id]/route.ts",
      "src/app/api/booking/config/route.ts",
      "src/app/api/connections/calendly/route.ts",
      "src/app/api/connections/google/route.ts",
      "src/app/api/connections/instagram/route.ts",
      "src/app/api/connections/vegaro/route.ts",
      "src/app/api/connections/yelp/route.ts",
      "src/app/api/content/[section]/versions/route.ts",
      "src/app/api/events/[id]/route.ts",
      "src/app/api/media/route.ts",
      "src/app/api/newsletter/send/route.ts",
      "src/app/api/oauth/calendly/route.ts",
      "src/app/api/oauth/google/route.ts",
      "src/app/api/oauth/instagram/route.ts",
      "src/app/api/offboarding/request/route.ts",
      "src/app/api/page-config/route.ts",
      "src/app/api/queue/[id]/route.ts",
      "src/app/api/reviews/route.ts",
      "src/app/api/rewards/members/[email]/adjust/route.ts",
      "src/app/api/social/route.ts",
      "src/app/api/suggestions/route.ts",
      "src/app/api/upload/route.ts",
    ];

    for (const route of permissionProtectedWriteRoutes) {
      const source = readFileSync(path.join(process.cwd(), route), "utf8");

      expect(source, route).toContain("requireTenantPermission");
    }

    const subscriptionProtectedWriteRoutes = [
      "src/app/api/agent/route.ts",
      "src/app/api/booking/[id]/route.ts",
      "src/app/api/booking/config/route.ts",
      "src/app/api/connections/vegaro/route.ts",
      "src/app/api/connections/yelp/route.ts",
      "src/app/api/content/[section]/versions/route.ts",
      "src/app/api/events/[id]/route.ts",
      "src/app/api/media/route.ts",
      "src/app/api/newsletter/send/route.ts",
      "src/app/api/oauth/calendly/route.ts",
      "src/app/api/oauth/google/route.ts",
      "src/app/api/oauth/instagram/route.ts",
      "src/app/api/page-config/route.ts",
      "src/app/api/queue/[id]/route.ts",
      "src/app/api/reviews/route.ts",
      "src/app/api/rewards/members/[email]/adjust/route.ts",
      "src/app/api/social/route.ts",
      "src/app/api/suggestions/route.ts",
      "src/app/api/upload/route.ts",
    ];

    for (const route of subscriptionProtectedWriteRoutes) {
      const source = readFileSync(path.join(process.cwd(), route), "utf8");

      expect(source, route).toContain("requireActiveSubscription");
    }
  });

  it("normalizes invite emails before access assignment", () => {
    const invite = readFileSync(path.join(process.cwd(), "src/app/api/admin/invites/route.ts"), "utf8");
    const assign = readFileSync(path.join(process.cwd(), "src/app/api/admin/tenants/assign/route.ts"), "utf8");
    const adminPage = readFileSync(path.join(process.cwd(), "src/app/admin/page.tsx"), "utf8");
    const inviteButton = readFileSync(path.join(process.cwd(), "src/app/admin/InviteButton.tsx"), "utf8");

    for (const source of [invite, assign]) {
      expect(source).toContain("normalizeEmail");
      expect(source).toContain("trim().toLowerCase()");
      expect(source).toContain("emailAddress: [email]");
      expect(source).not.toContain("emailAddress: [rawEmail]");
    }

    const inviteEmail = readFileSync(path.join(process.cwd(), "src/lib/invite-email.ts"), "utf8");

    expect(invite).toContain("createInvite(email");
    expect(invite).toContain("buildInviteEmailHtml");
    expect(invite).toContain("buildInviteEmailText");
    expect(invite).toContain("sanitizeEmailSubjectText");
    expect(invite).toContain("text: buildInviteEmailText");
    expect(invite).toContain("getInviteSignUpUrl");
    expect(invite).toContain("url.searchParams.set(\"email\", email)");
    expect(invite).toContain('getTenantDashboardUrl(tenantConfig, "/sign-up", "production")');
    expect(invite).toContain("buildInviteEmailHtml({ email, siteName: tenantConfig.siteName, signUpUrl })");
    expect(invite).toContain("buildInviteEmailText({ email, siteName: tenantConfig.siteName, signUpUrl })");
    expect(inviteEmail).toContain("function escapeHtml");
    expect(inviteEmail).toContain("buildInviteEmailText");
    expect(inviteEmail).toContain("safeSiteName");
    expect(inviteEmail).toContain("safeSignUpUrl");
    expect(inviteEmail).toContain("safeEmail");
    expect(inviteEmail).toContain("Use <strong>${safeEmail}</strong>");
    expect(inviteEmail).toContain("replace(/<[^>]*>/g");
    expect(inviteEmail).toContain("replace(/[\\r\\n\\t]+/g");
    expect(inviteEmail).toContain("<strong>${safeSiteName}</strong>");
    expect(inviteEmail).toContain('href="${safeSignUpUrl}"');
    expect(adminPage).toContain("<InviteButton");
    expect(adminPage).toContain("ownerEmail={t.ownerEmail}");
    expect(inviteButton).toContain('fetch("/api/admin/invites"');
    expect(inviteButton).toContain("Access is assigned to this exact email on signup");
    expect(inviteButton).toContain("signUpUrl?: string");
    expect(inviteButton).toContain("data.signUpUrl");
    expect(inviteButton).toContain("Open manual signup link");
    expect(inviteButton).toContain("Share this link only with");
    expect(inviteButton).toContain("Access is tied to that exact email");
    expect(inviteButton).toContain("navigator.clipboard.writeText");
    expect(inviteButton).toContain("Copy failed. Select the manual signup link above.");
    expect(inviteButton).toContain("Copy signup link");
    expect(inviteButton).toContain('role="dialog"');
    expect(inviteButton).toContain('htmlFor="invite-email"');
    expect(inviteButton).toContain('role="status"');
  });

  it("normalizes admin tenant setup request bodies", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/api/admin/tenants/route.ts"), "utf8");

    expect(source).toContain("readJsonObject(req)");
    expect(source).toContain("Invalid request body");
    expect(source).toContain("cleanString(rawSiteName)");
    expect(source).toContain("cleanString(rawOwnerName)");
    expect(source).toContain("cleanString(rawOwnerEmail)");
    expect(source).toContain("cleanString(rawSubdomain)");
    expect(source).toContain("cleanFeatures(features)");
    expect(source).toContain("TENANT_FEATURES");
    expect(source).toContain("normalizeTenantDomain(productionDomain)");
    expect(source).toContain("normalizeTenantDomain(adminDomain)");
  });

  it("rejects malformed content and page-config write bodies", () => {
    const content = readFileSync(path.join(process.cwd(), "src/app/api/content/[section]/route.ts"), "utf8");
    const versions = readFileSync(path.join(process.cwd(), "src/app/api/content/[section]/versions/route.ts"), "utf8");
    const pageConfig = readFileSync(path.join(process.cwd(), "src/app/api/page-config/route.ts"), "utf8");

    for (const source of [content, versions, pageConfig]) {
      expect(source).toContain("readJsonObject(request)");
      expect(source).toContain("Invalid request body");
    }
  });

  it("rejects malformed dashboard action write bodies", () => {
    const queue = readFileSync(path.join(process.cwd(), "src/app/api/queue/[id]/route.ts"), "utf8");
    const events = readFileSync(path.join(process.cwd(), "src/app/api/events/[id]/route.ts"), "utf8");
    const inbox = readFileSync(path.join(process.cwd(), "src/app/api/inbox/route.ts"), "utf8");
    const threads = readFileSync(path.join(process.cwd(), "src/app/api/threads/[threadId]/route.ts"), "utf8");
    const suggestions = readFileSync(path.join(process.cwd(), "src/app/api/suggestions/route.ts"), "utf8");
    const newsletterSend = readFileSync(path.join(process.cwd(), "src/app/api/newsletter/send/route.ts"), "utf8");
    const reviews = readFileSync(path.join(process.cwd(), "src/app/api/reviews/route.ts"), "utf8");
    const social = readFileSync(path.join(process.cwd(), "src/app/api/social/route.ts"), "utf8");
    const yelp = readFileSync(path.join(process.cwd(), "src/app/api/connections/yelp/route.ts"), "utf8");
    const chat = readFileSync(path.join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");

    for (const source of [queue, events, inbox, threads]) {
      expect(source).toContain("readJsonObject(request)");
      expect(source).toContain("Invalid request body");
    }
    for (const source of [suggestions, newsletterSend, reviews, social, yelp]) {
      expect(source).toContain("readJsonObject(req)");
      expect(source).toContain("Invalid request body");
    }

    const threadCreate = readFileSync(path.join(process.cwd(), "src/app/api/threads/route.ts"), "utf8");
    expect(threadCreate).toContain("readOptionalJsonObject(request)");
    expect(threadCreate).toContain("Invalid request body");
    expect(chat).toContain("readJsonArray(req)");
    expect(chat).toContain("Invalid request body");
  });

  it("rejects malformed admin and settings write bodies", () => {
    const tenantSettings = readFileSync(path.join(process.cwd(), "src/app/api/tenant-settings/route.ts"), "utf8");
    const adminDrafts = readFileSync(path.join(process.cwd(), "src/app/api/admin/drafts/route.ts"), "utf8");
    const rewardsAdjust = readFileSync(
      path.join(process.cwd(), "src/app/api/rewards/members/[email]/adjust/route.ts"),
      "utf8",
    );

    expect(tenantSettings).toContain("readJsonObject(req)");
    expect(tenantSettings).toContain("Invalid request body");
    for (const source of [adminDrafts, rewardsAdjust]) {
      expect(source).toContain("readJsonObject(request)");
      expect(source).toContain("Invalid request body");
    }
  });

  it("does not trust browser Origin for Stripe return URLs", () => {
    const subscription = readFileSync(
      path.join(process.cwd(), "src/app/api/billing/create-subscription/route.ts"),
      "utf8",
    );
    const portal = readFileSync(path.join(process.cwd(), "src/app/api/billing/portal/route.ts"), "utf8");

    for (const source of [subscription, portal]) {
      expect(source).toContain("getRequestOrigin");
      expect(source).toContain('"x-forwarded-host"');
      expect(source).toContain('"x-forwarded-proto"');
      expect(source).not.toContain('headers.get("origin")');
    }

    expect(subscription).toContain("normalizeEmail");
    expect(subscription).toContain("customerEmail = normalizeEmail");
    expect(subscription).toContain("readJsonObject(req)");
    expect(subscription).toContain("Invalid request body");
    expect(subscription).toContain("normalizedTenantId");
  });

  it("uses distributed rate limiting for newsletter sends", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/api/newsletter/send/route.ts"),
      "utf8",
    );

    expect(source).toContain("isRateLimitedWindowedAsync");
    expect(source).not.toContain("isRateLimitedWindowed(");
  });

  it("requires a linked Vercel project during production checks", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts/production-checklist.ts"), "utf8");

    expect(source).toContain("checkVercelProjectLink");
    expect(source).toContain(".vercel/project.json");
    expect(source).toContain("projectId");
    expect(source).toContain("orgId");
  });

  it("enforces a clean dependency audit during production checks", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts/production-checklist.ts"), "utf8");
    const packageJson = readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    const packageData = JSON.parse(packageJson) as { scripts?: Record<string, string> };
    const ci = readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
    const designKit = readFileSync(path.join(process.cwd(), "docs/design-kit.md"), "utf8");
    const domainSetup = readFileSync(path.join(process.cwd(), "docs/domain-setup.md"), "utf8");
    const launchBlockers = readFileSync(path.join(process.cwd(), "docs/launch-blockers.md"), "utf8");
    const releaseGate = packageData.scripts?.["check:release"] || "";
    const launchGate = packageData.scripts?.["check:launch"] || "";
    const signInClient = readFileSync(
      path.join(process.cwd(), "src/app/sign-in/[[...sign-in]]/SignInClient.tsx"),
      "utf8",
    );
    const customerFrontendSmoke = readFileSync(path.join(process.cwd(), "tests/customer-frontend.spec.ts"), "utf8");

    expect(source).toContain("checkDependencyAudit");
    expect(source).toContain("checkProductionSiteUrl");
    expect(source).toContain("checkVercelAppFreshness");
    expect(source).toContain("Vercel app freshness");
    expect(source).toContain("Sign in to Scaffold Web | Scaffold Web");
    expect(source).toContain("Redeploy the Vercel Production app from a clean release branch or dashboard");
    expect(source).toContain("getDnsContext");
    expect(source).toContain("Current DNS: A=");
    expect(source).toContain("resolve4");
    expect(source).toContain("resolveNs");
    expect(source).toContain("checkReleaseManifestEnv");
    expect(source).toContain("checkMarketingDomainCoverage");
    expect(source).toContain("checkReleaseWorkflow");
    expect(source).toContain("checkLaunchBlockerActionability");
    expect(source).toContain("checkCompletionAudit");
    expect(source).toContain("getResultCounts(1)");
    expect(source).toContain("expectedSummary");
    expect(source).toContain("checkCompletionAudit(\"docs/completion-audit.md\")");
    expect(source).toContain("checkPackageReleaseScripts");
    expect(source).toContain("checkCiWorkflow");
    expect(source).toContain("checkAccessSmokeCoverage");
    expect(source).toContain("checkAuthAccessPages");
    expect(source).toContain("checkAdminInviteFlow");
    expect(source).toContain("checkClerkWebhookRoute");
    expect(source).toContain("checkStripeBillingWebhookRoute");
    expect(source).toContain("checkCronAuthCoverage");
    expect(source).toContain("Production readiness doc");
    expect(source).toContain("Domain setup doc");
    expect(source).toContain("Release manifest env");
    expect(source).toContain("Tenant Deployment Checklist");
    expect(source).toContain("Customer Access Handoff");
    expect(source).toContain("vercel deploy --prod");
    expect(source).toContain("matching NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
    expect(source).toContain("same live Clerk instance as the publishable/secret keys");
    expect(source).toContain("git status --short");
    expect(source).toContain("PLAYWRIGHT_BASE_URL=https://reb-studio.vercel.app");
    expect(source).toContain("signed-out dashboard customers");
    expect(source).toContain("https://reb-studio.vercel.app/sign-in");
    expect(source).toContain("Sign in to Scaffold Web | Scaffold Web");
    expect(source).toContain("PLAYWRIGHT_BASE_URL=https://scaffoldweb.com");
    expect(source).toContain("https://scaffoldweb.com/api/health");
    expect(source).toContain("curl -i https://scaffoldweb.com/api/cron/maintenance");
    expect(source).toContain("/api/admin/invites");
    expect(source).toContain("exact invited email");
    expect(source).toContain("signed-out `/dashboard` and `/no-access` redirect to `/sign-in`");
    expect(source).toContain("admin.greatlakesdriedfruit.com");
    expect(source).toContain("Release workflow");
    expect(source).toContain("Launch blocker actionability");
    expect(source).toContain("Completion audit");
    expect(source).toContain("Package release scripts");
    expect(source).toContain("CI workflow");
    expect(source).toContain("Access smoke coverage");
    expect(source).toContain("Auth access pages");
    expect(source).toContain("Admin invite flow");
    expect(source).toContain("Clerk webhook route");
    expect(source).toContain("Stripe billing webhook route");
    expect(source).toContain("Cron auth coverage");
    expect(source).toContain(".github/workflows/release.yml");
    expect(source).toContain(".github/workflows/ci.yml");
    expect(source).toContain("tests/customer-frontend.spec.ts");
    expect(source).toContain("tests/smoke.spec.ts");
    expect(source).toContain("src/app/sign-in/[[...sign-in]]/SignInClient.tsx");
    expect(source).toContain("src/app/sign-in/[[...sign-in]]/page.tsx");
    expect(source).toContain("src/app/sign-up/[[...sign-up]]/page.tsx");
    expect(source).toContain("src/app/no-access/page.tsx");
    expect(source).toContain("src/app/(marketing)/account/page.tsx");
    expect(source).toContain("src/components/auth/UseInvitedEmailButton.tsx");
    expect(source).toContain("src/app/admin/page.tsx");
    expect(source).toContain("src/app/admin/InviteButton.tsx");
    expect(source).toContain("src/app/api/admin/invites/route.ts");
    expect(source).toContain('getTenantDashboardUrl(tenantConfig, "/sign-up", "production")');
    expect(source).toContain("src/app/api/clerk/webhook/route.ts");
    expect(source).toContain("validateCronRequest(process.env.CRON_SECRET");
    expect(source).toContain("src/app${cron.path}/route.ts");
    expect(source).toContain("package.json");
    expect(source).toContain("enforces release gate confirmation");
    expect(source).toContain("has owner-ready blocker actions");
    expect(source).toContain("release gates are aligned");
    expect(source).toContain("runs launch-aligned checks");
    expect(source).toContain("signed-out account handoff returns users to sign-in");
    expect(source).toContain("signup page explains invited email recovery");
    expect(source).toContain("admin tenant host sign-up uses the tenant invite context");
    expect(source).toContain("toHaveTitle(/Sign in to Scaffold Web");
    expect(source).toContain("toHaveTitle(/Sign in to Great Lakes Dried Fruit");
    expect(source).toContain("toHaveTitle(/Create your dashboard account");
    expect(source).toContain("toHaveTitle(/Create your Great Lakes Dried Fruit dashboard account");
    expect(source).toContain("admin tenant host sign-in keeps the invited email context");
    expect(source).toContain("cron maintenance endpoint is not public");
    expect(signInClient).toContain("Use the exact email address that received your invite");
    expect(signInClient).toContain("initialValues={invitedEmail ? { emailAddress: invitedEmail } : undefined}");
    expect(signInClient).toContain('signUpUrl={getAuthSwitchUrl("/sign-up", invitedEmail)}');
    expect(signInClient).not.toContain("Use the email address from your invite");
    expect(customerFrontendSmoke).toContain("Use the exact email address that received your invite");
    expect(customerFrontendSmoke).not.toContain("Use the email address from your invite");
    expect(source).toContain("sign-in page allows Clerk JS to load");
    expect(source).toContain("https://clerk.scaffoldweb.com");
    expect(source).toContain("signupNoAppOk");
    expect(source).toContain("including public sign-up");
    expect(source).toContain("cover sign-in/sign-up recovery paths, account handoff, Clerk JS CSP, and cron protection");
    expect(source).toContain("tenant-aware invite-focused metadata");
    expect(source).toContain("form is not loading");
    expect(source).toContain("route marketing-host auth through /account");
    expect(source).toContain("route tenant/admin auth to /dashboard");
    expect(source).toContain("host-aware redirects");
    expect(source).toContain("No invited sites on this account");
    expect(source).toContain("UseInvitedEmailButton");
    expect(source).toContain("signs you out so you can choose that account");
    expect(source).toContain('href="/account"');
    expect(source).toContain("Choose another site");
    expect(source).toContain("Start a new site");
    expect(source).toContain("!tenantConfigs.some(({ config }) => config)");
    expect(source).toContain("{button}</SignOutButton>");
    expect(source).toContain("Sign-in, sign-up, and no-access recovery are aligned with invite-focused metadata");
    expect(source).toContain("getSignUpTitle(siteName)");
    expect(source).toContain("Admin tenant rows expose owner-email invites through /api/admin/invites");
    expect(source).toContain("Tenant domain access");
    expect(source).toContain("src/app/api/admin/domains/route.ts");
    expect(source).toContain("src/app/api/tenant/domains/route.ts");
    expect(source).toContain('requireTenantPermission(tenant, "domains:manage")');
    expect(source).toContain("/api/admin/domains remains a compatibility alias");
    expect(source).toContain("Public storefront API");
    expect(source).toContain("src/app/api/public/content/[tenant]/[section]/route.ts");
    expect(source).toContain("src/app/api/public/page-config/[tenant]/route.ts");
    expect(source).toContain("src/app/api/v1/content/[tenant]/[section]/route.ts");
    expect(source).toContain("src/app/api/v1/page-config/[tenant]/route.ts");
    expect(source).toContain("config.active === false");
    expect(source).toContain("isValidSection(section, tenant)");
    expect(source).toContain("/api/v1 storefront APIs remain public read-only aliases");
    expect(source).toContain("OAuth callback state");
    expect(source).toContain("src/app/api/oauth/calendly/callback/route.ts");
    expect(source).toContain("src/app/api/oauth/google/callback/route.ts");
    expect(source).toContain("src/app/api/oauth/instagram/callback/route.ts");
    expect(source).toContain("verifyOAuthState(state)");
    expect(source).toContain("const tenantId = verifiedState.tenantId");
    expect(source).toContain("OAuth callbacks verify signed state before saving tenant connections");
    expect(source).toContain("verifies signed user.created events");
    expect(source).toContain("Vercel cron route(s) are covered by proxy CRON_SECRET validation");
    expect(source).toContain("Dependency audit");
    expect(source).toContain("Production site URL");
    expect(source).toContain("Marketing domain coverage");
    expect(source).toContain("MARKETING_DOMAINS must include");
    expect(source).toContain("root-domain auth returns customers to /account");
    expect(source).toContain("must resolve to the Vercel Next.js app");
    expect(source).toContain("A scaffoldweb.com 76.76.21.21");
    expect(source).toContain("remove Porkbun/l.ink forwarding");
    expect(source).toContain("Production domain routing");
    expect(source).toContain("requiredEnv entries are covered by check:prod or storefront handoff docs");
    expect(source).toContain('"pnpm", ["audit"]');
    expect(source).toContain("pnpm audit found no known vulnerabilities");
    expect(source).toContain("pnpm audit reported vulnerabilities; resolve them before release:");
    expect(source).toContain("slice(0, 8)");
    expect(packageJson).toContain('"check:release"');
    expect(packageJson).toContain('"fast-uri": "3.1.2"');
    expect(packageJson).not.toContain('"fast-uri": "3.1.1"');
    expect(releaseGate).toBe("pnpm lint && pnpm typecheck && pnpm test && pnpm audit && pnpm build && pnpm check:prod && REB_DEV_UNGATED_ACCESS=0 pnpm smoke");
    expect(launchGate).toBe("pnpm lint && pnpm typecheck && pnpm test && pnpm audit && pnpm build && REB_DEV_UNGATED_ACCESS=0 pnpm smoke");
    expect(ci).toContain("pnpm audit");
    expect(ci).not.toContain("--audit-level");
    expect(ci).toContain("REB_DEV_UNGATED_ACCESS");
    expect(designKit).toContain("pnpm audit");
    expect(designKit).toContain("pnpm check:release");
    expect(designKit).toContain("PLAYWRIGHT_BASE_URL=https://scaffoldweb.com");
    expect(designKit).toContain("PLAYWRIGHT_TENANT_ORIGIN=https://admin.greatlakesdriedfruit.com");
    expect(designKit).not.toContain("PLAYWRIGHT_BASE_URL=<deployment-url>");
    expect(designKit).not.toContain("PLAYWRIGHT_TENANT_ORIGIN=<tenant-url>");
    expect(domainSetup).toContain("reb-studio");
    expect(domainSetup).toContain("A     scaffoldweb.com    76.76.21.21");
    expect(domainSetup).toContain("cname.vercel-dns.com");
    expect(domainSetup).toContain("MARKETING_DOMAINS=scaffoldweb.com,www.scaffoldweb.com,reb-studio.vercel.app,reb.studio,www.reb.studio");
    expect(domainSetup).toContain("scaffoldweb-com.l.ink");
    expect(domainSetup).toContain("vercel domains inspect scaffoldweb.com");
    expect(domainSetup).toContain("dig +short scaffoldweb.com A");
    expect(domainSetup).toContain("dig +short scaffoldweb.com NS");
    expect(domainSetup).toContain("dig +short '*.scaffoldweb.com' CNAME");
    expect(domainSetup).toContain("pnpm check:prod");
    expect(launchBlockers).toContain("pnpm audit");
    expect(launchBlockers).toContain("pnpm check:release");
    expect(launchBlockers).toContain("261 tests across 28 files");
    expect(launchBlockers).toContain("261 unit tests across 28 files");
    expect(launchBlockers).toContain("20 Playwright tests");
    expect(launchBlockers).toContain("20 smoke tests");
    expect(launchBlockers).not.toContain("259 tests across 28 files");
    expect(launchBlockers).not.toContain("259 unit tests across 28 files");
    expect(launchBlockers).not.toContain("19 Playwright tests");
    expect(launchBlockers).not.toContain("19 smoke tests");
    expect(launchBlockers).toContain("forces `REB_DEV_UNGATED_ACCESS=0`");
    expect(launchBlockers).toContain("isolated Playwright server instead of an existing `localhost:3000` process");
    expect(launchBlockers).not.toContain("direct `curl` to `http://localhost:3000/sign-in` returned `200 OK`");
    expect(designKit).toContain("forces `REB_DEV_UNGATED_ACCESS=0`");
  });

  it("keeps the completion audit aligned with current production blockers", () => {
    const audit = readFileSync(path.join(process.cwd(), "docs/completion-audit.md"), "utf8");

    expect(audit).toContain("Current failures from the latest `pnpm check:prod` run");
    expect(audit).toContain("Required Production Env Vars And Stripe Price");
    expect(audit).toContain("Production Live Verification");
    expect(audit).toContain("Production Domain Routing");
    expect(audit).toContain("CLERK_WEBHOOK_SECRET");
    expect(audit).toContain("SANITY_WEBHOOK_SECRET");
    expect(audit).toContain("UPSTASH_REDIS_REST_URL");
    expect(audit).toContain("UPSTASH_REDIS_REST_TOKEN");
    expect(audit).toContain("SENTRY_DSN");
    expect(audit).toContain("NEXT_PUBLIC_SENTRY_DSN");
    expect(audit).toContain("price_1TM7v0D99ZGeTugfpmyYup3V");
    expect(audit).toContain("prod_UKnWPSG3QOtOUz");
    expect(audit).toContain("$20/month USD");
    expect(audit).toContain("$149/month USD");
    expect(audit).toContain("https://reb-studio.vercel.app/sign-in");
    expect(audit).toContain("Sign in to Scaffold Web | Scaffold Web");
    expect(audit).toContain("https://scaffoldweb-com.l.ink/");
    expect(audit).toContain("openresty");
    expect(audit).toContain("55 passed, 2 warned, 9 failed, 18 skipped");
    expect(audit).toContain("use the exact email address that received the invite");
    expect(audit).toContain("using the exact invited email");
    expect(audit).toContain("Full `pnpm check:launch` was rerun");
    expect(audit).toContain("isolated Playwright server instead of an existing `localhost:3000` process");
    expect(audit).toContain("Clerk infinite redirect-loop error");
    expect(audit).toContain("same live Clerk instance");
    expect(audit).toContain("visible support fallback copy");
    expect(audit).toContain("Clerk form is not loading");
    expect(audit).not.toContain("direct `curl` to `http://localhost:3000/sign-in` returned `200 OK`");
  });

  it("requires launch gate confirmation before creating release tags", () => {
    const release = readFileSync(path.join(process.cwd(), ".github/workflows/release.yml"), "utf8");

    expect(release).toContain("launch_gate");
    expect(release).toContain("check-release-passed");
    expect(release).toContain("owner-waived-blockers");
    expect(release).toContain("release_note_ref");
    expect(release).toContain("contents: write");
    expect(release).toContain("Refusing to tag release");
    expect(release).toContain("release_note_ref must be a real release note, PR, or ticket reference");
    expect(release).toContain("Owner-waived releases must reference waiver metadata");
    expect(release).toContain("launch-blockers");
    expect(release).toContain("^reb-v[0-9]{4}");
    expect(release).toContain("VERSION: ${{ inputs.version }}");
    expect(release).toContain('git tag "$VERSION"');
    expect(release).toContain('git push origin "$VERSION"');
    expect(release).not.toContain("git tag ${{ inputs.version }}");
  });

  it("prints owner-ready release actions for failed production checks", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts/production-checklist.ts"), "utf8");
    const readinessRules = readFileSync(path.join(process.cwd(), "src/lib/production-readiness-rules.ts"), "utf8");
    const launchBlockers = readFileSync(path.join(process.cwd(), "docs/launch-blockers.md"), "utf8");
    const requiredEnvNames = [...source.matchAll(/checkEnvVar\("([^"]+)", true/g)].map((match) => match[1]);
    const generatedSecretBlock = source.match(/const locallyGeneratedSecrets = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
    const sourceHintsBlock = source.match(/const envSourceHints: Record<string, string> = \{([\s\S]*?)\};/)?.[1] || "";

    expect(source).toContain("Required Release Actions");
    expect(source).toContain("SCAFFOLD_MONTHLY_PRICE_CENTS = 14900");
    expect(source).toContain("Expected $149/month USD for Scaffold Web");
    expect(source).toContain("Create or select the live $149 monthly Stripe price");
    expect(source).toContain('failedEnvVars.add("STRIPE_SCAFFOLD_PRICE_ID")');
    expect(source).toContain("replacementEnvs");
    expect(source).toContain("vercel env rm STRIPE_SCAFFOLD_PRICE_ID production --yes");
    expect(source).toContain("exactly $149/month");
    expect(source).toContain("Current Stripe price details");
    expect(source).toContain("livemode=");
    expect(source).toContain("active=");
    expect(source).toContain("warnedEnvVars");
    expect(source).toContain("Review or clean up these warning Vercel Production env vars");
    expect(source).toContain("Remove copied quotes, literal \\\\n text, localhost-only domains");
    expect(source).toContain("vercel env add");
    expect(source).toContain("openssl rand -hex 32");
    expect(source).toContain("vercel env pull .env.production.local --environment=production");
    expect(source).toContain("vercel deploy --prod");
    expect(source).toContain("git status --short");
    expect(source).toContain("PLAYWRIGHT_BASE_URL=https://reb-studio.vercel.app");
    expect(source).toContain("pnpm exec playwright test tests/customer-frontend.spec.ts -g");
    expect(source).toContain('\\"signed-out dashboard customers\\"');
    expect(source).toContain("dirty local working tree");
    expect(source).toContain("Production Live Verification");
    expect(source).toContain("PLAYWRIGHT_BASE_URL=https://scaffoldweb.com");
    expect(source).toContain("Clerk/Sanity/Stripe webhook deliveries");
    expect(source).toContain("cron 401");
    expect(source).toContain("production live-verification steps");
    expect(source).toContain('[".env.production.local", ".env.local", ".env"]');
    expect(source).toContain("failedEnvVars");
    expect(source).toContain("NEXT_PUBLIC_SENTRY_DSN");
    expect(source).toContain("getLaunchBlockerError");
    expect(readinessRules).toContain("currentBlockers");
    expect(readinessRules).toContain("Owner:");
    expect(readinessRules).toContain("Reason:");
    expect(source).toContain("signed-out /dashboard and /no-access reach /sign-in");
    expect(source).toContain("root marketing-host auth finishes at /account");
    expect(source).toContain("admin.greatlakesdriedfruit.com reaches the same invited-email sign-in flow");
    expect(source).toContain("after Clerk and Resend are live");
    expect(source).toContain("use Invite for each tenant ownerEmail");
    expect(source).toContain("signs up or signs in with the exact invited email");
    expect(source).toContain("email stays prefilled when switching between sign-up and sign-in");
    expect(source).toContain("scaffoldweb.com auth reaches /account");
    expect(source).toContain("admin.greatlakesdriedfruit.com auth reaches /dashboard/site");
    expect(source).toContain("content create/update/delete events");
    expect(source).toContain("checkout.session.completed");
    expect(source).toContain("invoice.paid");
    expect(source).toContain("invoice.payment_failed");
    expect(source).toContain("customer.subscription.deleted");
    expect(readinessRules).toContain("move them to Waived Blockers with Status, Owner, release/ticket reference, Follow-up, and Reason");
    expect(source).toContain("Vercel access: grant access to project reb-studio");
    expect(source).toContain("vercel whoami");
    expect(source).toContain("prj_AzaQBS8jM9E5RVgHuMWnQju0GIxb");
    expect(source).toContain("team_66XTGId41AJGh9vLvkiyXqkZ");
    expect(source).toContain("Production live verification");
    expect(source).toContain("PLAYWRIGHT_BASE_URL=https://scaffoldweb.com");
    expect(source).toContain("root marketing auth reaches /account");
    expect(source).toContain("invited-owner /dashboard/site access");
    expect(source).toContain("Clerk/Sanity/Stripe webhook deliveries are successful");
    expect(source).toContain("cron 401/success behavior works with CRON_SECRET");
    expect(source).toContain("clear docs/launch-blockers.md Current Blockers");
    expect(source).toContain("DNS verification commands:");
    expect(source).toContain("vercel domains inspect scaffoldweb.com");
    expect(source).toContain("dig +short scaffoldweb.com A");
    expect(source).toContain("dig +short scaffoldweb.com NS");
    expect(source).toContain("dig +short '*.scaffoldweb.com' CNAME");
    expect(source).toContain("curl -I -L https://scaffoldweb.com/api/health");
    expect(launchBlockers).toContain("vercel whoami");
    expect(launchBlockers).toContain("reb-studio");
    expect(launchBlockers).toContain("### Production Live Verification");
    expect(launchBlockers).toContain("Authenticated production dashboard access");
    expect(launchBlockers).toContain("https://reb-studio.vercel.app/sign-in");
    expect(launchBlockers).toContain("Sign in to Scaffold Web | Scaffold Web");
    expect(launchBlockers).toContain("Vercel app-host freshness check");
    expect(launchBlockers).toContain("after production env, redeploy, and DNS are resolved");
    expect(launchBlockers).toContain("PLAYWRIGHT_BASE_URL=https://scaffoldweb.com");
    expect(launchBlockers).toContain("Clerk/Sanity/Stripe webhook deliveries");
    expect(launchBlockers).toContain("Copyable Vercel env commands");
    expect(launchBlockers).toContain("vercel env add CLERK_WEBHOOK_SECRET production");
    expect(launchBlockers).toContain("vercel env add SANITY_WEBHOOK_SECRET production");
    expect(launchBlockers).toContain("vercel env add UPSTASH_REDIS_REST_URL production");
    expect(launchBlockers).toContain("vercel env add UPSTASH_REDIS_REST_TOKEN production");
    expect(launchBlockers).toContain("vercel env add SENTRY_DSN production");
    expect(launchBlockers).toContain("vercel env add NEXT_PUBLIC_SENTRY_DSN production");
    expect(launchBlockers).toContain("vercel env add STRIPE_SCAFFOLD_PRICE_ID production");
    expect(launchBlockers).toContain("vercel env rm STRIPE_SCAFFOLD_PRICE_ID production --yes");
    expect(launchBlockers).toContain("price_1TM7v0D99ZGeTugfpmyYup3V");
    expect(launchBlockers).toContain("prod_UKnWPSG3QOtOUz");
    expect(launchBlockers).toContain("amount=2000");
    expect(launchBlockers).toContain("interval=month");
    expect(
      launchBlockers.match(/vercel env add STRIPE_SCAFFOLD_PRICE_ID production/g),
    ).toHaveLength(1);
    expect(launchBlockers.indexOf("vercel env rm STRIPE_SCAFFOLD_PRICE_ID production --yes")).toBeLessThan(
      launchBlockers.indexOf("vercel env add STRIPE_SCAFFOLD_PRICE_ID production"),
    );
    expect(launchBlockers).toContain("vercel env add NEXT_PUBLIC_APP_URL production");
    expect(launchBlockers).toContain("exactly $149/month USD");
    expect(launchBlockers).toContain("Provider value sources");
    expect(launchBlockers).toContain("Clerk Dashboard -> Webhooks");
    expect(launchBlockers).toContain("Sanity project webhook settings");
    expect(launchBlockers).toContain("Upstash Redis database -> REST API section");
    expect(launchBlockers).toContain("Sentry project settings -> Client Keys / DSN");
    expect(launchBlockers).toContain("Stripe live-mode Products");
    expect(launchBlockers).toContain("Do not overwrite the values already passing the checker");
    expect(launchBlockers).toContain("Redeploy the Vercel Production app after env changes");
    expect(launchBlockers).toContain("vercel deploy --prod");
    expect(launchBlockers).toContain("git status --short");
    expect(launchBlockers).toContain("dirty local working tree");
    expect(launchBlockers).toContain("Copyable DNS verification commands");
    expect(launchBlockers).toContain("vercel domains inspect scaffoldweb.com");
    expect(launchBlockers).toContain("dig +short scaffoldweb.com A");
    expect(launchBlockers).toContain("dig +short scaffoldweb.com NS");
    expect(launchBlockers).toContain("dig +short '*.scaffoldweb.com' CNAME");
    expect(launchBlockers).toContain("does not redirect to `scaffoldweb-com.l.ink`");
    expect(launchBlockers).toContain("Copyable verification commands");
    expect(launchBlockers).toContain("PLAYWRIGHT_BASE_URL=https://scaffoldweb.com");
    expect(launchBlockers).toContain("PLAYWRIGHT_TENANT_ORIGIN=https://admin.greatlakesdriedfruit.com");
    expect(launchBlockers).not.toContain("PLAYWRIGHT_TENANT_ORIGIN=https://admin.<custom-domain>");
    expect(launchBlockers).not.toContain("PLAYWRIGHT_BASE_URL=<production-or-preview-url>");
    expect(launchBlockers).not.toContain("PLAYWRIGHT_TENANT_ORIGIN=<tenant-url>");
    expect(launchBlockers).toContain("curl -i https://scaffoldweb.com/api/cron/maintenance");
    expect(launchBlockers).toContain("https://scaffoldweb.com/api/health");
    expect(launchBlockers).toContain("stays on `scaffoldweb.com`");
    expect(launchBlockers).toContain('curl -i -H "Authorization: Bearer $CRON_SECRET" https://scaffoldweb.com/api/cron/maintenance');
    expect(launchBlockers).toContain("## Waived Blockers");
    expect(launchBlockers).toContain("Status: waived");
    expect(launchBlockers).toContain("Owner: <name or email>");
    expect(launchBlockers).toContain("Release note: <release note, PR, or ticket reference>");
    expect(launchBlockers).toContain("Follow-up: <YYYY-MM-DD>");
    expect(launchBlockers).toContain("Reason: <why the release can proceed without resolving it>");

    for (const name of requiredEnvNames) {
      expect(
        `${generatedSecretBlock}\n${sourceHintsBlock}`,
        `${name} needs either a local generation command or a vendor/source hint`,
      ).toContain(name);
    }
  });

  it("keeps required production env checks represented in the owner handoff template", () => {
    const checklist = readFileSync(path.join(process.cwd(), "scripts/production-checklist.ts"), "utf8");
    const template = readFileSync(path.join(process.cwd(), ".env.production.example"), "utf8");
    const requiredEnvNames = [...checklist.matchAll(/checkEnvVar\("([^"]+)", true/g)].map((match) => match[1]);

    expect(requiredEnvNames.length).toBeGreaterThan(10);

    for (const name of requiredEnvNames) {
      expect(template, `${name} is required by check:prod but missing from .env.production.example`).toContain(
        `${name}=`,
      );
    }
  });

  it("keeps every checked env var represented in the owner handoff template", () => {
    const checklist = readFileSync(path.join(process.cwd(), "scripts/production-checklist.ts"), "utf8");
    const template = readFileSync(path.join(process.cwd(), ".env.production.example"), "utf8");
    const localTemplate = readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
    const checkedEnvNames = [
      ...checklist.matchAll(/checkEnvVar\("([^"]+)"/g),
    ].map((match) => match[1]);
    const pairedEnvNames = [
      ...checklist.matchAll(/checkOptionalPair\("([^"]+)", "([^"]+)"/g),
    ].flatMap((match) => [match[1], match[2]]);
    const envNames = [...new Set([...checkedEnvNames, ...pairedEnvNames])];

    expect(envNames.length).toBeGreaterThan(20);

    for (const name of envNames) {
      expect(template, `${name} is checked by check:prod but missing from .env.production.example`).toContain(
        `${name}=`,
      );
    }

    expect(template).toContain("exactly $149/month");
    expect(template).toContain("same live Clerk instance");
    expect(template).toContain("Mixed Clerk instances can make /sign-in loop");
    expect(template).toContain("server/project DSN");
    expect(template).toContain("browser/client DSN");
    expect(localTemplate).toContain("same Clerk instance");
    expect(localTemplate).toContain("Mixed Clerk instances can make /sign-in loop");
    expect(localTemplate).toContain("exactly $149/month");
    expect(localTemplate).toContain("server/project and browser/client DSNs");
  });

  it("keeps required production env checks represented in the launch handoff docs", () => {
    const checklist = readFileSync(path.join(process.cwd(), "scripts/production-checklist.ts"), "utf8");
    const manifest = readFileSync(path.join(process.cwd(), "release-manifest.json"), "utf8");
    const productionReadiness = readFileSync(path.join(process.cwd(), "docs/production-readiness.md"), "utf8");
    const launchBlockers = readFileSync(path.join(process.cwd(), "docs/launch-blockers.md"), "utf8");
    const requiredEnvNames = [...checklist.matchAll(/checkEnvVar\("([^"]+)", true/g)].map((match) => match[1]);

    for (const name of requiredEnvNames) {
      expect(
        `${productionReadiness}\n${launchBlockers}`,
        `${name} is required by check:prod but missing from launch handoff docs`,
      ).toContain(name);
    }

    expect(productionReadiness).toContain("Current Blockers");
    expect(productionReadiness).toContain("Waived Blockers");
    expect(productionReadiness).toContain("Customer Access Handoff");
    expect(productionReadiness).toContain("/admin");
    expect(productionReadiness).toContain("Invite");
    expect(productionReadiness).toContain("/api/admin/invites");
    expect(productionReadiness).toContain("exact invited email address");
    expect(productionReadiness).toContain("preloads that address on sign-up");
    expect(productionReadiness).toContain("sign-in/sign-up links preserve it");
    expect(productionReadiness).toContain("same live Clerk instance");
    expect(productionReadiness).toContain("make `/sign-in` loop");
    expect(productionReadiness).toContain("root marketing hosts");
    expect(productionReadiness).toContain("/account");
    expect(productionReadiness).toContain("no invited sites");
    expect(productionReadiness).toContain("Use invited email");
    expect(productionReadiness).toContain("admin.greatlakesdriedfruit.com");
    expect(productionReadiness).toContain("Status: waived");
    expect(productionReadiness).toContain("Owner:");
    expect(productionReadiness).toContain("Follow-up:");
    expect(productionReadiness).toContain("Reason:");
    expect(productionReadiness).toContain("https://scaffoldweb.com/api/clerk/webhook");
    expect(productionReadiness).toContain("user.created");
    expect(productionReadiness).toContain("CLERK_WEBHOOK_SECRET");
    expect(productionReadiness).toContain("https://scaffoldweb.com/api/sanity/webhook");
    expect(productionReadiness).toContain("SANITY_WEBHOOK_SECRET");
    expect(productionReadiness).toContain("https://scaffoldweb.com/api/billing/webhook");
    expect(productionReadiness).toContain("checkout.session.completed");
    expect(productionReadiness).toContain("invoice.paid");
    expect(productionReadiness).toContain("invoice.payment_failed");
    expect(productionReadiness).toContain("customer.subscription.deleted");
    expect(productionReadiness).toContain("STRIPE_WEBHOOK_SECRET");
    expect(productionReadiness).toContain("NEXT_PUBLIC_SENTRY_DSN");
    expect(manifest).toContain("SENTRY_DSN");
    expect(manifest).toContain("NEXT_PUBLIC_SENTRY_DSN");
    expect(manifest).toContain("REVALIDATE_SECRET");
    expect(productionReadiness).toContain("storefront `REVALIDATE_SECRET`");
    expect(productionReadiness).toContain("Production Live Verification");
    expect(productionReadiness).toContain("invited owner reaches `/dashboard/site`");
    expect(productionReadiness).toContain("content edit saves and refreshes preview");
    expect(productionReadiness).toContain("Clerk/Sanity/Stripe webhook deliveries");
    expect(productionReadiness).toContain("cron 401/success behavior");
    expect(productionReadiness).toContain("Placeholder references");
    expect(launchBlockers).toContain("Placeholder references");
    expect(launchBlockers).toContain("exact invited email address");
    expect(launchBlockers).toContain("same live Clerk instance");
    expect(launchBlockers).toContain("todo");
  });

  it("keeps smoke tests isolated from unrelated localhost servers", () => {
    const source = readFileSync(path.join(process.cwd(), "playwright.config.ts"), "utf8");

    expect(source).toContain('process.env.PLAYWRIGHT_PORT || "3100"');
    expect(source).toContain("PLAYWRIGHT_BASE_URL");
    expect(source).toContain("/api/health");
    expect(source).toContain("reuseExistingServer: false");
    const nextConfig = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(nextConfig).toContain("gldf.localhost");
    expect(nextConfig).toContain("admin.gldf.localhost");
    expect(source).not.toContain('baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000"');
    expect(source).not.toContain("reuseExistingServer: true");
  });

  it("documents the dedicated OAuth state signing secret in production handoff", () => {
    const checklist = readFileSync(path.join(process.cwd(), "scripts/production-checklist.ts"), "utf8");
    const template = readFileSync(path.join(process.cwd(), ".env.production.example"), "utf8");

    expect(checklist).toContain('checkEnvVar("OAUTH_STATE_SECRET", true)');
    expect(template).toContain("OAUTH_STATE_SECRET=");
  });

  it("makes optional OAuth dependencies explicit in production checks", () => {
    const checklist = readFileSync(path.join(process.cwd(), "scripts/production-checklist.ts"), "utf8");
    const template = readFileSync(path.join(process.cwd(), ".env.production.example"), "utf8");
    const productionReadiness = readFileSync(path.join(process.cwd(), "docs/production-readiness.md"), "utf8");

    expect(checklist).toContain("checkOptionalPair");
    expect(checklist).toContain("NEXT_PUBLIC_APP_URL");
    expect(checklist).toContain("CALENDLY_WEBHOOK_SECRET");
    expect(checklist).toContain("OAuth redirects need the deployed app URL");
    expect(checklist).toContain("failedEnvVars.add(idName)");
    expect(checklist).toContain("failedEnvVars.add(secretName)");
    expect(checklist).toContain("Google Cloud OAuth client secret");
    expect(checklist).toContain("Meta app Instagram OAuth client secret");
    expect(checklist).toContain("Calendly OAuth app client secret");
    expect(productionReadiness).toContain("Set `NEXT_PUBLIC_APP_URL=https://scaffoldweb.com` when Google, Instagram, or Calendly OAuth connections are enabled.");
    expect(productionReadiness).not.toContain("`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, and tenant-specific revalidation secrets");
    expect(template).toContain("Required only when Google, Instagram, or Calendly OAuth connections are enabled.");
    expect(template).toContain("NEXT_PUBLIC_APP_URL=https://scaffoldweb.com");
    expect(template).toContain("MARKETING_DOMAINS=scaffoldweb.com,www.scaffoldweb.com,reb-studio.vercel.app,reb.studio,www.reb.studio");
  });

  it("uses signed OAuth state for integration callbacks", () => {
    const initiationRoutes = [
      "src/app/api/oauth/calendly/route.ts",
      "src/app/api/oauth/google/route.ts",
      "src/app/api/oauth/instagram/route.ts",
    ];
    const callbackRoutes = [
      "src/app/api/oauth/calendly/callback/route.ts",
      "src/app/api/oauth/google/callback/route.ts",
      "src/app/api/oauth/instagram/callback/route.ts",
    ];

    for (const route of initiationRoutes) {
      const source = readFileSync(path.join(process.cwd(), route), "utf8");

      expect(source, route).toContain("createOAuthState");
      expect(source, route).not.toContain("Buffer.from(JSON.stringify");
    }

    for (const route of callbackRoutes) {
      const source = readFileSync(path.join(process.cwd(), route), "utf8");

      expect(source, route).toContain("verifyOAuthState");
      expect(source, route).not.toContain("Buffer.from(state");
    }
  });

  it("fails closed on external booking webhooks without configured secrets", () => {
    const webhookRoutes = [
      "src/app/api/webhooks/calendly/route.ts",
      "src/app/api/webhooks/vegaro/route.ts",
    ];

    for (const route of webhookRoutes) {
      const source = readFileSync(path.join(process.cwd(), route), "utf8");

      expect(source, route).toContain("Webhook secret not configured");
      expect(source, route).toContain("Missing signature");
      expect(source, route).toContain("Invalid signature");
      expect(source, route).not.toContain("if (webhookSecret && signature)");
      expect(source, route).not.toContain("return true; // Skip if not configured");
    }
  });

  it("fails closed on Stripe billing webhooks without signature verification", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/api/billing/webhook/route.ts"), "utf8");

    expect(source).toContain("STRIPE_WEBHOOK_SECRET");
    expect(source).toContain("Webhook secret not configured");
    expect(source).toContain("stripe-signature");
    expect(source).toContain("stripe.webhooks.constructEvent");
    expect(source).toContain("Invalid signature");
    expect(source).toContain("checkout.session.completed");
    expect(source).toContain("invoice.paid");
    expect(source).toContain("invoice.payment_failed");
    expect(source).toContain("customer.subscription.deleted");
    expect(source).toContain("claimStripeEvent");
    expect(source).not.toContain("if (webhookSecret && signature)");
    expect(source).not.toContain("return true; // Skip if not configured");
  });

  it("fails closed on Sanity webhooks without a configured secret", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/api/sanity/webhook/route.ts"), "utf8");

    expect(source).toContain("SANITY_WEBHOOK_SECRET is not configured");
    expect(source).toContain('parseBody<SanityWebhookPayload>');
    expect(source).toContain('from "next-sanity/webhook"');
    expect(source).not.toContain("skipping signature verification");
    expect(source).not.toContain("x-sanity-signature");
    expect(source).not.toContain("return true;");
  });

  it("does not trust client-submitted checkout prices", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/api/checkout/route.ts"), "utf8");
    const checkoutItemInterface = source.match(/interface CheckoutItem \{[\s\S]*?\n\}/)?.[0] || "";

    expect(source).toContain('getContent("products", tenant)');
    expect(source).toContain("isRateLimitedAsync");
    expect(source).toContain('rateLimitKey(req, "checkout")');
    expect(source).toContain("productById.get(item.productId)");
    expect(source).toContain("parseProductPrice(product.price)");
    expect(source).toContain("readJsonObject(req)");
    expect(source).toContain("Invalid request body");
    expect(checkoutItemInterface).not.toContain("price:");
    expect(checkoutItemInterface).not.toContain("name:");
    expect(source).not.toContain("item.price *");
    expect(source).not.toContain("product_data: { name: item.name }");
  });

  it("uses distributed limiting and sanitized fields for public intake forms", () => {
    const onboard = readFileSync(path.join(process.cwd(), "src/app/api/onboard/intake/route.ts"), "utf8");
    const booking = readFileSync(path.join(process.cwd(), "src/app/api/booking/route.ts"), "utf8");
    const bookingUpdate = readFileSync(path.join(process.cwd(), "src/app/api/booking/[id]/route.ts"), "utf8");
    const bookingConfig = readFileSync(path.join(process.cwd(), "src/app/api/booking/config/route.ts"), "utf8");
    const availability = readFileSync(path.join(process.cwd(), "src/app/api/booking/availability/route.ts"), "utf8");
    const subscribe = readFileSync(path.join(process.cwd(), "src/app/api/newsletter/subscribe/route.ts"), "utf8");

    expect(onboard).toContain("isRateLimitedWindowedAsync");
    expect(onboard).not.toContain("isRateLimitedWindowed(");
    expect(onboard).toContain("normalizedEmail");
    expect(onboard).toContain("safeDescription");
    expect(onboard).toContain("readJsonObject(req)");
    expect(onboard).toContain("Invalid request body");

    expect(booking).toContain("cleanText");
    expect(booking).toContain("isValidDate");
    expect(booking).toContain("isValidTime");
    expect(booking).toContain("serviceName: service.name");
    expect(booking).toContain("readJsonObject(request)");
    expect(booking).toContain("Invalid request body");
    expect(booking).not.toContain("serviceName,");

    for (const source of [bookingUpdate, bookingConfig]) {
      expect(source).toContain("readJsonObject(request)");
      expect(source).toContain("Invalid request body");
    }

    expect(availability).toContain("isRateLimitedAsync");
    expect(availability).toContain('rateLimitKey(request, "booking-availability")');
    expect(availability).toContain('getContent("services", tenant)');
    expect(availability).toContain("service.comingSoon");
    expect(availability).toContain("serviceId.length > 120");

    expect(subscribe).toContain("isRateLimitedAsync");
    expect(subscribe).toContain('rateLimitKey(req, "subscribe")');
    expect(subscribe).toContain("cleanText(name, 160)");
    expect(subscribe).toContain("readJsonObject(req)");
    expect(subscribe).toContain("Invalid request body");
  });
});

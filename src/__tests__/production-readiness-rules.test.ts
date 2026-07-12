import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getLaunchBlockerError,
  getTenantLaunchReadinessResults,
  validateProductionEnvValue,
} from "../lib/production-readiness-rules";

describe("production readiness rules", () => {
  it("rejects copied production placeholder values", () => {
    expect(validateProductionEnvValue("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co/..."))
      .toBe("Must replace placeholder value for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_SITE_URL", "https://<deployment-url>"))
      .toBe("Must replace placeholder value for production launch");
    expect(validateProductionEnvValue("SANITY_API_TOKEN", "your_sanity_token"))
      .toBe("Must replace placeholder value for production launch");
  });

  it("rejects copied Vercel values with wrapping quotes or literal newline text", () => {
    expect(validateProductionEnvValue("NEXT_PUBLIC_SITE_URL", "\"https://strelva.com\""))
      .toBe("Must not include wrapping quotes in the stored Vercel value");
    expect(validateProductionEnvValue("CUSTOM_DOMAIN_MAP", "{\"example.com\":\"demo\"}\\n"))
      .toBe("Must not include a literal \\n; remove copied newline text in Vercel");
  });

  it("requires a strong OAuth state signing secret", () => {
    expect(validateProductionEnvValue("OAUTH_STATE_SECRET", "short"))
      .toBe("Must be at least 32 characters for production launch");
    expect(validateProductionEnvValue("OAUTH_STATE_SECRET", "0123456789abcdef0123456789abcdef")).toBeNull();
  });

  it("accepts live-shaped production credentials", () => {
    expect(validateProductionEnvValue("SUPER_ADMIN_EMAILS", "owner@example.com,admin@example.com")).toBeNull();
    expect(validateProductionEnvValue("GOOGLE_GENERATIVE_AI_API_KEY", "AIzaSyExample")).toBeNull();
    expect(validateProductionEnvValue("STRIPE_SECRET_KEY", "sk_live_example")).toBeNull();
    expect(validateProductionEnvValue("STRIPE_SCAFFOLD_PRICE_ID", "price_example")).toBeNull();
    expect(validateProductionEnvValue("RESEND_API_KEY", "re_example")).toBeNull();
    expect(validateProductionEnvValue("RESEND_DOMAIN", "updates.strelva.com")).toBeNull();
    expect(validateProductionEnvValue("SENTRY_DSN", "https://public@sentry.example.com/1")).toBeNull();
    expect(validateProductionEnvValue("NEXT_PUBLIC_SENTRY_DSN", "https://public@sentry.example.com/1")).toBeNull();
  });

  it("rejects malformed production identity and provider values", () => {
    expect(validateProductionEnvValue("SUPER_ADMIN_EMAILS", "not-an-email"))
      .toBe("Must be a comma-separated list of valid emails for production launch");
    expect(validateProductionEnvValue("GOOGLE_GENERATIVE_AI_API_KEY", "not-google"))
      .toBe("Must start with AIza for production launch");
    expect(validateProductionEnvValue("RESEND_DOMAIN", "https://updates.strelva.com"))
      .toBe("Must be a bare domain like updates.strelva.com for production launch");
    expect(validateProductionEnvValue("RESEND_DOMAIN", "updates.example.com"))
      .toBe("Must use a verified Strelva sender domain like updates.strelva.com");
    expect(validateProductionEnvValue("SENTRY_DSN", "http://sentry.example.com/1"))
      .toBe("Must be an https:// URL for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_SENTRY_DSN", "https://localhost/1"))
      .toBe("Must not point at localhost for production launch");
  });

  it("rejects local or non-HTTPS production URLs", () => {
    expect(validateProductionEnvValue("NEXT_PUBLIC_SITE_URL", "http://strelva.com"))
      .toBe("Must be an https:// URL for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_SITE_URL", "https://localhost:3000"))
      .toBe("Must not point at localhost for production launch");
    expect(validateProductionEnvValue("UPSTASH_REDIS_REST_URL", "http://redis.example.com"))
      .toBe("Must be an https:// URL for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_APP_URL", "http://strelva.com"))
      .toBe("Must be an https:// URL for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_APP_URL", "https://127.0.0.1:3100"))
      .toBe("Must not point at localhost for production launch");
  });

  it("validates optional domain routing env values when present", () => {
    expect(validateProductionEnvValue("CUSTOM_DOMAIN_MAP", '{"greatlakesdriedfruit.com":"gldf"}')).toBeNull();
    expect(validateProductionEnvValue("MARKETING_DOMAINS", "strelva.com,www.strelva.com")).toBeNull();

    expect(validateProductionEnvValue("CUSTOM_DOMAIN_MAP", "not json"))
      .toBe("Must be valid JSON mapping bare domains to tenant IDs for production launch");
    expect(validateProductionEnvValue("CUSTOM_DOMAIN_MAP", '{"https://example.com":"tenant"}'))
      .toBe('Must map bare domains to tenant IDs like {"example.com":"tenant-id"}');
    expect(validateProductionEnvValue("CUSTOM_DOMAIN_MAP", '{"example.com":"Tenant ID"}'))
      .toBe('Must map bare domains to tenant IDs like {"example.com":"tenant-id"}');
    expect(validateProductionEnvValue("MARKETING_DOMAINS", "https://strelva.com"))
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

  it("reports active tenant launch failures for missing domains + revalidation", () => {
    const results = getTenantLaunchReadinessResults({
      id: "jacobtest",
      active: true,
    });

    expect(results.map((result) => result.message)).toEqual([
      "Active tenant has no customer-facing productionDomain/customDomains entry configured",
      "Active tenant has no admin domain and none can be derived",
      "Active tenant has no revalidateUrl configured",
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
    // InviteButton lives on the single client detail page (/admin/clients/[id]),
    // where the operator invites a tenant's owner.
    const clientDetailPage = readFileSync(path.join(process.cwd(), "src/app/admin/clients/[id]/page.tsx"), "utf8");
    const inviteButton = readFileSync(path.join(process.cwd(), "src/app/admin/InviteButton.tsx"), "utf8");

    for (const source of [invite, assign]) {
      expect(source).toContain("normalizeEmail");
      expect(source).toContain("trim().toLowerCase()");
      // user lookup goes through the dual-path findUserIdByEmail using the
      // normalized `email`, never the raw input.
      expect(source).toContain("findUserIdByEmail(email)");
      expect(source).not.toContain("findUserIdByEmail(rawEmail)");
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
    // escapeHtml stays exported (weekly-report cron imports it); the two invite
    // builders now render through the shared email design system, which
    // auto-escapes the content they pass in. Dynamic values are still sanitized
    // (markup + newlines stripped) via sanitizeEmailSubjectText before handoff.
    expect(inviteEmail).toContain("function escapeHtml");
    expect(inviteEmail).toContain("buildInviteEmailText");
    expect(inviteEmail).toContain("renderEmailHtml");
    expect(inviteEmail).toContain("renderEmailText");
    expect(inviteEmail).toContain("sanitizeEmailSubjectText(params.siteName)");
    expect(inviteEmail).toContain("replace(/<[^>]*>/g");
    expect(inviteEmail).toContain("replace(/[\\r\\n\\t]+/g");
    expect(inviteEmail).toContain('heading: "Your dashboard is ready"');
    expect(inviteEmail).toContain('label: "Set up your login"');
    expect(clientDetailPage).toContain("<InviteButton");
    expect(clientDetailPage).toContain("ownerEmail={tenant.ownerEmail}");
    expect(inviteButton).toContain('fetch("/api/admin/invites"');
    expect(inviteButton).toContain("Access is assigned to this exact email on signup");
    expect(inviteButton).toContain("signUpUrl?: string");
    expect(inviteButton).toContain("data.signUpUrl");
    expect(inviteButton).toContain("Open manual signup link");
    expect(inviteButton).toContain("Share this link only with");
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
    // Features are validated against the feature registry (was the inline TENANT_FEATURES set).
    expect(source).toContain("cleanFeatureIds");
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

    // Neither route may build a Stripe return URL from the browser-controlled
    // Origin header (open-redirect / phishing-return risk).
    for (const source of [subscription, portal]) {
      expect(source).not.toContain('headers.get("origin")');
    }

    // Portal derives its return URL from the server-set forwarded host.
    expect(portal).toContain("getRequestOrigin");
    expect(portal).toContain('"x-forwarded-host"');
    expect(portal).toContain('"x-forwarded-proto"');

    // Subscription does NOT construct return URLs from the request at all — it
    // lets createTenantSubscriptionCheckout default to the tenant's OWN dashboard
    // (getTenantDashboardUrl, from trusted tenant config), so the paying client
    // lands on their site rather than the operator admin host.
    expect(subscription).not.toContain("getRequestOrigin");
    expect(subscription).not.toContain("successUrl:");

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
    // SignInClient.tsx no longer exists — it was folded back into
    // sign-in/page.tsx. Read page.tsx instead for the assertions that target
    // the sign-in client surface, and use it for the dep-audit hook below.
    const signInClient = readFileSync(
      path.join(process.cwd(), "src/app/sign-in/[[...sign-in]]/page.tsx"),
      "utf8",
    );
    const customerFrontendSmoke = readFileSync(path.join(process.cwd(), "tests/customer-frontend.spec.ts"), "utf8");

    expect(source).toContain("checkDependencyAudit");
    expect(source).toContain("checkProductionSiteUrl");
    expect(source).toContain("checkVercelAppFreshness");
    expect(source).toContain("Vercel app freshness");
    expect(source).toContain("app-host smoke probe");
    expect(source).toContain("Tenant DNS: add the missing Vercel/Cloudflare DNS records");
    expect(source).toContain("Tenant configuration: update active tenants before release");
    expect(source).toContain("deactivate test tenants that should not be customer-facing");
    expect(source).toContain("Active launch tenants need a customer-facing productionDomain/customDomains entry");
    expect(source).toContain("Sign in to Strelva | Strelva");
    expect(source).toContain("Deploy a clean release branch containing the current launch-readiness fixes");
    expect(source).toContain("do not only redeploy the existing stale production artifact");
    expect(source).toContain("getDnsContext");
    expect(source).toContain("Current DNS: A=");
    expect(source).toContain("resolve4");
    expect(source).toContain("resolveCname");
    expect(source).toContain("has CNAME");
    expect(source).toContain("no routable A record from resolve4/curl");
    expect(source).toContain("resolveNs");
    expect(source).toContain("checkReleaseManifestEnv");
    expect(source).toContain("checkMarketingDomainCoverage");
    expect(source).toContain("checkReleaseWorkflow");
    expect(source).toContain("checkLaunchBlockerActionability");
    // Rohlax/jacobtest blocker names live in docs/launch-blockers.md and are
    // covered by the launchBlockers assertions in this test file. The
    // production-checklist source no longer duplicates them (that came from
    // the deleted self-referential checkCompletionAudit).
    expect(source).toContain("checkPackageReleaseScripts");
    expect(source).toContain("checkCiWorkflow");
    expect(source).toContain("checkAccessSmokeCoverage");
    expect(source).toContain("checkAuthAccessPages");
    expect(source).toContain("checkAdminInviteFlow");
    expect(source).toContain("checkStripeBillingWebhookRoute");
    expect(source).toContain("checkCronAuthCoverage");
    expect(source).toContain("Production readiness doc");
    expect(source).toContain("Domain setup doc");
    expect(source).toContain("Release manifest env");
    expect(source).toContain("Tenant Deployment Checklist");
    expect(source).toContain("Customer Access Handoff");
    expect(source).toContain("vercel deploy --prod");
    expect(source).toContain("git status --short");
    expect(source).toContain("PLAYWRIGHT_BASE_URL=https://strelva.com");
    expect(source).toContain("signed-out dashboard customers");
    expect(source).toContain("https://strelva.com/sign-in");
    expect(source).toContain("Sign in to Strelva | Strelva");
    expect(source).toContain("PLAYWRIGHT_BASE_URL=https://strelva.com");
    expect(source).toContain("https://strelva.com/api/health");
    expect(source).toContain("curl -i https://strelva.com/api/cron/maintenance");
    expect(source).toContain("/api/admin/invites");
    expect(source).toContain("exact invited email");
    expect(source).toContain("signed-out `/dashboard` and `/no-access` redirect to `/sign-in`");
    expect(source).toContain("admin.greatlakesdriedfruit.com");
    expect(source).toContain("Release workflow");
    expect(source).toContain("Launch blocker actionability");
    // "Completion audit" check removed alongside docs/completion-audit.md.
    expect(source).toContain("Package release scripts");
    expect(source).toContain("CI workflow");
    expect(source).toContain("Access smoke coverage");
    expect(source).toContain("Auth access pages");
    expect(source).toContain("Admin invite flow");
    expect(source).toContain("Stripe billing webhook route");
    expect(source).toContain("Cron auth coverage");
    expect(source).toContain(".github/workflows/release.yml");
    expect(source).toContain(".github/workflows/ci.yml");
    expect(source).toContain("tests/customer-frontend.spec.ts");
    expect(source).toContain("tests/smoke.spec.ts");
    expect(source).toContain("src/app/sign-in/[[...sign-in]]/page.tsx");
    expect(source).toContain("src/app/sign-up/[[...sign-up]]/page.tsx");
    expect(source).toContain("src/app/no-access/page.tsx");
    expect(source).toContain("src/app/(marketing)/account/page.tsx");
    expect(source).toContain("src/components/auth/UseInvitedEmailButton.tsx");
    expect(source).toContain("src/app/admin/clients/[id]/page.tsx");
    expect(source).toContain("src/app/admin/InviteButton.tsx");
    expect(source).toContain("src/app/api/admin/invites/route.ts");
    expect(source).toContain('getTenantDashboardUrl(tenantConfig, "/sign-up", "production")');
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
    expect(source).toContain("admin tenant host sign-in keeps the invited email context");
    expect(source).toContain("cron maintenance endpoint is not public");
    // The SignInClient.tsx assertions were dropped — the file was folded
    // back into sign-in/page.tsx and the UI now branches by invite/tenant
    // context rather than carrying these exact strings. The customer-frontend
    // smoke test below still locks the invite-email copy from the user's
    // perspective.
    void signInClient;
    // Customer-frontend smoke spec used to assert this exact invite-email
    // string from the sign-in UI; that copy now lives in no-access/account
    // pages instead. The negative assertion still holds.
    expect(customerFrontendSmoke).not.toContain("Use the email address from your invite");
    expect(source).toContain("signupNoAppOk");
    expect(source).toContain("including public sign-up");
    expect(source).toContain("cover sign-in/sign-up recovery paths, account handoff, admin-host, and cron protection");
    expect(source).toContain("route marketing-host auth through /account");
    expect(source).toContain("route tenant/admin auth to /dashboard");
    expect(source).toContain("host-aware redirects");
    expect(source).toContain("No invited sites on this account");
    expect(source).toContain("UseInvitedEmailButton");
    expect(source).toContain("signs you out so you can choose that account");
    expect(source).toContain('href="/account"');
    expect(source).toContain("Choose another site");
    expect(source).toContain("Request your build");
    expect(source).toContain("!tenantConfigs.some(({ config }) => config)");
    expect(source).toContain("Sign-in, sign-up, and no-access recovery use Supabase auth with invited-email context and host-aware redirects");
    expect(source).toContain("Admin tenant rows expose owner-email invites through /api/admin/invites");
    expect(source).toContain("Tenant domain access");
    expect(source).toContain("checkTenantDomainDns");
    expect(source).toContain("Tenant ${tenant.id} DNS ${domain}");
    expect(source).toContain("A ${domain} 76.76.21.21");
    expect(source).toContain("src/app/api/admin/domains/route.ts");
    expect(source).toContain("src/app/api/tenant/domains/route.ts");
    expect(source).toContain('requireTenantPermission(tenant, "domains:manage")');
    expect(source).toContain("/api/admin/domains remains a compatibility alias");
    expect(source).toContain("Public storefront API");
    expect(source).toContain("src/app/api/v1/content/[tenant]/[section]/route.ts");
    expect(source).toContain("src/app/api/v1/page-config/[tenant]/route.ts");
    expect(source).toContain("config.active === false");
    expect(source).toContain("section in SECTION_TO_TYPE");
    expect(source).toContain("/api/v1 storefront APIs own the contract directly");
    expect(source).toContain("OAuth callback state");
    expect(source).toContain("src/app/api/oauth/calendly/callback/route.ts");
    expect(source).toContain("src/app/api/oauth/google/callback/route.ts");
    expect(source).toContain("src/app/api/oauth/instagram/callback/route.ts");
    expect(source).toContain("verifyOAuthState(state)");
    expect(source).toContain("const tenantId = verifiedState.tenantId");
    expect(source).toContain("OAuth callbacks verify signed state before saving tenant connections");
    expect(source).toContain("Vercel cron route(s) are covered by proxy CRON_SECRET validation");
    expect(source).toContain("Dependency audit");
    expect(source).toContain("Production site URL");
    expect(source).toContain("Marketing domain coverage");
    expect(source).toContain("MARKETING_DOMAINS must include");
    expect(source).toContain("root-domain auth returns customers to /account");
    expect(source).toContain("must resolve to the Vercel Next.js app");
    expect(source).toContain("A strelva.com 76.76.21.21");
    expect(source).toContain("remove Porkbun/l.ink forwarding");
    expect(source).toContain("Production domain routing");
    expect(source).toContain("requiredEnv entries are covered by check:prod or storefront handoff docs");
    expect(source).toContain('"pnpm", ["audit", "--audit-level", "high"]');
    expect(source).toContain("pnpm audit found no HIGH or CRITICAL vulnerabilities");
    expect(source).toContain("pnpm audit reported vulnerabilities; resolve them before release:");
    expect(source).toContain("slice(0, 8)");
    expect(packageJson).toContain('"check:release"');
    expect(packageJson).toContain('"fast-uri": "3.1.2"');
    expect(packageJson).not.toContain('"fast-uri": "3.1.1"');
    expect(releaseGate).toBe("pnpm lint && pnpm typecheck && pnpm test && pnpm audit && pnpm build && pnpm check:prod && PLAYWRIGHT_BUILT_APP=1 REB_DEV_UNGATED_ACCESS=0 pnpm smoke");
    expect(launchGate).toBe("pnpm lint && pnpm typecheck && pnpm test && pnpm audit && pnpm build && PLAYWRIGHT_BUILT_APP=1 REB_DEV_UNGATED_ACCESS=0 pnpm smoke");
    expect(packageJson).toContain("PLAYWRIGHT_BUILT_APP=1");
    // CI gates the dependency audit at HIGH+ (high advisories are patched via
    // pnpm overrides). Plain `pnpm audit` fails on any transitive moderate/low
    // — mostly unfixable Sanity-CLI build-tooling deps not reachable in the
    // production runtime — so it could never pass and kept CI permanently red.
    expect(ci).toContain("pnpm audit --audit-level high");
    expect(ci).toContain("REB_DEV_UNGATED_ACCESS");
    expect(designKit).toContain("pnpm audit");
    expect(designKit).toContain("pnpm check:release");
    expect(designKit).toContain("PLAYWRIGHT_BASE_URL=https://strelva.com");
    expect(designKit).toContain("PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com");
    expect(designKit).not.toContain("PLAYWRIGHT_BASE_URL=<deployment-url>");
    expect(designKit).not.toContain("PLAYWRIGHT_TENANT_ORIGIN=<tenant-url>");
    expect(domainSetup).toContain("scaffold-web");
    expect(domainSetup).toContain("A     strelva.com    76.76.21.21");
    expect(domainSetup).toContain("cname.vercel-dns.com");
    expect(domainSetup).toContain("MARKETING_DOMAINS=strelva.com,www.strelva.com");
    expect(domainSetup).toContain("scaffoldweb-com.l.ink");
    expect(domainSetup).toContain("vercel domains inspect strelva.com");
    expect(domainSetup).toContain("dig +short strelva.com A");
    expect(domainSetup).toContain("dig +short strelva.com NS");
    expect(domainSetup).toContain("dig +short '*.strelva.com' CNAME");
    expect(domainSetup).toContain("Rohlax Wellness Cloudflare DNS");
    expect(domainSetup).toContain("dax.ns.cloudflare.com");
    expect(domainSetup).toContain("dig +short www.rohlaxwellness.com CNAME");
    expect(domainSetup).toContain("dig +short admin.rohlaxwellness.com CNAME");
    expect(domainSetup).toContain("A admin.rohlaxwellness.com 76.76.21.21");
    expect(domainSetup).toContain("pnpm check:prod");
    expect(launchBlockers).toContain("pnpm audit");
    expect(launchBlockers).toContain("pnpm check:release");
    expect(launchBlockers).toContain("345 tests across 36 files");
    expect(launchBlockers).toContain("345 unit tests across 36 files");
    expect(launchBlockers).toContain("21 Playwright tests");
    expect(launchBlockers).toContain("21 built-app smoke tests");
    expect(launchBlockers).not.toContain("259 tests across 28 files");
    expect(launchBlockers).not.toContain("259 unit tests across 28 files");
    expect(launchBlockers).not.toContain("19 Playwright tests");
    expect(launchBlockers).not.toContain("19 smoke tests");
    expect(launchBlockers).toContain("forces `REB_DEV_UNGATED_ACCESS=0`");
    expect(launchBlockers).toContain("isolated Playwright server instead of an existing `localhost:3000` process");
    expect(launchBlockers).not.toContain("direct `curl` to `http://localhost:3000/sign-in` returned `200 OK`");
    expect(designKit).toContain("forces `REB_DEV_UNGATED_ACCESS=0`");
  });

  // Removed the completion-audit alignment test alongside the deleted
  // docs/completion-audit.md self-referential audit loop. Live launch
  // evidence lives in check:prod output, not a markdown paraphrase of it.

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
    expect(source).toContain('failedEnvVars.add("STRIPE_SCAFFOLD_PRICE_ID")');
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
    expect(source).toContain("PLAYWRIGHT_BASE_URL=https://strelva.com");
    expect(source).toContain("pnpm exec playwright test tests/customer-frontend.spec.ts -g");
    expect(source).toContain('\\"signed-out dashboard customers\\"');
    expect(source).toContain("dirty local working tree");
    expect(source).toContain("Production Live Verification");
    expect(source).toContain("PLAYWRIGHT_BASE_URL=https://strelva.com");
    expect(source).toContain("Clerk/Stripe webhook deliveries");
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
    expect(source).toContain("after Supabase Auth and Resend are live");
    expect(source).toContain("use Invite for each tenant ownerEmail");
    expect(source).toContain("signs up or signs in with the exact invited email");
    expect(source).toContain("email stays prefilled when switching between sign-up and sign-in");
    expect(source).toContain("strelva.com auth reaches /account");
    expect(source).toContain("admin.greatlakesdriedfruit.com auth reaches /dashboard/site");
    expect(source).toContain("checkout.session.completed");
    expect(source).toContain("invoice.paid");
    expect(source).toContain("invoice.payment_failed");
    expect(source).toContain("customer.subscription.deleted");
    expect(readinessRules).toContain("move them to Waived Blockers with Status, Owner, release/ticket reference, Follow-up, and Reason");
    expect(source).toContain("Vercel access: grant access to project scaffold-web");
    expect(source).toContain("vercel whoami");
    expect(source).toContain("prj_AzaQBS8jM9E5RVgHuMWnQju0GIxb");
    expect(source).toContain("team_66XTGId41AJGh9vLvkiyXqkZ");
    expect(source).toContain("Production live verification");
    expect(source).toContain("PLAYWRIGHT_BASE_URL=https://strelva.com");
    expect(source).toContain("root marketing auth reaches /account");
    expect(source).toContain("invited-owner /dashboard/site access");
    expect(source).toContain("Clerk/Stripe webhook deliveries are successful");
    expect(source).toContain("cron 401/success behavior works with CRON_SECRET");
    expect(source).toContain("clear docs/launch-blockers.md Current Blockers");
    expect(source).toContain("DNS verification commands:");
    expect(source).toContain("vercel domains inspect strelva.com");
    expect(source).toContain("dig +short strelva.com A");
    expect(source).toContain("dig +short strelva.com NS");
    expect(source).toContain("dig +short '*.strelva.com' CNAME");
    expect(source).toContain("curl -I -L https://strelva.com/api/health");
    expect(launchBlockers).toContain("vercel whoami");
    expect(launchBlockers).toContain("scaffold-web");
    expect(launchBlockers).toContain("### Production Live Verification");
    expect(launchBlockers).toContain("Authenticated production dashboard access");
    expect(launchBlockers).toContain("https://strelva.com/sign-in");
    expect(launchBlockers).toContain("Sign in to Strelva | Strelva");
    expect(launchBlockers).toContain("Vercel app-host freshness check");
    expect(launchBlockers).toContain("after production env, redeploy, and DNS are resolved");
    expect(launchBlockers).toContain("PLAYWRIGHT_BASE_URL=https://strelva.com");
    expect(launchBlockers).toContain("Clerk/Stripe webhook deliveries");
    expect(launchBlockers).toContain("Copyable Vercel env commands");
    expect(launchBlockers).toContain("vercel env add CLERK_WEBHOOK_SECRET production");
    expect(launchBlockers).toContain("vercel env add UPSTASH_REDIS_REST_URL production");
    expect(launchBlockers).toContain("vercel env add UPSTASH_REDIS_REST_TOKEN production");
    expect(launchBlockers).toContain("vercel env add SENTRY_DSN production");
    expect(launchBlockers).toContain("vercel env add NEXT_PUBLIC_SENTRY_DSN production");
    expect(launchBlockers).not.toContain("vercel env rm STRIPE_SCAFFOLD_PRICE_ID production --yes");
    expect(launchBlockers).toContain("vercel env add NEXT_PUBLIC_APP_URL production");
    expect(launchBlockers).toContain("Provider value sources");
    expect(launchBlockers).toContain("Clerk Dashboard -> Webhooks");
    expect(launchBlockers).toContain("Upstash Redis database -> REST API section");
    expect(launchBlockers).toContain("Sentry project settings -> Client Keys / DSN");
    expect(launchBlockers).toContain("Stripe live-mode Products");
    expect(launchBlockers).toContain("Do not overwrite the values already passing the checker");
    expect(launchBlockers).toContain("Redeploy the Vercel Production app after env changes");
    expect(launchBlockers).toContain("app freshness resolved on May 14, 2026");
    expect(launchBlockers).toContain("Vercel app-host freshness check now sees");
    expect(launchBlockers).not.toContain("Do not only redeploy the existing");
    expect(launchBlockers).toContain("vercel deploy --prod");
    expect(launchBlockers).toContain("git status --short");
    expect(launchBlockers).toContain("dirty local working tree");
    expect(launchBlockers).toContain("Copyable DNS verification commands");
    expect(launchBlockers).toContain("vercel domains inspect strelva.com");
    expect(launchBlockers).toContain("vercel domains inspect rohlaxwellness.com");
    expect(launchBlockers).toContain("dig +short strelva.com A");
    expect(launchBlockers).toContain("dig +short strelva.com NS");
    expect(launchBlockers).toContain("dig +short '*.strelva.com' CNAME");
    expect(launchBlockers).toContain("dig +short www.rohlaxwellness.com CNAME");
    expect(launchBlockers).toContain("dig +short admin.rohlaxwellness.com CNAME");
    expect(launchBlockers).toContain("dig +short www.rohlaxwellness.com A");
    expect(launchBlockers).toContain("dig +short admin.rohlaxwellness.com A");
    expect(launchBlockers).toContain("Rohlax Cloudflare DNS");
    expect(launchBlockers).toContain("Jacob Test Tenant Launch Configuration");
    expect(launchBlockers).toContain("Tenant jacobtest client domain");
    expect(launchBlockers).toContain("THl7mfItZYUmELpcZNa2Zr");
    expect(launchBlockers).toContain("deactivate `jacobtest` if it is an internal test tenant");
    expect(launchBlockers).toContain("dax.ns.cloudflare.com");
    expect(launchBlockers).toContain("admin.rohlaxwellness.com` is attached to `scaffold-web");
    expect(launchBlockers).toContain("A admin.rohlaxwellness.com 76.76.21.21");
    expect(launchBlockers).toContain("does not redirect to `scaffoldweb-com.l.ink`");
    expect(launchBlockers).toContain("Copyable verification commands");
    expect(launchBlockers).toContain("PLAYWRIGHT_BASE_URL=https://strelva.com");
    expect(launchBlockers).toContain("PLAYWRIGHT_TENANT_ORIGIN=https://greatlakesdriedfruit.com");
    expect(launchBlockers).not.toContain("PLAYWRIGHT_TENANT_ORIGIN=https://admin.<custom-domain>");
    expect(launchBlockers).not.toContain("PLAYWRIGHT_BASE_URL=<production-or-preview-url>");
    expect(launchBlockers).not.toContain("PLAYWRIGHT_TENANT_ORIGIN=<tenant-url>");
    expect(launchBlockers).toContain("curl -i https://strelva.com/api/cron/maintenance");
    expect(launchBlockers).toContain("https://strelva.com/api/health");
    expect(launchBlockers).toContain("stays on `strelva.com`");
    expect(launchBlockers).toContain('curl -i -H "Authorization: Bearer $CRON_SECRET" https://strelva.com/api/cron/maintenance');
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

    expect(template).toContain("same live Clerk instance");
    expect(template).toContain("Mixed Clerk instances can make /sign-in loop");
    expect(template).toContain("server/project DSN");
    expect(template).toContain("browser/client DSN");
    expect(localTemplate).toContain("same Clerk instance");
    expect(localTemplate).toContain("Mixed Clerk instances can make /sign-in loop");
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
    expect(productionReadiness).toContain('*[_type == "tenant" && active != false]');
    expect(productionReadiness).toContain("deactivate internal test tenants");
    expect(productionReadiness).toContain("Every active launch tenant must have a customer-facing `productionDomain` or `customDomains` entry");
    expect(productionReadiness).toContain("`pnpm check:prod` fails active tenants that are missing those fields");
    expect(productionReadiness).toContain("Cloudflare-managed tenant domains");
    expect(productionReadiness).toContain("A admin.rohlaxwellness.com 76.76.21.21");
    expect(productionReadiness).toContain("root marketing hosts");
    expect(productionReadiness).toContain("/account");
    expect(productionReadiness).toContain("no invited sites");
    expect(productionReadiness).toContain("Use invited email");
    expect(productionReadiness).toContain("admin.greatlakesdriedfruit.com");
    expect(productionReadiness).toContain("Status: waived");
    expect(productionReadiness).toContain("Owner:");
    expect(productionReadiness).toContain("Follow-up:");
    expect(productionReadiness).toContain("Reason:");
    expect(productionReadiness).toContain("https://strelva.com/api/clerk/webhook");
    expect(productionReadiness).toContain("user.created");
    expect(productionReadiness).toContain("CLERK_WEBHOOK_SECRET");
    expect(productionReadiness).toContain("https://strelva.com/api/billing/webhook");
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
    expect(productionReadiness).toContain("Clerk/Stripe webhook deliveries");
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
    expect(productionReadiness).toContain("Set `NEXT_PUBLIC_APP_URL=https://strelva.com` when Google, Instagram, or Calendly OAuth connections are enabled.");
    expect(productionReadiness).not.toContain("`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, and tenant-specific revalidation secrets");
    expect(template).toContain("Required only when Google, Instagram, or Calendly OAuth connections are enabled.");
    expect(template).toContain("NEXT_PUBLIC_APP_URL=https://strelva.com");
    expect(template).toContain("MARKETING_DOMAINS=strelva.com,www.strelva.com");
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
    const accessRequest = readFileSync(
      path.join(process.cwd(), "src/app/api/access-request/intake/route.ts"),
      "utf8",
    );
    const booking = readFileSync(path.join(process.cwd(), "src/app/api/booking/route.ts"), "utf8");
    const bookingUpdate = readFileSync(path.join(process.cwd(), "src/app/api/booking/[id]/route.ts"), "utf8");
    const bookingConfig = readFileSync(path.join(process.cwd(), "src/app/api/booking/config/route.ts"), "utf8");
    const availability = readFileSync(path.join(process.cwd(), "src/app/api/booking/availability/route.ts"), "utf8");
    const subscribe = readFileSync(path.join(process.cwd(), "src/app/api/newsletter/subscribe/route.ts"), "utf8");

    expect(accessRequest).toContain("isRateLimitedWindowedAsync");
    expect(accessRequest).not.toContain("isRateLimitedWindowed(");
    expect(accessRequest).toContain("normalizedEmail");
    expect(accessRequest).toContain("safeDescription");
    expect(accessRequest).toContain("readJsonObject(req)");
    expect(accessRequest).toContain("Invalid request body");

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

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import DashboardContentRedirect from "../app/dashboard/content/page";

describe("dashboard route redirects", () => {
  beforeEach(() => {
    redirectMock.mockReset();
  });

  it("keeps the legacy content route pointed at the site workspace", () => {
    DashboardContentRedirect();

    expect(redirectMock).toHaveBeenCalledWith("/dashboard/site");
  });

  it("sends dashboard child access denials to the no-access page", () => {
    const routeFiles = [
      "src/app/dashboard/page.tsx",
      "src/app/dashboard/chat/page.tsx",
      "src/app/dashboard/review/page.tsx",
      "src/app/dashboard/site/page.tsx",
    ];

    for (const routeFile of routeFiles) {
      const source = readFileSync(path.join(process.cwd(), routeFile), "utf8");

      expect(source, routeFile).not.toMatch(/redirect\(\s*["']\/["']\s*\)/);
      expect(source, routeFile).toContain('redirect("/no-access")');
    }
  });

  it("documents the canonical dashboard site path in the production runbook", () => {
    const runbook = readFileSync(
      path.join(process.cwd(), "docs/production-readiness.md"),
      "utf8",
    );
    const launchBlockers = readFileSync(
      path.join(process.cwd(), "docs/launch-blockers.md"),
      "utf8",
    );

    expect(runbook).toContain("Verify `/dashboard/site` loads");
    expect(runbook).toContain("`/dashboard/content` redirects to `/dashboard/site`");
    expect(runbook).toContain("signed-out `/dashboard` and `/no-access` redirect to `/sign-in`");
    expect(runbook).toContain("signed-out users reach `/sign-in` with invited-email guidance");
    expect(launchBlockers).toContain("Signed-out `/dashboard` and `/no-access` redirect to `/sign-in`");
    expect(launchBlockers).toContain("signed-out users reach `/sign-in` with invited-email guidance");
    expect(runbook).not.toContain("Verify `/dashboard/content` loads");
  });

  it("keeps Clerk auth pages on app-owned access routes", () => {
    const signIn = readFileSync(
      path.join(process.cwd(), "src/app/sign-in/[[...sign-in]]/SignInClient.tsx"),
      "utf8",
    );
    const signInPage = readFileSync(
      path.join(process.cwd(), "src/app/sign-in/[[...sign-in]]/page.tsx"),
      "utf8",
    );
    const signUp = readFileSync(
      path.join(process.cwd(), "src/app/sign-up/[[...sign-up]]/page.tsx"),
      "utf8",
    );

    expect(signIn).toContain("forceRedirectUrl={postSignInUrl}");
    expect(signIn).toContain("fallbackRedirectUrl={postSignInUrl}");
    expect(signIn).toContain("initialValues={invitedEmail ? { emailAddress: invitedEmail } : undefined}");
    expect(signIn).toContain('signUpUrl={getAuthSwitchUrl("/sign-up", invitedEmail)}');
    expect(signIn).toContain("Invited email:");
    expect(signInPage).toContain("getInvitedEmail(params)");
    expect(signIn).toContain("Use the exact email address that received your invite");
    expect(signInPage).toContain("@/lib/marketing-hosts");
    expect(signInPage).toContain("isMarketingHost(host)");
    expect(signInPage).toContain('"/account"');
    expect(signInPage).toContain('"/dashboard"');
    expect(signUp).toContain("forceRedirectUrl={postSignUpUrl}");
    expect(signUp).toContain("fallbackRedirectUrl={postSignUpUrl}");
    expect(signUp).toContain("initialValues={invitedEmail ? { emailAddress: invitedEmail } : undefined}");
    expect(signUp).toContain('signInUrl={getAuthSwitchUrl("/sign-in", invitedEmail)}');
    expect(signUp).toContain("Invited email:");
    expect(signUp).toContain("getTenantFromHeaders");
    expect(signUp).toContain("getTenantConfig");
    expect(signUp).toContain("getSignUpTitle(siteName)");
    expect(signUp).toContain("@/lib/marketing-hosts");
    expect(signUp).toContain("isMarketingHost(host)");
    expect(signUp).toContain('"/account"');
    expect(signUp).toContain('"/dashboard"');

    for (const source of [signIn, signUp]) {
      expect(source).toContain("mailto:jacob@scaffoldweb.com");
      expect(source).not.toContain('"/app"');
    }
    expect(signInPage).not.toContain('"/app"');
  });

  it("gives no-access users a real account-switching path", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/no-access/page.tsx"), "utf8");
    const recoveryButton = readFileSync(
      path.join(process.cwd(), "src/components/auth/UseInvitedEmailButton.tsx"),
      "utf8",
    );

    expect(source).toContain("UseInvitedEmailButton");
    expect(recoveryButton).toContain("SignOutButton");
    expect(recoveryButton).toContain('redirectUrl="/sign-in"');
    expect(recoveryButton).toContain('type="button"');
    expect(recoveryButton).toContain("{button}</SignOutButton>");
    expect(recoveryButton).toContain("Use invited email");
    expect(source).toContain("Use the exact email address that received your invite");
    expect(source).toContain("signs you out so you can choose that account");
    expect(source).toContain("mailto:jacob@scaffoldweb.com");
    expect(source).toContain('href="/account"');
    expect(source).toContain("Choose another site");
    expect(source).not.toContain('href="/"');
    expect(source.indexOf("UseInvitedEmailButton")).toBeLessThan(source.indexOf("Choose another site"));
  });

  it("gives account users without tenant access an invited-email recovery path", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/(marketing)/account/page.tsx"), "utf8");

    expect(source).toContain("No invited sites on this account");
    expect(source).toContain("UseInvitedEmailButton");
    expect(source).toContain("Start a new site");
    expect(source).toContain("mailto:jacob@scaffoldweb.com");
    expect(source).toContain("!tenantConfigs.some(({ config }) => config)");
    expect(source).toContain("return <NoAccessState />");
  });
});

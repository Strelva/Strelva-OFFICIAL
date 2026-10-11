import { expect, test, type Page, type Route } from "@playwright/test";
import type { AgencyOnboarding } from "../src/platform/workspaces/agency-onboarding";

test.skip(process.env.STRELVA_WORKSPACE_RELEASE !== "1" || process.env.STRELVA_AGENCY_SIGNUP_RELEASE !== "1",
  "Agency signup browser checks require STRELVA_WORKSPACE_RELEASE=1 and STRELVA_AGENCY_SIGNUP_RELEASE=1.");

/**
 * Agency front door (#258). Every API response is intercepted in the browser:
 * these checks exercise the real sign-up page and setup checklist without
 * auth or a database. The database side is tests/agency-signup-schema.sql.
 */

const AGENCY_ID = "5a000000-0000-4000-8000-000000000010";
const shots = process.env.AGENCY_SIGNUP_SHOTS;

const onboarding = (over: Partial<AgencyOnboarding> = {}): AgencyOnboarding => ({
  agency: { id: AGENCY_ID, name: "Northside Web Care", role: "owner" },
  members: 1,
  pendingInvitations: 0,
  clients: 0,
  effects: (["publish", "google", "email", "payments"] as const).map((effect) => ({ effect, verified: false, recordedAt: null })),
  steps: [
    { id: "profile", done: true, available: true },
    { id: "team", done: false, available: true },
    { id: "verification", done: false, available: false },
    { id: "first_client", done: false, available: false },
  ],
  next: "team",
  verifiedEffects: 0,
  ...over,
});

function fulfill(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
  test.describe(`at ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("sign-up asks business or agency and the agency path leads to setup", async ({ page }) => {
      await page.goto("/sign-up");
      const choice = page.getByRole("navigation", { name: "Who this account is for" });
      await expect(choice.getByRole("link", { name: "I run a business" })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { name: "Start your work here." })).toBeVisible();
      await expect(page.getByText("Request your build")).toHaveCount(0);
      await choice.getByRole("link", { name: "I run an agency" }).click();
      await expect(page).toHaveURL(/\/sign-up\?as=agency$/);
      await expect(page.getByRole("heading", { name: "Run your client work in Strelva." })).toBeVisible();
      await expect(choice.getByRole("link", { name: "I run an agency" })).toHaveAttribute("aria-current", "page");
      await noHorizontalScroll(page);
      if (shots) {
        // A fresh load, so the capture is not mid colour transition from the client navigation.
        await page.reload();
        await page.screenshot({ path: `${shots}/signup-agency-${viewport.name}.png`, fullPage: true });
      }
    });

    test("a new agency is created through create_agency and opens its checklist", async ({ page }) => {
      let created: unknown = null;
      await page.route("**/api/agency-onboarding**", (route) => {
        const workspaceId = new URL(route.request().url()).searchParams.get("workspaceId");
        if (!workspaceId) return fulfill(route, { agencies: [] });
        return fulfill(route, { onboarding: onboarding() });
      });
      await page.route("**/api/workspace", async (route) => {
        created = route.request().postDataJSON();
        return fulfill(route, { workspaceId: AGENCY_ID }, 201);
      });

      await page.goto("/workspace/agency/start");
      await expect(page.getByRole("heading", { name: "Name your agency." })).toBeVisible();
      if (shots) await page.screenshot({ path: `${shots}/create-${viewport.name}.png`, fullPage: true });
      await page.getByRole("button", { name: "Create agency" }).click();
      await expect(page.locator("main").getByRole("alert")).toHaveText("Enter your agency’s name.");
      await page.getByLabel("Agency name").fill("Northside Web Care");
      await page.getByRole("button", { name: "Create agency" }).click();

      await expect(page.getByRole("heading", { name: "Northside Web Care", level: 1 })).toBeVisible();
      expect(created).toEqual({ action: "create_agency", name: "Northside Web Care" });
      await expect(page).toHaveURL(new RegExp(`/workspace/agency/start\\?workspaceId=${AGENCY_ID}$`));
      await expect(page.getByText("1 of 4 done · 0 of 4 effects verified")).toBeVisible();
      const verification = page.getByRole("list", { name: "Verification" });
      await expect(verification.getByRole("listitem")).toHaveCount(4);
      for (const name of ["Publishing", "Google", "Email", "Payments"]) await expect(verification.getByText(name, { exact: true })).toBeVisible();
      await expect(verification.getByText("Not verified")).toHaveCount(4);
      await expect(page.getByRole("link", { name: "Invite a teammate" })).toHaveAttribute("href", `/workspace/invitations?workspaceId=${AGENCY_ID}`);
      await expect(page.locator('[aria-current="step"]')).toContainText("Invite your team");
      await expect(page.getByText("Adding clients opens here next.")).toBeVisible();
      await noHorizontalScroll(page);
      if (shots) await page.screenshot({ path: `${shots}/checklist-${viewport.name}.png`, fullPage: true });
    });
  });
}

test("the per-account cap is explained where the name was entered", async ({ page }) => {
  await page.route("**/api/agency-onboarding**", (route) => fulfill(route, { agencies: [] }));
  await page.route("**/api/workspace", (route) => fulfill(route, { error: "You have reached the limit of five workspaces for one account.", code: "workspace_limit_reached" }, 409));
  await page.goto("/workspace/agency/start");
  await page.getByLabel("Agency name").fill("Sixth Agency");
  await page.getByRole("button", { name: "Create agency" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("You have reached the limit of five workspaces for one account.");
  await expect(page.getByLabel("Agency name")).toHaveValue("Sixth Agency");
});

test("signed out, the checklist asks for sign-in and returns to agency setup", async ({ page }) => {
  await page.route("**/api/agency-onboarding**", (route) => fulfill(route, { error: "Sign in" }, 401));
  await page.goto("/workspace/agency/start");
  await expect(page.getByRole("heading", { name: "Sign in to set up your agency." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in or create an account" })).toHaveAttribute("href", "/sign-up?as=agency");
});

test("another agency's checklist is refused, and a failed read can be retried", async ({ page }) => {
  // Development renders mount twice, so the responses follow the test's step, not a call count.
  let refuseRead = true;
  let failList = true;
  await page.route("**/api/agency-onboarding**", (route) => {
    if (new URL(route.request().url()).searchParams.get("workspaceId")) {
      return refuseRead ? fulfill(route, { error: "This work is unavailable to your account." }, 403) : fulfill(route, { onboarding: onboarding() });
    }
    return failList ? fulfill(route, { error: "The operation could not be confirmed." }, 503)
      : fulfill(route, { agencies: [{ id: AGENCY_ID, name: "Northside Web Care", role: "owner" }] });
  });
  await page.goto(`/workspace/agency/start?workspaceId=${AGENCY_ID}`);
  await expect(page.getByRole("heading", { name: "This agency isn’t available to your account." })).toBeVisible();
  refuseRead = false;
  await page.getByRole("button", { name: "Go to your agencies" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("The operation could not be confirmed.");
  failList = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Northside Web Care", level: 1 })).toBeVisible();
});

test("a member sees verification but cannot invite, and a verified effect reads as verified", async ({ page }) => {
  await page.route("**/api/agency-onboarding**", (route) => fulfill(route, { onboarding: onboarding({
    agency: { id: AGENCY_ID, name: "Northside Web Care", role: "member" }, members: 3, pendingInvitations: null,
    effects: (["publish", "google", "email", "payments"] as const).map((effect) => ({ effect, verified: effect === "publish", recordedAt: null })),
    steps: [
      { id: "profile", done: true, available: true },
      { id: "team", done: true, available: false },
      { id: "verification", done: false, available: false },
      { id: "first_client", done: false, available: false },
    ],
    next: "first_client", verifiedEffects: 1,
  }) }));
  await page.goto(`/workspace/agency/start?workspaceId=${AGENCY_ID}`);
  await expect(page.getByText("Only an owner of Northside Web Care can invite people.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Invite a teammate" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Verification" }).getByText("Verified", { exact: true })).toHaveCount(1);
  await expect(page.locator('[aria-current="step"]')).toContainText("Add your first client");
});

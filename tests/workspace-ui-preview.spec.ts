import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the explicit development-only interface preview.");

const EDITOR_HERO = {
  headline: "A fictional headline",
  subheadline: "Synthetic studio",
  tagline: "Content stays inside this local fixture.",
  ctaText: "See the work",
  ctaLink: "#products",
  backgroundImageUrl: "/images/product-bag.jpg",
};

async function mockEditorApi(page: Page, options: { denyDrafts?: boolean } = {}) {
  let draft = { ...EDITOR_HERO };
  const restoredVersion = {
    ...EDITOR_HERO,
    headline: "An earlier fictional headline",
  };
  let restoredToDraft = false;
  const draftBodies: Record<string, unknown>[] = [];
  const apiRequests: { method: string; path: string }[] = [];

  await page.route("**/preview/strelva/website/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    apiRequests.push({ method: request.method(), path });

    if (path.endsWith("/publish")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ contentDrafts: {}, pageConfigDraft: false }) });
    }
    if (path.endsWith("/content/hero/versions")) {
      if (request.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([{
            id: "v_older",
            section: "hero",
            data: restoredVersion,
            author: "user",
            timestamp: "2026-09-20T12:00:00.000Z",
            status: "live",
            changes: [{ field: "headline", before: EDITOR_HERO.headline, after: restoredVersion.headline }],
          }]),
        });
      }
      if (request.method() === "POST") {
        draft = { ...restoredVersion };
        restoredToDraft = true;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, draft: true, version: { id: "v_older", section: "hero", data: restoredVersion } }),
        });
      }
    }
    if (path.endsWith("/page-config")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(null) });
    }
    if (path.endsWith("/content/hero")) {
      if (request.method() === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(url.searchParams.get("draft") === "true" ? draft : EDITOR_HERO) });
      }
      if (request.method() === "PUT") {
        const body = request.postDataJSON() as Record<string, unknown>;
        draftBodies.push(body);
        if (options.denyDrafts) {
          return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Content permission is required." }) });
        }
        draft = body as typeof EDITOR_HERO;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, draft: true }) });
      }
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Fixture route not provided." }) });
  });

  return { draftBodies, apiRequests, get restoredToDraft() { return restoredToDraft; } };
}

test("shared navigation remains available while opening and finding work", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=free");
  await expect(page.getByRole("heading", { name: "What would you like to do?" })).toBeVisible();
  await page.getByRole("button", { name: "Open Harbor Dental", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Harbor Dental", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to work" }).click();
  await page.getByRole("searchbox", { name: "Search saved work" }).fill("nothing matches");
  await expect(page.getByRole("heading", { name: "No matching work" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByRole("button", { name: "Open Harbor Dental", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^Apps & templates/ }).click();
  await page.getByText("More tools and managed services", { exact: true }).click();
  await page.getByRole("button", { name: /Home Finder/ }).click();
  await expect(page.getByText("Preview · early access", { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("link", { name: /Try Home Finder/ })).toHaveAttribute("href", /127\.0\.0\.1:3213\/embed\/agency-preview/);
  await page.getByRole("button", { name: "Ask about early access" }).click();
  await expect(page.getByLabel("What are you trying to do?")).toHaveValue(/enabling a live brokerage installation/);
  await page.getByLabel("What are you trying to do?").fill("Bring my existing WordPress website.");
  await expect(page.getByRole("link", { name: "Open email" })).toHaveAttribute("href", /Bring%20my%20existing%20WordPress/);
  await expect(page.getByText(/Nothing is sent until you send it/)).toBeVisible();
});

test("shared workspace resumes inquiry work inside the one Strelva frame", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=managed");
  await page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("link", { name: "Apps & templates", exact: true }).click();
  await page.getByText("More tools and managed services", { exact: true }).click();
  await page.getByRole("button", { name: /Inquiry work/ }).click();
  await page.getByRole("button", { name: "Open Buffalo Realty", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What should Strelva handle?" })).toBeVisible();
  await expect(page.getByLabel("Strelva navigation", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Inquiry navigation", exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Inquiry work", exact: true }).getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("What should Strelva handle?").fill("Collect quote requests and route them to the recorded inbox.");
  await page.getByRole("button", { name: "Shape this request" }).click();
  await expect(page.getByRole("heading", { name: "What this work touches" })).toBeVisible();
  await expect(page).toHaveURL(/view=inquiries/);
  await expect(page).toHaveURL(/inquiryView=shape/);
  await expect(page).toHaveURL(/inquiryRequest=fixture_request_/);
});

test("account-authorized websites stay separate from business installations", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=managed");
  const sites = page.getByRole("region", { name: "Authorized sites" });
  await expect(sites).toContainText("Websites you can access through your account.");
  await expect(sites).toContainText("Business assignment is managed in a customer business workspace.");
  await expect(sites.getByRole("link", { name: /Harbor Dental.*Account-authorized website/ })).toHaveAttribute("href", "/preview/strelva/website");
  await expect(sites.getByRole("button", { name: /Assign .* Harbor Dental/ })).toHaveCount(0);
});

test("a business owner can assign an authorized website from Home and keep website controls native", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=business");
  const handoff = page.getByTestId("website-assignment-handoff");
  await expect(handoff).toContainText("Assign a website to Harbor Dental");
  await expect(handoff).toContainText("Domains, connections, and billing stay in that website's native controls.");
  await handoff.getByRole("button", { name: "Assign Harbor Dental to Harbor Dental" }).click();
  await expect(page.getByRole("region", { name: "Your business and work" }).getByRole("button", { name: "Open Harbor Dental", exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("website-assignment-handoff")).toHaveCount(0);

  await page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Business information", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "People and access", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Subscription/ })).toHaveAttribute("href", "/preview/strelva/website/dashboard/settings#plan");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a business owner can propose a future payer and the exact addressee can accept", async ({ page }) => {
  const workspaceId = "33333333-3333-4333-8333-333333333333";
  const transitionId = "12121212-1212-4212-8212-121212121212";
  const proposedAt = "2026-09-18T16:00:00.000Z";
  let state: "empty" | "pending" | "accepted" = "empty";
  await page.route("**/api/work-economics/payer-transition**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const action = (request.postDataJSON() as { action: string }).action;
      state = action === "accept" ? "accepted" : "pending";
    }
    const transition = {
      id: transitionId,
      workspaceId,
      successorUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      successorEmail: "successor@harbordental.example",
      proposerEmail: "owner@harbordental.example",
      status: state,
      proposedAt,
      resolvedAt: state === "accepted" ? proposedAt : null,
      acceptedAt: state === "accepted" ? proposedAt : null,
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        transitions: state === "empty" ? [] : [transition],
        current: state === "accepted" ? transition : null,
        pending: state === "pending" ? transition : null,
        currentActorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
    });
  });

  await page.goto("/preview/strelva?scenario=business");
  await page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("link", { name: "Settings", exact: true }).click();
  const payer = page.getByRole("region", { name: "Payer for future jobs" });
  await expect(payer).toContainText("Existing budgets, reservations, recorded costs, and unresolved holds keep their original payer and limit.");
  await payer.getByLabel("Verified payer email").fill("successor@harbordental.example");
  await payer.getByRole("button", { name: "Propose new payer" }).click();
  await expect(payer).toContainText("Only this addressed verified person can accept.");
  await payer.getByRole("button", { name: "Accept future payer role" }).click();
  await expect(payer).toContainText("Current accepted successor: successor@harbordental.example");
  await expect(payer.getByRole("status")).toContainText("You accepted responsibility for future jobs.");
});

test("direct customer can inspect an offering setup and its local allowance", async ({ page }) => {
  test.slow();
  await page.goto("/preview/strelva?scenario=business");
  await expect(page.getByRole("heading", { name: "Business offerings" })).toBeVisible();
  const allowance = page.getByRole("region", { name: "Work allowance" });
  await expect(allowance).toContainText("Cap needs your acceptance");
  await expect(allowance).toContainText("Billing details are not available yet.");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(allowance).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (process.env.STRELVA_CAPTURE_PRODUCT_EXPERIENCE === "1") {
    await page.screenshot({ path: "output/product-experience/business-home-desktop.png", fullPage: true });
    await allowance.screenshot({ path: "output/product-experience/work-allowance-desktop.png" });
  }

  await page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("link", { name: "Apps & templates", exact: true }).click();
  await page.getByText("More tools and managed services", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Useful outcomes for this business." })).toBeVisible();
  await expect(page.getByText("Start work that is available here, or request setup when it needs a connected service or release decision.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Website assignments" })).toBeVisible();
  if (process.env.STRELVA_CAPTURE_PRODUCT_EXPERIENCE === "1") {
    await page.screenshot({ path: "output/product-experience/offering-directory-desktop.png", fullPage: true });
  }

  await page.getByRole("button", { name: "Assign to this business" }).click();
  await expect(page.getByText("Assigned to this business · You can open it")).toBeVisible();
  const managedWebsiteChanges = page.locator('[class*="discoveryRow"]').filter({ hasText: "Managed website changes" }).first();
  await managedWebsiteChanges.getByRole("button", { name: "Start setup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Install Managed website changes" })).toBeVisible();
  await expect(page.locator("form").getByRole("combobox")).toHaveValue("99999999-9999-4999-8999-999999999999");
  await page.getByRole("button", { name: "Back to offerings" }).click();

  const staffRequestOffering = page.locator('[class*="discoveryRow"]').filter({ hasText: "Staff request application" }).first();
  await staffRequestOffering.getByRole("button", { name: "Start setup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Install Staff request application" })).toBeVisible();
  await expect(page.getByText("Create the standard staff request application")).toBeVisible();
  if (process.env.STRELVA_CAPTURE_PRODUCT_EXPERIENCE === "1") {
    await page.screenshot({ path: "output/product-experience/offering-install-desktop.png", fullPage: true });
  }
  await page.getByText("Request a provider").click();
  await expect(page.getByText("does not confirm Strelva or a third party accepted the work")).toBeVisible();
  if (process.env.STRELVA_CAPTURE_PRODUCT_EXPERIENCE === "1") {
    await page.screenshot({ path: "output/product-experience/provider-request-desktop.png", fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator("#workspace-main").evaluate((main) => main.getBoundingClientRect().left)).toBe(0);
  const mobileNavigation = page.getByRole("complementary", { name: "Strelva navigation", exact: true });
  await expect(mobileNavigation).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Install Staff request application" })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole("button", { name: "Close navigation", exact: true }).click();
  await expect(mobileNavigation).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator("#workspace-main > div").evaluate((scroll) => scroll.scrollTo({ top: 0, behavior: "instant" }));
  await expect(page.getByRole("heading", { name: "Install Staff request application" })).toBeVisible();
  if (process.env.STRELVA_CAPTURE_PRODUCT_EXPERIENCE === "1") {
    await page.screenshot({ path: "output/product-experience/offering-install-mobile.png", fullPage: true });
    await page.getByText("does not confirm Strelva or a third party accepted the work").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "output/product-experience/provider-request-mobile.png", fullPage: true });
  }

  await page.getByRole("button", { name: "Prepare offering" }).click();
  await expect(page.getByText("The local fixture lost the first response after accepting the command.")).toBeVisible();
  await expect(page.getByText("The setup is locked so retry sends the exact same command.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Offering label (display only)")).toBeDisabled();
  await page.getByRole("button", { name: "Retry exact setup" }).click();
  await expect.poll(() => {
    const url = new URL(page.url());
    return { workspaceId: url.searchParams.get("workspaceId"), view: url.searchParams.get("view"), work: url.searchParams.get("work") };
  }).toEqual({ workspaceId: "33333333-3333-4333-8333-333333333333", view: "applications", work: "88888888-8888-4888-8888-888888888888" });
  await expect(page.getByRole("heading", { name: "Staff requests", exact: true })).toBeVisible();
  await expect(page.getByText("No version is live yet.", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Check proposed change", exact: true }).click();
  await expect(page.getByText("Passed: Definition is valid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/Version 1 is live/)).toBeVisible();

  await page.getByLabel("What do you need?", { exact: true }).fill("Replace the reception printer");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByText("Replace the reception printer", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Recipient email", { exact: true }).fill("staff@harbordental.example");
  await page.getByRole("button", { name: "Issue access link", exact: true }).click();
  await expect(page.getByText("Link for staff@harbordental.example", { exact: true })).toBeVisible();
  await expect(page.locator('a[href="/apps/88888888-8888-4888-8888-888888888888"]')).toBeVisible();

  await page.getByText("Edit proposed app", { exact: true }).click();
  await page.getByLabel("Label for What do you need?", { exact: true }).fill("Request details");
  await page.getByRole("button", { name: "Save new draft", exact: true }).click();
  await expect(page.getByText(/label changes from "What do you need\?" to "Request details"/)).toBeVisible();
  await expect(page.getByLabel("What do you need?", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Check proposed change", exact: true }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/Version 2 is live/)).toBeVisible();
  await expect(page.getByLabel("Request details", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Replace the reception printer", { exact: true }).first()).toBeVisible();

  const recovery = page.locator("details").filter({ hasText: "Restore an earlier live version" });
  await recovery.getByText("Restore an earlier live version", { exact: true }).click();
  await recovery.getByRole("combobox").selectOption("1");
  await recovery.getByRole("button", { name: "Restore released version", exact: true }).click();
  await expect(page.getByText(/Version 1 is live/)).toBeVisible();
  await expect(page.getByLabel("What do you need?", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Replace the reception printer", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Revoke link", exact: true }).click();
  await expect(page.getByText("Access revoked for staff@harbordental.example", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back to work" }).click();
  const installedApp = page.getByRole("button", { name: "Open Staff requests", exact: true });
  await expect(installedApp).toHaveCount(1);
  await installedApp.click();
  await expect(page.getByRole("heading", { name: "Staff requests", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back to work" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  const navigation = page.getByRole("complementary", { name: "Strelva navigation", exact: true });
  await navigation.getByRole("link", { name: "Home", exact: true }).click();
  const recent = page.getByRole("region", { name: "Recent work", exact: true });
  await expect(recent.getByRole("button", { name: /Staff requests/ })).toBeVisible();
  await recent.getByRole("button", { name: /Staff requests/ }).click();
  await expect(page.getByRole("heading", { name: "Staff requests", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to work" }).click();
  await navigation.getByRole("link", { name: "Apps & templates", exact: true }).click();
  await page.getByText("More tools and managed services", { exact: true }).click();
  const installedStaffRequestOffering = page.locator('[class*="discoveryRow"]').filter({ hasText: "Staff request application" }).first();
  await installedStaffRequestOffering.getByRole("button", { name: "Open", exact: true }).click();
  const connected = page.getByRole("region", { name: "Connected work", exact: true });
  await expect(connected).toContainText("Staff requests");
  await expect(connected).not.toContainText("88888888-8888-4888-8888-888888888888");
  for (const width of [320, 360, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(connected.getByRole("button", { name: "Open Staff requests", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (process.env.STRELVA_CAPTURE_PRODUCT_EXPERIENCE === "1") {
      await connected.screenshot({ path: `output/staff-review/connected-work-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await connected.getByRole("button", { name: "Open Staff requests", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Staff requests", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "This saved result is unavailable." })).toBeVisible();
  await page.getByRole("button", { name: "Back to work" }).click();
  await expect(page.getByText("Fictional data · changes reset on reload · no live actions", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Staff requests", exact: true })).toHaveCount(0);
});

test("empty workspace can create an explicitly fictional local assessment", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=empty");
  await expect(page.getByText(/Start with something useful./)).toBeVisible();
  await page.getByRole("link", { name: "Apps & templates", exact: true }).click();
  await page.getByText("More tools and managed services", { exact: true }).click();
  await expect(page.getByRole("button", { name: /AI Visibility.*Available · Free assessment/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Inquiry work.*Available to use/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Inquiry work.*Free assessment/ })).toHaveCount(0);
  await page.getByRole("button", { name: /AI Visibility/ }).click();
  await page.getByRole("button", { name: "Check a business", exact: true }).click();
  await page.getByLabel("Business name").fill("Fictional Bakery");
  await page.getByLabel("Website", { exact: true }).fill("bakery.example");
  await page.getByRole("button", { name: "Run assessment" }).click();
  await expect(page.getByRole("heading", { name: "Fictional Bakery", exact: true })).toBeVisible();
  await expect(page.getByText(/These scores are fictional/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "This saved result is unavailable." })).toBeVisible();
  await page.getByRole("link", { name: "Strelva home", exact: true }).click();
  await expect(page.getByText(/Start with something useful./)).toBeVisible();
});

test("mobile navigation closes on Escape and selection, and does not overflow", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=agency");
  for (const width of [320, 360, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const navigation = page.getByRole("complementary", { name: "Strelva navigation", exact: true });
  await expect(navigation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(navigation).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await navigation.getByRole("link", { name: /^Apps & templates/ }).click();
  await page.getByText("More tools and managed services", { exact: true }).click();
  await expect(navigation).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "More you can do." })).toBeVisible();
});

test("agency home opens exact authorized client work and survives a partial client load", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=agency");
  await expect(page.getByRole("heading", { name: "Client work", exact: true })).toBeVisible();
  await expect(page.getByText("1 client workspace was unavailable during this check.", { exact: false })).toBeVisible();
  await expect(page.getByText("Business offerings are installed and managed from the customer business that owns them.", { exact: false })).toBeVisible();
  if (process.env.STRELVA_CAPTURE_PRODUCT_EXPERIENCE === "1") {
    await page.screenshot({ path: "output/product-experience/agency-home-desktop.png", fullPage: true });
  }
  const attention = page.getByRole("region", { name: "Needs attention across clients" });
  await attention.getByRole("button", { name: "Open Harbor Dental to review Harbor Dental" }).click();
  await expect(page).toHaveURL(/workspaceId=33333333-3333-4333-8333-333333333333/);
  await expect(page).toHaveURL(/work=44444444-4444-4444-8444-444444444444/);
  await expect(page.getByRole("heading", { name: "Harbor Dental", exact: true })).toBeVisible();

  await page.goto("/preview/strelva?scenario=agency");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Client work", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.STRELVA_CAPTURE_PRODUCT_EXPERIENCE === "1") {
    await page.screenshot({ path: "output/product-experience/agency-home-mobile.png", fullPage: true });
  }
  await page.getByRole("region", { name: "Clients with shared work" }).getByRole("button", { name: /Harbor Dental/ }).click();
  await expect(page.getByRole("heading", { name: "Your shared work." })).toBeVisible();
});

test("shared read-only work cannot start an assessment", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=read-only");
  await expect(page.getByRole("heading", { name: "Your shared work." })).toBeVisible();
  await page.getByRole("link", { name: /^Apps & templates/ }).click();
  await page.getByText("More tools and managed services", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Offerings belong to a business." })).toBeVisible();
  await expect(page.getByText("This work-share does not include business-wide offering access.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /AI Visibility/ }).click();
  await expect(page.getByRole("button", { name: "Check a business", exact: true })).toBeDisabled();
  await expect(page.getByText("Switch to a workspace you own to create an assessment.")).toBeVisible();
});

test("preview account navigation remains local and exposes no real sign-out", async ({ page }) => {
  const liveApiRequests: string[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) liveApiRequests.push(path);
  });
  await page.goto("/preview/strelva?scenario=managed");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  const account = page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("link", { name: /alex.*alex@example.com/i });
  await expect(account).toHaveAttribute("href", "/preview/strelva/workspace/account");
  await account.click();
  await expect(page).toHaveURL(/\/preview\/strelva\/workspace\/account/);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "North Studio", exact: true }).click();
  await expect(page).toHaveURL(/workspaceId=22222222-2222-4222-8222-222222222222/);
  await expect(page.getByRole("heading", { name: "Client work", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await page.goto("/preview/strelva/workspace/account");
  await page.getByRole("link", { name: "Harbor Dental", exact: true }).click();
  await expect(page).toHaveURL(/workspaceId=33333333-3333-4333-8333-333333333333/);
  await expect(page.getByRole("heading", { name: "Your shared work.", exact: true })).toBeVisible();
  expect(liveApiRequests).toEqual([]);
});

test("preview controls reserve viewport space so the account stays visible", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=enterprise");
  for (const width of [320, 360, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 720 });
    if (width < 1024) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    const account = page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("link", { name: /alex.*alex@example.com/i });
    await expect(account).toBeInViewport({ ratio: 1 });
    if (width < 1024) await page.keyboard.press("Escape");
  }
});

test("isolated Website editor accepts structured text and image draft controls", async ({ page }) => {
  const fixture = await mockEditorApi(page);
  await page.goto("/preview/strelva/website/dashboard/site?editor=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Local Website editor · fictional content · no live actions")).toBeVisible();
  await page.getByRole("button", { name: "Edit site" }).click();
  await expect(page.getByLabel("Headline").first()).toBeVisible();
  await expect(page.getByText("Background image", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove image" })).toBeVisible();

  await page.getByLabel("Headline").first().fill("A changed fictional headline");
  await expect(page.getByText("Draft saved - preview updated", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove image" }).click();
  await expect.poll(() => fixture.draftBodies.some((body) => body.headline === "A changed fictional headline" && body.backgroundImageUrl === "")).toBe(true);

  expect(fixture.apiRequests.some((request) => request.method === "PUT" && request.path.endsWith("/content/hero"))).toBe(true);
  expect(fixture.apiRequests.some((request) => request.method === "POST" && request.path.endsWith("/publish"))).toBe(false);
  expect(fixture.apiRequests.some((request) => request.method === "DELETE" && request.path.endsWith("/publish"))).toBe(false);
});

test("isolated Website editor surfaces a permission failure without accepting the draft", async ({ page }) => {
  const fixture = await mockEditorApi(page, { denyDrafts: true });
  await page.goto("/preview/strelva/website/dashboard/site?editor=1", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit site" }).click();
  await page.getByLabel("Headline").first().fill("A denied fictional headline");
  await expect(page.getByText("Couldn't save. Try again", { exact: false })).toBeVisible();
  expect(fixture.draftBodies.some((body) => body.headline === "A denied fictional headline")).toBe(true);
  expect(fixture.apiRequests.some((request) => request.method === "POST" && request.path.endsWith("/publish"))).toBe(false);
  expect(fixture.apiRequests.some((request) => request.method === "DELETE" && request.path.endsWith("/publish"))).toBe(false);
});

test("website history restores into a draft before publish", async ({ page }) => {
  const fixture = await mockEditorApi(page);
  await page.goto("/preview/strelva/website/dashboard/site?editor=1", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit site" }).click();
  await expect(page.getByLabel("Headline").first()).toBeVisible();

  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByText("Last 1 version", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /12:00|just now|user/i }).click();
  await page.getByRole("button", { name: "Restore to draft", exact: true }).click();

  await expect(page.getByText("Restored to draft. Review before publishing", { exact: true })).toBeVisible();
  await expect(page.getByText("Draft preview active - review before publishing", { exact: true })).toBeVisible();
  expect(fixture.restoredToDraft).toBe(true);
  if (process.env.STRELVA_CAPTURE_WEBSITE_PROOF === "1") {
    await page.screenshot({ path: "/tmp/strelva-website-history-desktop.png", fullPage: true });
  }
  expect(fixture.apiRequests.some((request) => request.method === "POST" && request.path.endsWith("/publish"))).toBe(false);
});

test("website editor supports a draft change from a phone-sized viewport", async ({ page }) => {
  const fixture = await mockEditorApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/strelva/website/dashboard/site?editor=1", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Edit site" }).click();
  await page.getByLabel("Headline").first().fill("A mobile fictional headline");
  await expect(page.getByLabel("Headline").first()).toBeFocused();
  await expect(page.getByText("Draft saved - preview updated", { exact: true })).toBeVisible();
  await expect(page.getByText("Draft preview active - review before publishing", { exact: true })).toBeVisible();
  await expect.poll(() => fixture.draftBodies.some((body) => body.headline === "A mobile fictional headline")).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const headlineBox = await page.getByLabel("Headline").first().boundingBox();
  expect(headlineBox).not.toBeNull();
  expect(headlineBox!.x).toBeGreaterThanOrEqual(0);
  expect(headlineBox!.x + headlineBox!.width).toBeLessThanOrEqual(390);
  const saveButtonBox = await page.getByRole("button", { name: "Save changes", exact: true }).boundingBox();
  expect(saveButtonBox).not.toBeNull();
  expect(saveButtonBox!.x).toBeGreaterThanOrEqual(0);
  expect(saveButtonBox!.x + saveButtonBox!.width).toBeLessThanOrEqual(390);
  expect(saveButtonBox!.y + saveButtonBox!.height).toBeLessThanOrEqual(844);
  if (process.env.STRELVA_CAPTURE_WEBSITE_PROOF === "1") {
    await page.screenshot({ path: "/tmp/strelva-website-editor-mobile.png", fullPage: true });
  }
  expect(fixture.apiRequests.some((request) => request.method === "POST" && request.path.endsWith("/publish"))).toBe(false);
});

test("website editor keeps a mobile permission failure recoverable", async ({ page }) => {
  const fixture = await mockEditorApi(page, { denyDrafts: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/strelva/website/dashboard/site?editor=1", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Edit site" }).click();
  await page.getByLabel("Headline").first().fill("A denied mobile fictional headline");
  await expect(page.getByText("Couldn't save. Try again", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  const saveButtonBox = await page.getByRole("button", { name: "Save changes", exact: true }).boundingBox();
  expect(saveButtonBox).not.toBeNull();
  expect(saveButtonBox!.y + saveButtonBox!.height).toBeLessThanOrEqual(844);
  expect(fixture.draftBodies.some((body) => body.headline === "A denied mobile fictional headline")).toBe(true);
  expect(fixture.apiRequests.some((request) => request.method === "POST" && request.path.endsWith("/publish"))).toBe(false);
  if (process.env.STRELVA_CAPTURE_WEBSITE_PROOF === "1") {
    await page.screenshot({ path: "/tmp/strelva-website-editor-mobile-permission.png", fullPage: true });
  }
});

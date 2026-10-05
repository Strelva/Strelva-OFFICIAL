import { expect, test, type Page } from "@playwright/test";

// Local preview fixtures (STRELVA_UI_PREVIEW=1). The Mooney Firm website content
// comes from the October 1 capture; everything else is fictional fixture data.

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test("Home presents The Mooney Firm's actual Systems and what needs the owner", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=mooney");
  await expect(page.getByRole("heading", { name: "The Mooney Firm", level: 1 })).toBeVisible();
  await expect(page.getByText("3 live · 1 in draft")).toBeVisible();
  const needsYou = page.getByRole("region", { name: "Needs you" });
  await expect(needsYou.getByText("Let attorneys request a session date from attymooney.com")).toBeVisible();
  await expect(needsYou.getByText("Confirm 40 flagged facts on the rebuilt site")).toBeVisible();
  const systems = page.getByRole("list", { name: "The Mooney Firm systems" });
  await expect(systems.getByRole("link")).toHaveCount(4);
  await expect(systems.getByRole("link", { name: "Open attymooney.com, Website, Live, Not checked here yet" })).toBeVisible();
  await expect(systems.getByRole("link", { name: "Open Mediation sessions, Bookings, Draft, Not checked here yet" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Strelva navigation" }).getByRole("region", { name: "Systems" }).getByRole("link")).toHaveCount(5); // four Systems and the full list
});

test("opening the website gives it the page, then compares and refuses to fake Make real", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=mooney");
  await page.getByRole("link", { name: /^Open attymooney\.com/ }).click();
  await expect(page).toHaveURL(/view=system&system=site%3Amooney-firm/);
  await expect(page.getByRole("heading", { name: "attymooney.com", level: 1 })).toBeVisible();
  await expect(page.locator('iframe[title="attymooney.com as visitors see it"]')).toHaveAttribute("src", "https://www.attymooney.com");
  await expect(page.getByRole("complementary", { name: "Strelva navigation" }).getByRole("link", { name: "attymooney.com" })).toHaveAttribute("aria-current", "page");
  const about = page.getByRole("complementary", { name: "About attymooney.com" });
  await expect(about.getByRole("heading", { name: /Connections/ })).toBeVisible();
  await expect(about.getByText("Changes: attymooney.com, Inquiries")).toBeVisible();
  await about.getByRole("button", { name: "Compare" }).click();
  await expect(page.locator('iframe[title="A rebuilt attymooney.com, not live"]')).toHaveAttribute("src", "/preview/strelva/rebuild/site?example=mooney");
  await page.getByRole("group", { name: "What to show" }).getByRole("button", { name: "Possibility" }).click();
  await expect(page.locator('iframe[title="attymooney.com as visitors see it"]')).toHaveCount(0);
  await about.getByRole("button", { name: "Make real" }).click();
  await expect(about.getByRole("status")).toContainText("Activation is not connected yet. Nothing changed");
  await expect(page.locator('iframe[title="A rebuilt attymooney.com, not live"]')).toBeVisible();

  // The same Possibility is contextual from the other System it changes.
  await page.getByRole("complementary", { name: "Strelva navigation" }).getByRole("link", { name: "Inquiries" }).click();
  await expect(page.getByRole("complementary", { name: "About Inquiries" }).getByText("A rebuilt attymooney.com")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "About Inquiries" }).getByRole("button", { name: "Compare" })).toHaveCount(0);
});

test("bookings and internal tools open as the actual thing, with lineage beside them", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=mooney");
  await page.getByRole("link", { name: /^Open Mediation sessions/ }).click();
  await expect(page.getByRole("heading", { name: "Mediation sessions", level: 1 })).toBeVisible();
  await expect(page.getByText("Half-day session · [Matter A]").first()).toBeVisible();
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByRole("link", { name: /^Open Mediation intake/ }).click();
  await expect(page.getByRole("heading", { name: "Mediation intake", level: 1 })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "About Mediation intake" })).toContainText("Adapted from a source system");
});

test("read-only access sees Systems but cannot change them or make anything real", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=mooney-shared");
  await expect(page.getByText("Shared with you")).toBeVisible();
  await expect(page.getByRole("heading", { name: "What should happen next?" })).toHaveCount(0);
  await page.getByRole("link", { name: /^Open Mediation intake/ }).click();
  await expect(page.getByRole("button", { name: "Ask for a change" })).toBeDisabled();
  await expect(page.getByText("Only The Mooney Firm owners can make changes.")).toBeVisible();
});

test("empty, loading and error states say what is true", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=mooney-empty");
  await expect(page.getByRole("heading", { name: "Nothing is running yet." })).toBeVisible();
  await page.goto("/preview/strelva?scenario=mooney-loading");
  await expect(page.getByText("Loading your systems…")).toBeVisible();
  await page.goto("/preview/strelva?scenario=mooney-error");
  await expect(page.getByText("Some websites could not be loaded.")).toBeVisible();
  await expect(page.getByText("Requests waiting on your decision could not be checked.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open attymooney.com, Website, Live, Something is off" })).toBeVisible();
  await page.goto("/preview/strelva/workspace?scenario=mooney&workspaceId=a0000000-0000-4000-8000-000000000001&view=system&system=site%3Aunknown");
  await expect(page.getByRole("heading", { name: "This system isn’t available here." })).toBeVisible();
});

test("an agency sees its source Systems and each client's Version", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=agency-systems");
  const versions = page.getByRole("list", { name: "Client versions of Intake for professional practices" });
  await expect(versions.getByRole("button")).toHaveCount(2);
  await expect(versions).toContainText("The Mooney Firm");
  await expect(versions).toContainText("Harbor Dental");
  await expect(page.getByRole("list", { name: "Client systems with no recorded source" })).toContainText("Staff requests");
});

test("two locations on one account are Versions of one website", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=twin-trees");
  await page.getByRole("link", { name: /^Open Twin Trees Camillus/ }).click();
  await expect(page.getByRole("complementary", { name: "About Twin Trees Camillus" }).getByRole("link", { name: "Twin Trees Fayetteville" })).toBeVisible();
  await expect(page.getByText("No public address is recorded")).toBeVisible();
});

test("Home and a System reflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/strelva?scenario=mooney");
  await expect(page.getByRole("heading", { name: "The Mooney Firm", level: 1 })).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole("link", { name: /^Open attymooney\.com/ }).click();
  await expect(page.getByRole("heading", { name: "attymooney.com", level: 1 })).toBeVisible();
  await noHorizontalScroll(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await noHorizontalScroll(page);
});

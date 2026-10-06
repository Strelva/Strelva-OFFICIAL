import { expect, test, type Page } from "@playwright/test";

// Local preview fixtures (STRELVA_UI_PREVIEW=1). The Mooney Firm website content
// comes from the October 1 capture; everything else is fictional fixture data.
// Systems, health and Possibilities are projected on the server by the same
// code the workspace route runs (preview/systems-projection.ts).
// The whole Systems model sits behind STRELVA_SYSTEMS_RELEASE; the preview
// turns it on with `systems=on` and off with `systems=off`.
test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the explicit development-only interface preview.");

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function fullPhoneContent(page: Page) {
  // No overflow alone misses a retained desktop navigation column. Wait for
  // the responsive transition and require the main to use the phone width.
  await expect.poll(async () => {
    const box = await page.locator("[data-frame-main]").boundingBox();
    const width = page.viewportSize()!.width;
    return Boolean(box && Math.abs(box.x) <= 1 && box.width >= width - 2);
  }).toBe(true);
}

test("Home presents The Mooney Firm's actual Systems and what needs the owner", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=mooney&systems=on");
  await expect(page.getByRole("heading", { name: "The Mooney Firm", level: 1 })).toBeVisible();
  await expect(page.getByText("3 live · 1 in draft")).toBeVisible();
  const needsYou = page.getByRole("region", { name: "Needs you" });
  await expect(needsYou.getByText("Let attorneys request a session date from attymooney.com")).toBeVisible();
  await expect(needsYou.getByText("Confirm 40 flagged facts on the rebuilt site")).toBeVisible();
  const systems = page.getByRole("list", { name: "The Mooney Firm systems" });
  await expect(systems.getByRole("link")).toHaveCount(4);
  // Health comes from evidence; no evidence reads Unknown, never Working.
  await expect(systems.getByRole("link", { name: "Open attymooney.com, Website, Live, Working" })).toBeVisible();
  await expect(systems.getByRole("link", { name: "Open The Mooney Firm inquiries, Inquiries, Live, Unknown" })).toBeVisible();
  await expect(systems.getByRole("link", { name: "Open Mediation sessions, Bookings, Draft, Unknown" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Strelva navigation" }).getByRole("region", { name: "Systems" }).getByRole("link")).toHaveCount(5); // four Systems and the full list
});

test("opening the website gives it the page, compares, and runs Make real on an isolated copy", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=mooney&systems=on");
  await page.getByRole("link", { name: /^Open attymooney\.com/ }).click();
  await expect(page).toHaveURL(/view=system&system=[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "attymooney.com", level: 1 })).toBeVisible();
  await expect(page.locator('iframe[title="attymooney.com as visitors see it"]')).toHaveAttribute("src", "https://www.attymooney.com");
  await expect(page.getByRole("complementary", { name: "Strelva navigation" }).getByRole("link", { name: "attymooney.com" })).toHaveAttribute("aria-current", "page");
  const about = page.getByRole("complementary", { name: "About attymooney.com" });
  await expect(about.getByRole("heading", { name: /Connections/ })).toBeVisible();
  await expect(about.getByText("Changes: attymooney.com, The Mooney Firm inquiries")).toBeVisible();
  await about.getByRole("button", { name: "Compare" }).click();
  await expect(page.locator('iframe[title="A rebuilt attymooney.com, not live"]')).toHaveAttribute("src", "/preview/strelva/rebuild/site?example=mooney");
  await page.getByRole("group", { name: "What to show" }).getByRole("button", { name: "Possibility" }).click();
  await expect(page.locator('iframe[title="attymooney.com as visitors see it"]')).toHaveCount(0);
  await about.getByRole("button", { name: "Make real" }).click();
  const result = about.getByRole("status", { name: "Make real result" });
  await expect(result).toContainText("In progress: 2 of 5 steps.");
  await expect(result).toContainText("Outside effects aren’t connected yet, so this ran on an isolated copy. Your live systems are unchanged.");
  await expect(result).toContainText("Prepare the new The Mooney Firm (the rebuilt attymooney.com)");
  await expect(result).toContainText("Switch The Mooney Firm to the new revision");
  await expect(result).toContainText("Publishing the rebuilt site at attymooney.com");
  await expect(page.locator('iframe[title="A rebuilt attymooney.com, not live"]')).toBeVisible();

  // The same Possibility is contextual from the other System it changes.
  await page.getByRole("complementary", { name: "Strelva navigation" }).getByRole("link", { name: "The Mooney Firm inquiries" }).click();
  const inquiries = page.getByRole("complementary", { name: "About The Mooney Firm inquiries" });
  await expect(inquiries.getByText("A rebuilt attymooney.com")).toBeVisible();
  await expect(inquiries.getByRole("button", { name: "Compare" })).toHaveCount(0);
});

test("bookings and internal tools open as the actual thing, with lineage beside them", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=mooney&systems=on");
  await page.getByRole("link", { name: /^Open Mediation sessions/ }).click();
  await expect(page.getByRole("heading", { name: "Mediation sessions", level: 1 })).toBeVisible();
  await expect(page.getByText("Half-day session · [Matter A]").first()).toBeVisible();
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByRole("link", { name: /^Open Mediation intake/ }).click();
  await expect(page.getByRole("heading", { name: "Mediation intake", level: 1 })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "About Mediation intake" })).toContainText("Adapted from a source system");
});

test("read-only access sees Systems but cannot change them or make anything real", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=mooney-shared&systems=on");
  await expect(page.getByText("Shared with you")).toBeVisible();
  await expect(page.getByRole("heading", { name: "What should happen next?" })).toHaveCount(0);
  await page.getByRole("link", { name: /^Open Mediation intake/ }).click();
  await expect(page.getByRole("button", { name: "Ask for a change" })).toBeDisabled();
  await expect(page.getByText("The Mooney Firm shared this with your agency to review.")).toBeVisible();
});

test("a member who is not an owner sees why Make real is unavailable", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=mooney-member&systems=on");
  await page.getByRole("link", { name: /^Open attymooney\.com/ }).click();
  const about = page.getByRole("complementary", { name: "About attymooney.com" });
  await expect(about.getByRole("button", { name: "Make real" })).toBeDisabled();
  await expect(about.getByText("Only an owner of this business can make a possibility real.")).toBeVisible();
});

test("a member can use apps and bookings without management controls", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=mooney-member&systems=on");
  await page.getByRole("link", { name: /^Open Mediation intake/ }).click();
  await expect(page.getByRole("button", { name: "Ask for a change" })).toBeDisabled();
  await page.getByText("Add another record", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Your name" })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Sharing", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByRole("link", { name: /^Open Mediation sessions/ }).click();
  await expect(page.getByRole("textbox", { name: "Reservation name" })).toBeEnabled();
  await expect(page.getByRole("region", { name: "External calendar sync" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask for a change" })).toBeDisabled();
});

test("empty, loading and error states say what is true", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=mooney-empty&systems=on");
  await expect(page.getByRole("heading", { name: "Nothing is running yet." })).toBeVisible();
  // Systems arrive with the workspace read; the slower decision reads say they are still checking.
  await page.goto("/preview/strelva?scenario=mooney-loading&systems=on");
  await expect(page.getByRole("region", { name: "Needs you" }).getByText("Checking your work…")).toBeVisible();
  await expect(page.getByRole("list", { name: "The Mooney Firm systems" }).getByRole("link")).toHaveCount(4);
  await page.goto("/preview/strelva?scenario=mooney-error&systems=on");
  await expect(page.getByText("Some websites could not be loaded.")).toBeVisible();
  await expect(page.getByText("Requests waiting on your decision could not be checked.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open attymooney.com, Website, Live, Something is off" })).toBeVisible();
  await page.goto("/preview/strelva/workspace?scenario=mooney&workspaceId=a0000000-0000-4000-8000-000000000001&view=system&system=00000000-0000-4000-8000-00000000dead&systems=on");
  await expect(page.getByRole("heading", { name: "This system isn’t available here." })).toBeVisible();
});

test("an agency sees its source Systems and each client's Version", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=agency-systems&systems=on");
  const versions = page.getByRole("list", { name: "Client versions of Intake for professional practices" });
  await expect(versions.getByRole("button")).toHaveCount(2);
  await expect(versions).toContainText("The Mooney Firm");
  await expect(versions).toContainText("Harbor Dental");
  await expect(page.getByRole("list", { name: "Client systems with no recorded source" })).toContainText("Staff requests");
});

test("two locations on one account are Versions of one website", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=twin-trees&systems=on");
  await page.getByRole("link", { name: /^Open Twin Trees Camillus/ }).click();
  await expect(page.getByRole("complementary", { name: "About Twin Trees Camillus" }).getByRole("link", { name: "Twin Trees Fayetteville" })).toBeVisible();
  await expect(page.getByText("No public address is recorded")).toBeVisible();
});

test("Home and a System reflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/strelva?scenario=mooney&systems=on");
  await expect(page.getByRole("heading", { name: "The Mooney Firm", level: 1 })).toBeVisible();
  await noHorizontalScroll(page);
  await fullPhoneContent(page);
  await page.getByRole("link", { name: /^Open attymooney\.com/ }).click();
  await expect(page.getByRole("heading", { name: "attymooney.com", level: 1 })).toBeVisible();
  await noHorizontalScroll(page);
  await fullPhoneContent(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => (await page.locator("[data-frame-main]").boundingBox())?.x ?? 0).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await fullPhoneContent(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await noHorizontalScroll(page);
  await fullPhoneContent(page);
});

test("with Systems off, Home is the pre-Systems workspace and System links open Home", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=mooney&systems=off");
  await expect(page.getByRole("heading", { name: "What should happen next?", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "The Mooney Firm systems" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Systems" })).toHaveCount(0);
  await expect(page.getByText(/\d live/)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Recent", exact: true })).toBeVisible();
  const navigation = page.getByRole("complementary", { name: "Strelva navigation" });
  await expect(navigation.getByRole("region", { name: "Website and apps", exact: true })).toBeVisible();
  // The Customers page is retired in both states (October 6).
  await expect(navigation.getByRole("link", { name: "Customers", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "All apps and files", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Make real|Compare/ })).toHaveCount(0);

  // A System deep link opens Home instead of a System page.
  await page.goto("/preview/strelva/workspace?scenario=mooney&systems=off&workspaceId=a0000000-0000-4000-8000-000000000001&view=system&system=00000000-0000-4000-8000-00000000dead");
  await expect(page.getByRole("heading", { name: "What should happen next?", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This system isn’t available here." })).toHaveCount(0);

  await page.goto("/preview/strelva?scenario=agency-systems&systems=off");
  await expect(page.getByRole("heading", { name: "Client work", level: 1 })).toBeVisible();
  await expect(page.getByText(/each client’s version/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Assigned website drafts", exact: true })).toBeVisible();
});

test("with Systems off, Home reflows on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/strelva?scenario=mooney&systems=off");
  await expect(page.getByRole("heading", { name: "What should happen next?", level: 1 })).toBeVisible();
  await noHorizontalScroll(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await noHorizontalScroll(page);
});

import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires isolated fictional 1.0 previews.");

async function readable(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const width of [1440, 390]) {
  test(`1.0 owner reads website facts and explicitly adds selected details at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/preview/strelva/getting-started");
    await expect(page.getByRole("heading", { name: "Northside Bakery", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Read my website", exact: true }).click();
    const facts = page.getByRole("list", { name: "Found facts", exact: true });
    await expect(facts.getByRole("checkbox")).toHaveCount(2);
    // Reading proposes selections; only the explicit Add action accepts them.
    const firstFact = facts.getByRole("checkbox").first();
    await expect(firstFact).toBeChecked();
    await firstFact.uncheck();
    await expect(page.getByRole("button", { name: "Add 1 detail to my business", exact: true })).toBeVisible();
    await firstFact.check();
    await page.getByRole("button", { name: "Add 2 details to my business", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Added to your business.");
    await expect(page.getByRole("link", { name: "Review business details", exact: true })).toHaveAttribute("href", "#details");
    await expect(page.getByText("Fictional preview · nothing is read, created or saved.", { exact: true })).toBeVisible();
    await readable(page);
    await page.screenshot({ path: info.outputPath(`getting-started-${width}.png`), fullPage: true });

    await page.goto("/preview/strelva/getting-started?state=member");
    await expect(page.getByText("Only the business owner can add details found on the website.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Read my website", exact: true })).toHaveCount(0);
    await readable(page);
  });

  test(`1.0 owner reviews the exact form and confirms its own live action at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/preview/strelva/owner-decision");
    const decision = page.getByRole("region", { name: "Needs you", exact: true });
    await expect(decision.getByRole("list", { name: "Every change you approve", exact: true }).getByRole("listitem")).toHaveCount(3);
    await page.getByRole("button", { name: "Try requesting this date", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("No date was requested or booked.");
    const accept = decision.getByRole("button", { name: "Hold to make it live: Let attorneys request a session date", exact: true });
    await accept.click();
    const confirmation = decision.getByRole("group", { name: "Confirm: Hold to make it live: Let attorneys request a session date", exact: true });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(accept).toBeFocused();
    await accept.click();
    await confirmation.getByRole("button", { name: "Confirm: Hold to make it live: Let attorneys request a session date", exact: true }).click();
    await expect(accept).toHaveCount(0);
    await expect(page.getByText("Nothing needs you. The form is still a fictional preview.", { exact: true })).toBeVisible();
    await readable(page);
    await page.screenshot({ path: info.outputPath(`owner-review-${width}.png`), fullPage: true });

    await page.goto("/preview/strelva/owner-decision?state=permission");
    await expect(page.getByText("Only the owner can decide these. You can see what is waiting.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Hold to make it live:/ })).toHaveCount(0);
    await readable(page);
  });
}

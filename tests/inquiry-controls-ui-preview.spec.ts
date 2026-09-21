import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the explicit development-only interface preview.");

async function startInquiry(page: Page) {
  await page.goto("/preview/strelva/inquiries");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("What should Strelva handle?").fill("Collect seller inquiries and route them to Maria, with a follow-up if nobody replies.");
  await page.getByRole("button", { name: "Shape this request" }).click();
  await page.getByRole("button", { name: "Go with this shape" }).click();
}

test.describe("inquiry control surfaces", () => {
  test("keeps rule, responsibility, onboarding, and Inspector actions reviewable", async ({ page }) => {
    await startInquiry(page);

    await page.getByRole("button", { name: "Open preview", exact: true }).click();
    await page.getByLabel("Send new inquiries to").fill("new-owner@example.invalid");
    await page.getByLabel("Within minutes").fill("20");
    await page.getByLabel("Follow up after minutes").fill("120");
    await page.getByLabel("Maximum attempts").fill("2");
    await page.getByLabel("Message to send").fill("Hello {name}, this is Strelva checking in.");
    await page.getByRole("button", { name: "Save rule changes" }).click();
    await expect(page.getByText("Rules match this draft version.", { exact: true })).toBeVisible();
    await expect(page.getByText("Send each new seller request to new-owner@example.invalid within 20 minutes.", { exact: true })).toBeVisible();
    await expect(page.getByText(/If nobody replies within 2 hours/).first()).toBeVisible();

    await page.getByRole("button", { name: "Plan", exact: true }).click();
    await page.getByRole("button", { name: "Work", exact: true }).click();
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: "Read the responsibility", exact: true }).click();
    await page.getByLabel("Responsibility title").fill("Handle seller inquiries carefully");
    await page.getByLabel("Scope").fill("Route seller inquiries and prepare a bounded follow-up during approved hours.");
    await page.getByRole("button", { name: "Save responsibility", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("supervised trust");
    await expect(page.getByRole("heading", { name: "Handle seller inquiries carefully", exact: true })).toBeVisible();

    await page.goto("/preview/strelva/inquiries?view=onboarding");
    await page.getByLabel("Read website").fill("https://buffalo-realty.example");
    await page.getByRole("button", { name: "Read website", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("blocked in this isolated preview");

    await startInquiry(page);
    await page.getByRole("button", { name: "Open preview", exact: true }).click();
    await page.getByRole("button", { name: "Go to rehearsal", exact: true }).click();
    await page.getByRole("button", { name: "Run rehearsal", exact: true }).click();
    await expect(page.getByRole("heading", { name: "8 of 8 checks passed", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Make live", exact: true }).click();
    await page.getByRole("button", { name: "Work", exact: true }).click();
    await page.getByRole("button", { name: "Review rehearsal", exact: true }).click();
    await page.getByRole("button", { name: "Send test inquiry", exact: true }).click();

    await page.getByLabel("Ask about this inquiry").fill("Prepare a bounded response for this customer.");
    await page.getByRole("button", { name: "Start from this inquiry", exact: true }).click();
    await expect(page.getByText(/Started from inquiry/)).toBeVisible();
    await expect(page.getByText(/capability version/)).toBeVisible();
  });
});

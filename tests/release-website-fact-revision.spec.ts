import { expect, test, type TestInfo } from "@playwright/test";

function fixtureOrigin(info: TestInfo): string {
  const baseURL = info.project.use.baseURL;
  if (!baseURL) throw new Error("This fixture needs an explicit loopback baseURL.");
  const url = new URL(baseURL);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("This fixture needs a credential-free HTTP loopback origin.");
  return url.origin;
}

for (const [width, enlarged] of [[1440, false], [390, false], [320, true]] as const) {
  test(`approved website facts can be revised with keyboard recovery at ${width}px${enlarged ? " with enlarged text" : ""}`, async ({ page }, info) => {
    const outsideRequests: string[] = [];
    const ownedOrigin = fixtureOrigin(info);
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === ownedOrigin) return route.continue();
      outsideRequests.push(url.origin); return route.abort();
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/preview/strelva/rebuild?scenario=review");
    if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    const review = page.getByRole("region", { name: "Website rebuild", exact: true });
    await review.getByRole("button", { name: "Confirm", exact: true }).first().click();
    await review.getByRole("button", { name: "Confirm", exact: true }).click();
    await review.getByRole("button", { name: "Approve this preview", exact: true }).click();
    await expect(review.getByText("This exact preview is approved.", { exact: true })).toBeVisible();
    const summary = review.locator("summary", { hasText: /^Edit website facts$/ });
    await summary.focus(); await page.keyboard.press("Enter");
    const fact = review.getByRole("article", { name: "[Office hours could not be confirmed]", exact: true });
    await fact.getByRole("button", { name: "Edit fact", exact: true }).focus();
    await page.keyboard.press("Enter");
    const field = fact.getByLabel("Corrected fact", { exact: true });
    await expect(field).toBeFocused();
    await field.fill("Saturday pickup is available by appointment. This is fictional interface content.");
    await fact.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(fact.getByRole("button", { name: "Edit fact", exact: true })).toBeFocused();
    await fact.getByRole("button", { name: "Edit fact", exact: true }).click();
    await expect(field).toHaveValue("[Office hours could not be confirmed]");
    const correction = "Saturday pickup is available by appointment. This is fictional interface content.";
    await field.fill(correction);
    await fact.getByRole("button", { name: "Save correction", exact: true }).click();
    const revised = review.getByRole("article", { name: correction, exact: true });
    await expect(revised.getByRole("button", { name: "Edit fact", exact: true })).toBeFocused();
    await expect(review.getByText("This exact preview is approved.", { exact: true })).toHaveCount(0);
    await expect(review.getByRole("status").filter({ hasText: "Fact updated in a new revision" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await revised.getByRole("button", { name: "Edit fact", exact: true }).click();
    await expect(revised.getByLabel("Corrected fact", { exact: true })).toHaveValue(correction);
    await page.screenshot({ path: info.outputPath("fact-editor.png"), fullPage: true });
    await info.attach("fictional-ui-scope", { body: JSON.stringify({ width, enlarged, externalRequestsBlocked: outsideRequests, nativeAuthQualified: false, realPreviewRevisionQualified: false }), contentType: "application/json" });
  });
}

for (const [width, enlarged] of [[1440, false], [390, false], [320, true]] as const) {
  test.describe(`fictional contact controls at ${width}px`, () => {
    test.use({ hasTouch: width < 768 });
    test(`contact removal preserves keyboard recovery, errors and read-only limits${enlarged ? " with enlarged text" : ""}`, async ({ page }, info) => {
      const outsideRequests: string[] = [];
      const ownedOrigin = fixtureOrigin(info);
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin === ownedOrigin) return route.continue();
        outsideRequests.push(url.origin); return route.abort();
      });
      await page.setViewportSize({ width, height: 900 });
      const open = async (scenario: string) => {
        await page.goto(`/preview/strelva/rebuild?scenario=${scenario}`);
        if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
        const region = page.getByRole("region", { name: "Website rebuild", exact: true });
        const summary = region.locator("summary", { hasText: /^Edit website facts$/ });
        await summary.focus(); await page.keyboard.press("Enter");
        return { region, summary };
      };
      const { region, summary } = await open("contacts");
      await expect(region.getByText("This exact preview is approved.", { exact: true })).toBeVisible();
      const phone = region.getByRole("article", { name: "(716) 555-0100", exact: true });
      const remove = phone.getByRole("button", { name: "Remove contact", exact: true });
      if (width < 768) {
        const box = await remove.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect(box?.width).toBeGreaterThanOrEqual(44);
      }
      await remove.focus(); await page.keyboard.press("Enter");
      await expect(phone).toHaveCount(0);
      await expect(summary).toBeFocused();
      await expect(region.getByText("This exact preview is approved.", { exact: true })).toHaveCount(0);
      await expect(region.getByRole("status").filter({ hasText: "Contact removed in a new private preview" })).toBeVisible();
      await expect(region.getByRole("article", { name: "orders@example.test", exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath("contact-removed.png"), fullPage: true });

      const failed = await open("contacts-error");
      const email = failed.region.getByRole("article", { name: "orders@example.test", exact: true });
      await email.getByRole("button", { name: "Edit fact", exact: true }).click();
      const field = email.getByLabel("Corrected fact", { exact: true });
      await field.fill("pickup@example.test");
      await email.getByRole("button", { name: "Remove contact", exact: true }).click();
      await expect(failed.region.getByRole("alert")).toContainText("Your current review is preserved");
      await expect(field).toHaveValue("pickup@example.test");
      await expect(field).toBeFocused();
      await expect(failed.region.getByText("This exact preview is approved.", { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath("contact-remove-error.png"), fullPage: true });

      const readOnly = await open("contacts-read-only");
      for (const button of await readOnly.region.getByRole("button", { name: "Remove contact", exact: true }).all()) await expect(button).toBeDisabled();
      await expect(readOnly.region.getByRole("button", { name: "Remove contact", exact: true })).toHaveCount(2);
      await info.attach("fictional-ui-scope", { body: JSON.stringify({ width, enlarged, externalRequestsBlocked: outsideRequests, nativeAuthQualified: false, realPreviewRevisionQualified: false, contactDeliveryQualified: false }), contentType: "application/json" });
    });
  });
}

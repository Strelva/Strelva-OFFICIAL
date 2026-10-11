import { expect, test } from "@playwright/test";
test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires isolated interface fixtures.");
const workspaceId = "5e000000-0000-4000-8000-000000000010";
for (const width of [1280, 390]) {
  test(`canonical Library shows existing inquiry Versions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/workspace/agency-library?*", route => route.fulfill({ json: { agencyWorkspaceId: workspaceId, sources: [], inquiryVersions: [
      { id: "juniper", tenantId: "juniper", businessName: "Juniper Bakery", name: "Custom cake inquiries", sourceBusinessId: workspaceId,
        sourceSystemId: "inquiry:source", sourceRevision: 2, currentRelease: 7, improvement: "blocked" },
      { id: "maple", tenantId: "maple", businessName: "Maple Catering", name: "Event inquiries", sourceBusinessId: workspaceId,
        sourceSystemId: "inquiry:source", sourceRevision: 2, currentRelease: 3, improvement: "auto_applicable" }], inquiryVersionsUnavailable: true } }));
    await page.goto("/preview/strelva/inquiry-library");
    await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
    await expect(page.getByText("Source revision 2 · this Version’s release 7")).toBeVisible();
    await expect(page.getByText("A source update needs a choice about local changes.")).toBeVisible();
    await expect(page.getByText("Some inquiry Versions could not be checked.", { exact: false })).toBeVisible();
    await page.getByRole("link", { name: "Open Juniper Bakery’s inquiry form" }).focus();
    await expect(page.getByRole("link", { name: "Open Juniper Bakery’s inquiry form" })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/w6-inquiry-library-${width}.png`, fullPage: true });
  });
  test(`external inquiry form remains named and honest at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/workspace/inquiries?*", route => route.fulfill({ json: { data: { sites: [{ key: "connected:juniper", connected: true,
      tenantId: null, siteName: "juniper.example.test", leads: [], unavailable: false, lastThirtyDays: 0 }], denied: [], durable: true } } }));
    await page.route("**/api/workspace/inquiries/system?*", route => route.fulfill({ json: { details: [{ site: "juniper.example.test", lifecycle: "draft", formSource: "external",
      health: "The current form is managed on your site. Its form and change history aren't available here.", forms: [], history: [],
      connections: [{ kind: "appears in", target: "juniper.example.test", sentence: "Receives inquiries from your connected site. Changing this System does not change the site's form." }] }] } }));
    await page.goto("/preview/strelva/inquiry-system?state=fetch");
    await expect(page.getByRole("heading", { name: "The form on juniper.example.test" })).toBeVisible();
    await expect(page.getByText("The current form is managed on your site.", { exact: false })).toBeVisible();
    await expect(page.getByRole("form", { name: /viewing copy/ })).toHaveCount(0);
    await page.getByText("Connections and History · juniper.example.test", { exact: true }).click();
    await expect(page.getByText("The form’s change history is unavailable here.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/w6-inquiry-external-${width}.png`, fullPage: true });
  });
}

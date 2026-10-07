import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Explicit local interface preview required; all actions use fictional transports.");
test.beforeEach(async ({ page }) => {
  await page.route("https://**", route => route.abort());
});
const ask = (mode = "on", scenario = "mooney") => `/preview/strelva?scenario=${scenario}&systems=on&needsYou=on&ask=${mode}&view=ask`;

for (const width of [1280, 390]) {
  test(`Ask drafts route to Needs you, refuses chat approval and stays usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(ask());
    const composer = page.getByRole("textbox", { name: "Ask Strelva about The Mooney Firm" });
    await expect(composer).toBeEnabled();
    await composer.fill("Change the homepage hero for our holiday promotion");
    await composer.press("Enter");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Open Needs you" })).toHaveAttribute("href", /\/workspace\?workspaceId=/);
    await expect(page.getByText(/Drafted: Homepage hero:/)).toBeVisible();
    await composer.fill("Approve it");
    await composer.press("Enter");
    await expect(page.getByText(/I can't approve anything from the conversation/)).toBeVisible();
    await expect(page.getByRole("button", { name: /approve|publish/i })).toHaveCount(0);
    await composer.focus();
    await expect(composer).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`ask-decision-${width}.png`), fullPage: true });
  });

  test(`Operator invitation preparation and revoke send nothing at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/preview/strelva/owner-invitations");
    await expect(page.getByRole("button", { name: "Prepare invitation link" })).toBeDisabled();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Prepare invitation link" }).click();
    await expect(page.getByRole("status")).toHaveText("Invitation link prepared. No email was sent.");
    await expect(page.getByRole("textbox", { name: "Invitation link — keep private" })).toHaveValue(/preview-token$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`invitation-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Revoke invitation" }).click();
    await expect(page.getByRole("status")).toHaveText("Invitation revoked.");
    await expect(page.getByRole("textbox", { name: "Invitation link — keep private" })).toHaveCount(0);
  });
}

for (const width of [1280, 390]) {
test(`Ask handles unavailable, unsaved, released-off and read-only states at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(ask("error"));
  const composer = page.getByRole("textbox", { name: "Ask Strelva about The Mooney Firm" });
  await composer.fill("What are our hours?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /can't answer/ })).toBeVisible();
  await expect(composer).toHaveValue("What are our hours?");
  await page.goto(ask("unsaved"));
  await expect(page.getByText(/Earlier conversations can't be read/)).toBeVisible();
  await page.goto(ask("off"));
  await expect(page.getByRole("textbox", { name: /Ask Strelva about/ })).toHaveCount(0);
  await page.goto(ask("on", "mooney-shared"));
  await expect(page.getByRole("textbox", { name: /Ask Strelva about/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test(`Invitation suppression, failure and permission states remain honest at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/preview/strelva/owner-invitations?delivery=suppressed");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Email invitation" }).click();
  await expect(page.getByRole("status")).toContainText("Email was not sent");
  await page.goto("/preview/strelva/owner-invitations?delivery=error");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Prepare invitation link" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "storage is unavailable" })).toBeVisible();
  await page.goto("/preview/strelva/owner-invitations?state=denied");
  await expect(page.getByText(/active Strelva operator with business admin membership is required/)).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.goto("/preview/strelva/owner-invitations?state=unavailable");
  await expect(page.getByRole("alert").filter({ hasText: "could not be read" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
}

import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires isolated interface fixtures.");
const path = "/preview/strelva/places?place=leads&held=1&reply=1";

test("owner sees the exact recipient and message, then one truthful provider receipt", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/workspace/inquiries/reply", async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { outcome: { status: "accepted", providerMessageId: "fixture-provider-1", acceptedAt: "2026-10-07T12:00:00Z", retryable: false } } });
  });
  await page.goto(path);
  await page.getByRole("button", { name: "Reply to Priya S." }).click();
  await expect(page.getByText("To priya@example.test", { exact: true })).toBeVisible();
  await page.getByLabel("Your reply to Priya S.").fill("We can prepare the cake for $80. Please confirm pickup.");
  await page.getByRole("button", { name: "Approve and send reply" }).click();
  await expect(page.getByRole("status")).toContainText("Sent. Delivery isn't confirmed yet.");
  await expect(page.getByText("Provider receipt: fixture-provider-1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve and send reply" })).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ rowId: "5e000000-0000-4000-8000-0000000000d4", body: "We can prepare the cake for $80. Please confirm pickup." });
  expect(requests[0]).not.toHaveProperty("to");
});

test("uncertain response retains the exact immutable draft and rechecks the same claim", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/workspace/inquiries/reply", async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill(requests.length === 1 ? { status: 503, json: { error: "Receipt unavailable" } }
      : { json: { outcome: { status: "unknown", providerMessageId: null, acceptedAt: null, retryable: false } } });
  });
  await page.goto(path);
  await page.getByRole("button", { name: "Reply to Priya S." }).click();
  await page.getByLabel("Your reply to Priya S.").fill("Can you confirm your pickup time?");
  await page.getByRole("button", { name: "Approve and send reply" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Receipt unavailable");
  await expect(page.getByLabel("Your reply to Priya S.")).toBeDisabled();
  await page.getByRole("button", { name: "Check this reply" }).click();
  await expect(page.getByRole("status")).toContainText("send couldn't be confirmed");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
});

test("held review reports a refusal without removing evidence", async ({ page }) => {
  await page.route("**/api/workspace/inquiries/held", route => route.fulfill({ status: 409, json: { error: "This message changed. Reload it." } }));
  await page.goto(path);
  await page.getByRole("button", { name: "Release the message from Ana", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("changed");
  await expect(page.getByRole("article", { name: "Ana", exact: true })).toBeVisible();
});

for (const state of ["empty", "permission", "error"] as const) {
  test(`${state} does not offer a reply or invent a record`, async ({ page }) => {
    await page.goto(`${path}&state=${state}`);
    await expect(page.getByRole("button", { name: /Reply to/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Priya S." })).toHaveCount(0);
    await expect(page.getByRole("main")).toBeVisible();
  });
}

test("narrow inbox and keyboard reply stay inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  await page.getByRole("button", { name: "Reply to Priya S." }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Your reply to Priya S.").fill("Please confirm the details.");
  await expect(page.getByLabel("Your reply to Priya S.")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "output/w6-inquiry-reply-mobile.png", fullPage: true });
});

import { test, expect } from "@playwright/test";

const preview = "/preview/strelva/agent-oauth";
const name = "Fictional consulting assistant with a longer display name";
for (const width of [320, 360, 768, 1280, 1600]) {
  test(`assistant connection wraps and disconnects at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${preview}?connections=active`, { waitUntil: "domcontentloaded" });
    const disconnect = page.getByRole("button", { name: `Disconnect ${name}`, exact: true });
    await expect(disconnect).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.keyboard.press("Tab");
    await expect(disconnect).toBeFocused();
    await disconnect.click();
    await expect(page.getByRole("button", { name: "Confirm disconnect" })).toBeVisible();
    await page.getByRole("button", { name: "Keep connected" }).click();
    await expect(disconnect).toBeVisible();
    await disconnect.click();
    await page.getByRole("button", { name: "Confirm disconnect" }).click();
    await expect(page.getByText("Disconnected", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Its access and renewal tokens have been revoked" })).toBeVisible();
    await expect(disconnect).toHaveCount(0);
  });
}
test("owners can revoke a connection whose old owner lost authority", async ({ page }) => {
  await page.goto(`${preview}?connections=authority_removed`);
  await expect(page.getByText("Business access ended", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Disconnect ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Confirm disconnect" }).click();
  await expect(page.getByText("Disconnected", { exact: true })).toBeVisible();
});
test("confirmed disconnect survives a failed refresh and reload recovers", async ({ page }) => {
  await page.goto(`${preview}?connections=refresh-error`);
  await page.getByRole("button", { name: `Disconnect ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Confirm disconnect" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Its access and renewal tokens have been revoked" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Reload before changing" })).toBeVisible();
  await page.getByRole("button", { name: "Reload connections" }).click();
  await expect(page.getByText("Disconnected", { exact: true })).toBeVisible();
});
test("unconfirmed mutation clears stale controls until reload", async ({ page }) => {
  await page.goto(`${preview}?connections=disconnect-error`);
  await page.getByRole("button", { name: `Disconnect ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Confirm disconnect" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Disconnect could not be confirmed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm disconnect" })).toHaveCount(0);
  await page.getByRole("button", { name: "Reload connections" }).click();
  await expect(page.getByRole("button", { name: `Disconnect ${name}`, exact: true })).toBeVisible();
});
for (const [mode, message] of [
  ["empty", "No assistants are connected to this business."],
  ["permission", "Only a business owner can manage assistant connections."],
  ["loading", "Loading assistant access…"],
  ["error", "Assistant access could not be loaded."],
]) {
  test(`assistant ${mode} state`, async ({ page }) => {
    await page.goto(`${preview}?connections=${mode}`);
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /Disconnect Fictional/ })).toHaveCount(0);
  });
}
test("consent explains client identity, renewal, and website review permissions", async ({ page }) => {
  await page.route("**/api/mcp/oauth/authorize", route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Sign in with a verified email." }) }));
  await page.goto(preview, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Client identity verified at assistant.example.test/)).toBeVisible();
  await expect(page.getByText(/renew access for up to 30 days/)).toBeVisible();
  await expect(page.getByText("Save website changes for owner review. Cannot publish them.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect assistant" })).toBeEnabled();
  await page.getByRole("button", { name: "Connect assistant" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "could not be approved" })).toBeVisible();
});
test("native website review requires owner fact decisions before approval", async ({ page }) => {
  await page.goto("/preview/strelva/rebuild?scenario=review", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("2 decisions need you", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve this preview", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Confirm", exact: true }).first().click();
  await expect(page.getByText("1 decision needs you", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve this preview", exact: true })).toBeDisabled();
});

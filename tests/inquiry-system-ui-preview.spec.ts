import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires isolated interface fixtures.");
const path = "/preview/strelva/inquiry-system";
const workspaceId = "5e000000-0000-4000-8000-000000000010";
const rowId = "5e000000-0000-4000-8000-0000000000d4";
const offer = { serviceId: "5e000000-0000-4000-8000-000000000020", services: [{ id: "5e000000-0000-4000-8000-000000000020", name: "Cake consultation", durationMinutes: 30 }], serviceName: "Cake consultation", timeZone: "America/New_York", expiresAt: "2026-10-11T12:00:00Z", chooseUrl: "/inquiry-booking/fixture.signed", slots: [0, 1, 2].map(index => ({ start: `2026-10-12T${13 + index}:00:00Z`, end: `2026-10-12T${13 + index}:30:00Z`, label: `Monday at ${9 + index} am EDT`, chooseUrl: `/inquiry-booking/fixture.signed?slot=${index}` })) };

test("current form comes before records and contextual history, without offering a builder", async ({ page }) => {
  await page.goto(path);
  await expect(page.getByRole("form", { name: /viewing copy/ })).toBeVisible();
  await expect(page.getByLabel("Your name (required)", { exact: true })).toBeDisabled();
  await expect(page.getByText("Live · The owner email bounced.", { exact: false })).toBeVisible();
  const positions = await page.evaluate(() => ["form", "article", "details"].map(selector => document.querySelector(selector)!.getBoundingClientRect().top));
  expect(positions[0]).toBeLessThan(positions[1]!); expect(positions[1]).toBeLessThan(positions[2]!);
  await page.getByText("Connections and History · Juniper Bakery", { exact: true }).click();
  await expect(page.getByText("Uses the current owner, people, hours and services.")).toBeVisible();
  await expect(page.getByText("Published the updated cake inquiry form after the owner approved it.")).toBeVisible();
  await page.screenshot({ path: "output/w6-inquiry-system-desktop.png", fullPage: true });
});

test("owner selects up to three times and approves the exact final reply once", async ({ page }) => {
  const preparations: Record<string, unknown>[] = [], sends: Record<string, unknown>[] = [];
  await page.route("**/api/workspace/inquiries/booking-offer", async route => {
    const input = route.request().postDataJSON(); preparations.push(input);
    await route.fulfill({ json: { offer: { ...offer, slots: input.starts ? offer.slots.filter(slot => input.starts.includes(slot.start)) : offer.slots } } });
  });
  await page.route("**/api/workspace/inquiries/reply", async route => { sends.push(route.request().postDataJSON()); await route.fulfill({ json: { outcome: { status: "accepted", providerMessageId: "fixture-selected-times", acceptedAt: "2026-10-10T12:00:00Z", retryable: false } } }); });
  await page.goto(path);
  await page.getByRole("button", { name: "Reply to Priya S." }).click();
  await page.getByLabel("Your reply to Priya S.").fill("Thanks for your inquiry.");
  await page.getByRole("button", { name: "Prepare appointment times" }).click();
  await page.getByLabel("Monday at 11 am EDT").uncheck();
  await page.getByRole("button", { name: "Add these times to reply" }).click();
  await expect(page.getByLabel("Your reply to Priya S.")).toHaveValue(/We must confirm your appointment/);
  const body = await page.getByLabel("Your reply to Priya S.").inputValue();
  expect(body).toContain("Thanks for your inquiry."); expect(body).toContain("We must confirm your appointment");
  expect(body).toContain("slot=0"); expect(body).toContain("slot=1"); expect(body).not.toContain("slot=2");
  expect(sends).toHaveLength(0);
  expect(preparations[1]).toMatchObject({ workspaceId, rowId, starts: offer.slots.slice(0, 2).map(slot => slot.start) });
  await page.getByRole("button", { name: "Approve and send reply" }).click();
  await expect(page.getByText("Provider receipt: fixture-selected-times", { exact: true })).toBeVisible();
  expect(sends).toHaveLength(1); expect(sends[0]).toMatchObject({ body });
});

test("unavailable appointment times retain the editable inquiry draft", async ({ page }) => {
  await page.route("**/api/workspace/inquiries/booking-offer", route => route.fulfill({ status: 503, json: { error: "Times are unavailable. Your reply is still here." } }));
  await page.goto(path);
  await page.getByRole("button", { name: "Reply to Priya S." }).click();
  await page.getByLabel("Your reply to Priya S.").fill("Please tell us more about your event.");
  await page.getByRole("button", { name: "Prepare appointment times" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Times are unavailable");
  await expect(page.getByLabel("Your reply to Priya S.")).toHaveValue("Please tell us more about your event.");
  await expect(page.getByLabel("Your reply to Priya S.")).toBeEnabled();
});

for (const next of ["error", "permission"] as const) {
  test(`business switch clears the previous records and draft through loading and ${next}`, async ({ page }) => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/workspace/inquiries?*", async route => {
      if (route.request().url().includes(workspaceId)) await route.fulfill({ json: { data: { workspaceReplies: true, durable: true, sites: [{ key: "juniper", tenantId: "juniper", siteName: "Juniper", unavailable: false, lastThirtyDays: 1, leads: [{ id: "private-record", rowId, name: "Private Juniper customer", email: "private@example.test", message: "Private Juniper message", source: null, fields: [], createdAt: "2026-10-07T12:00:00Z" }] }], denied: [] } } });
      else { await pending; await route.fulfill({ status: next === "permission" ? 403 : 503, json: { error: "Unavailable" } }); }
    });
    await page.route("**/api/workspace/inquiries/system?*", route => route.fulfill({ json: { details: [] } }));
    await page.goto(`${path}?state=fetch`);
    await page.getByRole("button", { name: "Reply to Private Juniper customer" }).click();
    await page.getByLabel("Your reply to Private Juniper customer").fill("Private unsent draft");
    await page.getByRole("button", { name: "Open Maple" }).click();
    await expect(page.getByText("Opening inquiries…", { exact: true })).toBeVisible();
    await expect(page.getByText("Private Juniper message", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Your reply to Private Juniper customer")).toHaveCount(0);
    release();
    await expect(page.getByText("Opening inquiries…", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Reply to/ })).toHaveCount(0);
    if (next === "error") await expect(page.getByRole("heading", { name: "Inquiries couldn't load" })).toBeVisible();
  });
}

test("mobile current form and reply use shared controls without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  await page.getByRole("button", { name: "Reply to Priya S." }).focus(); await page.keyboard.press("Enter");
  await page.getByLabel("Your reply to Priya S.").fill("Please confirm your requirements.");
  await expect(page.getByLabel("Your reply to Priya S.")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "output/w6-inquiry-system-mobile.png", fullPage: true });
});

for (const state of ["ready", "requested", "expired", "error", "conflict", "rate"] as const) {
  test(`signed booking choice ${state} is usable on mobile and truthful about confirmation`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/preview/strelva/inquiry-booking?state=${state}`);
    await expect(page.getByRole("main")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (state === "ready") { await expect(page.getByRole("button", { name: "Request this time" })).toHaveCount(3); await page.getByRole("button", { name: "Request this time" }).first().click(); await expect(page.getByText("Waiting for the business to confirm", { exact: true })).toBeVisible(); }
    if (state === "requested") await expect(page.getByText("Waiting for the business to confirm", { exact: true })).toBeVisible();
    if (state === "expired" || state === "error") await expect(page.getByRole("button", { name: "Request this time" })).toHaveCount(0);
    await page.screenshot({ path: `output/w6-inquiry-booking-${state}-mobile.png`, fullPage: true });
  });
}

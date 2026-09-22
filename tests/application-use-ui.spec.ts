import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the explicit application-use UI preview flag.");

const WORK_ID = "11111111-1111-4111-8111-111111111111";

const snapshot = {
  workId: WORK_ID,
  title: "Repair requests",
  releaseVersion: 1,
  views: [
    { kind: "form", fields: [{ id: "problem", label: "Problem", type: "text", required: true }] },
    { kind: "list", fields: [{ id: "problem", label: "Problem", type: "text", required: true }] },
  ],
  records: [{ id: "request-1", values: { problem: "Loose front door" } }],
  access: { views: ["form", "list"], recordRead: "all", recordSubmit: true, expiresAt: "2026-09-15T12:00:00.000Z" },
};

async function mockUse(page: Page, options: { revoked?: boolean; documentOnly?: boolean } = {}) {
  let submitted = false;
  const responseSnapshot = options.documentOnly
    ? {
        ...snapshot,
        views: [{ kind: "document", fields: [{ id: "problem", label: "Problem", type: "text", required: true }] }],
        access: { ...snapshot.access, views: ["document"], recordSubmit: false },
      }
    : snapshot;
  await page.route(`**/api/apps/${WORK_ID}`, async route => {
    if (options.revoked) {
      await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "This application link is no longer available." }) });
      return;
    }
    if (route.request().method() === "POST") {
      submitted = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...responseSnapshot, records: [...responseSnapshot.records, { id: "request-2", values: { problem: "Broken gate" } }] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responseSnapshot) });
  });
  return { wasSubmitted: () => submitted };
}

test("finished application is a focused keyboard usable experience with responsive records", async ({ page }, testInfo) => {
  const use = await mockUse(page);
  const requests: string[] = [];
  page.on("request", request => requests.push(new URL(request.url()).pathname));
  await page.goto(`/apps/${WORK_ID}`);
  await expect(page.getByRole("heading", { name: "Repair requests", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Records", exact: true })).toBeVisible();
  await page.getByLabel("Problem *", { exact: true }).fill("Broken gate");
  await page.getByLabel("Problem *", { exact: true }).press("Tab");
  await expect(page.getByRole("button", { name: "Submit record", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Submit record", exact: true }).press("Enter");
  await expect(page.getByRole("status")).toContainText("Record submitted.");
  expect(use.wasSubmitted()).toBe(true);
  expect(requests.some(path => /chat|agent|generate|workspace/.test(path))).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("application-use-ui-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("article", { name: "Record 1" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("application-use-ui-mobile.png"), fullPage: true });
});

test("finished application renders a bounded select and submits the chosen option", async ({ page }, testInfo) => {
  const selectSnapshot = {
    ...snapshot,
    views: [
      { kind: "form", fields: [{ id: "priority", label: "Priority", type: "select", required: true, options: ["standard", "urgent"] }] },
      { kind: "list", fields: [{ id: "priority", label: "Priority", type: "select", required: true, options: ["standard", "urgent"] }] },
    ],
    records: [],
  };
  let submitted: unknown;
  await page.route(`**/api/apps/${WORK_ID}`, async route => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...selectSnapshot, records: [{ id: "request-2", values: { priority: "urgent" } }] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(selectSnapshot) });
  });
  await page.goto(`/apps/${WORK_ID}`);
  const priority = page.getByRole("combobox", { name: /Priority/ });
  await priority.selectOption("urgent");
  await page.getByRole("button", { name: "Submit record", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Record submitted.");
  expect((submitted as { input?: { record?: { values?: unknown } } }).input?.record?.values).toEqual({ priority: "urgent" });
  await page.screenshot({ path: testInfo.outputPath("application-use-select-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("application-use-select-mobile.png"), fullPage: true });
});

test("finished application shows a revoked error without exposing the saved experience", async ({ page }, testInfo) => {
  await mockUse(page, { revoked: true });
  await page.goto(`/apps/${WORK_ID}`);
  await expect(page.getByRole("heading", { name: "This application link is unavailable", exact: true })).toBeVisible();
  await expect(page.locator('p[role="alert"]')).toContainText("no longer available");
  await expect(page.getByRole("heading", { name: "Repair requests", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("application-use-ui-revoked.png"), fullPage: true });
});

test("a document-only grant still renders its permitted records", async ({ page }) => {
  await mockUse(page, { documentOnly: true });
  await page.goto(`/apps/${WORK_ID}`);
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Record 1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Submit a record", exact: true })).toHaveCount(0);
});

test("corrections submit form fields while preserving visible office notes", async ({ page }) => {
  const editable = {
    ...snapshot,
    views: [snapshot.views[0]!, { kind: "list", fields: [...snapshot.views[1]!.fields, { id: "notes", label: "Office notes", type: "text", required: false }] }],
    records: [{ id: "existing-record", values: { problem: "Loose front door", notes: "Use the side entrance" }, revision: 1 }],
    access: { ...snapshot.access, recordEdit: "all" },
  };
  await page.route(`**/api/apps/${WORK_ID}`, async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const outsideForm = Object.hasOwn(body.input.record.values, "notes");
      await route.fulfill({ status: outsideForm ? 403 : 200, contentType: "application/json", body: JSON.stringify(outsideForm ? { error: "This field is not part of the released form." } : { ...editable, records: [{ ...editable.records[0], values: { ...editable.records[0]!.values, ...body.input.record.values }, revision: 2 }] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(editable) });
  });
  await page.goto(`/apps/${WORK_ID}`);
  await page.getByRole("button", { name: "Edit record", exact: true }).click();
  await page.getByLabel("Problem *", { exact: true }).fill("Door handle needs repair");
  await page.getByRole("button", { name: "Save correction", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Correction saved.");
  await expect(page.getByRole("article")).toContainText("Use the side entrance");
});

test("cancelling a correction starts a distinct new record", async ({ page }) => {
  const editable = {
    ...snapshot,
    records: [{ id: "existing-record", values: { problem: "Loose front door" }, revision: 1 }],
    access: { ...snapshot.access, recordEdit: "all" },
  };
  await page.route(`**/api/apps/${WORK_ID}`, async route => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      const collision = input.input.record.id === "existing-record";
      await route.fulfill({ status: collision ? 409 : 200, contentType: "application/json", body: JSON.stringify(collision ? { error: "Record already exists." } : { ...editable, records: [...editable.records, input.input.record] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(editable) });
  });
  await page.goto(`/apps/${WORK_ID}`);
  await page.getByRole("button", { name: "Edit record", exact: true }).click();
  await page.getByRole("button", { name: "Cancel correction", exact: true }).click();
  await page.getByLabel("Problem *", { exact: true }).fill("Broken gate");
  await page.getByRole("button", { name: "Submit record", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Record submitted.");
  await expect(page.getByRole("article", { name: "Record 1", exact: true })).toContainText("Loose front door");
  await expect(page.getByRole("article", { name: "Record 2", exact: true })).toContainText("Broken gate");
});

for (const width of [1440, 390]) {
  test(`shared records offer only authorized corrections at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route(`**/api/apps/${WORK_ID}`, route => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...snapshot,
        access: { ...snapshot.access, recordSubmit: false, recordEdit: "own" },
        records: [
          { id: "mine", values: { problem: "Loose front door" }, revision: 4 },
          { id: "other", values: { problem: "Broken hinge" } },
        ],
      }),
    }));
    await page.goto(`/apps/${WORK_ID}`);
    const ownRecord = page.getByRole("article", { name: "Record 1", exact: true });
    const sharedRecord = page.getByRole("article", { name: "Record 2", exact: true });
    await expect(sharedRecord).toContainText("Broken hinge");
    await expect(sharedRecord.getByRole("button", { name: "Edit record" })).toHaveCount(0);
    await ownRecord.getByRole("button", { name: "Edit record" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Problem *", { exact: true })).toHaveValue("Loose front door");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/strelva-app-edit-scope-${width}.png`, fullPage: true });
  });
}

test("an edit-only recipient keeps a date correction after a stale response", async ({ page }, testInfo) => {
  const editSnapshot = {
    ...snapshot,
    views: [
      { kind: "form", fields: [
        { id: "visit_date", label: "Visit date", type: "date", required: true },
        { id: "problem", label: "Problem", type: "text", required: true },
      ] },
      { kind: "list", fields: [
        { id: "visit_date", label: "Visit date", type: "date", required: true },
        { id: "problem", label: "Problem", type: "text", required: true },
      ] },
    ],
    records: [{ id: "request-1", values: { visit_date: "2024-02-28", problem: "Loose front door" }, revision: 1 }],
    access: { views: ["form", "list"], recordRead: "all", recordEdit: "own", recordSubmit: false, expiresAt: "2026-09-21T12:00:00.000Z" },
  };
  let attempt = 0;
  let submitted: unknown;
  await page.route(`**/api/apps/${WORK_ID}`, async route => {
    if (route.request().method() === "POST") {
      attempt += 1;
      submitted = route.request().postDataJSON();
      if (attempt === 1) {
        await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "That record changed." }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...editSnapshot, records: [{ id: "request-1", values: { visit_date: "2024-02-29", problem: "Broken gate" }, revision: 2 }] }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(editSnapshot) });
  });

  await page.goto(`/apps/${WORK_ID}`);
  await expect(page.getByRole("button", { name: "Edit record", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit record", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Correct a record", exact: true })).toBeVisible();
  await page.getByLabel("Visit date *", { exact: true }).fill("2024-02-29");
  await page.getByLabel("Problem *", { exact: true }).fill("Broken gate");
  await page.getByRole("button", { name: "Save correction", exact: true }).click();
  await expect(page.locator('[id$="application-submit-error"]')).toContainText("Your correction is still here");
  await expect(page.getByLabel("Visit date *", { exact: true })).toHaveValue("2024-02-29");
  await expect(page.getByLabel("Problem *", { exact: true })).toHaveValue("Broken gate");
  await page.getByRole("button", { name: "Save correction", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Correction saved.");
  expect((submitted as { action?: string; input?: { expectedRecordRevision?: number; record?: { id?: string; values?: unknown } } }).action).toBe("edit");
  expect((submitted as { input?: { expectedRecordRevision?: number } }).input?.expectedRecordRevision).toBe(1);
  expect((submitted as { input?: { record?: { id?: string; values?: unknown } } }).input?.record).toEqual({ id: "request-1", values: { visit_date: "2024-02-29", problem: "Broken gate" } });
  await page.screenshot({ path: testInfo.outputPath("application-use-edit-date.png"), fullPage: true });
});

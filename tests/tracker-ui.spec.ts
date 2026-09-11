import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test";
import { applyTrackerCommand, createTracker, previewTrackerImport } from "../src/products/tracker";
import type { TrackerSnapshot } from "../src/products/tracker/contracts";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ID = "tracker-browser-work";
const TRACKER_ID = "tracker-browser";
const CSV = [
  "Name,Status",
  ...Array.from({ length: 61 }, (_, index) => `Task ${index + 1},${index % 2 ? "in progress" : "queued"}`),
].join("\n");

type TrackerFixture = {
  tracker: TrackerSnapshot | null;
  readOnly: boolean;
  conflictNextEdit: boolean;
  experimentRecorded: boolean;
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function sourcePreview() {
  return previewTrackerImport({
    sourceId: "browser-upload",
    fileName: "tasks.csv",
    mimeType: "text/csv",
    content: CSV,
  });
}

function savedWork(tracker: TrackerSnapshot) {
  return {
    id: WORK_ID,
    workspaceId: WORKSPACE_ID,
    title: tracker.title,
    productId: "tracker",
    resourceKind: "tracker",
    payload: { tracker },
    input: {},
    createdAt: tracker.createdAt,
  };
}

function workspaceSnapshot(fixture: TrackerFixture) {
  return {
    actor: { email: "owner@example.com", localPreview: false },
    workspaces: [{
      id: WORKSPACE_ID,
      kind: fixture.readOnly ? "customer" : "personal",
      name: fixture.readOnly ? "Shared workspace" : "Owner workspace",
      ...(fixture.readOnly ? { access: "delegated_read" } : { access: "member", role: "owner" }),
    }],
    workspaceId: WORKSPACE_ID,
    work: fixture.tracker ? [savedWork(fixture.tracker)] : [],
    handoffs: [],
    delegations: [],
    products: [{
      id: "tracker",
      name: "Spreadsheet tracker",
      description: "Turn a CSV into working data with a saved history.",
      availability: "available",
    }],
  };
}

async function installTrackerApi(page: Page, options: { initialTracker?: TrackerSnapshot; readOnly?: boolean; conflictNextEdit?: boolean } = {}) {
  const fixture: TrackerFixture = {
    tracker: options.initialTracker ?? null,
    readOnly: options.readOnly ?? false,
    conflictNextEdit: options.conflictNextEdit ?? false,
    experimentRecorded: false,
  };
  const preview = sourcePreview();

  await page.route("**/api/workspace**", async (route) => {
    if (route.request().method() !== "GET") return json(route, { error: "Unsupported workspace fixture request." }, 400);
    return json(route, workspaceSnapshot(fixture));
  });

  await page.route("**/api/tracker**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      if (!fixture.tracker) return json(route, { error: "Tracker fixture has not been created." }, 404);
      return json(route, { workId: WORK_ID, workspaceId: WORKSPACE_ID, tracker: fixture.tracker, canRecordExperiment: true });
    }
    if (request.method() !== "POST") return json(route, { error: "Unsupported tracker fixture request." }, 400);

    const body = request.postDataJSON() as Record<string, unknown>;
    if (body.action === "preview") return json(route, { preview });
    if (body.action === "create") {
      const input = body.input as { fileName?: string; content?: string; mimeType?: string };
      if (input.content !== CSV || input.fileName !== "tasks.csv") return json(route, { error: "Unexpected source fixture." }, 400);
      fixture.tracker = createTracker(preview, {
        trackerId: TRACKER_ID,
        actorId: "owner",
        title: String(body.title || "Imported tracker"),
        mapping: Array.isArray(body.mapping) ? body.mapping as never : undefined,
        at: "2026-09-11T15:00:00.000Z",
      });
      return json(route, { workId: WORK_ID, workspaceId: WORKSPACE_ID, tracker: fixture.tracker });
    }
    if (body.action === "command") {
      if (!fixture.tracker) return json(route, { error: "Tracker fixture has not been created." }, 404);
      if (fixture.conflictNextEdit) {
        fixture.conflictNextEdit = false;
        return json(route, { error: "This work changed. Reload it before saving another edit." }, 409);
      }
      const command = body.command as Parameters<typeof applyTrackerCommand>[1];
      fixture.tracker = applyTrackerCommand(fixture.tracker, {
        ...command,
        trackerId: fixture.tracker.id,
        actorId: "owner",
        at: "2026-09-11T15:01:00.000Z",
      });
      return json(route, { workId: WORK_ID, workspaceId: WORKSPACE_ID, tracker: fixture.tracker, canRecordExperiment: true });
    }
    if (body.action === "experiment") {
      const input = body.input as { expectedRevision?: number };
      if (input.expectedRevision !== fixture.tracker?.revision) return json(route, { error: "This work changed. Reload it before recording evidence." }, 409);
      fixture.experimentRecorded = true;
      return json(route, { experimentWorkId: "experiment-browser", evidence: { reported: true } });
    }
    return json(route, { error: "Unsupported tracker fixture action." }, 400);
  });

  return fixture;
}

async function writeExperiment(page: Page) {
  await page.getByText("Internal R&D: record an experiment", { exact: true }).click();
  await page.getByLabel("What are we testing?").fill("Compare imported review time");
  await page.getByLabel("Workload and comparison method").fill("61-row CSV with a manual review baseline");
  await page.getByLabel("Previous approach, minutes").fill("60");
  await page.getByLabel("Setup, minutes").fill("5");
  await page.getByLabel("Review, minutes").fill("20");
  await page.getByLabel("Corrections, minutes").fill("3");
  await page.getByLabel("Checks, evidence and failures").fill("All imported rows were reviewed; no provider write was made.");
  await page.getByRole("button", { name: "Record experiment", exact: true }).click();
}

test("owner can import, save, reload, edit with conflict feedback, paginate, and record R&D evidence", async ({ page }, testInfo: TestInfo) => {
  const fixture = await installTrackerApi(page, { conflictNextEdit: true });
  await page.goto(`/workspace?workspaceId=${WORKSPACE_ID}&view=tracker`);

  await expect(page.getByRole("heading", { name: "Turn a spreadsheet into a tracker", exact: true })).toBeVisible();
  await page.getByLabel("Choose a CSV file", { exact: true }).setInputFiles({
    name: "tasks.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV),
  });
  await expect(page.getByRole("heading", { name: "Preview imported rows", exact: true })).toBeVisible();
  await expect(page.getByText("Task 1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Source row", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Tracker name").fill("Team backlog");
  await page.getByRole("button", { name: "Create tracker", exact: true }).click();
  await expect(page).toHaveURL(/view=tracker/);
  await expect(page).toHaveURL(/work=tracker-browser-work/);
  await expect(page.getByRole("heading", { name: "Team backlog", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next rows", exact: true })).toBeEnabled();
  await expect(page.getByText("Page 1 of 2", { exact: false }).first()).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("tracker-owner-saved-desktop.png"), fullPage: true });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Team backlog", exact: true })).toBeVisible();
  const firstNameCell = page.getByRole("button", { name: "Edit Name, source row 2", exact: true });
  await expect(firstNameCell).toHaveText("Task 1");

  await page.getByRole("button", { name: "Next rows", exact: true }).click();
  await expect(page.getByText("Page 2 of 2", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Name, source row 62", exact: true })).toHaveText("Task 61");
  await page.getByLabel("Filter rows").fill("Task 61");
  await expect(page.getByText("1 matching rows", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Name, source row 62", exact: true })).toHaveText("Task 61");
  await page.getByLabel("Filter rows").fill("");
  await page.getByRole("button", { name: "Edit Name, source row 2", exact: true }).click();
  await page.getByLabel("New cell value").fill("Task one revised");
  await page.getByRole("button", { name: "Save edit", exact: true }).click();
  await expect(page.locator("#tracker-error")).toContainText("This work changed. Reload it before saving another edit.");
  await page.getByRole("button", { name: "Save edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Name, source row 2", exact: true })).toHaveText("Task one revised");
  await expect(page.getByText(/Changed Name from.*Task 1.*Task one revised/)).toBeVisible();

  await writeExperiment(page);
  await expect(page.getByText("Experiment recorded in My work. These are reported observations, not verified customer savings.", { exact: true })).toBeVisible();
  expect(fixture.experimentRecorded).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await page.locator("[data-frame-main]").boundingBox())?.x ?? -1).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("tracker-owner-mobile.png"), fullPage: true });
});

test("delegated tracker work stays readable and read only on mobile", async ({ page }, testInfo: TestInfo) => {
  const preview = sourcePreview();
  const tracker = createTracker(preview, { trackerId: TRACKER_ID, actorId: "owner", title: "Shared backlog", at: "2026-09-11T15:00:00.000Z" });
  await installTrackerApi(page, { initialTracker: tracker, readOnly: true });
  await page.goto(`/workspace?workspaceId=${WORKSPACE_ID}&view=tracker&work=${WORK_ID}`);

  await expect(page.getByRole("heading", { name: "Shared backlog", exact: true })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Editing requires workspace membership.");
  await expect(page.getByRole("button", { name: /Edit Name/ })).toHaveCount(0);
  await expect(page.getByText("Internal R&D: record an experiment", { exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await page.locator("[data-frame-main]").boundingBox())?.x ?? -1).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("tracker-read-only-mobile.png"), fullPage: true });
});

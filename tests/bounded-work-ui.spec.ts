import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.STRELVA_WORKSPACE_RELEASE !== "1", "Requires the local workspace release server; all API responses are isolated fixtures.");
const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "44444444-4444-4444-8444-444444444444";
const at = "2026-09-12T12:00:00.000Z";
const base = { version: 1, revision: 0, title: "Team work", createdBy: "fixture-owner", createdAt: at, history: [] };
async function workspace(page: Page, productId: string, readOnly = false, empty = false) {
  await page.route("**/api/workspace**", route => route.fulfill({ json: {
    actor: { email: "owner@example.com", localPreview: false }, workspaceId,
    workspaces: [{ id: workspaceId, name: "My workspace", kind: "personal", access: readOnly ? "delegated_read" : "member" }],
    work: empty ? [] : [{ id: workId, workspaceId, title: base.title, productId, resourceKind: productId === "applications" ? "application" : productId === "scheduling" ? "schedule" : productId === "work_plans" ? "plan" : "investigation", payload: null, input: {}, createdAt: at }],
    handoffs: [], delegations: [], products: [{ id: productId, name: "Fixture work", description: "Local proof", availability: "available" }],
  } }));
}

test("private app uses its declared form, records and selected result on desktop and mobile", async ({ page }) => {
  await workspace(page, "applications");
  const spec = { title: base.title, maintenanceOwner: "fixture-owner", fields: [{ id: "name", label: "Customer name", type: "text", required: true }], components: [{ kind: "form", fields: ["name"] }, { kind: "list", fields: ["name"] }, { kind: "detail", fields: ["name"] }] };
  const release = { version: 1, spec, publishedAt: at, publishedBy: "fixture-owner", provenance: "published" as const };
  const payload = { ...base, spec, specVersion: 1, status: "installed", versions: [{ version: 1, spec }], rehearsal: { specVersion: 1, checks: [{ name: "Fixed components", passed: true }] }, records: [] as Array<{ id: string; values: Record<string, string> }>, recordsRevision: 0, release, releases: [release] };
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/bounded-work**", route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON(); writes.push(body);
      expect(body.command.kind).toBe("submit");
      expect(body.command).toMatchObject({ expectedReleaseVersion: 1, expectedRecordsRevision: 0 });
      payload.records.push(body.command.record); payload.revision++;
      payload.recordsRevision++;
    }
    return route.fulfill({ json: { id: workId, workspaceId, payload } });
  });
  await page.goto(`/workspace?workspaceId=${workspaceId}&work=${workId}`);
  await expect(page.getByRole("heading", { name: "Add a record" })).toBeVisible();
  await page.getByLabel("Customer name", { exact: true }).fill("Harbor Dental");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Harbor Dental", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open record 1", exact: true }).click();
  await expect(page.getByText("Harbor Dental", { exact: true }).last()).toBeVisible();
  expect(writes).toHaveLength(1);
  await page.getByRole("heading", { name: base.title, exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/strelva-private-app-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => page.getByRole("main").evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(380);
  await page.getByRole("heading", { name: base.title, exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/strelva-private-app-mobile.png", fullPage: true });
  await page.reload();
  await expect(page.getByRole("cell", { name: "Harbor Dental", exact: true })).toBeVisible();
});

test("a conflicting reservation preserves the requested time and does not claim a booking", async ({ page }) => {
  await workspace(page, "scheduling");
  const payload = { ...base, availability: [{ start: "2026-10-01T08:00:00.000Z", end: "2026-10-01T23:00:00.000Z" }], reservations: [] };
  await page.route("**/api/bounded-work**", route => route.request().method() === "POST" ? route.fulfill({ status: 409, json: { error: "That time conflicts with another reservation." } }) : route.fulfill({ json: { id: workId, workspaceId, payload } }));
  await page.goto(`/workspace?workspaceId=${workspaceId}&work=${workId}`);
  await page.getByLabel("Reservation name").fill("Consultation");
  await page.getByLabel("Starts", { exact: true }).fill("2026-10-01T13:00");
  await page.getByLabel("Ends", { exact: true }).fill("2026-10-01T14:00");
  await page.getByRole("button", { name: "Reserve in workspace" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("conflicts");
  await expect(page.getByLabel("Reservation name")).toHaveValue("Consultation");
  await expect(page.getByText("No time has been reserved yet.")).toBeVisible();
  await expect(page.getByText(/held in this workspace first, then can be synced to a connected calendar/)).toBeVisible();
});

test("a native reservation can change time without changing its identity", async ({ page }) => {
  await workspace(page, "scheduling");
  const payload = { ...base, revision: 1, availability: [{ start: "2026-10-01T08:00:00.000Z", end: "2026-10-01T23:00:00.000Z" }], reservations: [{ requestId: "visit-1", title: "Consultation", start: "2026-10-01T13:00:00.000Z", end: "2026-10-01T14:00:00.000Z", status: "reserved" }] };
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/bounded-work**", route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON(); writes.push(body);
      expect(body.command).toMatchObject({ kind: "reschedule", requestId: "visit-1", expectedRevision: 1 });
      payload.reservations[0] = { ...payload.reservations[0]!, start: "2026-10-01T15:00:00.000Z", end: "2026-10-01T16:00:00.000Z" };
      payload.revision = 2;
    }
    return route.fulfill({ json: { id: workId, workspaceId, payload } });
  });
  await page.goto(`/workspace?workspaceId=${workspaceId}&work=${workId}`);
  await expect(page.getByRole("listitem").filter({ hasText: "Consultation" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Change time for Consultation", exact: true }).click();
  await page.getByLabel("New Starts", { exact: true }).fill("2026-10-01T15:00");
  await page.getByLabel("New Ends", { exact: true }).fill("2026-10-01T16:00");
  await page.getByRole("button", { name: "Save new time for Consultation", exact: true }).click();
  await expect(page.getByText("Saved in this workspace.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]!.command).toMatchObject({ kind: "reschedule", requestId: "visit-1" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Change time for Consultation", exact: true })).toBeVisible();
});

test("unchanged sources keep unresolved differences visible and read-only work cannot run", async ({ page }) => {
  await workspace(page, "investigations", true);
  const sourceId = "55555555-5555-4555-8555-555555555555";
  const payload = { ...base, sources: [{ workId }, { workId: sourceId }], intervalMinutes: 60, status: "active", nextRunAt: at, runs: [{ requestId: "check-one", at, result: "no_change", fingerprint: "same", sources: [{ workId, revision: 1, updatedAt: at }, { workId: sourceId, revision: 2, updatedAt: at }], differences: [{ key: "document", left: "Open at nine", right: "Open at ten" }] }] };
  await page.route("**/api/bounded-work**", route => { expect(route.request().method()).toBe("GET"); return route.fulfill({ json: { id: workId, workspaceId, payload } }); });
  await page.goto(`/workspace?workspaceId=${workspaceId}&work=${workId}`);
  await expect(page.getByRole("heading", { name: "Sources have not changed" })).toBeVisible();
  await expect(page.getByText(/Previous differences remain unresolved/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "Open at nine" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check sources now" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Pause checks" })).toBeDisabled();
});


test("document drafting stays with the document and preserves writing after provider failure", async ({ page }) => {
  await workspace(page, "documents", false, true);
  const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const budgetId = "77777777-7777-4777-8777-777777777777";
  let ledger: Record<string, unknown> | null = null;
  const budgetCommands: string[] = [];
  const budgetResponse = () => ({ ledger, executions: [], usage: [], currentActorId: ownerId, canManage: true, canAccept: ledger?.status === "draft" });
  await page.route("**/api/work-economics**", async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      budgetCommands.push(String(body.action));
      if (body.action === "create") {
        ledger = {
          id: budgetId, workspaceId, workId: null, productId: "work_plans", resourceKind: "plan",
          tenantId: null, businessId: null, requestId: null, capabilityId: null, payerId: ownerId, currency: "usd",
          estimateCents: null, maxAuthorizedCents: body.maxAuthorizedCents, reservedCents: 0, usedCents: 0,
          strelvaRetryCents: 0, actualCents: null, actualKnown: false, status: "draft", createdBy: ownerId,
          acceptedBy: null, acceptedAt: null, createdAt: at, updatedAt: at,
        };
      } else if (body.action === "accept" && ledger) {
        ledger = { ...ledger, status: "accepted", acceptedBy: ownerId, acceptedAt: at, updatedAt: at };
      }
    }
    return route.fulfill({ json: budgetResponse() });
  });
  await page.route("**/api/work-plans", route => route.fulfill({ status: 503, json: { error: "Drafting is temporarily unavailable. Your request is unchanged." } }));
  await page.goto(`/workspace?workspaceId=${workspaceId}&view=document`);
  await page.getByLabel("Document title", { exact: true }).fill("Team handover");
  await page.getByLabel("Document text", { exact: true }).fill("Keep this paragraph.");
  await page.getByRole("button", { name: "Draft with Strelva", exact: true }).click();
  await page.getByLabel("The result you want", { exact: true }).fill("Draft a handover procedure for our team.");
  await page.getByLabel("Maximum planning budget, USD", { exact: true }).fill("1.25");
  await page.getByRole("button", { name: "Propose planning budget", exact: true }).click();
  await expect(page.getByText("$1.25", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accept planning budget", exact: true }).click();
  await expect(page.getByText("The maximum is accepted. A model call will reserve it before the request starts.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Prepare document draft", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByLabel("The result you want", { exact: true })).toHaveValue("Draft a handover procedure for our team.");
  await expect(page).toHaveURL(/view=document/);
  expect(budgetCommands).toEqual(["create", "accept"]);
  await page.getByRole("button", { name: "Write it myself", exact: true }).click();
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue("Team handover");
  await expect(page.getByLabel("Document text", { exact: true })).toHaveValue("Keep this paragraph.");
  await expect(page.getByRole("button", { name: "Save document", exact: true })).toBeEnabled();
});


test("a generated app is reviewed as a result and saved through its exact plan output", async ({ page }) => {
  await workspace(page, "work_plans");
  const outputId = "intake-app";
  const draft = { kind: "application", title: "Client intake", fields: [{ id: "name", label: "Client name", type: "text", required: true }], components: [{ kind: "form", fields: ["name"] }, { kind: "list", fields: ["name"] }] };
  await page.route("**/api/work-plans?**", route => route.fulfill({ json: { work: { id: workId, workspaceId }, plan: { version: 1, status: "ready", userGoal: "Create a private client intake app.", summary: "Collect and review client records.", proposedOutputs: [{ id: outputId, title: draft.title, description: "A private form and record list.", outcome: "capability", nativeOperationIds: ["create_application"], draft }], steps: [], neededInputs: [], requiredDecisions: [], supportedNativeOperations: [], estimatedCost: null, metadata: { revision: 1, actorId: "fixture-owner", createdBy: "fixture-owner", workspaceId, createdAt: at } } } }));
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/work-plans/execute", route => {
    const body = route.request().postDataJSON(); writes.push(body);
    return route.fulfill({ json: { nativeWorkId: "55555555-5555-4555-8555-555555555555", nativeProductId: "applications", receipt: { completedAt: at } } });
  });
  await page.goto(`/workspace?workspaceId=${workspaceId}&work=${workId}`);
  await expect(page.getByRole("region", { name: "Proposed app" })).toContainText("Client name");
  await expect(page.getByRole("region", { name: "Proposed app" })).toContainText("Starts with no records");
  await page.getByLabel("App name").fill("New client intake");
  await page.getByRole("button", { name: "Create application" }).click();
  expect(writes).toEqual([{ workspaceId, planWorkId: workId, outputId, expectedPlanRevision: 1, operationId: "create_application", inputs: { title: "New client intake", fields: draft.fields, components: draft.components } }]);
  await expect(page).toHaveURL(/view=applications/);
  await expect(page).toHaveURL(/work=55555555-5555-4555-8555-555555555555/);
});

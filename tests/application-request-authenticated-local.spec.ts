import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Auth and Postgres.");
test.setTimeout(120_000);

test("an owner starts with a request and delivers an application through the UI, using a prepared model response", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "request-owner");
  const employee = await signedInContext(browser, admin, "request-employee");
  try {
    expect((await owner.context.request.get("/api/workspace")).status()).toBe(200);
    const workspaceId = randomUUID();
    expect((await admin.from("workspaces").insert({ id: workspaceId, kind: "customer", name: "Harbor Plumbing", created_by: owner.userId })).error).toBeNull();
    expect((await admin.from("workspace_memberships").insert({ workspace_id: workspaceId, user_id: owner.userId, role: "owner", created_by: owner.userId })).error).toBeNull();
    const page = await owner.context.newPage();
    page.setDefaultTimeout(15_000);
    const goal = "Create an app for employees to request equipment for plumbing jobs.";
    let attempts = 0;
    // The planning response and its saved plan are fixtures. This does not
    // exercise the generation route. Application creation, release, sharing
    // and record writes use actual authenticated local routes.
    await page.route("**/api/work-plans", async route => {
      if (route.request().method() !== "POST") return route.continue();
      const input = route.request().postDataJSON() as Record<string, unknown>;
      expect(input).toMatchObject({
        workspaceId,
        userGoal: goal,
        planningEconomics: { maximumCents: 125 },
      });
      expect(input.planningEconomics).toMatchObject({
        jobId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        executionKey: expect.stringMatching(/^planning:/),
      });
      attempts += 1;
      if (attempts === 1) return route.fulfill({ status: 503, json: { error: "The request could not be prepared. Try again." } });
      const at = new Date().toISOString();
      const draft = { kind: "application", title: "Equipment requests", fields: [{ id: "equipment", label: "Equipment needed", type: "text", required: true }], components: [{ kind: "form", fields: ["equipment"] }, { kind: "list", fields: ["equipment"] }] };
      const plan = { version: 1, status: "ready", userGoal: goal, summary: "Employees can request equipment and review their submissions.", proposedOutputs: [{ id: "equipment-app", title: draft.title, description: "A staff request form and list.", outcome: "capability", nativeOperationIds: ["create_application"], draft }], steps: [], neededInputs: [], supportedNativeOperations: [{ id: "create_application", productId: "applications", resourceKind: "application", label: "Create an application", effect: "create_resource", support: "release_gated", description: "Create a private application" }], estimatedCost: null, requiredDecisions: [], context: { version: 1, sources: [] }, metadata: { revision: 1, actorId: owner.userId, createdBy: owner.userId, workspaceId, createdAt: at } };
      const saved = await admin.from("saved_product_work").insert({ workspace_id: workspaceId, product_id: "work_plans", resource_kind: "plan", title: "Equipment requests", created_by: owner.userId, payload: plan }).select("id").single();
      expect(saved.error).toBeNull();
      return route.fulfill({ json: { work: { id: saved.data!.id, workspaceId }, plan } });
    });
    await page.goto(`/workspace?workspaceId=${workspaceId}&view=start`);
    await page.getByLabel("What do you want to accomplish?").fill(goal);
    await page.getByRole("button", { name: "Show me the shape", exact: true }).click();
    await page.getByRole("button", { name: "Prepare application", exact: true }).click();
    await expect(page.getByLabel("The result you want", { exact: true })).toHaveValue(goal);
    await page.getByLabel("Maximum planning budget, USD", { exact: true }).fill("1.25");
    await page.getByRole("button", { name: "Propose planning budget", exact: true }).click();
    await expect(page.getByText("$1.25", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Accept planning budget", exact: true }).click();
    await expect(page.getByText("The maximum is accepted. A model call will reserve it before the request starts.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Prepare a plan", exact: true }).click();
    await expect(page.getByRole("region", { name: "Work plan", exact: true }).getByRole("alert")).toContainText("Try again");
    await expect(page.getByLabel("The result you want", { exact: true })).toHaveValue(goal);
    await page.getByRole("button", { name: "Prepare a plan", exact: true }).click();
    await page.getByRole("button", { name: "Create application", exact: true }).click();
    await expect(page).toHaveURL(/view=applications/);
    await expect(page.getByRole("heading", { name: "Equipment requests", exact: true })).toBeVisible();
    const appId = new URL(page.url()).searchParams.get("work");
    expect(appId).toBeTruthy();
    await page.getByRole("button", { name: "Check proposed change", exact: true }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText(/Version 1 is live/)).toBeVisible();
    await page.getByLabel("Recipient email", { exact: true }).fill(employee.email);
    await page.getByRole("button", { name: "Issue access link", exact: true }).click();
    await expect(page.locator(`a[href="/apps/${appId}"]`)).toBeVisible();
    const staff = await employee.context.newPage();
    await staff.setViewportSize({ width: 390, height: 844 });
    await staff.goto(`/apps/${appId}`);
    await staff.getByLabel("Equipment needed *", { exact: true }).fill("Pipe inspection camera for the Elm Street job");
    await staff.getByRole("button", { name: "Submit record", exact: true }).click();
    await expect(staff.getByText("Pipe inspection camera for the Elm Street job", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Pipe inspection camera for the Elm Street job", { exact: true })).toBeVisible();
    await page.getByText("Edit proposed app", { exact: true }).click();
    await page.getByLabel("Label for Equipment needed", { exact: true }).fill("Equipment and job");
    await page.getByRole("button", { name: "Save new draft", exact: true }).click();
    await expect(page.getByText(/label changes from "Equipment needed" to "Equipment and job"/)).toBeVisible();
    await staff.reload();
    await expect(staff.getByLabel("Equipment needed *", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Check proposed change", exact: true }).click();
    // A compatible submission arriving after review must not require the owner
    // to restart an unchanged design review or lose that submission.
    await staff.getByLabel("Equipment needed *", { exact: true }).fill("Replacement pipe cutter for van 3");
    await staff.getByRole("button", { name: "Submit record", exact: true }).click();
    await expect(staff.getByText("Replacement pipe cutter for van 3", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await staff.reload();
    await expect(staff.getByLabel("Equipment and job *", { exact: true })).toBeVisible();
    await expect(staff.getByText("Pipe inspection camera for the Elm Street job", { exact: true })).toBeVisible();
    await expect(staff.getByText("Replacement pipe cutter for van 3", { exact: true })).toBeVisible();
    await staff.screenshot({ path: testInfo.outputPath("equipment-requests-phone.png"), fullPage: true });
    expect(attempts).toBe(2);
  } finally {
    await owner.context.close();
    await employee.context.close();
  }
});

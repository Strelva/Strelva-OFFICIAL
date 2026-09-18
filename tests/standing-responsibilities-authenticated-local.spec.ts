import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires an isolated local Supabase stack.");
test.setTimeout(180_000);
test.use({ actionTimeout: 15_000 });

async function post(request: APIRequestContext, path: string, body: unknown, expectedStatus: number | number[] = 200) {
  const response = await request.post(path, { headers: { origin: localEnvironment().app }, data: body });
  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  expect(expected, await response.text()).toContain(response.status());
  return response.json();
}

async function getJson(request: APIRequestContext, path: string) {
  const response = await request.get(path);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test("admits two current saved checks as distinct finite jobs, replays a trigger, and gates a revoked job", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "standing-owner");
  try {
    const workspace = await getJson(owner.context.request, "/api/workspace");
    const workspaceId = workspace.workspaceId as string;
    const left = await post(owner.context.request, "/api/documents", {
      action: "create", workspaceId, input: { title: "Supplier terms", text: "Net 30" },
    });
    const right = await post(owner.context.request, "/api/documents", {
      action: "create", workspaceId, input: { title: "Supplier record", text: "Net 30" },
    });
    const investigation = await post(owner.context.request, "/api/bounded-work", {
      action: "create", productId: "investigations", workspaceId,
      input: { title: "Check supplier documents", intervalMinutes: 15, sources: [{ workId: left.workId }, { workId: right.workId }] },
    }, 201);

    let standing = await post(owner.context.request, "/api/operations", {
      action: "standing_create", workspaceId,
      input: {
        title: "Check supplier documents repeatedly",
        intent: "Compare the saved supplier records whenever the owner admits a check.",
        scope: { steps: [{ id: "check", operation: "investigation.run", workId: investigation.id, input: {}, dependsOn: [], maximumCents: 0 }] },
        trigger: { kind: "manual" },
        limits: { maxConcurrentJobs: 1, maxRuns: 10 },
        exclusions: ["No external messages"],
        escalation: "Review differences before changing a supplier record.",
      },
    }, [200, 201]);
    expect(standing.policy).toMatchObject({ version: 1, revision: 0, status: "proposed" });
    standing = await post(owner.context.request, "/api/operations", {
      action: "standing_command", standingId: standing.id,
      command: { kind: "approve", expectedRevision: standing.policy.revision },
    });
    expect(standing.policy).toMatchObject({ version: 1, revision: 1, status: "active" });

    const first = await post(owner.context.request, "/api/operations", {
      action: "standing_admit", standingId: standing.id,
      input: { triggerKey: "manual:first", expectedVersion: standing.policy.version },
    });
    expect(first.replayed).toBe(false);
    // Simulate a lost wrapper receipt after the finite native action committed:
    // the finite entry point completes, while the standing run remains admitted.
    const acceptedWithoutProjection = await post(owner.context.request, "/api/operations", {
      action: "run", workId: first.job.finiteWorkId,
    });
    expect(acceptedWithoutProjection.payload.status).toBe("completed");
    const firstRun = await post(owner.context.request, "/api/operations", { action: "standing_run", runId: first.run.id });
    expect(firstRun.run).toMatchObject({ status: "completed", attempt: 1 });
    const firstFinite = await getJson(owner.context.request, `/api/operations?workId=${first.job.finiteWorkId}`);
    expect(firstFinite.payload).toMatchObject({ status: "completed", steps: [{ status: "completed", effect: "accepted" }] });

    const changedInvestigation = await getJson(owner.context.request, `/api/bounded-work?productId=investigations&workId=${investigation.id}`);
    expect(changedInvestigation.payload.revision).toBe(1);
    const recoveredAgain = await post(owner.context.request, "/api/operations", { action: "standing_run", runId: first.run.id });
    expect(recoveredAgain.run).toMatchObject({ status: "completed", attempt: 1 });
    const unchangedAfterRecovery = await getJson(owner.context.request, `/api/bounded-work?productId=investigations&workId=${investigation.id}`);
    expect(unchangedAfterRecovery.payload.revision).toBe(1);

    // Make the next native investigation due in this isolated database. The
    // policy still resolves the current revision and request identity at the
    // second admission; this only avoids waiting for the native 15-minute
    // interval during a local proof.
    const duePayload = { ...changedInvestigation.payload, nextRunAt: new Date(Date.now() - 1000).toISOString() };
    const dueUpdate = await admin.from("saved_product_work").update({ payload: duePayload }).eq("id", investigation.id).eq("workspace_id", workspaceId);
    expect(dueUpdate.error, dueUpdate.error?.message).toBeNull();

    const second = await post(owner.context.request, "/api/operations", {
      action: "standing_admit", standingId: standing.id,
      input: { triggerKey: "manual:second", expectedVersion: standing.policy.version },
    });
    expect(second.replayed).toBe(false);
    expect(second.job.finiteWorkId).not.toBe(first.job.finiteWorkId);
    const secondFinite = await getJson(owner.context.request, `/api/operations?workId=${second.job.finiteWorkId}`);
    expect(secondFinite.payload.steps[0].input).toMatchObject({ expectedRevision: 1 });
    expect(secondFinite.payload.steps[0].input.requestId).not.toBe(firstFinite.payload.steps[0].input?.requestId);
    const secondRun = await post(owner.context.request, "/api/operations", { action: "standing_run", runId: second.run.id });
    expect(secondRun.run.status).toBe("completed");

    const replay = await post(owner.context.request, "/api/operations", {
      action: "standing_admit", standingId: standing.id,
      input: { triggerKey: "manual:first", expectedVersion: standing.policy.version },
    });
    expect(replay.replayed).toBe(true);
    expect(replay.job.id).toBe(first.job.id);
    const runs = await getJson(owner.context.request, `/api/operations?standingId=${standing.id}&view=runs`);
    expect(runs.jobs).toHaveLength(2);
    expect(new Set(runs.jobs.map((job: { finiteWorkId: string }) => job.finiteWorkId)).size).toBe(2);
    expect(runs.runs.filter((run: { status: string }) => run.status === "completed")).toHaveLength(2);

    standing = await post(owner.context.request, "/api/operations", {
      action: "standing_command", standingId: standing.id,
      command: { kind: "pause", expectedRevision: standing.policy.revision },
    });
    expect(standing.policy.status).toBe("paused");
    await post(owner.context.request, "/api/operations", {
      action: "standing_admit", standingId: standing.id,
      input: { triggerKey: "manual:paused", expectedVersion: standing.policy.version },
    }, 409);
    const pausedHistory = await getJson(owner.context.request, `/api/operations?standingId=${standing.id}&view=runs`);
    expect(pausedHistory.jobs).toHaveLength(2);
    expect(pausedHistory.runs.filter((run: { status: string }) => run.status === "completed")).toHaveLength(2);

    standing = await post(owner.context.request, "/api/operations", {
      action: "standing_command", standingId: standing.id,
      command: { kind: "resume", expectedRevision: standing.policy.revision },
    });
    const cancelled = await post(owner.context.request, "/api/operations", {
      action: "standing_admit", standingId: standing.id,
      input: { triggerKey: "manual:cancelled", expectedVersion: standing.policy.version },
    });
    const cancelledRun = await post(owner.context.request, "/api/operations", {
      action: "standing_cancel", runId: cancelled.run.id,
    });
    expect(cancelledRun).toMatchObject({ run: { status: "cancelled" }, finiteWork: { payload: { status: "cancelled" } } });
    const cancelledReplay = await post(owner.context.request, "/api/operations", {
      action: "standing_run", runId: cancelled.run.id,
    });
    expect(cancelledReplay.run.status).toBe("cancelled");
    const afterCancellation = await getJson(owner.context.request, `/api/bounded-work?productId=investigations&workId=${investigation.id}`);
    expect(afterCancellation.payload.revision).toBe(2);

    const revoked = await post(owner.context.request, "/api/operations", {
      action: "standing_admit", standingId: standing.id,
      input: { triggerKey: "manual:revoked", expectedVersion: standing.policy.version },
    });
    standing = await post(owner.context.request, "/api/operations", {
      action: "standing_command", standingId: standing.id,
      command: { kind: "revoke", expectedRevision: standing.policy.revision },
    });
    expect(standing.policy.status).toBe("revoked");
    const revokedReplay = await post(owner.context.request, "/api/operations", {
      action: "standing_admit", standingId: standing.id,
      input: { triggerKey: "manual:first", expectedVersion: standing.policy.version },
    });
    expect(revokedReplay.replayed).toBe(true);
    expect(revokedReplay.job.id).toBe(first.job.id);
    await post(owner.context.request, "/api/operations", { action: "standing_admit", standingId: standing.id, input: { triggerKey: "manual:after-revoke", expectedVersion: standing.policy.version } }, 409);

    // This is the alternate finite entry point. The accepted work remains
    // readable, but the native adapter must stop before claiming its effect.
    await post(owner.context.request, "/api/operations", { action: "run", workId: revoked.job.finiteWorkId }, 409);
    const blockedFinite = await getJson(owner.context.request, `/api/operations?workId=${revoked.job.finiteWorkId}`);
    expect(blockedFinite.payload).toMatchObject({ status: "ready", steps: [{ status: "pending", attempt: 0 }] });
    const retained = await getJson(owner.context.request, `/api/operations?standingId=${standing.id}&view=runs`);
    expect(retained.jobs).toHaveLength(4);
    expect(retained.runs.map((run: { status: string }) => run.status)).toEqual(expect.arrayContaining(["completed", "cancelled", "failed"]));
  } finally {
    await owner.context.close();
  }
});

test("an owner can discover, create, and reopen ongoing work in the workspace", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "standing-ui-owner");
  try {
    const workspace = await getJson(owner.context.request, "/api/workspace");
    const workspaceId = workspace.workspaceId as string;
    const left = await post(owner.context.request, "/api/documents", {
      action: "create", workspaceId, input: { title: "Supplier terms", text: "Net 30" },
    });
    const right = await post(owner.context.request, "/api/documents", {
      action: "create", workspaceId, input: { title: "Supplier record", text: "Net 30" },
    });
    const investigation = await post(owner.context.request, "/api/bounded-work", {
      action: "create", productId: "investigations", workspaceId,
      input: { title: "Saved supplier check", intervalMinutes: 15, sources: [{ workId: left.workId }, { workId: right.workId }] },
    }, 201);
    expect(investigation.id || investigation.workId || investigation.work?.id).toBeTruthy();
    const page = await owner.context.newPage();
    await page.goto(`/workspace?workspaceId=${workspaceId}&view=operations`);
    await expect(page.getByRole("heading", { name: "Saved checks that can run again", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "New ongoing work", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("UI supplier check");
    await page.getByLabel("Result", { exact: true }).fill("Compare the supplier records whenever a check is needed.");
    await page.getByLabel("Saved check", { exact: true }).selectOption({ label: "Saved supplier check" });
    await page.getByRole("button", { name: "Create ongoing work", exact: true }).click();
    await expect(page).toHaveURL(/standingId=/);
    await expect(page.getByRole("heading", { name: "UI supplier check", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Runs", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Decisions", exact: true })).toBeVisible();
    await page.screenshot({ path: "/tmp/strelva-standing-owner-desktop.png", fullPage: true });
    await page.getByText("History", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Jobs", exact: true })).toBeVisible();
    await page.getByText("History", { exact: true }).click();
    await page.getByRole("button", { name: "Approve ongoing work", exact: true }).click();
    await expect(page.getByText("Ready to run", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Run now", exact: true }).click();
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.getByText("Paused", { exact: true }).first()).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "UI supplier check", exact: true })).toBeVisible();
    await expect(page.getByText("Paused", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: "/tmp/strelva-standing-owner-phone.png", fullPage: true });
    await page.close();
  } finally {
    await owner.context.close();
  }
});

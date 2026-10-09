import { randomUUID } from "node:crypto";
import { configuredPackageReviewer } from "./support/configured-package-reviewer";
import { ordinaryAgencyMaker, ordinaryCustomerBusiness } from "./support/ordinary-agency-maker";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires an isolated local Supabase stack.");
test.setTimeout(180_000);
async function post(request: APIRequestContext, path: string, body: unknown, status = 200) {
  const response = await request.post(path, { headers: { origin: localEnvironment().app }, data: body });
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}

test("approved budgeted work completes a native document edit and refuses another account", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "operation-owner");
  const stranger = await signedInContext(browser, admin, "operation-stranger");
  try {
    const snapshotResponse = await owner.context.request.get("/api/workspace");
    expect(snapshotResponse.status()).toBe(200);
    const { workspaceId } = await snapshotResponse.json();
    expect((await stranger.context.request.get("/api/workspace")).status()).toBe(200);
    const document = await post(owner.context.request, "/api/documents", { action: "create", workspaceId, input: { title: "Opening procedure", text: "Open at nine." } });
    let operation = await post(owner.context.request, "/api/operations", { action: "create", workspaceId, input: { title: "Update the opening procedure", intent: "Reflect the agreed ten o’clock opening", steps: [{ id: "edit", operation: "document.edit", workId: document.workId, input: { kind: "edit", expectedRevision: 0, title: "Opening procedure", text: "Open at ten." }, maximumCents: 5 }] } });
    expect(operation.payload.status).toBe("proposed");
    await post(owner.context.request, "/api/operations", { action: "run", workId: operation.id }, 409);
    const budget = await post(owner.context.request, "/api/work-economics", { action: "create", workspaceId, workId: operation.id, productId: "operations", resourceKind: "responsibility", payerId: owner.userId, estimateCents: 0, maxAuthorizedCents: 5 });
    await post(owner.context.request, "/api/work-economics", { action: "accept", jobId: budget.ledger.id });
    operation = await post(owner.context.request, "/api/operations", { action: "command", workId: operation.id, command: { kind: "set_budget", expectedRevision: 0, budgetId: budget.ledger.id } });
    operation = await post(owner.context.request, "/api/operations", { action: "command", workId: operation.id, command: { kind: "approve", expectedRevision: operation.payload.revision } });
    expect(operation.payload.status).toBe("ready");
    expect((await stranger.context.request.get(`/api/operations?workId=${operation.id}`)).status()).toBe(403);
    await post(stranger.context.request, "/api/operations", { action: "run", workId: operation.id }, 403);
    operation = await post(owner.context.request, "/api/operations", { action: "command", workId: operation.id, command: { kind: "pause", expectedRevision: operation.payload.revision } });
    await post(owner.context.request, "/api/operations", { action: "run", workId: operation.id }, 409);
    operation = await post(owner.context.request, "/api/operations", { action: "command", workId: operation.id, command: { kind: "resume", expectedRevision: operation.payload.revision } });
    operation = await post(owner.context.request, "/api/operations", { action: "run", workId: operation.id });
    expect(operation.payload.status).toBe("completed");
    expect(operation.payload.steps[0]).toMatchObject({ status: "completed", effect: "accepted", attempt: 1 });
    const reopened = await owner.context.request.get(`/api/documents?workId=${document.workId}`);
    expect((await reopened.json()).document).toMatchObject({ text: "Open at ten.", revision: 1 });
    const safeReplay = await post(owner.context.request, "/api/operations", { action: "run", workId: operation.id });
    expect(safeReplay.payload.status).toBe("completed");
    const replayDocument = await owner.context.request.get(`/api/documents?workId=${document.workId}`);
    expect((await replayDocument.json()).document.revision).toBe(1);
    const finalBudget = await owner.context.request.get(`/api/work-economics?jobId=${budget.ledger.id}`);
    const ledger = await finalBudget.json();
    expect(ledger.ledger.status).toBe("settled");
    expect(ledger.executions).toHaveLength(1);
    expect(ledger.executions[0]).toMatchObject({ status: "finished", effect: "accepted", amountCents: 0 });
    const page = await owner.context.newPage();
    await page.goto(`/workspace?workspaceId=${workspaceId}&view=document&work=${document.workId}`);
    await expect(page.getByLabel("Document text", { exact: true })).toHaveValue("Open at ten.");
  } finally { await owner.context.close(); await stranger.context.close(); }
});

test("native scheduling keeps one reservation identity through cancel, reschedule and retry", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "scheduling-lifecycle-owner");
  try {
    const snapshotResponse = await owner.context.request.get("/api/workspace");
    expect(snapshotResponse.status()).toBe(200);
    const { workspaceId } = await snapshotResponse.json();
    let schedule = await post(owner.context.request, "/api/bounded-work", { action: "create", productId: "scheduling", workspaceId, input: { title: "Private availability", availability: [{ start: "2026-10-01T09:00:00Z", end: "2026-10-01T17:00:00Z" }] } }, 201);
    const reopened = await owner.context.request.get(`/api/bounded-work?productId=scheduling&workId=${schedule.id}`);
    expect((await reopened.json()).payload.reservations).toEqual([]);
    schedule = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "scheduling", workId: schedule.id, command: { kind: "reserve", expectedRevision: 0, requestId: "visit-1", title: "Site visit", start: "2026-10-01T10:00:00Z", end: "2026-10-01T11:00:00Z" } });
    schedule = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "scheduling", workId: schedule.id, command: { kind: "cancel", expectedRevision: 1, requestId: "visit-1" } });
    expect(schedule.payload.reservations[0]).toMatchObject({ requestId: "visit-1", status: "cancelled" });
    const cancelRetry = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "scheduling", workId: schedule.id, command: { kind: "cancel", expectedRevision: 1, requestId: "visit-1" } });
    expect(cancelRetry.payload.reservations).toHaveLength(1);
    schedule = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "scheduling", workId: schedule.id, command: { kind: "reserve", expectedRevision: 2, requestId: "visit-2", title: "Follow-up", start: "2026-10-01T11:00:00Z", end: "2026-10-01T12:00:00Z" } });
    schedule = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "scheduling", workId: schedule.id, command: { kind: "reschedule", expectedRevision: 3, requestId: "visit-2", start: "2026-10-01T12:00:00Z", end: "2026-10-01T13:00:00Z" } });
    const rescheduleRetry = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "scheduling", workId: schedule.id, command: { kind: "reschedule", expectedRevision: 3, requestId: "visit-2", start: "2026-10-01T12:00:00Z", end: "2026-10-01T13:00:00Z" } });
    expect(rescheduleRetry.payload.reservations).toEqual(schedule.payload.reservations);
    await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "scheduling", workId: schedule.id, command: { kind: "reserve", expectedRevision: 4, requestId: "visit-3", title: "Conflict", start: "2026-10-01T13:00:00Z", end: "2026-10-01T14:00:00Z" } });
    await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "scheduling", workId: schedule.id, command: { kind: "reschedule", expectedRevision: 5, requestId: "visit-2", start: "2026-10-01T13:30:00Z", end: "2026-10-01T14:30:00Z" } }, 409);
    const final = await owner.context.request.get(`/api/bounded-work?productId=scheduling&workId=${schedule.id}`);
    expect((await final.json()).payload.reservations).toEqual(expect.arrayContaining([
      expect.objectContaining({ requestId: "visit-1", status: "cancelled" }),
      expect.objectContaining({ requestId: "visit-2", status: "reserved", start: "2026-10-01T12:00:00Z", end: "2026-10-01T13:00:00Z" }),
      expect.objectContaining({ requestId: "visit-3", status: "reserved" }),
    ]));
  } finally { await owner.context.close(); }
});

test("scheduling, generated applications and two-source investigation persist with their native checks", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "horizontal-owner");
  let maker: Awaited<ReturnType<typeof ordinaryAgencyMaker>> | undefined;
  let reviewer: Awaited<ReturnType<typeof configuredPackageReviewer>> | undefined;
  try {
    const workspaceId = await ordinaryCustomerBusiness(owner, "Native horizontal operations business");
    maker = await ordinaryAgencyMaker(browser, admin, owner, workspaceId);
    let schedule = await post(owner.context.request, "/api/bounded-work", { action: "create", productId: "scheduling", workspaceId, input: { title: "Private availability", availability: [{ start: "2026-10-01T09:00:00Z", end: "2026-10-01T17:00:00Z" }] } }, 201);
    schedule = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "scheduling", workId: schedule.id, command: { kind: "reserve", expectedRevision: 0, requestId: "visit-1", title: "Site visit", start: "2026-10-01T10:00:00Z", end: "2026-10-01T11:00:00Z" } });
    expect(schedule.payload.reservations[0].status).toBe("reserved");
    await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "scheduling", workId: schedule.id, command: { kind: "reserve", expectedRevision: 1, requestId: "visit-2", title: "Conflicting visit", start: "2026-10-01T10:30:00Z", end: "2026-10-01T11:30:00Z" } }, 409);
    let app = await post(maker.context.request, "/api/bounded-work", { action: "create", productId: "applications", workspaceId, input: { title: "Project portal", fields: [{ id: "name", label: "Project", type: "text", required: true }], components: [{ kind: "form", fields: ["name"] }, { kind: "list", fields: ["name"] }] } }, 201);
    await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId: app.id, command: { kind: "install", expectedRevision: 0 } }, 409);
    app = await post(maker.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId: app.id, command: { kind: "rehearse", expectedRevision: 0 } });
    app = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId: app.id, command: { kind: "install", expectedRevision: app.payload.revision } });
    app = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId: app.id, command: { kind: "submit", expectedRevision: app.payload.revision, record: { id: "project-1", values: { name: "Kitchen renovation" } } } });
    // Agency owners author reusable sources through the dedicated definition path.
    // Generic app creation remains a customer provider operation.
    const reusableDefinition = { kind: "internal_app", title: "Reusable project portal",
      fields: [{ id: "name", label: "Project", type: "text", required: true }],
      components: [{ kind: "form", fields: ["name"] }, { kind: "list", fields: ["name"] }] };
    await post(maker.context.request, "/api/bounded-work", { action: "create", productId: "applications", workspaceId: maker.agencyId,
      input: { title: reusableDefinition.title, fields: reusableDefinition.fields, components: reusableDefinition.components } }, 403);
    const reusable = await post(maker.context.request, "/api/workspace/version-sources", { action: "create", workspaceId: maker.agencyId,
      name: "Reusable project portal source", commandId: randomUUID() }, 201);
    const revision = await post(maker.context.request, "/api/workspace/version-sources", { action: "publish", workspaceId: maker.agencyId,
      systemId: reusable.source.systemId, commandId: randomUUID(), expectedRevision: 0, definition: reusableDefinition,
      summary: "Reusable project portal definition without customer records" }, 201);
    const checks = await post(maker.context.request, "/api/workspace/packages", { action: "qualify", workspaceId: maker.agencyId,
      revisionId: revision.source.revisionId });
    expect(checks.revisionId).toBe(revision.source.revisionId);
    expect(checks.evidence.every((item: { status: string }) => item.status === "passed")).toBe(true);
    await post(maker.context.request, "/api/workspace/packages", { action: "review", workspaceId: maker.agencyId,
      revisionId: revision.source.revisionId, approve: true, note: "Ordinary maker cannot issue platform qualification." }, 403);
    reviewer = await configuredPackageReviewer(browser, admin);
    const reviewed = await post(reviewer.context.request, "/api/workspace/packages", { action: "review", workspaceId: maker.agencyId,
      revisionId: revision.source.revisionId, approve: true, note: "Reviewed actual isolated native project portal rehearsal under the configured local policy." });
    expect(reviewed.status).toBe("qualified");
    expect(reviewed.humanReview.state).toBe("approved");
    expect(reviewed.humanReview.reviewerId).toBe(reviewer.userId);
    await post(maker.context.request, "/api/workspace/version-sources", { action: "share", workspaceId: maker.agencyId,
      systemId: reusable.source.systemId, businessId: workspaceId, shared: true });
    const copyCommandId = randomUUID();
    await post(maker.context.request, "/api/workspace/version-sources", { action: "install", workspaceId,
      source: revision.source, name: "Reusable project portal", commandId: copyCommandId }, 403);
    const grant = await post(owner.context.request, "/api/workspace/version-sources", { action: "grant_install", workspaceId,
      agencyWorkspaceId: maker.agencyId, revisionId: revision.source.revisionId, commandId: copyCommandId,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    expect(grant.commandId).toBe(copyCommandId);
    const copiedVersion = await post(maker.context.request, "/api/workspace/version-sources", { action: "install", workspaceId,
      source: revision.source, name: "Reusable project portal", commandId: copyCommandId }, 201);
    const nativeCopy = await admin.rpc("read_version_native_runtime", { p_workspace_id: workspaceId,
      p_user_id: owner.userId, p_verified_email: owner.email, p_version_id: copiedVersion.versionId });
    expect(nativeCopy.error).toBeNull();
    expect(nativeCopy.data.kind).toBe("internal_app");
    const copyResponse = await owner.context.request.get(`/api/bounded-work?productId=applications&workId=${nativeCopy.data.workId}`);
    expect(copyResponse.status(), await copyResponse.text()).toBe(200);
    const installedCopy = await copyResponse.json();
    expect(installedCopy.id).not.toBe(app.id);
    expect(installedCopy.payload.status).toBe("draft");
    expect(installedCopy.payload.records).toEqual([]);
    expect(installedCopy.payload.spec.fields).toEqual(reusableDefinition.fields);
    expect(JSON.stringify(installedCopy)).not.toContain("Kitchen renovation");
    // Version tables remain private to native functions. Read the persisted
    // lineage through the existing RPC, which rechecks this exact real owner.
    const lineage = await admin.rpc("read_system_version", {
      p_user_id: owner.userId, p_verified_email: owner.email, p_version_id: copiedVersion.versionId,
    });
    expect(lineage.error).toBeNull();
    expect(lineage.data).toMatchObject({
      id: copiedVersion.versionId,
      version: { businessId: workspaceId, systemId: copiedVersion.systemId },
      source: { businessId: maker.agencyId, systemId: reusable.source.systemId },
      sourceRevisionId: revision.source.revisionId,
    });
    const originalResponse = await owner.context.request.get(`/api/bounded-work?productId=applications&workId=${app.id}`);
    expect(originalResponse.status(), await originalResponse.text()).toBe(200);
    expect((await originalResponse.json()).payload.records).toEqual(app.payload.records);
    const left = await post(owner.context.request, "/api/documents", { action: "create", workspaceId, input: { title: "Published hours", text: "Open at nine" } });
    const right = await post(owner.context.request, "/api/documents", { action: "create", workspaceId, input: { title: "Staff hours", text: "Open at ten" } });
    let investigation = await post(owner.context.request, "/api/bounded-work", { action: "create", productId: "investigations", workspaceId, input: { title: "Keep hours consistent", intervalMinutes: 60, sources: [{ workId: left.workId }, { workId: right.workId }] } }, 201);
    investigation = await post(owner.context.request, "/api/bounded-work", { action: "run", productId: "investigations", workId: investigation.id, command: { expectedRevision: 0, requestId: "hours-check" } });
    expect(investigation.payload.runs[0]).toMatchObject({ result: "discrepancy", differences: [{ key: "document", left: "Open at nine", right: "Open at ten" }] });
    const reopened = await owner.context.request.get(`/api/bounded-work?productId=investigations&workId=${investigation.id}`);
    expect((await reopened.json()).payload.runs).toHaveLength(1);
    await post(owner.context.request, "/api/bounded-work", { action: "run", productId: "investigations", workId: investigation.id, command: { expectedRevision: 1, requestId: "too-early" } }, 409);
  } finally { await reviewer?.context.close(); await maker?.context.close(); await owner.context.close(); }
});

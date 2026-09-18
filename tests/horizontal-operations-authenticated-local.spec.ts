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

test("scheduling, generated applications and two-source investigation persist with their native checks", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "horizontal-owner");
  try {
    const snapshotResponse = await owner.context.request.get("/api/workspace");
    expect(snapshotResponse.status()).toBe(200);
    const { workspaceId } = await snapshotResponse.json();
    let schedule = await post(owner.context.request, "/api/bounded-work", { action: "create", productId: "scheduling", workspaceId, input: { title: "Private availability", availability: [{ start: "2026-10-01T09:00:00Z", end: "2026-10-01T17:00:00Z" }] } }, 201);
    schedule = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "scheduling", workId: schedule.id, command: { kind: "reserve", expectedRevision: 0, requestId: "visit-1", title: "Site visit", start: "2026-10-01T10:00:00Z", end: "2026-10-01T11:00:00Z" } });
    expect(schedule.payload.reservations[0].status).toBe("reserved");
    await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "scheduling", workId: schedule.id, command: { kind: "reserve", expectedRevision: 1, requestId: "visit-2", title: "Conflicting visit", start: "2026-10-01T10:30:00Z", end: "2026-10-01T11:30:00Z" } }, 409);
    let app = await post(owner.context.request, "/api/bounded-work", { action: "create", productId: "applications", workspaceId, input: { title: "Project portal", fields: [{ id: "name", label: "Project", type: "text", required: true }], components: [{ kind: "form", fields: ["name"] }, { kind: "list", fields: ["name"] }] } }, 201);
    await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId: app.id, command: { kind: "install", expectedRevision: 0 } }, 409);
    app = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId: app.id, command: { kind: "rehearse", expectedRevision: 0 } });
    app = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId: app.id, command: { kind: "install", expectedRevision: app.payload.revision } });
    app = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId: app.id, command: { kind: "submit", expectedRevision: app.payload.revision, record: { id: "project-1", values: { name: "Kitchen renovation" } } } });
    const installedCopy = await post(owner.context.request, "/api/bounded-work", { action: "from_source", productId: "applications", workspaceId, sourceWorkId: app.id }, 201);
    expect(installedCopy.payload.records).toEqual([]);
    expect(installedCopy.payload.installation.sourceWorkId).toBe(app.id);
    const left = await post(owner.context.request, "/api/documents", { action: "create", workspaceId, input: { title: "Published hours", text: "Open at nine" } });
    const right = await post(owner.context.request, "/api/documents", { action: "create", workspaceId, input: { title: "Staff hours", text: "Open at ten" } });
    let investigation = await post(owner.context.request, "/api/bounded-work", { action: "create", productId: "investigations", workspaceId, input: { title: "Keep hours consistent", intervalMinutes: 60, sources: [{ workId: left.workId }, { workId: right.workId }] } }, 201);
    investigation = await post(owner.context.request, "/api/bounded-work", { action: "run", productId: "investigations", workId: investigation.id, command: { expectedRevision: 0, requestId: "hours-check" } });
    expect(investigation.payload.runs[0]).toMatchObject({ result: "discrepancy", differences: [{ key: "document", left: "Open at nine", right: "Open at ten" }] });
    const reopened = await owner.context.request.get(`/api/bounded-work?productId=investigations&workId=${investigation.id}`);
    expect((await reopened.json()).payload.runs).toHaveLength(1);
    await post(owner.context.request, "/api/bounded-work", { action: "run", productId: "investigations", workId: investigation.id, command: { expectedRevision: 1, requestId: "too-early" } }, 409);
  } finally { await owner.context.close(); }
});

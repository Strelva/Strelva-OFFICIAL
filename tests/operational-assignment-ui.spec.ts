import { expect, test, type Page, type Route } from "@playwright/test";

test.skip(process.env.STRELVA_WORKSPACE_RELEASE !== "1", "Requires a local workspace server; API responses are fictional route-shaped fixtures.");

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
const targetId = "33333333-3333-4333-8333-333333333333";
const assignmentId = "44444444-4444-4444-8444-444444444444";
const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const operatorId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const at = "2026-09-15T12:00:00.000Z";

function responsibility(status: "ready" | "completed" = "ready") {
  return {
    version: 1, revision: status === "ready" ? 1 : 3, title: "Verify the handover records",
    intent: "Run the exact record check approved by the workspace owner.", ownerId,
    approvedBy: ownerId, approvedAt: at, status, createdAt: at, updatedAt: at,
    steps: [{ id: "check", operation: "investigation.run", workId: targetId, input: {}, dependsOn: [], maximumCents: 0,
      capabilityVersion: 1, status: status === "ready" ? "pending" : "completed", attempt: status === "ready" ? 0 : 1,
      ...(status === "completed" ? { effect: "accepted", finishedAt: at, result: { checked: true } } : {}) }],
    history: status === "ready" ? [{ revision: 1, kind: "approve", actorId: ownerId, at }]
      : [{ revision: 1, kind: "approve", actorId: ownerId, at }, { revision: 2, kind: "started", actorId: operatorId, at }, { revision: 3, kind: "outcome", actorId: operatorId, at, detail: "check: completed" }],
  };
}

function assignment(status: "offered" | "accepted" | "revoked" = "offered", expired = false) {
  return {
    id: assignmentId, workspaceId, workId, sponsorId: ownerId, sponsorEmail: "owner@example.com",
    assigneeUserId: operatorId, assigneeEmail: "operator@example.com", assigneeKind: "staff",
    scope: ["operate"], status, offeredAt: at,
    expiresAt: new Date(Date.now() + (expired ? -60_000 : 86_400_000)).toISOString(),
    acceptedAt: status === "offered" ? null : at, revokedAt: status === "revoked" ? at : null,
    revokedBy: status === "revoked" ? ownerId : null,
  };
}

async function workspace(page: Page, role: "owner" | "member", includeWork: boolean) {
  await page.route("**/api/workspace**", route => route.fulfill({ json: {
    actor: { email: role === "owner" ? "owner@example.com" : "operator@example.com", localPreview: false }, workspaceId,
    workspaces: [{ id: workspaceId, name: "Team workspace", kind: "personal", access: "member", role }],
    work: includeWork ? [{ id: workId, workspaceId, title: "Verify the handover records", productId: "operations", resourceKind: "responsibility", payload: null, input: {}, createdAt: at }] : [],
    handoffs: [], delegations: [], products: [{ id: "operations", name: "Operations", description: "Approved jobs", availability: "available" }],
  } }));
}

function fulfillJson(route: Route, value: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

test("owner offers, recovers, links, and revokes one approved job", async ({ page }) => {
  await workspace(page, "owner", true);
  const payload = responsibility();
  let current: ReturnType<typeof assignment> | null = null;
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/operations**", route => fulfillJson(route, { id: workId, workspaceId, payload }));
  await page.route("**/api/operational-assignments**", route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET") {
      expect(url.searchParams.get("workId")).toBe(workId);
      return fulfillJson(route, current);
    }
    const body = route.request().postDataJSON(); writes.push(body);
    if (body.action === "offer") current = assignment("offered");
    if (body.action === "revoke") current = assignment("revoked");
    return fulfillJson(route, current, body.action === "offer" ? 201 : 200);
  });
  await page.goto(`/workspace?workspaceId=${workspaceId}&work=${workId}`);
  await expect(page.getByRole("heading", { name: "Exact-job assignment" })).toBeVisible();
  await expect(page.getByText(/does not remove access they already have/)).toBeVisible();
  await page.getByLabel("Existing member email").fill("operator@example.com");
  await page.getByLabel("Relationship label").selectOption("staff");
  await page.getByLabel("Permission expires").fill("2026-12-01T12:00");
  await page.getByRole("button", { name: "Offer exact job" }).click();
  await expect(page.getByRole("link", { name: "Open assignment link" })).toHaveAttribute("href", `/workspace?workspaceId=${workspaceId}&view=operations&assignmentId=${assignmentId}`);
  expect(writes[0]).toMatchObject({ action: "offer", workId, assignment: { assigneeEmail: "operator@example.com", assigneeKind: "staff" } });
  expect(String((writes[0]!.assignment as { idempotencyKey: string }).idempotencyKey)).toMatch(/^offer:/);
  await page.screenshot({ path: "/tmp/strelva-assignment-owner-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Revoke assignment" }).click();
  await expect(page.getByText("revoked", { exact: true })).toBeVisible();
});

test("verified assignee inspects, explicitly accepts, and runs only the next approved step on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await workspace(page, "member", false);
  let current = assignment("offered");
  let payload = responsibility();
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/operational-assignments**", route => {
    if (route.request().method() === "GET") return fulfillJson(route, { assignment: current, responsibility: { id: workId, workspaceId, payload } });
    const body = route.request().postDataJSON(); writes.push(body);
    if (body.action === "accept") { current = assignment("accepted"); return fulfillJson(route, current); }
    payload = responsibility("completed");
    return fulfillJson(route, { assignmentId, responsibility: { id: workId, workspaceId, payload } });
  });
  await page.goto(`/workspace?workspaceId=${workspaceId}&view=operations&assignmentId=${assignmentId}`);
  await expect(page.getByRole("heading", { name: "Exact approved scope" })).toBeVisible();
  await expect(page.getByText(/cannot approve, reconcile, export, change a budget, or start paid work/)).toBeVisible();
  await page.getByRole("button", { name: "Accept this assignment" }).click();
  await page.getByRole("button", { name: "Run next approved step" }).click();
  await expect(page.getByText("This assigned job is complete.")).toBeVisible();
  expect(writes).toEqual([{ action: "accept", assignmentId }, { action: "run", assignmentId }]);
  await expect(page.getByRole("button", { name: /approve|reconcile|export|paid/i })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/strelva-assignment-assignee-mobile.png", fullPage: true });
});

test("expired and unavailable assignments expose no operation", async ({ page }) => {
  await workspace(page, "member", false);
  let unavailable = false;
  await page.route("**/api/operational-assignments**", route => unavailable
    ? fulfillJson(route, { error: "This assignment is unavailable." }, 403)
    : fulfillJson(route, { assignment: assignment("accepted", true), responsibility: { id: workId, workspaceId, payload: responsibility() } }));
  await page.goto(`/workspace?workspaceId=${workspaceId}&view=operations&assignmentId=${assignmentId}`);
  await expect(page.getByText("This assignment is expired. No further step can run.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run next approved step" })).toHaveCount(0);
  unavailable = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Assigned job unavailable" })).toBeVisible();
  await expect(page.getByText(/expired, been revoked, or your workspace access may have changed/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Run next approved step" })).toHaveCount(0);
});

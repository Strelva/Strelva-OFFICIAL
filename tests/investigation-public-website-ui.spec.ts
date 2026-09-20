import { expect, test, type Page, type Route } from "@playwright/test";

test.skip(process.env.STRELVA_WORKSPACE_RELEASE !== "1", "Workspace browser checks require the opt-in workspace release server.");

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const INVESTIGATION_ID = "33333333-3333-4333-8333-333333333333";

function investigationPayload() {
  return {
    version: 1,
    revision: 1,
    title: "Public price check",
    createdBy: "local-preview",
    createdAt: "2026-09-20T12:00:00.000Z",
    history: [{ revision: 1, kind: "create", actorId: "local-preview", at: "2026-09-20T12:00:00.000Z" }],
    intervalMinutes: 60,
    mode: "public_website",
    sources: [{ kind: "public_website", url: "https://example.test/pricing" }],
    status: "active",
    nextRunAt: "2026-09-20T12:00:00.000Z",
    runs: [],
  };
}

function snapshot(work: Array<Record<string, unknown>> = []) {
  return {
    actor: { email: "owner@example.test", localPreview: true },
    workspaces: [{ id: WORKSPACE_ID, kind: "personal", name: "My work" }],
    workspaceId: WORKSPACE_ID,
    work,
    handoffs: [],
    delegations: [],
    products: [
      { id: "documents", name: "Documents", description: "Keep a useful document close.", availability: "available" },
      { id: "investigations", name: "Ongoing checks", description: "Notice when permitted sources disagree.", availability: "release_gated" },
    ],
  };
}

async function mockWorkspace(page: Page) {
  let savedWork: Record<string, unknown> | null = null;
  const document = { id: DOCUMENT_ID, workspaceId: WORKSPACE_ID, title: "Expected price", productId: "documents", resourceKind: "document", payload: null, input: {}, createdAt: "2026-09-20T12:00:00.000Z" };
  await page.route("**/api/workspace**", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(snapshot(savedWork ? [savedWork, document] : [document])),
  }));
  await page.route("**/api/offerings*", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ businessId: WORKSPACE_ID, permissions: { canRead: true, canManage: true, role: "owner" }, definitions: [], installations: [], websiteBindings: [] }),
  }));
  await page.route("**/api/bounded-work*", async (route: Route) => {
    if (route.request().method() === "GET") return savedWork
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: INVESTIGATION_ID, payload: savedWork.payload }) })
      : route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "No saved comparison." }) });
    const body = route.request().postDataJSON() as { productId?: string; action?: string; input?: { title?: string; mode?: string; sources?: unknown[] } };
    expect(body.productId).toBe("investigations");
    expect(body.action).toBe("create");
    expect(body.input).toMatchObject({
      title: "Public price check",
      mode: "public_website",
      sources: [{ kind: "public_website", url: "https://example.test/pricing" }],
    });
    const payload = investigationPayload();
    savedWork = { id: INVESTIGATION_ID, workspaceId: WORKSPACE_ID, title: payload.title, productId: "investigations", resourceKind: "investigation", payload, input: {}, createdAt: payload.createdAt };
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: INVESTIGATION_ID, payload }) });
  });
}

test("saves a public page URL in an ongoing check and shows the source receipt", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto(`/workspace?workspaceId=${WORKSPACE_ID}&view=investigations`);
  await expect(page.getByRole("heading", { name: "Monitor a public page", exact: true })).toBeVisible();
  await page.getByLabel("Public page URL").fill("https://example.test/pricing");
  await page.getByLabel("Name").fill("Public price check");
  await page.getByRole("button", { name: "Monitor public page", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Public price check", exact: true })).toBeVisible();
  await page.getByText("Monitored page", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Public website · https://example.test/pricing" })).toHaveAttribute("href", "https://example.test/pricing");
  await expect(page.getByText("Compared with its last successful page snapshot.", { exact: true })).toBeVisible();
});

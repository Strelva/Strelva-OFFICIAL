import { expect, test } from "@playwright/test";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const rebuild = {
  version: 2, revision: 1, title: "Fictional client website", input: { requestId: "provider-fixture-request", businessName: "Fictional client", description: "A local test business." },
  status: "failed", stages: [], checkpoint: null, candidate: null, approvedCandidateRevision: null, tenantId: null,
  launch: { receipt: null, readBack: null }, lastError: "Synthetic stage failure; saved work is retained.", createdBy: "local-staff", createdAt: "2026-10-07T12:00:00Z", history: [],
};
const snapshot = {
  actor: { email: "staff@fictional-agency.example", localPreview: false }, workspaceId,
  workspaces: [{ id: workspaceId, name: "Fictional client", kind: "customer", access: "provider_seat" }],
  work: [{ id: workId, workspaceId, productId: "websites", resourceKind: "website", title: "Fictional client website", payload: rebuild, createdAt: "2026-10-07T12:00:00Z" }],
  managedWork: [], handoffs: [], delegations: [], products: [], workspaceExitState: null, workspaceExitReadStatus: "available",
  releases: { systems: false, needsYou: false, ask: false, inquiries: false, websiteRebuild: true },
};

test("provider client entry opens saved rebuild with retry, without general member controls", async ({ page }) => {
  await page.route("**/api/workspace?*", route => route.fulfill({ json: snapshot }));
  await page.route("**/api/workspace", route => route.fulfill({ json: snapshot }));
  await page.route(`**/api/websites/${workId}/rebuild?*`, route => route.fulfill({ json: { workspaceId, workId, rebuild } }));
  await page.route("**/api/workspace/work-allowance?*", route => route.fulfill({ json: { error: "Unavailable in fixture" }, status: 503 }));
  await page.goto(`/workspace?workspaceId=${workspaceId}`);
  await expect(page.getByRole("heading", { name: "Your client’s website work." })).toBeVisible();
  await expect(page.getByText("Your agency has assigned you to Fictional client. Open a saved website to continue working.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask Strelva" })).toBeDisabled();
  await page.getByRole("button", { name: "Open Fictional client website", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry failed stage" })).toBeEnabled();
  await expect(page.getByText("You have read-only access. An owner or authorized operator can make changes.")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/sol-245-provider-rebuild.png", fullPage: true });
});

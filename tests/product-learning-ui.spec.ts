import { expect, test } from "@playwright/test";
import { createLearning, changeLearning, learningSummary } from "../src/products/product-learning/engine";

test.skip(process.env.STRELVA_WORKSPACE_RELEASE !== "1", "Requires the local workspace release shell.");
const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "33333333-3333-4333-8333-333333333333";
const now = "2026-09-12T12:00:00.000Z";

test("reviews source evidence, pauses recurring work, and recovers from unavailable research on desktop and mobile", async ({ page }) => {
  let learning = createLearning({ title: "Do missed replies cost bookings?", objective: "Test follow-up without assuming that more messages create value", intervalHours: 24, budgetCents: 0, sources: [{ id: "support", workId: "22222222-2222-4222-8222-222222222222", segment: "Website owners", freshForHours: 24 }] }, "researcher", now);
  learning = changeLearning(learning, { kind: "collect", expectedRevision: 0, observations: [{ sourceId: "support", status: "available", fingerprint: "interview-1", reference: "support/interview-1", excerpt: "An owner reported an inquiry remained unanswered while they were on a job.", eventAt: now, evidenceKind: "operator_report" }], costCents: 0 }, "researcher", now);
  let unavailable = false;
  await page.route("**/api/workspace**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ actor: { email: "researcher@example.com", localPreview: false }, workspaces: [{ id: workspaceId, kind: "personal", name: "Internal research", access: "member", role: "owner" }], workspaceId, work: [{ id: workId, workspaceId, title: learning.title, productId: "product-learning", resourceKind: "learning", payload: null, input: {}, createdAt: now }], handoffs: [], delegations: [], products: [] }) }));
  await page.route("**/api/product-learning**", async route => {
    if (unavailable) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Research storage is unavailable. The change has not been confirmed." }) });
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      learning = changeLearning(learning, input.command, "researcher", now);
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ workId, workspaceId, learning, summary: learningSummary(learning, now) }) });
  });
  await page.goto(`/workspace?workspaceId=${workspaceId}&work=${workId}&view=work`);
  await expect(page.getByRole("heading", { name: "Do missed replies cost bookings?" })).toBeVisible();
  await page.getByText("Website owners · operator report · current", { exact: true }).click();
  await expect(page.locator("details").filter({ has: page.getByText("Website owners · operator report · current", { exact: true }) }).getByText("An owner reported an inquiry remained unanswered while they were on a job.", { exact: true })).toBeVisible();
  await page.getByText("Record a claim", { exact: true }).click();
  await page.getByLabel("Claim", { exact: true }).fill("We do not yet know whether reminders improve bookings");
  await page.getByLabel("What prevents the outcome?").fill("Replies compete with paid work");
  await page.getByLabel("What is the person trying to accomplish?").fill("Resolve an inquiry while on a job");
  await page.getByLabel("Potential value").fill("Fewer unanswered inquiries");
  await page.getByRole("button", { name: "Save claim" }).click();
  await expect(page.getByRole("heading", { name: "We do not yet know whether reminders improve bookings" })).toBeVisible();
  await page.screenshot({ path: "/tmp/strelva-learning-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Pause checks" }).click();
  await expect(page.getByRole("button", { name: "Resume checks" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume checks" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Tests and outcomes" }).click();
  await expect(page.getByText("No outcome evidence. Retention and value are unknown.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Build decision" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/strelva-learning-mobile.png", fullPage: true });
  unavailable = true;
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Research storage is unavailable");
  unavailable = false;
  await page.getByRole("button", { name: "Reload research" }).click();
  await expect(page.getByRole("heading", { name: "Do missed replies cost bookings?" })).toBeVisible();
});

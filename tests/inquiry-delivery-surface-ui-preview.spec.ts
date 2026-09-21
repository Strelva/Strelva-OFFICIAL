import { expect, test, type Page, type Route } from "@playwright/test";
import { InquiryEngine } from "@/products/inquiries/client";
import type { InquirySurfaceSnapshot } from "@/products/inquiries/contracts";
import { createPreviewInquiryAdapter } from "@/experience/inquiries/preview-fixture";

test.skip(
  process.env.STRELVA_INQUIRIES_RELEASE !== "1" || process.env.REB_DEV_UNGATED_ACCESS !== "1",
  "Requires the released inquiry route with the local development access bypass.",
);

async function fulfill(route: Route, value: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

async function providerSnapshot(): Promise<InquirySurfaceSnapshot> {
  const adapter = createPreviewInquiryAdapter();
  const snapshot = adapter.getSnapshot();
  const requestId = snapshot.state.requests[0]!.id;
  await adapter.execute({ kind: "accept-shape", requestId, input: { actorId: "fixture-owner" } });
  await adapter.execute({ kind: "rehearse", requestId, actorId: "fixture-owner" });
  await adapter.execute({ kind: "publish", requestId, actorId: "fixture-owner" });
  const capabilityId = adapter.getSnapshot().state.capabilities[0]!.id;
  const simulated = await adapter.execute({
    kind: "simulate-inquiry",
    capabilityId,
    actorId: "fixture-owner",
    fields: { name: "Avery Buyer", email: "avery@example.test", message: "Please call me." },
  });
  const record = simulated.record!;
  const base = adapter.getSnapshot();
  const bounceId = "delivery_ui_bounce";
  const blockedId = "delivery_ui_follow_up_blocked";
  const providerEvents = [
    {
      id: bounceId,
      inquiryId: record.id,
      businessId: record.businessId,
      capabilityId: record.capabilityId,
      type: "notification_bounced" as const,
      actor: { kind: "system" as const, id: "resend-webhook", label: "Resend" },
      summary: "Provider delivery update: bounced.",
      at: "2026-09-11T15:00:00.000Z",
      receiptId: null,
      causedByEventId: null,
      outcome: "failed" as const,
      evidence: ["Resend event evt_bounce reported email.bounced."],
    },
    {
      id: blockedId,
      inquiryId: record.id,
      businessId: record.businessId,
      capabilityId: record.capabilityId,
      type: "follow_up_blocked" as const,
      actor: { kind: "system" as const, id: "inquiry-delivery", label: "Delivery system" },
      summary: "Follow-up: recipient unavailable.",
      at: "2026-09-11T15:01:00.000Z",
      receiptId: null,
      causedByEventId: null,
      outcome: "blocked" as const,
      evidence: ["The provider timeline recorded a blocked follow-up."],
    },
  ];
  const state = {
    ...base.state,
    inquiries: base.state.inquiries.map((item) => item.id === record.id
      ? { ...item, status: "blocked" as const, timelineEventIds: [...item.timelineEventIds, bounceId, blockedId] }
      : item),
    timeline: [...base.state.timeline, ...providerEvents],
  };
  const engine = new InquiryEngine({ businessId: base.business.id, state });
  return {
    ...base,
    rehearsal: false,
    state,
    capabilities: state.capabilities,
    deliveryEvidence: { available: true, reason: null },
    whyByInquiry: { [record.id]: engine.explainWhy(record.id) },
  };
}

async function mockProviderTimeline(page: Page) {
  const current = await providerSnapshot();
  await mockSnapshot(page, current);
  return current;
}

async function mockSnapshot(page: Page, current: InquirySurfaceSnapshot) {
  await page.route("**/api/inquiry-workspace**", async (route) => {
    if (route.request().method() === "GET") {
      await fulfill(route, { snapshot: current });
      return;
    }
    await fulfill(route, { error: "No write is part of this read-only provider timeline fixture." }, 400);
  });
}

test("provider bounce and blocked follow-up are visible in Needs you, Inspector, and Why", async ({ page }) => {
  const snapshot = await mockProviderTimeline(page);
  const record = snapshot.state.inquiries[0]!;
  await page.goto("/business/gldf", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Needs you", exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Inspect ${record.id}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Avery Buyer", exact: true })).toBeVisible();
  const main = page.locator("main");
  await expect(main.getByText("Provider delivery update: bounced.", { exact: true })).toBeVisible();
  await expect(main.getByText("Evidence: Resend event evt_bounce reported email.bounced.", { exact: true })).toBeVisible();
  await expect(main.getByText("Follow-up: recipient unavailable.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ask Why from recorded evidence", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recorded steps", exact: true })).toBeVisible();
  await expect(main.getByText("Provider delivery update: bounced.", { exact: true })).toBeVisible();
  await expect(main.getByText(/Its cause is not linked in the timeline\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Review this fix", exact: true })).toBeVisible();
});

test("a provider timeline outage is visible and removes the unsafe Why fix", async ({ page }) => {
  const source = await providerSnapshot();
  const current: InquirySurfaceSnapshot = {
    ...source,
    deliveryEvidence: { available: false, reason: "delivery_timeline_unavailable" },
    whyByInquiry: Object.fromEntries(Object.entries(source.whyByInquiry ?? {}).map(([id, why]) => [id, { ...why, fix: null }])),
  };
  await mockSnapshot(page, current);
  const record = current.state.inquiries[0]!;
  await page.goto("/business/gldf", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status")).toContainText("Provider outcomes may be missing");
  await page.getByRole("button", { name: `Inspect ${record.id}`, exact: true }).click();
  await expect(page.locator("main").getByRole("status")).toContainText("Provider outcomes may be missing");
  await page.getByRole("button", { name: "Ask Why from recorded evidence", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Why cannot offer a provider-based fix");
  await expect(page.getByText("No safe fix proposal was returned for the recorded evidence.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review this fix", exact: true })).toHaveCount(0);
});

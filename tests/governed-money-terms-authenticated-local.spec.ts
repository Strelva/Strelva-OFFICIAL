import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import { localEnvironment, signedInContext, seedLocalSuperAdmin, removeLocalSuperAdmin } from "./support/local-auth";
import { moneyPost, nativeWorkspace } from "./support/money-agent-native";
import { seedFictionalGovernedCustomer, readNativeGovernedTerms, withdrawFictionalGovernedOwner } from "./support/governed-money-native";
// Supplemental actual Auth/UI proof; original full34 identities/count unchanged.
// PREPARED UNRUN. Explicit fictional written price/operator/customer setup in
// a disposable native DB does not qualify commercial terms or Stripe access.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated Auth and qualified current native schema; no provider effects.");
test.setTimeout(120000);
test("current business owner accepts an exact recorded price and period through real Auth without a charge", async ({ browser }, info) => {
  const env = localEnvironment(), admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const contexts: BrowserContext[] = []; let seededOperator: string | null = null;
  try {
    const owner = await signedInContext(browser, admin, "governed-owner"); contexts.push(owner.context);
    const reader = await signedInContext(browser, admin, "governed-reader"); contexts.push(reader.context);
    const operator = await signedInContext(browser, admin, "governed-operator"); contexts.push(operator.context);
    const workspaceId = await nativeWorkspace(owner.context.request); await nativeWorkspace(reader.context.request); await nativeWorkspace(operator.context.request);
    const invited = await moneyPost(owner.context.request, "/api/workspace-invitations", { workspaceId, recipientEmail: reader.email, role: "admin" }, 201);
    await moneyPost(reader.context.request, `/api/workspace-invitations/accept/${invited.token}`, {});
    const page = await owner.context.newPage(); await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/workspace/money-terms?workspaceId=${workspaceId}`);
    await expect(page.getByRole("heading", { name: "Recorded money terms", exact: true })).toBeVisible();
    await expect(page.getByText("Payment details have not been configured. No terms can be accepted yet.", { exact: true })).toBeVisible();
    seedLocalSuperAdmin(operator.userId, operator.email); seededOperator = operator.userId;
    const version = `fictional-local-explicit-price-${randomUUID()}`;
    const price = { action: "record_price", version, amountCents: 1700, currency: "cad", definitionId: null, effectiveFrom: new Date(Date.now() - 60000).toISOString(), effectiveUntil: null };
    await moneyPost(reader.context.request, "/api/admin/money-configuration", price, 403);
    const written = await moneyPost(operator.context.request, "/api/admin/money-configuration", price);
    expect(written).toMatchObject({ recordedBy: operator.userId, command: price });
    expect(seedFictionalGovernedCustomer(workspaceId, owner.userId)).toEqual({ configured: true });
    await page.reload(); await page.getByLabel("Written price", { exact: true }).selectOption(version);
    await page.getByLabel("Period starts (your local time)").fill("2099-01-01T10:00"); await page.getByLabel("Period ends (your local time)").fill("2099-02-01T10:00");
    const periods = await page.evaluate(() => ({ start: new Date("2099-01-01T10:00").toISOString(), end: new Date("2099-02-01T10:00").toISOString() }));
    await page.getByRole("button", { name: "Accept these terms and period", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("No card was charged");
    const state = readNativeGovernedTerms(workspaceId); expect(state.collections).toBe(0); expect(state.terms).toHaveLength(1);
    expect(state.terms[0]).toMatchObject({ business_workspace_id: workspaceId, accepted_by: owner.userId, agreement_version: version, amount_cents: 1700, currency: "cad" });
    expect(Date.parse(state.terms[0].period.period_start)).toBe(Date.parse(periods.start)); expect(Date.parse(state.terms[0].period.period_end)).toBe(Date.parse(periods.end));
    const input = { action: "accept_collection_terms", workspaceId, lineId: randomUUID(), priceVersion: version, amountCents: 1700, currency: "cad", installationId: null, periodStart: periods.start, periodEnd: periods.end };
    await moneyPost(reader.context.request, "/api/workspace/money-preparation", input, 403);
    await moneyPost(owner.context.request, "/api/workspace/money-preparation", { ...input, acceptedBy: operator.userId }, 400);
    const readerPage = await reader.context.newPage(); await readerPage.goto(`/workspace/money-terms?workspaceId=${workspaceId}`);
    await expect(readerPage.getByRole("button", { name: "Accept these terms and period", exact: true })).toHaveCount(0); await expect(readerPage.getByRole("heading", { name: "Accepted history", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("governed-money-terms-1440.png"), fullPage: true }); await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath("governed-money-terms-390.png"), fullPage: true });
    withdrawFictionalGovernedOwner(workspaceId, owner.userId); await page.getByRole("button", { name: "Reload recorded terms", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible(); await moneyPost(owner.context.request, "/api/workspace/money-preparation", input, 403);
    expect(readNativeGovernedTerms(workspaceId)).toEqual(state);
  } finally {
    try { if (seededOperator) removeLocalSuperAdmin(seededOperator); } finally { await Promise.allSettled(contexts.map(context => context.close())); }
  }
});

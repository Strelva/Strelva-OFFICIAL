import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";
import { moneyPost, nativeWorkspace } from "./support/money-agent-native";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Auth and migrated database; no provider payment authorization is exercised.");
test.setTimeout(120_000);

test("native unpriced billing homes preserve payer authority and merchant prerequisites after access withdrawal", async ({ browser }, info) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "billing-owner");
  const agencyOwner = await signedInContext(browser, admin, "billing-agency-owner");
  const reader = await signedInContext(browser, admin, "billing-reader");
  try {
    const workspaceId = await nativeWorkspace(owner.context.request);
    await nativeWorkspace(agencyOwner.context.request);
    await nativeWorkspace(reader.context.request);
    const agency = await moneyPost(agencyOwner.context.request, "/api/workspace", { action: "create_agency", name: "Native unpriced agency" }, 201);
    const agencyId = agency.workspaceId as string;
    // Explicit disposable membership fixture; no operator or provider privileges.
    const seats = await admin.from("workspace_memberships").insert([
      { workspace_id: workspaceId, user_id: reader.userId, role: "member", created_by: owner.userId },
      { workspace_id: agencyId, user_id: reader.userId, role: "member", created_by: agencyOwner.userId },
      { workspace_id: agencyId, user_id: owner.userId, role: "member", created_by: agencyOwner.userId },
    ]);
    expect(seats.error).toBeNull();
    const ownerPage = await owner.context.newPage();
    await ownerPage.goto(`/workspace/billing?workspaceId=${workspaceId}`);
    await expect(ownerPage.getByRole("heading", { name: "Business billing", exact: true })).toBeVisible();
    await expect(ownerPage.getByText("Price not recorded", { exact: true })).toBeVisible();
    await expect(ownerPage).toContainText("No monthly price or plan is recorded.");
    await expect(ownerPage).toContainText("This business");
    const agencyPage = await agencyOwner.context.newPage();
    await agencyPage.goto(`/workspace/billing?workspaceId=${agencyId}`);
    await expect(agencyPage.getByRole("heading", { name: "Agency billing", exact: true })).toBeVisible();
    await expect(agencyPage).toContainText("No business has accepted this agency as payer yet.");
    const payer = ownerPage.locator("section", { has: ownerPage.getByRole("heading", { name: "Payer for future jobs", exact: true }) });
    await payer.getByLabel("Who pays for future jobs?").selectOption("agency");
    await payer.getByLabel("Agency", { exact: true }).selectOption(agencyId);
    await payer.getByRole("button", { name: "Propose new payer", exact: true }).click();
    await expect(payer).toContainText("An authorized representative of the proposed payer must accept it.");
    const snapshotResponse = await owner.context.request.get(`/api/work-economics/payer-transition?workspaceId=${workspaceId}`);
    expect(snapshotResponse.status(), await snapshotResponse.text()).toBe(200);
    const pending = (await snapshotResponse.json()).pending;
    expect(pending).toMatchObject({ successorKind: "agency", successorWorkspaceId: agencyId });
    await moneyPost(reader.context.request, "/api/work-economics/payer-transition", { action: "accept", transitionId: pending.id }, 403);
    const accepted = await moneyPost(agencyOwner.context.request, "/api/work-economics/payer-transition", { action: "accept", transitionId: pending.id });
    expect(accepted.current).toMatchObject({ status: "accepted", successorWorkspaceId: agencyId });
    await ownerPage.reload();
    await expect(ownerPage.getByText("Price not recorded", { exact: true })).toBeVisible();
    await expect(ownerPage).toContainText("Native unpriced agency");
    await agencyPage.reload();
    await expect(agencyPage.getByText("Wholesale price not set", { exact: true })).toBeVisible();
    await expect(agencyPage).toContainText("Agency pays");
    await agencyPage.screenshot({ path: info.outputPath("native-agency-unpriced-billing.png"), fullPage: true });
    const invoiceInput = { action: "propose", agencyWorkspaceId: agencyId, businessWorkspaceId: workspaceId,
      kind: "pay_link", amountCents: 100, currency: "usd", description: "Local authority check", idempotencyKey: randomUUID() };
    // Denied actor only: never fulfills or creates a provider checkout.
    await moneyPost(reader.context.request, "/api/agency/pay-links", invoiceInput, 403);
    const readerPage = await reader.context.newPage();
    await readerPage.goto(`/workspace/billing?workspaceId=${agencyId}`);
    await expect(readerPage.getByRole("alert")).toContainText("Only an agency owner or admin can read its billing.");
    await expect(readerPage.getByRole("button", { name: "Prepare client agreement", exact: true })).toHaveCount(0);
    await ownerPage.goto(`/workspace/payments?workspaceId=${workspaceId}`);
    await expect(ownerPage.getByRole("heading", { name: "Payments", exact: true })).toBeVisible();
    await expect(ownerPage).toContainText("No customer payments have been recorded.");
    await expect(ownerPage).toContainText("Complete Stripe setup before accepting customer payments.");
    await expect(ownerPage.getByRole("button", { name: "Continue Stripe setup", exact: true })).toBeVisible();
    await ownerPage.screenshot({ path: info.outputPath("native-payments-merchant-prerequisite.png"), fullPage: true });
    const removed = await admin.from("workspace_memberships").delete().eq("workspace_id", workspaceId).eq("user_id", owner.userId);
    expect(removed.error).toBeNull();
    await ownerPage.reload();
    await expect(ownerPage.getByRole("alert")).toContainText("Payments could not be loaded.");
    await expect(ownerPage.getByRole("button", { name: "Continue Stripe setup", exact: true })).toHaveCount(0);
    await ownerPage.goto(`/workspace/billing?workspaceId=${workspaceId}`);
    await expect(ownerPage.getByRole("alert")).toContainText("Billing could not be loaded.");
    await moneyPost(owner.context.request, "/api/work-economics/payer-transition", { action: "propose", workspaceId, successorKind: "business" }, 403);
    const removedAgency = await admin.from("workspace_memberships").delete().eq("workspace_id", agencyId).eq("user_id", agencyOwner.userId);
    expect(removedAgency.error).toBeNull();
    await moneyPost(agencyOwner.context.request, "/api/agency/pay-links", { ...invoiceInput, idempotencyKey: randomUUID() }, 403);
    const home = await admin.from("accounts").select("billing_type,monthly_cents,plan_key,stripe_customer_id").eq("workspace_id", workspaceId).single();
    expect(home.error).toBeNull();
    expect(home.data).toMatchObject({ billing_type: "none", monthly_cents: null, plan_key: null, stripe_customer_id: null });
    const invoices = await admin.from("agency_billing_intents").select("id").eq("business_workspace_id", workspaceId);
    expect(invoices.error).toBeNull();
    expect(invoices.data).toEqual([]);
  } finally {
    await Promise.all([owner.context.close(), agencyOwner.context.close(), reader.context.close()]);
  }
});

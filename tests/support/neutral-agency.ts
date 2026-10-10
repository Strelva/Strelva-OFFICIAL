import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, type Browser, type BrowserContext, type TestInfo } from "@playwright/test";
import { assertActingProvider } from "@/platform/workspaces/acting-provider";
import { createListingPost, type ListingContext } from "@/products/google-listing/service";
import type { GoogleListingClient } from "@/products/google-listing/client";
import type { ListingReceiptStore } from "@/products/google-listing/receipts";
import { localEnvironment } from "./local-auth";
import { localSql } from "./journeys";

type Person = { context: BrowserContext; userId: string; email: string };

/** Actual anonymous Auth signup. The disposable Auth server disables email
 * confirmations; this is not proof of production confirmation mail. */
export async function neutralSignUp(browser: Browser, label: string): Promise<Person> {
  const env = localEnvironment();
  const email = `local-${label}-${randomUUID()}@example.test`;
  const context = await browser.newContext({ baseURL: env.app });
  const cookies: Array<Parameters<BrowserContext["addCookies"]>[0][number]> = [];
  const auth = createServerClient(env.url, env.anon, { cookies: {
    getAll: () => [], setAll: values => { for (const cookie of values) cookies.push({
      name: cookie.name, value: cookie.value, domain: new URL(env.app).hostname,
      path: cookie.options.path || "/", httpOnly: Boolean(cookie.options.httpOnly), secure: false, sameSite: "Lax",
    }); },
  } });
  const result = await auth.auth.signUp({ email, password: `${randomUUID()}Aa1!` });
  expect(result.error).toBeNull();
  expect(result.data.session).toBeTruthy();
  expect(result.data.user?.email).toBe(email);
  await context.addCookies(cookies);
  return { context, userId: result.data.user!.id, email };
}

/** Real acting-provider SQL and production Google service. Only Google's
 * client is fictional; any attempted provider call fails this refusal proof. */
export async function refusedGoogleWrite(admin: SupabaseClient, businessId: string, person: Person, reason: string) {
  const args = { p_workspace_id: businessId, p_user_id: person.userId, p_verified_email: person.email,
    p_effect: "google", p_resource_kind: "google_location", p_resource_ref: "neutral-location" };
  const admission = await admin.rpc("assert_acting_provider", args);
  expect(admission.error?.message).toContain(reason);
  let calls = 0;
  const noProvider = async (): Promise<never> => { calls++; throw new Error("A refused Google write reached the fictional provider."); };
  const client: GoogleListingClient = {
    listReviews: noProvider, getReview: noProvider, updateReply: noProvider, deleteReply: noProvider,
    getLocation: noProvider, patchLocation: noProvider, createPost: noProvider, getPost: noProvider, deletePost: noProvider,
  };
  const receipts: ListingReceiptStore = { record: noProvider, settle: noProvider, get: noProvider };
  const ctx: ListingContext = { workspaceId: businessId, bindingId: null, location: { accountId: "neutral-account", locationId: "neutral-location" },
    lifecycle: "live", client, receipts, authorizeProvider: async () => { await assertActingProvider({ userId: person.userId, verifiedEmail: person.email }, businessId,
      { effect: "google", kind: "google_location", ref: "neutral-location" }, admin); } };
  expect(await createListingPost(ctx, { post: { topicType: "STANDARD", summary: "A fictional local post that must never leave." },
    authority: { kind: "operator_instruction", actor: person.userId, instructionRef: `neutral-${randomUUID()}` } })).toMatchObject({ status: "refused", reason: "provider" });
  expect(calls).toBe(0);
}

export async function neutralSwitchAndPayer(input: {
  admin: SupabaseClient; businessId: string; workId: string; agencyId: string; successorAgencyId: string;
  agency: Person; other: Person; owner: Person; tenantId: string; headers: Record<string, string>; testInfo: TestInfo;
}) {
  const { admin, businessId, workId, agencyId, successorAgencyId, agency, other, owner, headers, testInfo } = input;
  const migrationsBefore = localSql<string[]>(`select jsonb_agg(version order by version) from supabase_migrations.schema_migrations`);
  const before = await admin.from("saved_product_work").select("id,workspace_id,payload").eq("id", workId).single();
  expect(before.error).toBeNull();
  const denied = await admin.rpc("choose_business_provider", { p_user_id: agency.userId, p_verified_email: agency.email, p_workspace_id: businessId, p_agency_workspace_id: successorAgencyId });
  expect(denied.error?.message).toContain("owner");
  const changed = await admin.rpc("choose_business_provider", { p_user_id: owner.userId, p_verified_email: owner.email, p_workspace_id: businessId, p_agency_workspace_id: successorAgencyId });
  expect(changed.error).toBeNull();
  expect(changed.data).toMatchObject({ customerWorkspaceId: businessId, agencyWorkspaceId: successorAgencyId, source: "business_choice" });
  const assigned = await other.context.request.post("/api/workspace/agency-team", { headers, data: { action: "assign", workspaceId: successorAgencyId, userIds: [other.userId], clientIds: [businessId], active: true } });
  expect(assigned.status(), await assigned.text()).toBe(200);
  expect((await agency.context.request.get(`/api/websites/${workId}/rebuild`)).status()).toBe(403);
  expect((await agency.context.request.get(`/api/websites/${workId}/history`)).status()).toBe(403);
  const newRead = await other.context.request.get(`/api/websites/${workId}/rebuild`);
  expect(newRead.status(), await newRead.text()).toBe(200);
  await refusedGoogleWrite(admin, businessId, agency, "acting_provider_not_staffed");
  const after = await admin.from("saved_product_work").select("id,workspace_id,payload").eq("id", workId).single();
  expect(after.error).toBeNull();
  expect(after.data).toEqual(before.data);
  const providers = localSql<Array<{ provider_workspace_id: string; status: string }>>(`select jsonb_agg(jsonb_build_object('provider_workspace_id',provider_workspace_id,'status',status)) from public.workspace_providers where customer_workspace_id=:'v1'::uuid`, businessId);
  expect(providers).toEqual(expect.arrayContaining([{ provider_workspace_id: agencyId, status: "ended" }, { provider_workspace_id: successorAgencyId, status: "active" }]));

  // The owner proposes; only the addressed agency's current owner/admin may
  // accept. This records the payer, without selecting a price or charging.
  const propose = await owner.context.request.post("/api/work-economics/payer-transition", { headers, data: { action: "propose", workspaceId: businessId, successorAgencyWorkspaceId: successorAgencyId } });
  expect(propose.status(), await propose.text()).toBe(200);
  const proposal = await propose.json();
  expect(proposal.pending).toMatchObject({ successorKind: "agency", successorWorkspaceId: successorAgencyId });
  const transitionId = proposal.pending.id;
  expect((await agency.context.request.post("/api/work-economics/payer-transition", { headers, data: { action: "accept", transitionId } })).status()).toBe(403);
  const accepted = await other.context.request.post("/api/work-economics/payer-transition", { headers, data: { action: "accept", transitionId } });
  expect(accepted.status(), await accepted.text()).toBe(200);
  const billing = await admin.rpc("read_business_billing", { p_workspace_id: businessId, p_user_id: owner.userId, p_verified_email: owner.email });
  expect(billing.error).toBeNull();
  // Isolated successor: the ordinary creation receipt provisions the home.
  // Null underlying amount/plan/Stripe binding means unresolved commercial terms.
  expect(billing.data).toMatchObject({ workspaceId: businessId, state: "none", openItem: true, paymentStatus: "none", planKey: null,
    payerParty: { kind: "agency", workspaceId: successorAgencyId } });
  const nativeHome = localSql(`select jsonb_build_object('createdVia',created_via,'monthlyCents',monthly_cents,'planKey',plan_key,'stripeCustomerId',stripe_customer_id,'payerKind',payer_kind,'payerWorkspaceId',payer_workspace_id) from public.accounts where workspace_id=:'v1'::uuid`, businessId);
  expect(nativeHome).toEqual({ createdVia: "business", monthlyCents: null, planKey: null, stripeCustomerId: null, payerKind: "agency", payerWorkspaceId: successorAgencyId });
  const agencyBilling = await admin.rpc("read_agency_billing", { p_workspace_id: successorAgencyId, p_user_id: other.userId, p_verified_email: other.email });
  expect(agencyBilling.error).toBeNull();
  expect(agencyBilling.data).toMatchObject({ clients: [{ workspaceId: businessId, state: "none", paymentStatus: "none", lineState: "active", monthlyCents: null, planKey: null }] });
  await testInfo.attach("unpriced-native-business-home", { body: JSON.stringify({ workspaceId: businessId, snapshot: billing.data, nativeHome, agencyBilling: agencyBilling.data, limitation: "No selected commercial price, Stripe intent or actual charge." }), contentType: "application/json" });
  if (process.env.STRELVA_BUSINESS_BILLING === "1") {
    const billingPage = await owner.context.newPage();
    expect((await billingPage.goto(`/workspace/billing?workspaceId=${businessId}`))?.status()).toBe(200);
    await expect(billingPage.getByRole("heading", { name: "Business billing", exact: true })).toBeVisible();
    await expect(billingPage.getByText("Price not recorded", { exact: true })).toBeVisible();
    await expect(billingPage.getByText("Payer: Southtowns Digital", { exact: true })).toBeVisible();
    await expect(billingPage.getByText("$0.00 / month", { exact: true })).toHaveCount(0);
    await expect(billingPage.getByRole("link", { name: "Open billing settings" })).toHaveCount(0);
    await billingPage.screenshot({ path: testInfo.outputPath("native-unpriced-billing-desktop.png"), fullPage: true });
    await billingPage.setViewportSize({ width: 390, height: 844 });
    await expect(billingPage.getByText("Price not recorded", { exact: true })).toBeVisible();
    await billingPage.screenshot({ path: testInfo.outputPath("native-unpriced-billing-390.png"), fullPage: true });
    await billingPage.close();
  }
  // The owner's ordinary new-business HTTP route has the same source home,
  // before any payer transition; it creates no business subscription or line.
  const entry = await owner.context.request.post("/api/workspace/businesses", { headers, data: {
    destination: { kind: "new", name: "Native owner-created business" }, initialRequest: null, idempotencyKey: randomUUID(),
  } });
  expect(entry.status()).toBe(200);
  const entryBusiness = (await entry.json()).workspaceId as string;
  const entryBilling = await admin.rpc("read_business_billing", { p_workspace_id: entryBusiness, p_user_id: owner.userId, p_verified_email: owner.email });
  expect(entryBilling.error).toBeNull();
  expect(entryBilling.data).toMatchObject({ state: "none", openItem: true, planKey: null, payerParty: { kind: "business", workspaceId: entryBusiness } });
  expect(localSql(`select count(*)::integer from public.subscriptions s join public.accounts a on a.id=s.account_id where a.workspace_id=:'v1'::uuid`, entryBusiness)).toBe(0);
  const jobResponse = await owner.context.request.post("/api/work-economics", { headers, data: {
    action: "create", workspaceId: businessId, productId: "work_plans", resourceKind: "plan", payerId: owner.userId, estimateCents: null, maxAuthorizedCents: 0,
  } });
  expect(jobResponse.status(), await jobResponse.text()).toBe(200);
  const job = (await jobResponse.json()).ledger;
  expect(job).toMatchObject({ workspaceId: businessId, payerId: other.userId, maxAuthorizedCents: 0 });
  expect((await owner.context.request.post("/api/work-economics/payer-transition", { headers, data: { action: "accept_job", jobId: job.id } })).status()).toBe(403);
  expect((await agency.context.request.post("/api/work-economics/payer-transition", { headers, data: { action: "accept_job", jobId: job.id } })).status()).toBe(403);
  const acceptedJob = await other.context.request.post("/api/work-economics/payer-transition", { headers, data: { action: "accept_job", jobId: job.id } });
  expect(acceptedJob.status(), await acceptedJob.text()).toBe(200);
  expect(localSql(`select jsonb_build_object('payerKind',payer_kind,'payerWorkspaceId',payer_workspace_id,'acceptedBy',accepted_by,'maximumCents',max_authorized_cents) from public.job_economics where id=:'v1'::uuid`, job.id)).toEqual({ payerKind: "agency", payerWorkspaceId: successorAgencyId, acceptedBy: other.userId, maximumCents: 0 });
  expect(localSql<string[]>(`select jsonb_agg(version order by version) from supabase_migrations.schema_migrations`)).toEqual(migrationsBefore);
  const page = await other.context.newPage();
  await page.goto("/workspace/account");
  await expect(page.getByRole("region", { name: "Payer requests", exact: true })).toContainText("Accepted");
  await page.screenshot({ path: testInfo.outputPath("neutral-agency-payer-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("neutral-agency-payer-390.png"), fullPage: true });
  expect((await owner.context.request.get(`/api/websites/${workId}/rebuild`)).status()).toBe(200);
}

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  adminClient, bookingStatus, cleanup, convertTenant, decision, decisions, designateAgency, fixtureTenant, journeyEnvironment,
  makeOperator, oneTapLink, openLink, person, requestBooking, reviewedRebuild, runNeedsYouChase,
} from "./support/journeys";

// Tenant owner_email alone is not confirmed business ownership. The current
// guards refuse anonymous approval; the account-free acceptance promise stays
// an explicit release stop, rather than granting authority in this fixture.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres.");
test.beforeAll(() => { journeyEnvironment(); });
test.setTimeout(240_000);

test("an unconfirmed owner without an account cannot decide a booking by email link", async ({ browser, request }, testInfo) => {
  const admin = adminClient();
  const operator = await person(browser, admin, "j10-email-operator");
  let tenantId = "";
  let businessId = "";
  try {
    await makeOperator(admin, operator);
    const ownerEmail = `local-j10-never-signs-in-${Date.now()}@example.test`;
    const tenant = await fixtureTenant(admin, { siteName: "Willow Studio", ownerEmail, ownerName: "Rae Park" });
    tenantId = tenant.tenantId;
    const { agencyId } = await designateAgency(admin, operator);
    businessId = convertTenant(tenantId, operator.email, agencyId);
    expect((await admin.from("users").select("id").eq("email", ownerEmail)).data).toEqual([]);
    const booking = await requestBooking(admin, tenantId, { name: "Jo Banks", email: "jo@example.test", daysAhead: 12, hour: 13 });
    expect((await runNeedsYouChase({ request })).failed).toBe(0);
    const open = (await decisions(admin, businessId, operator, false)).find(row => row.sourceLifecycle === "booking_request" && row.sourceId === booking.id);
    expect(open?.state).toBe("open");

    const link = oneTapLink(open!, ownerEmail, "approve");
    const prefetch = await openLink(browser, link);
    await expect(prefetch.getByRole("button", { name: "Confirm — approve" })).toBeVisible();
    expect((await decision(admin, businessId, open!.id)).state).toBe("open");
    await prefetch.getByRole("button", { name: "Confirm — approve" }).click();
    await expect(prefetch.getByRole("heading", { name: /This link isn't for this account|Sign in to decide this/ })).toBeVisible();
    await prefetch.screenshot({ path: testInfo.outputPath("unconfirmed-owner-booking-refused-390.png"), fullPage: true });
    await prefetch.context().close();
    expect(await decision(admin, businessId, open!.id)).toMatchObject({ state: "open", outcome: null });
    expect(await bookingStatus(admin, tenantId, booking.id)).toBe("requested");
    expect((await admin.from("users").select("id").eq("email", ownerEmail)).data).toEqual([]);
  } finally {
    await cleanup(admin, { tenantIds: tenantId ? [tenantId] : [], workspaceIds: businessId ? [businessId] : [], operatorEmail: operator.email, people: [operator] });
  }
});

test("an owner without an account cannot make a website rebuild real", async ({ browser, request }) => {
  const admin = adminClient();
  const env = journeyEnvironment();
  const operator = await person(browser, admin, "j10-email-makereal-operator");
  let tenantId = "";
  let businessId = "";
  try {
    await makeOperator(admin, operator);
    const ownerEmail = `local-j10-makereal-never-signs-in-${Date.now()}@example.test`;
    const tenant = await fixtureTenant(admin, { siteName: "Harbor Pilates", ownerEmail, ownerName: "Mara Quinn" });
    tenantId = tenant.tenantId;
    const { agencyId } = await designateAgency(admin, operator);
    businessId = convertTenant(tenantId, operator.email, agencyId);
    const workId = randomUUID();
    const payload = reviewedRebuild(workId, tenantId, operator.userId);
    const work = await admin.from("saved_product_work").insert({
      id: workId, workspace_id: businessId, product_id: "websites", resource_kind: "website", title: "Harbor rebuild", created_by: operator.userId, payload,
    }).select("id").single();
    expect(work.error).toBeNull();
    expect((await runNeedsYouChase({ request })).failed).toBe(0);
    expect((await decisions(admin, businessId, operator, false)).filter(row => row.sourceLifecycle === "make_real" && row.sourceId.startsWith(`website-rebuild:${workId}@`))).toEqual([]);
    const attempted = await request.post(`${env.app}/api/workspace/systems/make-real`, {
      headers: { origin: env.app }, data: { workspaceId: businessId, possibilityId: `website-rebuild:${workId}` }, maxRedirects: 0,
    });
    expect(attempted.status()).toBe(307);
    const location = attempted.headers().location;
    if (!location) throw new Error("Anonymous Make real did not return a sign-in location.");
    expect(new URL(location, env.app).pathname).toBe("/sign-in");
    expect((await admin.from("saved_product_work").select("payload").eq("id", workId).single()).data?.payload).toEqual(payload);
    expect((await admin.from("users").select("id").eq("email", ownerEmail)).data).toEqual([]);
  } finally {
    await cleanup(admin, { tenantIds: tenantId ? [tenantId] : [], workspaceIds: businessId ? [businessId] : [], operatorEmail: operator.email, people: [operator] });
  }
});

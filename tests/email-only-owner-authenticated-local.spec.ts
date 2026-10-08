import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  adminClient, bookingStatus, cleanup, convertTenant, ordinaryConversionAgency, decideByLink, decision, decisions, fixtureTenant, journeyEnvironment,
  makeOperator, oneTapLink, openLink, person, requestBooking, reviewedRebuild, runNeedsYouChase,
} from "./support/journeys";

// "Clients who never log in keep working." The owner on record has no
// Strelva account and never signs in. The hourly chase opens the ask; the
// owner decides from the email link alone. Client email is off in this stack,
// so the chase records the delivery as suppressed (owner not told) and the
// link is rebuilt with the same signer the email uses.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres (see docs/operations/testing-and-ci.md).");
test.beforeAll(() => { journeyEnvironment(); });
test.setTimeout(240_000);

test("an owner who never signs in decides a booking request by email link only", async ({ browser, request }, testInfo) => {
  const admin = adminClient();
  const operator = await person(browser, admin, "j10-email-operator");
  let tenantId = "";
  let businessId = "";
  try {
    await makeOperator(admin, operator);
    const ownerEmail = `local-j10-never-signs-in-${Date.now()}@example.test`;
    const tenant = await fixtureTenant(admin, { siteName: "Willow Studio", ownerEmail, ownerName: "Rae Park" });
    tenantId = tenant.tenantId;
    businessId = convertTenant(tenantId, operator.email, await ordinaryConversionAgency(operator));

    // No account exists for the owner, and nobody opens Home.
    const users = await admin.from("users").select("id").eq("email", ownerEmail);
    expect(users.data).toEqual([]);
    const booking = await requestBooking(admin, tenantId, { name: "Jo Banks", email: "jo@example.test", daysAhead: 12, hour: 13 });

    // The hourly chase opens the ask for a converted business and tries to reach the owner at once (urgent).
    const chase = await runNeedsYouChase({ request });
    expect(chase.failed).toBe(0);
    const open = (await decisions(admin, businessId, operator, false)).find((row) => row.sourceLifecycle === "booking_request" && row.sourceId === booking.id);
    expect(open?.state).toBe("open");
    // Client email is gated here, so the delivery is recorded honestly as not told.
    const recorded = await decision(admin, businessId, open!.id) as unknown as { deliveryState: string; deliveries: Array<{ kind: string; status: string }> };
    expect(recorded.deliveries).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "urgent", status: "suppressed" })]));

    // A scanner or prefetcher that GETs the link changes nothing.
    const prefetch = await openLink(browser, oneTapLink(open!, ownerEmail, "approve"));
    await expect(prefetch.getByRole("button", { name: "Confirm — approve" })).toBeVisible();
    await prefetch.context().close();
    expect((await decision(admin, businessId, open!.id)).state).toBe("open");

    // A tampered link (another recipient) is refused.
    const tampered = await decideByLink(browser, oneTapLink(open!, "someone-else@example.test", "approve"), /Confirm — approve/);
    await expect(tampered.getByRole("heading", { name: "This link isn't for this account" })).toBeVisible();
    await tampered.context().close();
    expect((await decision(admin, businessId, open!.id)).state).toBe("open");

    // The owner taps Approve in the email, then confirms. No session anywhere.
    const approved = await decideByLink(browser, oneTapLink(open!, ownerEmail, "approve"), /Confirm — approve/);
    await expect(approved.getByRole("heading", { name: "Approved" })).toBeVisible();
    await approved.screenshot({ path: testInfo.outputPath("email-only-approved-390.png"), fullPage: true });
    await approved.context().close();
    expect(await decision(admin, businessId, open!.id)).toMatchObject({ state: "approved", outcome: "done", decidedByKind: "owner_link" });
    expect(await bookingStatus(admin, tenantId, booking.id)).toBe("confirmed");

    // Still no account: deciding never required one.
    expect((await admin.from("users").select("id").eq("email", ownerEmail)).data).toEqual([]);

    // Not yet from the same kind of link declines a second request.
    const second = await requestBooking(admin, tenantId, { name: "Lee Park", email: "lee@example.test", daysAhead: 13, hour: 10 });
    await runNeedsYouChase({ request });
    const secondItem = (await decisions(admin, businessId, operator, false)).find((row) => row.sourceId === second.id);
    expect(secondItem?.state).toBe("open");
    const declined = await decideByLink(browser, oneTapLink(secondItem!, ownerEmail, "not-yet"), /Confirm — not yet/);
    await expect(declined.getByRole("heading", { name: "Not yet" })).toBeVisible();
    await declined.context().close();
    expect(await decision(admin, businessId, secondItem!.id)).toMatchObject({ state: "declined", outcome: "done" });
    expect(["declined", "cancelled"]).toContain(await bookingStatus(admin, tenantId, second.id));
  } finally {
    await cleanup(admin, { tenantIds: tenantId ? [tenantId] : [], workspaceIds: businessId ? [businessId] : [], operatorEmail: operator.email, people: [operator] });
  }
});

// Make real for an owner who never signs in (owner-entry decision 6): the
// signed link decides the plan. Strelva (system) reads and runs it under a
// make_real_link session bound to the item and the owner recipient
// (20261009131000_make_real_owner_link.sql); the owner's link stays the
// approver of record, and the plan fingerprint is checked again at decision
// time. The result is honest: it ran on an isolated copy.
test("an owner without an account approves Make real by email link", async ({ browser, request }, testInfo) => {
  const admin = adminClient();
  const operator = await person(browser, admin, "j10-email-makereal-operator");
  let tenantId = "";
  let businessId = "";
  try {
    await makeOperator(admin, operator);
    const ownerEmail = `local-j10-makereal-never-signs-in-${Date.now()}@example.test`;
    const tenant = await fixtureTenant(admin, { siteName: "Harbor Pilates", ownerEmail, ownerName: "Mara Quinn" });
    tenantId = tenant.tenantId;
    businessId = convertTenant(tenantId, operator.email, await ordinaryConversionAgency(operator));
    expect((await admin.from("users").select("id").eq("email", ownerEmail)).data).toEqual([]);

    // Strelva rebuilt the site; the reviewed rebuild is a Ready Possibility.
    const workId = randomUUID();
    const work = await admin.from("saved_product_work").insert({
      id: workId, workspace_id: businessId, product_id: "websites", resource_kind: "website", title: "Harbor rebuild", created_by: operator.userId,
      payload: reviewedRebuild(workId, tenantId, operator.userId),
    }).select("id").single();
    expect(work.error).toBeNull();

    // The hourly chase opens the Make real ask as Strelva (system); nobody signed in.
    expect((await runNeedsYouChase({ request })).failed).toBe(0);
    const open = (await decisions(admin, businessId, operator, false)).find((row) => row.sourceLifecycle === "make_real" && row.sourceId.startsWith(`website-rebuild:${workId}@`));
    expect(open?.state).toBe("open");

    // GET never decides; a link for anyone else is refused; neither starts anything.
    const prefetch = await openLink(browser, oneTapLink(open!, ownerEmail, "approve"));
    await expect(prefetch.getByRole("button", { name: "Confirm — approve" })).toBeVisible();
    await prefetch.context().close();
    const tampered = await decideByLink(browser, oneTapLink(open!, "someone-else@example.test", "approve"), /Confirm — approve/);
    await expect(tampered.getByRole("heading", { name: "This link isn't for this account" })).toBeVisible();
    await tampered.context().close();
    expect((await decision(admin, businessId, open!.id)).state).toBe("open");

    // The owner approves from the email. No session, no account.
    const approved = await decideByLink(browser, oneTapLink(open!, ownerEmail, "approve"), /Confirm — approve/);
    await expect(approved.getByRole("heading", { name: "Approved" })).toBeVisible();
    await approved.screenshot({ path: testInfo.outputPath("email-only-make-real-approved-390.png"), fullPage: true });
    await approved.context().close();
    const decided = await decision(admin, businessId, open!.id);
    expect(decided).toMatchObject({ state: "approved", outcome: "done", decidedByKind: "owner_link" });
    expect(decided.outcomeReason).toContain("isolated copy");
    expect((await admin.from("users").select("id").eq("email", ownerEmail)).data).toEqual([]);

    // Replaying the link is already handled; nothing runs twice.
    const replayed = await openLink(browser, oneTapLink(open!, ownerEmail, "approve"));
    await expect(replayed.getByRole("heading", { name: "Already handled" })).toBeVisible();
    await replayed.context().close();
  } finally {
    await cleanup(admin, { tenantIds: tenantId ? [tenantId] : [], workspaceIds: businessId ? [businessId] : [], operatorEmail: operator.email, people: [operator] });
  }
});

import { expect, test } from "@playwright/test";
import {
  adminClient, bookingStatus, cleanup, convertTenant, decideByLink, decision, decisions, fixtureTenant, journeyEnvironment,
  makeOperator, oneTapLink, openLink, person, requestBooking, runNeedsYouChase,
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
    businessId = convertTenant(tenantId, operator.email);

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

// Make real for an owner who never signs in. The make_real source needs a
// member actor (needsMemberActor: true): an owner link resolves only through
// needs_you_owner_actor, a verified owner *member*, so without an account the
// decision answers "Sign in to decide this". Only stored Possibilities with a
// live channel on (STRELVA_MAKE_REAL_LIVE) are proposed without a session at
// all. Missing piece: the spec decision on whether an account-less owner can
// approve Make real by link (owner-entry open decision 6).
test.fixme("an owner without an account approves Make real by email link", async () => {});

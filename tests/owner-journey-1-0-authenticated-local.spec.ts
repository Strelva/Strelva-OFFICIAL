import { expect, test } from "@playwright/test";
import {
  adminClient, adminHost, bookingStatus, cleanup, convertTenant, convertedBusinessWithOwner, decideByLink, decision, decisions, ordinaryConversionAgency,
  fixtureTenant, inviteOwner, journeyEnvironment, makeOperator, noHorizontalOverflow, oneTapLink, openLink, person, requestBooking, type Person,
} from "./support/journeys";

// The 1.0 owner journey, end to end on real local Auth and Postgres:
// operator converts a fixture tenant, names an ordinary agency and its staff,
// invites the owner; the owner accepts the signed link, lands in the
// workspace on the client admin host, sees Systems and Needs you, approves a
// booking request by the one-tap email link, and sees What changed with
// a working undo.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres (see docs/operations/testing-and-ci.md).");
test.beforeAll(() => { journeyEnvironment(); });
test.setTimeout(300_000);

test("operator converts and invites; the owner accepts, lands on the admin host and decides by one-tap link", async ({ browser }, testInfo) => {
  const admin = adminClient();
  const operator = await person(browser, admin, "j10-operator");
  const stranger = await person(browser, admin, "j10-stranger");
  let owner: Person | null = null;
  let tenantId = "";
  let businessId = "";
  try {
    await makeOperator(admin, operator);
    // The owner account exists before the invitation, with the address the
    // tenant already has on file (resolve_business_owner_recipient falls back to it).
    const ownerEmail = `local-j10-owner-${Date.now()}@example.test`;
    const tenant = await fixtureTenant(admin, { siteName: "Harbor Pilates", ownerEmail, ownerName: "Mara Quinn" });
    tenantId = tenant.tenantId;
    const adminOrigin = adminHost(tenantId);
    owner = await person(browser, admin, "j10-owner", { email: ownerEmail, origins: [adminOrigin] });

    // 1. Operator converts the fixture tenant (real script, --apply on loopback only).
    const designation = await ordinaryConversionAgency(operator);
    businessId = convertTenant(tenantId, operator.email, designation);
    const replay = convertTenant(tenantId, operator.email, designation);
    expect(replay).toBe(businessId);

    // 2. The ordinary agency receives the explicitly agreed conversion seat.
    // Conversion installs only the explicit ordinary agency staffed seat.
    expect(designation.agencyId).toMatch(/^[0-9a-f-]{36}$/);
    const clients = await admin.rpc("list_provided_clients", { p_user_id: operator.userId, p_verified_email: operator.email, p_agency_workspace_id: designation.agencyId });
    expect(clients.error).toBeNull();
    expect((clients.data as Array<{ customerWorkspaceId: string; source: string }>).some((row) => row.customerWorkspaceId === businessId && row.source === "tenant_conversion")).toBe(true);

    // 3. Operator invites the owner. The email needs Jacob's yes, so the link comes back for this local run.
    const invitation = inviteOwner(tenantId, operator.email);
    expect(invitation.workspaceName.length).toBeGreaterThan(0);

    // The link alone grants nothing: another verified account cannot accept it.
    const strangerPage = await stranger.context.newPage();
    await strangerPage.goto(invitation.acceptPath);
    await strangerPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(strangerPage.locator("p[role=alert]")).toBeVisible();
    expect((await admin.from("workspace_memberships").select("role").eq("workspace_id", businessId).eq("user_id", stranger.userId)).data).toEqual([]);

    // 4. The owner accepts the signed link: owner of the business and of every linked site, in one transaction.
    const acceptPage = await owner.context.newPage();
    await acceptPage.setViewportSize({ width: 390, height: 844 });
    await acceptPage.goto(invitation.acceptPath);
    await expect(acceptPage.getByRole("heading", { name: `Join ${invitation.workspaceName}` })).toBeVisible();
    await acceptPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(acceptPage.getByRole("heading", { name: `You joined ${invitation.workspaceName}.` })).toBeVisible();
    await expect(acceptPage.getByText("Your role is owner.")).toBeVisible();
    await noHorizontalOverflow(acceptPage);
    await acceptPage.screenshot({ path: testInfo.outputPath("owner-accepted-390.png"), fullPage: true });
    expect((await admin.from("workspace_memberships").select("role").eq("workspace_id", businessId).eq("user_id", owner.userId).single()).data?.role).toBe("owner");
    expect((await admin.from("memberships").select("role").eq("tenant_id", tenantId).eq("user_id", owner.userId).single()).data?.role).toBe("owner");

    // A visitor asks for a booking (request mode), so there is something only the owner can decide.
    const booking = await requestBooking(admin, tenantId, { name: "Dana Reed", email: "dana@example.test", daysAhead: 9, hour: 15 });
    expect(booking.workspaceId).toBe(businessId);

    // 5. The owner opens the client admin host and lands in the workspace (owner entry, 307).
    const home = await owner.context.newPage();
    await home.setViewportSize({ width: 1440, height: 900 });
    await home.goto(`${adminOrigin}/`);
    await expect(home).toHaveURL(new RegExp(`^${adminOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/workspace\\?workspaceId=${businessId}`));

    // 6. Home shows the business's Systems and what needs the owner.
    // The Oct 6 redesign greets the owner in the h1; the Systems list names the business.
    await expect(home.getByRole("heading", { level: 1 })).toBeVisible();
    const systems = home.getByRole("list", { name: `${invitation.workspaceName} systems` });
    await expect(systems.getByRole("link", { name: /Website/ })).toBeVisible();
    const needsYou = home.getByRole("region", { name: "Needs you" });
    await expect(needsYou.getByText(/^Booking request: Dana Reed/)).toBeVisible();
    await home.screenshot({ path: testInfo.outputPath("owner-home-admin-host-1440.png"), fullPage: true });

    // 7. The owner approves by the one-tap email link: no session, confirm step, then done.
    const open = (await decisions(admin, businessId, owner, false)).find((row) => row.sourceLifecycle === "booking_request" && row.sourceId === booking.id);
    expect(open?.state).toBe("open");
    // A link for anyone but the owner on record is refused and changes nothing.
    const wrong = await decideByLink(browser, oneTapLink(open!, stranger.email, "approve"), /Confirm — approve/);
    await expect(wrong.getByRole("heading", { name: "This link isn't for this account" })).toBeVisible();
    await wrong.context().close();
    expect((await decision(admin, businessId, open!.id)).state).toBe("open");

    const approved = await decideByLink(browser, oneTapLink(open!, ownerEmail, "approve"), /Confirm — approve/);
    await expect(approved.getByRole("heading", { name: "Approved" })).toBeVisible();
    await noHorizontalOverflow(approved);
    await approved.screenshot({ path: testInfo.outputPath("one-tap-approved-390.png"), fullPage: true });
    await approved.context().close();
    const decided = await decision(admin, businessId, open!.id);
    expect(decided).toMatchObject({ state: "approved", outcome: "done", decidedByKind: "owner_link" });
    expect(await bookingStatus(admin, tenantId, booking.id)).toBe("confirmed");

    // Replaying the link is idempotent: already handled, nothing done twice.
    const replayed = await openLink(browser, oneTapLink(open!, ownerEmail, "approve"));
    await expect(replayed.getByRole("heading", { name: "Already handled" })).toBeVisible();
    await expect(replayed.getByRole("button", { name: /Confirm/ })).toHaveCount(0);
    await replayed.context().close();

    // 8. Home: the ask is gone; What changed shows what Strelva did, with a one-tap undo.
    await home.reload();
    await expect(home.getByRole("region", { name: "Needs you" }).getByText(/^Booking request: Dana Reed/)).toHaveCount(0);
    const handled = home.getByRole("region", { name: "What changed" });
    const undo = handled.getByRole("button", { name: /^Undo: Strelva updated your .* in your business record$|^Undo: Strelva updated your business record$/ }).first();
    await expect(undo).toBeVisible();
    await undo.focus();
    await expect(undo).toBeFocused();
    await undo.click();
    await expect(handled.getByText("Undone.").first()).toBeVisible();

    await home.setViewportSize({ width: 390, height: 844 });
    await home.reload();
    await noHorizontalOverflow(home);
    await home.screenshot({ path: testInfo.outputPath("owner-home-admin-host-390.png"), fullPage: true });
  } finally {
    await cleanup(admin, { tenantIds: tenantId ? [tenantId] : [], workspaceIds: businessId ? [businessId] : [], operatorEmail: operator.email, people: [operator, stranger, ...(owner ? [owner] : [])] });
  }
});

// The decision itself under What changed
// (20261009130000_strelva_handled_decisions.sql): after the owner approves a
// booking request by one-tap link, Home says Strelva confirmed it, and says
// honestly why it isn't a one-tap undo (a confirmed booking is moved or
// cancelled in Bookings, and the customer is told).
test("What changed lists the approved booking decision with its undo state", async ({ browser }, testInfo) => {
  const admin = adminClient();
  let setup: Awaited<ReturnType<typeof convertedBusinessWithOwner>> | null = null;
  try {
    setup = await convertedBusinessWithOwner(browser, admin, "j10-handled");
    const { owner, businessId, tenantId } = setup;
    const booking = await requestBooking(admin, tenantId, { name: "Dana Reed", email: "dana@example.test", daysAhead: 9, hour: 15 });

    const home = await owner.context.newPage();
    await home.setViewportSize({ width: 1440, height: 900 });
    await home.goto(`/workspace?workspaceId=${businessId}`);
    await expect(home.getByRole("region", { name: "Needs you" }).getByText(/^Booking request: Dana Reed/)).toBeVisible();
    const open = (await decisions(admin, businessId, owner, false)).find((row) => row.sourceLifecycle === "booking_request" && row.sourceId === booking.id);
    expect(open?.state).toBe("open");

    const approved = await decideByLink(browser, oneTapLink(open!, owner.email, "approve"), /Confirm — approve/);
    await expect(approved.getByRole("heading", { name: "Approved" })).toBeVisible();
    await approved.context().close();
    expect(await bookingStatus(admin, tenantId, booking.id)).toBe("confirmed");

    await home.reload();
    const handled = home.getByRole("region", { name: "What changed" });
    const receipt = handled.getByRole("listitem").filter({ hasText: /Strelva confirmed the booking you approved: Dana Reed/ });
    await expect(receipt).toHaveCount(1);
    await expect(receipt.getByText("A confirmed booking isn't undone in one tap. Move or cancel it in Bookings, and the customer is told.")).toBeVisible();
    await expect(receipt.getByRole("button", { name: /^Undo/ })).toHaveCount(0);
    await home.screenshot({ path: testInfo.outputPath("handled-approved-booking-1440.png"), fullPage: true });
    await home.setViewportSize({ width: 390, height: 844 });
    await noHorizontalOverflow(home);
    await home.screenshot({ path: testInfo.outputPath("handled-approved-booking-390.png"), fullPage: true });
  } finally {
    if (setup) await cleanup(admin, { tenantIds: [setup.tenantId], workspaceIds: [setup.businessId], operatorEmail: setup.operator.email, people: [setup.operator, setup.owner] });
  }
});

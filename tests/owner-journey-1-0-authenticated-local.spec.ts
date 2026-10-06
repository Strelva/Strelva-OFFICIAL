import { expect, test } from "@playwright/test";
import {
  adminClient, adminHost, bookingStatus, cleanup, convertTenant, decideByLink, decision, decisions, designateAgency,
  fixtureTenant, inviteOwner, journeyEnvironment, makeOperator, noHorizontalOverflow, oneTapLink, openLink, person, requestBooking, type Person,
} from "./support/journeys";

// The 1.0 owner journey, end to end on real local Auth and Postgres:
// operator converts a fixture tenant, designates Strelva's agency workspace,
// invites the owner; the owner accepts the signed link, lands in the
// workspace on the client admin host, sees Systems and Needs you, approves a
// booking request by the one-tap email link, and sees Strelva handled with
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
    businessId = convertTenant(tenantId, operator.email);
    const replay = convertTenant(tenantId, operator.email);
    expect(replay).toBe(businessId);

    // 2. Operator designates Strelva's agency workspace; the converted business is marked as operated by it.
    const designation = await designateAgency(admin, operator);
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
    await expect(home.getByRole("heading", { name: invitation.workspaceName, level: 1 })).toBeVisible();
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

    // 8. Home: the ask is gone; Strelva handled shows what Strelva did, with a one-tap undo.
    await home.reload();
    await expect(home.getByRole("region", { name: "Needs you" }).getByText(/^Booking request: Dana Reed/)).toHaveCount(0);
    const handled = home.getByRole("region", { name: "Strelva handled" });
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

// The decision itself under Strelva handled. read_strelva_handled
// (supabase/migrations/20261007120000_needs_you.sql) lists business record
// revisions, website document receipts, policy history and only *expired*
// owner decisions; an approved decision and the booking it confirmed are not
// receipts there, so Home cannot show "Strelva confirmed Dana Reed's booking"
// with undo. Missing piece: a handled receipt (and its undo or "why not") for
// approved owner decisions, e.g. a booking_history source in read_strelva_handled.
test.fixme("Strelva handled lists the approved booking decision with its undo state", async () => {});

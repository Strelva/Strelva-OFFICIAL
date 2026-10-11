import { expect, test } from "@playwright/test";
import { adminClient, bookingStatus, cleanup, convertedBusinessWithOwner, decisions, journeyEnvironment, noHorizontalOverflow, requestBooking, serveBookingsFromTheStore, tenantHost } from "./support/journeys";

// A booking request reaches the owner as a Needs you decision and the owner's
// Approve confirms it in the one booking store; Not yet declines another and
// releases the time. Real local Auth and Postgres.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres (see docs/operations/testing-and-ci.md).");
test.beforeAll(() => { journeyEnvironment(); });
test.setTimeout(300_000);

for (const width of [1440, 390]) {
  test(`a booking request becomes the owner's decision and Approve confirms it at ${width}px`, async ({ browser }, testInfo) => {
    const admin = adminClient();
    let setup: Awaited<ReturnType<typeof convertedBusinessWithOwner>> | null = null;
    try {
      setup = await convertedBusinessWithOwner(browser, admin, `j10-booking-${width}`);
      const { owner, businessId, tenantId } = setup;
      const keep = await requestBooking(admin, tenantId, { name: "Sam Lee", email: "sam@example.test", daysAhead: 10, hour: 14 });
      const release = await requestBooking(admin, tenantId, { name: "Ana Ruiz", email: "ana@example.test", daysAhead: 11, hour: 16 });

      const home = await owner.context.newPage();
      await home.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await home.goto(`/workspace?workspaceId=${businessId}`);
      const needsYou = home.getByRole("region", { name: "Needs you" });
      await expect(needsYou.getByText(/^Booking request: Sam Lee/)).toBeVisible();
      await expect(needsYou.getByText(/^Booking request: Ana Ruiz/)).toBeVisible();
      await noHorizontalOverflow(home);
      await home.screenshot({ path: testInfo.outputPath(`booking-needs-you-${width}.png`), fullPage: true });

      // Confirm (the Approve of a booking ask): keyboard reachable, then the booking is confirmed in the store.
      const approve = needsYou.getByRole("button", { name: /^Confirm: Booking request: Sam Lee/ });
      await approve.focus();
      await expect(approve).toBeFocused();
      const decided = home.waitForResponse((r) => new URL(r.url()).pathname === "/api/workspace/needs-you" && r.request().method() === "POST");
      await approve.press("Enter");
      const approveResponse = await decided;
      expect(approveResponse.status(), await approveResponse.text()).toBe(200);
      expect((await approveResponse.json()).status).toBe("done");
      await expect.poll(() => bookingStatus(admin, tenantId, keep.id)).toBe("confirmed");

      // Not yet: declined, the time is released.
      const notYet = home.waitForResponse((r) => new URL(r.url()).pathname === "/api/workspace/needs-you" && r.request().method() === "POST");
      await needsYou.getByRole("button", { name: /^Not yet: Booking request: Ana Ruiz/ }).click();
      expect((await (await notYet).json()).status).toBe("done");
      await expect.poll(() => bookingStatus(admin, tenantId, release.id)).not.toBe("requested");
      expect(["declined", "cancelled"]).toContain(await bookingStatus(admin, tenantId, release.id));

      const rows = (await decisions(admin, businessId, owner, true)).filter((row) => row.sourceLifecycle === "booking_request");
      expect(rows.find((row) => row.sourceId === keep.id)).toMatchObject({ state: "approved", outcome: "done", decidedByKind: "owner_session" });
      expect(rows.find((row) => row.sourceId === release.id)).toMatchObject({ state: "declined", outcome: "done" });

      // Both asks leave Needs you; the bookings page shows the confirmed one.
      await home.reload();
      await expect(home.getByRole("region", { name: "Needs you" }).getByText(/^Booking request:/)).toHaveCount(0);
      // The week view opens on the current week; Sam's booking is ten days out.
      const keepDay = new Date();
      keepDay.setUTCDate(keepDay.getUTCDate() + 10);
      await home.goto(`/workspace/bookings?workspaceId=${businessId}&view=week&date=${keepDay.toISOString().slice(0, 10)}`);
      await expect(home.getByText("Sam Lee").first()).toBeVisible();
      await noHorizontalOverflow(home);
      await home.screenshot({ path: testInfo.outputPath(`bookings-after-${width}.png`), fullPage: true });
    } finally {
      if (setup) await cleanup(admin, { tenantIds: [setup.tenantId], workspaceIds: [setup.businessId], operatorEmail: setup.operator.email, people: [setup.operator, setup.owner] });
    }
  });
}

// The visitor's own hop: a request-mode booking taken through the tenant's
// public route (POST /api/booking on <tenant>.localhost), with the one store
// serving and no Redis in the stack. The store's exclusion constraint guards
// the slot; the rate limit falls back to a per-instance count only because
// the store serves (src/app/api/booking/route.ts).
test("a visitor's request-mode booking on the tenant site reaches Needs you", async ({ browser }, testInfo) => {
  const admin = adminClient();
  let setup: Awaited<ReturnType<typeof convertedBusinessWithOwner>> | null = null;
  try {
    setup = await convertedBusinessWithOwner(browser, admin, "j10-visitor");
    const { owner, businessId, tenantId } = setup;
    await serveBookingsFromTheStore(admin, tenantId, { id: "consultation", name: "Consultation" });

    // The visitor, on the tenant's own site, with no session.
    const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const site = await visitor.newPage();
    const origin = tenantHost(tenantId);
    const day = new Date();
    day.setUTCDate(day.getUTCDate() + 10);
    const date = day.toISOString().slice(0, 10);
    const offered = await site.goto(`${origin}/api/booking/availability?date=${date}&serviceId=consultation`);
    expect(offered?.status()).toBe(200);
    const slots = ((await offered!.json()) as { slots: string[] }).slots;
    expect(slots.length).toBeGreaterThan(0);
    const booked = await site.evaluate(async (input) => {
      const response = await fetch("/api/booking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      return { status: response.status, body: await response.json() };
    }, { serviceId: "consultation", date, startTime: slots[0]!, clientName: "Jo Visitor", clientEmail: "jo.visitor@example.test" });
    expect(booked.status, JSON.stringify(booked.body)).toBe(200);
    expect(booked.body).toMatchObject({ success: true, requested: true, confirmationSent: false });
    // The same time again is refused by the store, not double-held.
    const again = await site.evaluate(async (input) => (await fetch("/api/booking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })).status,
      { serviceId: "consultation", date, startTime: slots[0]!, clientName: "Second Visitor", clientEmail: "second@example.test" });
    expect(again).toBe(409);
    await visitor.close();

    // The owner sees it in Needs you and approves it; the store confirms it.
    const home = await owner.context.newPage();
    await home.setViewportSize({ width: 1440, height: 900 });
    await home.goto(`/workspace?workspaceId=${businessId}`);
    const needsYou = home.getByRole("region", { name: "Needs you" });
    await expect(needsYou.getByText(/^Booking request: Jo Visitor/)).toBeVisible();
    await home.screenshot({ path: testInfo.outputPath("visitor-request-needs-you-1440.png"), fullPage: true });
    const item = (await decisions(admin, businessId, owner, false)).find((row) => row.sourceLifecycle === "booking_request" && row.title.startsWith("Booking request: Jo Visitor"));
    expect(item?.state).toBe("open");
    const decided = home.waitForResponse((r) => new URL(r.url()).pathname === "/api/workspace/needs-you" && r.request().method() === "POST");
    await needsYou.getByRole("button", { name: /^Confirm: Booking request: Jo Visitor/ }).click();
    expect((await (await decided).json()).status).toBe("done");
    await expect.poll(() => bookingStatus(admin, tenantId, item!.sourceId)).toBe("confirmed");
  } finally {
    if (setup) await cleanup(admin, { tenantIds: [setup.tenantId], workspaceIds: [setup.businessId], operatorEmail: setup.operator.email, people: [setup.operator, setup.owner] });
  }
});

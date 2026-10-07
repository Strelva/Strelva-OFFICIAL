import { expect, test } from "@playwright/test";
import { adminClient, cleanup, convertedBusinessWithOwner, journeyEnvironment, noHorizontalOverflow, person, tenantHost, type Person } from "./support/journeys";

// Inquiries at 1.0, on real local Auth, Postgres and a loopback Redis: a
// visitor's message through the public lead beacon is kept in Postgres first
// (STRELVA_LEADS_AUTHORITY=postgres) and reaches the owner's Inquiries page;
// a message the honeypot catches is held, not dropped, and the owner
// releases it (STRELVA_INQUIRY_RECORDS). Nobody is emailed: every send is off.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres (see docs/operations/testing-and-ci.md).");
test.beforeAll(() => {
  journeyEnvironment();
  for (const [name, value] of [["STRELVA_LEADS_AUTHORITY", "postgres"], ["STRELVA_LEADS_READ", "postgres"], ["TENANTS_SOURCE", "postgres"]] as const) {
    if (process.env[name] !== value) throw new Error(`Set ${name}=${value} for the app server and this runner.`);
  }
  if (!process.env.UPSTASH_REDIS_REST_URL) throw new Error("Run with the loopback journeys Redis (pnpm check:journeys).");
});
test.setTimeout(240_000);

test("a visitor's message reaches the owner's Inquiries; a held one is released by the owner", async ({ browser }, testInfo) => {
  const admin = adminClient();
  const env = journeyEnvironment();
  let setup: Awaited<ReturnType<typeof convertedBusinessWithOwner>> | null = null;
  let stranger: Person | null = null;
  try {
    setup = await convertedBusinessWithOwner(browser, admin, "j10-inquiry");
    const { owner, businessId, tenantId } = setup;
    stranger = await person(browser, admin, "j10-inquiry-stranger");
    const stamp = Date.now().toString(36);
    const real = { name: `Rosa Diaz ${stamp}`, email: `rosa-${stamp}@example.test`, message: "Do you run a Saturday morning class? Two of us would like to try it." };
    const caught = { name: `Theo Park ${stamp}`, email: `theo-${stamp}@example.test`, message: "Is the beginner mat class still on Tuesdays?" };

    // The visitor's form on the client's own site posts to the public beacon (cross-origin, no session).
    const visitor = await browser.newContext();
    const beacon = `${env.app}/api/v1/leads/${tenantId}`;
    const sent = await visitor.request.post(beacon, { headers: { origin: tenantHost(tenantId) }, data: { ...real, source: "contact-form" } });
    expect(sent.status(), await sent.text()).toBe(200);
    expect(await sent.json()).toEqual({ ok: true });
    // The honeypot field people can't see: held for review, and the visitor still sees success.
    const trapped = await visitor.request.post(beacon, { headers: { origin: tenantHost(tenantId) }, data: { ...caught, source: "contact-form", website: "https://example.test/offer" } });
    expect(trapped.status()).toBe(200);
    expect(await trapped.json()).toEqual({ ok: true });
    await visitor.close();

    // Kept in Postgres against the business, the caught one held with its reason.
    const rows = async () => {
      const read = await admin.from("tenant_leads").select("id,name,workspace_id,intake_state,held_reason").eq("tenant_slug_at_capture", tenantId);
      expect(read.error).toBeNull();
      return read.data as Array<{ id: string; name: string; workspace_id: string | null; intake_state: string; held_reason: string | null }>;
    };
    await expect.poll(async () => (await rows()).map((row) => `${row.name}:${row.intake_state}`).sort()).toEqual([`${caught.name}:held`, `${real.name}:kept`].sort());
    expect((await rows()).every((row) => row.workspace_id === businessId)).toBe(true);
    expect((await rows()).find((row) => row.name === caught.name)?.held_reason).toBe("honeypot");

    // Someone who isn't on the business can't release it.
    const heldRow = (await rows()).find((row) => row.name === caught.name)!;
    const refused = await stranger.context.request.post("/api/workspace/inquiries/held", { headers: { origin: env.app }, data: { workspaceId: businessId, rowId: heldRow.id, decision: "release" } });
    expect([403, 404]).toContain(refused.status());
    expect((await rows()).find((row) => row.name === caught.name)?.intake_state).toBe("held");

    // The owner's Inquiries page: the kept message, and the held one to decide.
    const page = await owner.context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/workspace/inquiries?workspaceId=${businessId}`);
    await expect(page.getByRole("heading", { name: "Who reached out", level: 1 })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("heading", { name: real.name })).toBeVisible();
    await expect(page.getByText(real.message)).toBeVisible();
    await expect(page.getByText(/1 in the last 30 days · 1 in all/)).toBeVisible();
    const held = page.getByRole("region", { name: "Held as spam" });
    await expect(held.getByRole("heading", { name: caught.name })).toBeVisible();
    await expect(held.getByText("Filled in a field people can't see")).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("inquiries-held-1440.png"), fullPage: true });

    // Release: keyboard reachable, recorded, and it joins the other inquiries.
    const release = held.getByRole("button", { name: `Release the message from ${caught.name}` });
    await release.focus();
    await expect(release).toBeFocused();
    await release.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Released. It's with your other inquiries now; nobody was emailed." })).toBeVisible();
    await expect.poll(async () => (await rows()).find((row) => row.name === caught.name)?.intake_state).toBe("released");
    const events = await admin.from("inquiry_events").select("kind,actor").eq("workspace_id", businessId);
    expect(events.error).toBeNull();
    expect((events.data as Array<{ kind: string; actor: string }>).map((event) => event.kind)).toEqual(expect.arrayContaining(["captured", "held_as_spam", "released"]));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const releasedCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: caught.name }) });
    await expect(releasedCard.getByText("Released from held messages.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/2 in the last 30 days · 2 in all/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Held as spam" })).toHaveCount(0);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("inquiries-released-390.png"), fullPage: true });
  } finally {
    if (setup) await cleanup(admin, { tenantIds: [setup.tenantId], workspaceIds: [setup.businessId], operatorEmail: setup.operator.email, people: [setup.operator, setup.owner, ...(stranger ? [stranger] : [])] });
  }
});

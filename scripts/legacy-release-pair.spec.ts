import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { expect, test, type BrowserContext } from "@playwright/test";

// Copied unchanged into both pinned source checkouts by the pair controller.
// Every identity, tenant, record and write belongs to the disposable local stack.
test.setTimeout(240_000);
test("legacy client contracts and genuine owner authority survive the app switch", async ({ browser }) => {
  const app = process.env.PLAYWRIGHT_BASE_URL!;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  for (const value of [app, url, process.env.STRELVA_LOCAL_DB_URL!]) {
    expect(["localhost", "127.0.0.1"]).toContain(new URL(value).hostname);
  }
  const stateFile = process.env.LEGACY_RELEASE_PAIR_STATE!;
  const phase = process.env.LEGACY_RELEASE_PAIR_PHASE!;
  const enabled = process.env.STRELVA_WORKSPACE_RELEASE === "1";
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  let state: { tenant: string; userId: string; email: string; password: string; workspaceId?: string; applicationId?: string; recordId?: string; nativeCreation?: number; nativePublication?: number; bookingId?: string; leadIds?: string[]; headline?: string };
  if (phase === "old") {
    state = { tenant: "pair-" + randomUUID().slice(0, 8), userId: "", email: "pair-" + randomUUID() + "@example.test", password: randomUUID() + "Aa1!" };
    const created = await admin.auth.admin.createUser({ email: state.email, password: state.password, email_confirm: true });
    expect(created.error).toBeNull(); state.userId = created.data.user!.id;
    expect((await admin.from("tenants").insert({ id: state.tenant, site_name: "Release pair synthetic tenant", template: "wellness", active: true, owner_email: state.email, subscription_status: "active", subscription_plan: "growth" })).error).toBeNull();
    expect((await admin.from("memberships").insert({ tenant_id: state.tenant, user_id: state.userId, role: "owner" })).error).toBeNull();
    expect((await admin.from("content").insert([
      { tenant_id: state.tenant, section: "hero", data: { headline: "Retained release fixture", subheadline: "", tagline: "", ctaText: "Contact", ctaLink: "/contact", backgroundImageUrl: "" } },
      { tenant_id: state.tenant, section: "services", data: { services: [{ id: "consultation", name: "Consultation", description: "Synthetic local booking", duration: "60", price: "", featured: false }] } },
    ])).error).toBeNull();
    state.headline = "Retained release fixture";
    writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
  } else {
    expect(existsSync(stateFile), "Old app must establish retained synthetic data before candidate proof").toBe(true);
    state = JSON.parse(readFileSync(stateFile, "utf8"));
  }
  const context = await browser.newContext({ baseURL: app });
  const cookies: Array<Parameters<BrowserContext["addCookies"]>[0][number]> = [];
  const auth = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: {
    getAll: () => [], setAll: values => values.forEach(cookie => cookies.push({ name: cookie.name, value: cookie.value, domain: new URL(app).hostname, path: cookie.options.path || "/", httpOnly: Boolean(cookie.options.httpOnly), secure: false, sameSite: "Lax" })),
  } });
  expect((await auth.auth.signInWithPassword({ email: state.email, password: state.password })).error).toBeNull();
  await context.addCookies(cookies);
  const tenantHeaders = { host: `admin.${state.tenant}.localhost:${new URL(app).port}`, origin: `http://admin.${state.tenant}.localhost:${new URL(app).port}` };
  const publicHeaders = { host: `${state.tenant}.localhost:${new URL(app).port}`, origin: `http://${state.tenant}.localhost:${new URL(app).port}` };
  try {
    // Genuine owner read and foreign-owner refusal; no dev bypass or agency grant.
    const privateHero = await context.request.get("/api/content/hero", { headers: tenantHeaders });
    expect(privateHero.status(), "Authenticated legacy content read").toBe(200);
    expect((await privateHero.json()).headline).toBe(state.headline);
    const foreign = await browser.newContext({ baseURL: app });
    const refused = await foreign.request.get("/api/content/hero", { headers: tenantHeaders, maxRedirects: 0 });
    expect([401, 307]).toContain(refused.status());
    const billing = await foreign.request.post("/api/billing/portal", { headers: tenantHeaders, maxRedirects: 0 });
    expect([401, 307]).toContain(billing.status());
    const outsiderEmail = "pair-outsider-" + randomUUID() + "@example.test";
    const outsiderPassword = randomUUID() + "Aa1!";
    const outsider = await admin.auth.admin.createUser({ email: outsiderEmail, password: outsiderPassword, email_confirm: true });
    expect(outsider.error).toBeNull();
    const outsiderCookies: typeof cookies = [];
    const outsiderAuth = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: {
      getAll: () => [], setAll: values => values.forEach(cookie => outsiderCookies.push({ name: cookie.name, value: cookie.value, domain: new URL(app).hostname, path: cookie.options.path || "/", httpOnly: Boolean(cookie.options.httpOnly), secure: false, sameSite: "Lax" })),
    } });
    expect((await outsiderAuth.auth.signInWithPassword({ email: outsiderEmail, password: outsiderPassword })).error).toBeNull();
    await foreign.addCookies(outsiderCookies);
    expect((await foreign.request.get("/api/content/hero", { headers: tenantHeaders })).status()).toBe(403);
    await foreign.close();
    const ownerBilling = await context.request.post("/api/billing/portal", { headers: tenantHeaders });
    expect(ownerBilling.status()).toBe(500);
    expect(await ownerBilling.json()).toEqual({ error: "Stripe not configured" });

    // Concurrent owner writes and public reads exercise shared schema/Redis paths.
    const nextHeadline = "Release fixture " + phase;
    const heroBody = { headline: nextHeadline, subheadline: "", tagline: "", ctaText: "Contact", ctaLink: "/contact", backgroundImageUrl: "" };
    const concurrent = await Promise.all([
      context.request.put("/api/content/hero", { headers: tenantHeaders, data: heroBody }),
      context.request.put("/api/content/hero?draft=true", { headers: tenantHeaders, data: { ...heroBody, headline: "Private draft " + phase } }),
      context.request.get(`/api/v1/content/${state.tenant}/hero`),
    ]);
    for (const result of concurrent) expect(result.status(), "Concurrent legacy read/write succeeded").toBe(200);
    state.headline = nextHeadline;
    const publicHero = await context.request.get(`/api/v1/content/${state.tenant}/hero`);
    expect(publicHero.status()).toBe(200);
    expect((await publicHero.json()).headline).toBe(nextHeadline);

    const leadInput = { name: "Synthetic Release Visitor", email: "visitor@example.test", message: "Please arrange a consultation for our local release check " + phase + ".", source: "release-pair-" + phase };
    const captured = await context.request.post(`/api/v1/leads/${state.tenant}`, { data: leadInput });
    expect(captured.status()).toBe(200); expect(await captured.json()).toEqual({ ok: true });
    const repeated = await context.request.post(`/api/v1/leads/${state.tenant}`, { data: leadInput });
    expect(repeated.status()).toBe(200);
    const leadRows = await admin.rpc("read_tenant_leads", { p_tenant_id: state.tenant, p_limit: 50, p_before: null });
    expect(leadRows.error).toBeNull();
    const leadIds = (leadRows.data as Array<{ leadId: string }>).map(row => row.leadId);
    for (const retained of state.leadIds || []) expect(leadIds).toContain(retained);
    expect(leadIds.length).toBe(phase === "old" ? 1 : 2);
    state.leadIds = leadIds;

    const listBefore = await context.request.get("/api/booking/list", { headers: tenantHeaders });
    expect(listBefore.status()).toBe(200);
    if (state.bookingId) expect((await listBefore.json()).map((row: { id: string }) => row.id)).toContain(state.bookingId);
    if (phase === "old") {
      const configured = await context.request.put("/api/booking/config", { headers: tenantHeaders, data: {
        timezone: "America/New_York", weeklySchedule: Array.from({ length: 7 }, (_, day) => ({ day, start: "09:00", end: "17:00", enabled: true })),
        slotDuration: 60, bufferTime: 0, bookingLeadTime: 0, maxAdvanceBooking: 60, requirePayment: false,
      } });
      expect(configured.status(), "Owner configures deterministic synthetic booking availability").toBe(200);
    }
    const retainedConfig = await context.request.get("/api/booking/config", { headers: tenantHeaders });
    expect(retainedConfig.status()).toBe(200);
    expect((await retainedConfig.json()).weeklySchedule.filter((day: { enabled: boolean }) => day.enabled)).toHaveLength(7);
    const date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const bookingInput = { serviceId: "consultation", date, startTime: phase === "old" ? "10:00" : "12:00", clientName: "Synthetic Visitor", clientEmail: "visitor@example.test" };
    const raced = await Promise.all([0, 1].map(() => context.request.post("/api/booking", { headers: publicHeaders, data: bookingInput })));
    expect(raced.map(response => response.status()).sort()).toEqual([200, 409]);
    const accepted = raced.find(response => response.status() === 200)!;
    const booking = await accepted.json();
    const acceptedId = booking.booking?.id || booking.id;
    expect(acceptedId).toBeTruthy();
    const listAfter = await context.request.get("/api/booking/list", { headers: tenantHeaders });
    expect(listAfter.status()).toBe(200);
    expect((await listAfter.json()).map((row: { id: string }) => row.id)).toContain(acceptedId);
    state.bookingId ||= acceptedId;

    const workspace = await context.request.get("/api/workspace");
    expect(workspace.status()).toBe(enabled ? 200 : 503);
    if (!enabled) {
      const hidden = await context.request.post("/api/bounded-work", { headers: { origin: app }, data: { action: "create", productId: "applications", workspaceId: randomUUID(), input: {} } });
      expect(hidden.status()).toBe(503);
    } else {
      const workspaceBody = await workspace.json();
      if (phase === "old") {
        state.workspaceId = workspaceBody.workspaceId;
        const created = await context.request.post("/api/bounded-work", { headers: { origin: app }, data: { action: "create", productId: "applications", workspaceId: state.workspaceId, input: { title: "Retained native tool", fields: [{ id: "name", label: "Name", type: "text", required: true }], components: [{ kind: "form", fields: ["name"] }, { kind: "list", fields: ["name"] }] } } });
        state.nativeCreation = created.status();
        // Schema-level new-tool admission may already require the agency even
        // for the old server. This is an accepted direction, not permission to
        // manufacture an agency grant. Preserve the observed refusal explicitly.
        if (created.status() === 403) {
          expect((await created.json()).code).toBe("make_systems_required");
          return;
        }
        expect(created.status(), "Frozen old app owner creation on upgraded schema").toBe(201);
        let application = await created.json(); state.applicationId = application.id;
        for (const kind of ["rehearse", "install"]) {
          const changed = await context.request.post("/api/bounded-work", { headers: { origin: app }, data: { action: "command", productId: "applications", workId: application.id, command: { kind, expectedRevision: application.payload.revision } } });
          state.nativePublication = changed.status();
          expect(changed.status(), "Frozen old app lifecycle on upgraded schema").toBe(200);
          application = await changed.json();
        }
      } else {
        // New tool admission intentionally requires the agency; retained use does not.
        const newTool = await context.request.post("/api/bounded-work", { headers: { origin: app }, data: { action: "create", productId: "applications", workspaceId: state.workspaceId, input: { title: "New member tool", fields: [{ id: "name", label: "Name", type: "text", required: true }], components: [{ kind: "form", fields: ["name"] }] } } });
        expect(newTool.status()).toBe(403); expect((await newTool.json()).code).toBe("make_systems_required");
        if (!state.applicationId) {
          expect(state.nativeCreation).toBe(403);
          return;
        }
      }
      // The owner's existing workspace use path differs from focused recipient
      // use. Ownership must not manufacture a focused recipient grant.
      const focused = await context.request.get(`/api/apps/${state.applicationId}`);
      expect(focused.status()).toBe(403);
      expect((await focused.json()).code).toBe("application_access_denied");
      const runtime = await context.request.get(`/api/bounded-work?productId=applications&workId=${state.applicationId}`);
      expect(runtime.status(), "Retained owner workspace application remains readable").toBe(200);
      const initialUse = (await runtime.json()).payload;
      expect(initialUse.status).toBe("installed");
      expect(initialUse.release.version).toBe(1);
      if (phase === "candidate") expect(initialUse.records.map((row: { id: string }) => row.id)).toContain("record-old");
      const submitted = await context.request.post("/api/bounded-work", { headers: { origin: app }, data: { action: "command", productId: "applications", workId: state.applicationId, command: { kind: "submit", expectedRevision: initialUse.revision, record: { id: "record-" + phase, values: { name: "Retained local " + phase } } } } });
      expect(submitted.status(), "Existing owner use requires workspace authority, not maker admission").toBe(200);
      const use = (await submitted.json()).payload;
      if (phase === "candidate") expect(use.records.map((row: { id: string }) => row.id)).toContain("record-old");
      expect(use.records.map((row: { id: string }) => row.id)).toContain("record-" + phase);
      const retained = await context.request.get(`/api/bounded-work?productId=applications&workId=${state.applicationId}`);
      expect(retained.status()).toBe(200);
      expect((await retained.json()).payload.records.find((row: { id: string }) => row.id === "record-" + phase).values.name).toBe("Retained local " + phase);
    }
  } finally {
    writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
    await context.close();
  }
});

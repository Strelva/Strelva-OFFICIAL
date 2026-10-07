import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { buildWorkspaceApproveUrl } from "@/lib/approve-link";
import { adminClient, cleanup, convertTenant, fixtureTenant, makeOperator, person, type Person } from "./support/journeys";
import { localEnvironment } from "./support/local-auth";

// The 1.0 flags off, on real local Auth and Postgres: a converted business
// with a signed-in owner sees the workspace exactly as before 1.0. Needs you,
// Make real, Systems, owner entry, the one-tap links and the chase all stay
// dark. pnpm check:journeys runs this on an app server with only
// STRELVA_WORKSPACE_RELEASE on.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres (see docs/operations/testing-and-ci.md).");
test.beforeAll(() => {
  localEnvironment();
  const on = ["STRELVA_SYSTEMS_RELEASE", "STRELVA_NEEDS_YOU_RELEASE", "STRELVA_OWNER_ENTRY", "STRELVA_BOOKING_STORE_WRITE", "STRELVA_MAKE_REAL_OWNER_LINK_RELEASE"].filter((name) => (process.env[name] ?? "") !== "" && process.env[name] !== "0");
  if (on.length) throw new Error(`Unset ${on.join(", ")} for the app server and this runner.`);
  if (!process.env.APPROVE_LINK_SECRET || !process.env.CRON_SECRET) throw new Error("Set APPROVE_LINK_SECRET and CRON_SECRET (any local values) for the app server and this runner.");
});
test.setTimeout(180_000);

test("with every 1.0 flag off, a converted business's owner sees the workspace as before 1.0", async ({ browser }) => {
  const env = localEnvironment();
  const app = new URL(env.app);
  const admin = adminClient();
  const operator = await person(browser, admin, "j10off-operator");
  let owner: Person | null = null;
  let tenantId = "";
  let businessId = "";
  try {
    await makeOperator(admin, operator);
    const ownerEmail = `local-j10off-owner-${Date.now()}@example.test`;
    tenantId = (await fixtureTenant(admin, { siteName: "Quiet Harbor", ownerEmail })).tenantId;
    const adminOrigin = `${app.protocol}//admin.${tenantId}.localhost:${app.port}`;
    owner = await person(browser, admin, "j10off-owner", { email: ownerEmail, origins: [adminOrigin] });

    // Conversion is an operator script, not a 1.0 flag: it works the same either way.
    businessId = convertTenant(tenantId, operator.email);
    expect((await admin.from("workspace_memberships").insert({ workspace_id: businessId, user_id: owner.userId, role: "owner", created_by: operator.userId })).error).toBeNull();
    const request = owner.context.request;

    // The workspace snapshot builds no Systems and reports every 1.0 release off.
    const snapshot = await request.get(`/api/workspace?workspaceId=${businessId}`);
    expect(snapshot.status()).toBe(200);
    const body = await snapshot.json() as { workspaceId: string; systems?: unknown; releases: { systems: boolean; needsYou: boolean; ask: boolean } };
    expect(body.workspaceId).toBe(businessId);
    expect(body.systems).toBeUndefined();
    expect(body.releases).toMatchObject({ systems: false, needsYou: false, ask: false });

    // Needs you and Make real answer 503 and change nothing.
    expect((await request.get(`/api/workspace/needs-you?workspaceId=${businessId}`)).status()).toBe(503);
    const decide = await request.post("/api/workspace/needs-you", { headers: { origin: env.app }, data: { workspaceId: businessId, itemId: randomUUID(), revision: "0".repeat(64), decision: "approve" } });
    expect(decide.status()).toBe(503);
    const makeReal = await request.post("/api/workspace/systems/make-real", { headers: { origin: env.app }, data: { workspaceId: businessId } });
    expect(makeReal.status()).toBe(503);
    expect(await makeReal.json()).toMatchObject({ error: expect.stringMatching(/not enabled/) });

    // Home renders the pre-1.0 workspace: no Needs you, no Systems.
    const home = await owner.context.newPage();
    await home.goto(`/workspace?workspaceId=${businessId}`);
    await expect(home.getByText("Quiet Harbor").first()).toBeVisible({ timeout: 60_000 });
    await expect(home.getByRole("heading", { name: /needs you/i })).toHaveCount(0);
    await expect(home.getByRole("heading", { name: /strelva handled/i })).toHaveCount(0);

    // Owner entry off: the client's admin host still sends a signed-in owner to /dashboard.
    const entry = await request.get(`${adminOrigin}/auth/entry`, { maxRedirects: 0 });
    expect(entry.status()).toBe(307);
    expect(new URL(entry.headers().location!, adminOrigin).pathname).toBe("/dashboard");

    // A correctly signed one-tap link is refused while Needs you is off.
    const link = buildWorkspaceApproveUrl(env.app, { workspaceId: businessId, itemId: randomUUID(), action: "approve", recipient: ownerEmail, revision: "0".repeat(64) });
    const visitor = await browser.newContext();
    const tapped = await visitor.request.get(link, { maxRedirects: 0 });
    expect(tapped.status()).toBe(400);
    await visitor.close();

    // The hourly chase records a heartbeat and opens nothing.
    const chase = await request.get("/api/cron/needs-you", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(chase.status()).toBe(200);
    expect(await chase.json()).toMatchObject({ status: "disabled" });
    const opened = await admin.from("owner_decisions").select("id").eq("workspace_id", businessId);
    expect(opened.error).toBeNull();
    expect(opened.data).toEqual([]);
  } finally {
    await cleanup(admin, { tenantIds: tenantId ? [tenantId] : [], workspaceIds: businessId ? [businessId] : [], operatorEmail: operator.email, people: [operator, ...(owner ? [owner] : [])] });
  }
});

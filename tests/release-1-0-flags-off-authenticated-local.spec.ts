import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { buildWorkspaceApproveUrl } from "@/lib/approve-link";
import { adminClient, cleanup, decisions, fixtureTenant, makeOperator, operatorScript, person, type ConversionOutcome, type Person } from "./support/journeys";
import { localEnvironment } from "./support/local-auth";

// The 1.0 flags off, on real local Auth and Postgres: a converted business
// with a signed-in owner sees the unreleased workspace behavior. The 1.0
// decision feed, Make real, Systems, owner entry, one-tap links and chase stay
// dark; the redesigned frame keeps its fallback headings. The runner has only
// STRELVA_WORKSPACE_RELEASE on.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres (see docs/operations/testing-and-ci.md).");
test.beforeAll(() => {
  localEnvironment();
  const on = ["STRELVA_SYSTEMS_RELEASE", "STRELVA_NEEDS_YOU_RELEASE", "STRELVA_OWNER_ENTRY", "STRELVA_BOOKING_STORE_WRITE", "STRELVA_MAKE_REAL_OWNER_LINK_RELEASE", "STRELVA_INQUIRY_RECORDS"].filter((name) => (process.env[name] ?? "") !== "" && process.env[name] !== "0");
  if (on.length) throw new Error(`Unset ${on.join(", ")} for the app server and this runner.`);
  if (!process.env.APPROVE_LINK_SECRET || !process.env.CRON_SECRET) throw new Error("Set APPROVE_LINK_SECRET and CRON_SECRET (any local values) for the app server and this runner.");
});
test.setTimeout(180_000);

test("with every 1.0 flag off, a converted business's owner sees the workspace as before 1.0", async ({ browser }) => {
  const env = localEnvironment();
  const app = new URL(env.app);
  const admin = adminClient();
  const operator = await person(browser, admin, "j10off-operator");
  const agency = await person(browser, admin, "j10off-agency");
  let owner: Person | null = null;
  let tenantId = "";
  let businessId = "";
  let agencyId = "";
  try {
    await makeOperator(admin, operator);
    // A separate ordinary agency supplies the explicit conversion relationship.
    // The operator gets no standing membership in the converted client.
    const createdAgency = await agency.context.request.post("/api/workspace", {
      headers: { origin: env.app }, data: { action: "create_agency", name: "Quiet Harbor's local agency" },
    });
    expect(createdAgency.status(), await createdAgency.text()).toBeLessThan(300);
    agencyId = (await createdAgency.json()).workspaceId;
    const ownerEmail = `local-j10off-owner-${Date.now()}@example.test`;
    tenantId = (await fixtureTenant(admin, { siteName: "Quiet Harbor", ownerEmail })).tenantId;
    const adminOrigin = `${app.protocol}//admin.${tenantId}.localhost:${app.port}`;
    owner = await person(browser, admin, "j10off-owner", { email: ownerEmail, origins: [adminOrigin] });

    // Conversion is an operator script, not a 1.0 flag: it works the same either way.
    const conversion = operatorScript<ConversionOutcome>("convert-tenant-to-workspace", [
      tenantId, "--apply", `--operator-email=${operator.email}`, `--agency=${agencyId}`,
      `--agency-staff=${agency.email}`, "--agency-basis=existing_contract",
    ]);
    expect(conversion.mode).toBe("apply");
    expect(conversion.receipt?.workspaceId).toMatch(/^[0-9a-f-]{36}$/);
    businessId = conversion.receipt!.workspaceId;
    const clientMemberships = await admin.from("workspace_memberships").select("user_id").eq("workspace_id", businessId);
    expect(clientMemberships.error).toBeNull();
    expect(clientMemberships.data).toEqual([]);
    // Provider internals are RPC-only. The real actor projection verifies the
    // active seat, agency membership and named staff without bypassing that gate.
    const agencyActor = await admin.rpc("read_version_actor", { p_user_id: agency.userId, p_verified_email: agency.email });
    expect(agencyActor.error).toBeNull();
    expect(agencyActor.data).toMatchObject({ memberships: expect.arrayContaining([{ businessId, role: "admin", via: "provider_seat" }]) });
    const operatorActor = await admin.rpc("read_version_actor", { p_user_id: operator.userId, p_verified_email: operator.email });
    expect(operatorActor.error).toBeNull();
    expect(operatorActor.data).toMatchObject({ memberships: expect.not.arrayContaining([expect.objectContaining({ businessId })]) });
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

    // The redesigned frame keeps the headings with legacy fallback content,
    // while the 1.0 decision feed is never requested and no actions appear.
    const home = await owner.context.newPage();
    const decisionReads: string[] = [];
    home.on("request", (read) => {
      if (new URL(read.url()).pathname === "/api/workspace/needs-you") decisionReads.push(read.url());
    });
    await home.goto(`/workspace?workspaceId=${businessId}`);
    const currentWorkspace = home.getByRole("combobox", { name: "Current workspace" });
    await expect(currentWorkspace).toBeVisible();
    await expect(currentWorkspace).toHaveValue(businessId);
    await expect(currentWorkspace.locator("option:checked")).toHaveText("Quiet Harbor");
    await expect(home.getByRole("region", { name: "Needs you" }).getByText("Nothing needs a decision right now.")).toBeVisible();
    await expect(home.getByRole("region", { name: "Strelva handled" }).getByText("Nothing finished yet.", { exact: false })).toBeVisible();
    await expect(home.getByRole("button", { name: /^(?:Confirm|Approve|Not yet|Make it live|Undo):/ })).toHaveCount(0);
    expect(decisionReads).toEqual([]);

    // Owner entry off: the client's admin host still sends a signed-in owner to /dashboard.
    // APIRequestContext's DNS does not resolve *.localhost. Preserve the
    // client's Host header while connecting to the loopback app.
    const entry = await request.get(`${env.app}/auth/entry`, { headers: { host: new URL(adminOrigin).host }, maxRedirects: 0 });
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
    // owner_decisions is RPC-only, including for the service-role client.
    expect(await decisions(admin, businessId, owner)).toEqual([]);
  } finally {
    await cleanup(admin, { tenantIds: tenantId ? [tenantId] : [], workspaceIds: [businessId, agencyId].filter(Boolean), operatorEmail: operator.email, people: [operator, agency, ...(owner ? [owner] : [])] });
  }
});

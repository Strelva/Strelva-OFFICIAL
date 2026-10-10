import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

// #259 on real local Supabase Auth and Postgres: an agency adds a client from
// the form, the business has no direct member, the owner link is copied (not
// sent), another agency cannot see the client, the seat holder reaches the
// connect entry, and the owner claims the business with the link.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres.");
test.setTimeout(300_000);

const shots = process.env.STRELVA_PROOF_SCREENSHOTS;
/** Seat, staff and fact tables are closed even to the service role; read them as the disposable database's owner. */
function sql(query: string): string {
  const dbUrl = process.env.STRELVA_LOCAL_DB_URL || "";
  if (!dbUrl || !["localhost", "127.0.0.1"].includes(new URL(dbUrl).hostname)) throw new Error("Set STRELVA_LOCAL_DB_URL to the disposable database (loopback only).");
  return execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-Atq", "-c", query], { encoding: "utf8" }).trim();
}
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

test("an agency adds a client by URL with a provider seat, and the owner claims it with the copied link", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const agencyOwner = await signedInContext(browser, admin, "add-client-agency");
  const otherAgency = await signedInContext(browser, admin, "add-client-other-agency");
  const owner = await signedInContext(browser, admin, "add-client-owner");
  const origin = { origin: env.app };

  // Mirror the identities, then each person creates their agency through the ordinary path.
  for (const person of [agencyOwner, otherAgency, owner]) expect((await person.context.request.get("/api/workspace")).status()).toBe(200);
  const createAgency = async (person: typeof agencyOwner, name: string) => {
    const response = await person.context.request.post("/api/workspace", { headers: origin, data: { action: "create_agency", name } });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return (await response.json() as { workspaceId: string }).workspaceId;
  };
  const agencyId = await createAgency(agencyOwner, "Northside Web Care");
  const otherAgencyId = await createAgency(otherAgency, "Southtowns Digital");

  // The form, desktop.
  const page = await agencyOwner.context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/workspace/agency/clients/new?workspaceId=${agencyId}`);
  await expect(page.getByRole("heading", { name: "Add a client" })).toBeVisible({ timeout: 120_000 });
  await shot(page, "01-form-desktop");
  // Empty submit explains itself.
  await page.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByText("Enter the business’s website.")).toHaveAttribute("role", "alert");
  // A private or custom-port address is refused before anything is fetched or written.
  await page.getByLabel("Their website").fill(`${env.app}/`);
  await page.getByLabel("Business name").fill("Elmwood Bakery");
  await page.getByLabel("Owner’s email").fill(owner.email);
  await page.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByText("Enter a public HTTP or HTTPS website address without credentials or a custom port.")).toBeVisible({ timeout: 120_000 });
  await shot(page, "01b-form-error-desktop");
  expect(sql(`select count(*) from public.provider_seats where agency_workspace_id = '${agencyId}'`)).toBe("0");
  // A real public site (one small crawl, robots respected).
  await page.getByLabel("Their website").fill("https://example.com");
  await page.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByRole("heading", { name: "Elmwood Bakery" })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Not sent.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Connect the site they have/ })).toBeVisible();
  // Rebuild is offered, but saved work does not yet resolve the seat (#245's TypeScript half): no dead link.
  await expect(page.getByText("The owner can start a rebuild once they claim the business.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Rebuild it on Strelva/ })).toHaveCount(0);
  await shot(page, "02-added-desktop");
  const claimLink = await page.getByLabel("Owner claim link").inputValue();
  expect(claimLink).toMatch(/\/workspace\/claim\/[A-Za-z0-9_-]{43}$/);

  // The database: a seat, a staff row, no direct member, unconfirmed agency facts.
  const additions = await page.request.get(`/api/workspace/agency-clients/added?workspaceId=${agencyId}`);
  const clients = (await additions.json() as { clients: Array<{ customerWorkspaceId: string; pendingClaim: { delivery: { status: string; reason: string } } | null }> }).clients;
  expect(clients).toHaveLength(1);
  const clientId = clients[0]!.customerWorkspaceId;
  expect(clients[0]!.pendingClaim?.delivery).toMatchObject({ status: "not_sent", reason: "gated" });
  expect(sql(`select count(*) from public.workspace_memberships where workspace_id = '${clientId}'`)).toBe("0");
  expect(sql(`select agency_workspace_id || '|' || granted_by_kind || '|' || status from public.provider_seats where customer_workspace_id = '${clientId}'`))
    .toBe(`${agencyId}|agency_added|active`);
  expect(sql(`select count(*) from public.agency_client_staff where customer_workspace_id = '${clientId}' and user_id = '${agencyOwner.userId}' and status = 'active'`)).toBe("1");
  const facts = sql(`select fact_key || ':' || source || ':' || verified from public.business_record_facts where workspace_id = '${clientId}' order by fact_key`).split("\n");
  expect(facts).toEqual(expect.arrayContaining(["display_name:agency:false", "links:agency:false"]));
  expect(facts.every((fact) => fact.endsWith(":agency:false"))).toBe(true);

  // Mobile, 390 wide: the result and the form both reflow.
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "03-added-390");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // Another agency sees nothing of it.
  const denied = await otherAgency.context.request.get(`/api/workspace/agency-clients/added?workspaceId=${agencyId}`);
  expect(denied.status()).toBe(403);
  const otherList = await otherAgency.context.request.get(`/api/workspace/agency-clients/added?workspaceId=${otherAgencyId}`);
  expect((await otherList.json() as { clients: unknown[] }).clients).toEqual([]);
  const otherSite = await otherAgency.context.newPage();
  await otherSite.goto(`/workspace/site?workspaceId=${clientId}&entry=connect`);
  await expect(otherSite.getByText("This business isn't available to your account.")).toBeVisible({ timeout: 120_000 });

  // The seat holder reaches the connect entry for the client it added.
  const connect = await agencyOwner.context.newPage();
  await connect.setViewportSize({ width: 1280, height: 900 });
  await connect.goto(`/workspace/site?workspaceId=${clientId}&entry=connect`);
  await expect(connect.getByText("This business isn't available to your account.")).toHaveCount(0, { timeout: 120_000 });
  await shot(connect, "04-connect-entry-seat-holder");
  // ...and can connect the existing site (connect.js); the other agency cannot.
  const connected = await agencyOwner.context.request.post("/api/workspace/connected-sites", { headers: origin, data: { action: "connect", workspaceId: clientId, siteUrl: "https://example.com" } });
  expect(connected.status(), await connected.text()).toBe(201);
  const site = (await connected.json() as { site: { workspaceId: string; siteHost: string; snippet: unknown } }).site;
  expect(site).toMatchObject({ workspaceId: clientId, siteHost: "example.com" });
  expect(JSON.stringify(site.snippet)).toContain("connect.js");
  const blocked = await otherAgency.context.request.post("/api/workspace/connected-sites", { headers: origin, data: { action: "connect", workspaceId: clientId, siteUrl: "https://example.org" } });
  expect(blocked.status()).toBe(403);
  // Recorded gap, not this issue's to fix: the rebuild entry refuses the seat holder today.
  await connect.goto(`/workspace/site?workspaceId=${clientId}&entry=rebuild`);
  await expect(connect.getByText("This business isn't available to your account.")).toBeVisible({ timeout: 120_000 });

  // The owner opens the copied link and takes the business.
  const claim = await owner.context.newPage();
  await claim.setViewportSize({ width: 390, height: 844 });
  await claim.goto(new URL(claimLink).pathname);
  await expect(claim.getByRole("heading", { name: "Take ownership of Elmwood Bakery" })).toBeVisible({ timeout: 120_000 });
  await shot(claim, "05-claim-390");
  await claim.getByRole("button", { name: "Become the owner" }).click();
  await expect(claim.getByRole("heading", { name: "Elmwood Bakery is yours." })).toBeVisible();
  await shot(claim, "06-claimed-390");
  expect(sql(`select user_id || '|' || role from public.workspace_memberships where workspace_id = '${clientId}'`)).toBe(`${owner.userId}|owner`);
  expect(sql(`select status from public.provider_seats where customer_workspace_id = '${clientId}'`)).toBe("active");

  // The other agency's owner cannot use the link either way.
  const replay = await otherAgency.context.request.post(new URL(claimLink).pathname.replace("/workspace/claim/", "/api/workspace-claims/"), { headers: origin, data: {} });
  expect(replay.status()).toBe(403);

  // The list now shows the owner signed in.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Add another client" }).click();
  await expect(page.getByText("Owner signed in")).toBeVisible();
  await shot(page, "07-form-with-list-desktop");
});

test("an agency adds a client from its prospects list; a plain member is refused", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const agencyOwner = await signedInContext(browser, admin, "add-client-prospect-agency");
  const member = await signedInContext(browser, admin, "add-client-prospect-member");
  const origin = { origin: env.app };
  for (const person of [agencyOwner, member]) expect((await person.context.request.get("/api/workspace")).status()).toBe(200);
  const created = await agencyOwner.context.request.post("/api/workspace", { headers: origin, data: { action: "create_agency", name: "Lakeside Studio" } });
  const agencyId = (await created.json() as { workspaceId: string }).workspaceId;
  const prospectId = randomUUID();
  sql(`insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values ('${agencyId}', '${member.userId}', 'member', '${agencyOwner.userId}');
    insert into public.agency_prospecting_profiles(workspace_id, slug, contact_url, contact_email, enabled) values ('${agencyId}', 'lakeside-${agencyId.slice(0, 8)}', 'https://lakeside.example/contact', 'hi@lakeside.example', true);
    insert into public.prospects(id, agency_workspace_id, source, result_id, name, email, url, business, score, grade)
      values ('${prospectId}', '${agencyId}', 'audit', 'r-${agencyId.slice(0, 8)}', 'Dana Ruiz', 'dana@lakeview-dental.example', null, 'Lakeview Dental', 58, 'C');`);

  const page = await agencyOwner.context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/workspace/agency/clients/new?workspaceId=${agencyId}&prospect=${prospectId}`);
  await expect(page.getByRole("radio", { name: /Lakeview Dental/ })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("radio", { name: /Lakeview Dental/ }).check();
  await expect(page.getByLabel("Owner’s email")).toHaveValue("dana@lakeview-dental.example");
  await shot(page, "08-prospect-form-390");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByRole("heading", { name: "Lakeview Dental" })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("No website given, so nothing was read.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Add another client" }).click();
  await page.getByRole("tab", { name: "Prospect" }).click();
  await expect(page.getByRole("radio", { name: /Lakeview Dental/ })).toBeDisabled();
  expect(sql(`select source_kind || '|' || prospect_id from public.agency_client_additions where agency_workspace_id = '${agencyId}'`)).toBe(`prospect|${prospectId}`);

  // Agency Home offers the entry, and the added client is listed under Clients through the seat.
  const home = await agencyOwner.context.newPage();
  await home.setViewportSize({ width: 1280, height: 900 });
  await home.goto(`/workspace?workspaceId=${agencyId}`);
  await expect(home.getByRole("link", { name: "Add a client" })).toBeVisible({ timeout: 120_000 });
  await expect(home.getByText("Lakeview Dental").first()).toBeVisible({ timeout: 60_000 });
  await shot(home, "10-agency-home-desktop");

  // A plain member of the agency sees the form but cannot add.
  const memberPage = await member.context.newPage();
  await memberPage.setViewportSize({ width: 1280, height: 900 });
  await memberPage.goto(`/workspace/agency/clients/new?workspaceId=${agencyId}`);
  await memberPage.getByLabel("Their website").fill("https://example.com");
  await memberPage.getByRole("button", { name: "Add client" }).click();
  await expect(memberPage.getByText("Only an owner or admin of this agency can add clients.")).toBeVisible({ timeout: 120_000 });
  await shot(memberPage, "09-member-refused-desktop");
  expect(sql(`select count(*) from public.agency_client_additions where agency_workspace_id = '${agencyId}'`)).toBe("1");
});

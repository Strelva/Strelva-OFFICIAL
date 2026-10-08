import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminClient, cleanup, convertedBusinessWithOwner, journeyEnvironment, localSql, noHorizontalOverflow, person, reviewedRebuild, type Person } from "./support/journeys";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated loopback Auth and Postgres.");
test.beforeAll(() => { journeyEnvironment(); });
test.setTimeout(300_000);

for (const role of ["owner", "member"] as const) test(`newer website detail refreshes a held old ${role} workspace without repinning or writes`, async ({ browser }, testInfo) => {
  const admin = adminClient();
  let setup: Awaited<ReturnType<typeof convertedBusinessWithOwner>> | null = null;
  let member: Person | null = null;
  try {
    setup = await convertedBusinessWithOwner(browser, admin, `j501-refresh-${role}`);
    const { owner, businessId, tenantId } = setup;
    const systemId = localSql<string>("select to_json(id) from public.systems where business_workspace_id=:'v1'::uuid and kind='website' and origin_kind='tenant' limit 1;", businessId);
    const workId = randomUUID();
    expect((await admin.from("saved_product_work").insert({ id: workId, workspace_id: businessId, product_id: "websites", resource_kind: "website", title: "Reviewed rebuild",
      created_by: owner.userId, payload: reviewedRebuild(workId, tenantId, owner.userId) })).error).toBeNull();
    // Qualify a real stored Ready alternative before holding its response. A
    // first interrupted preparation may recover on the next ordinary owner read.
    await expect.poll(async () => {
      const response = await owner.context.request.get(`/api/workspace?workspaceId=${businessId}`);
      return (await response.json()).systems.possibilities[0]?.status;
    }).toBe("ready");
    if (role === "member") {
      member = await person(browser, admin, "j501-refresh-member");
      expect((await admin.from("workspace_memberships").insert({ workspace_id: businessId, user_id: member.userId, role: "member", created_by: owner.userId })).error).toBeNull();
      // Actual owner creates the reviewed stored alternative; a member cannot.
      expect((await owner.context.request.get(`/api/workspace?workspaceId=${businessId}`)).status()).toBe(200);
    }
    const viewer = member ?? owner;
    const page = await viewer.context.newPage();
    await page.setViewportSize({ width: role === "member" ? 390 : 1440, height: role === "member" ? 844 : 900 });
    let heldOld = false;
    let readOnlyRefreshes = 0;
    let storedAfterReconciliation: unknown;
    let oldRevision: string | null = null;
    const mutations: string[] = [];
    const stored = () => localSql<unknown>("select json_agg(json_build_object('id',p.id,'body',p.body,'revision',p.revision,'status',p.status,'updatedAt',p.updated_at,'pins',(select json_agg(row_to_json(pin)) from public.system_possibility_pins pin where pin.possibility_id=p.id))) from public.system_possibilities p where p.business_workspace_id=:'v1'::uuid;", businessId);
    page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/workspace") && request.method() !== "GET") mutations.push(request.method()); });
    await page.route("**/api/workspace?*", async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("workspaceId") !== businessId) return route.continue();
      if (url.searchParams.get("systemsReadOnly") === "1") { readOnlyRefreshes++; return route.continue(); }
      if (heldOld) return route.continue();
      heldOld = true;
      // Hold an actual signed workspace response computed against revision 1.
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const body = await response.json();
      oldRevision = body.systems.systems.find((item: { ref: { systemId: string } }) => item.ref.systemId === systemId).currentRevisionId;
      expect(body.systems.possibilities[0].status).toBe("ready");
      // A newer, real detail request reconciles the legacy implementation before
      // the held old projection arrives in the browser. No claim or JWT is forged.
      const reconciled = await viewer.context.request.get(`/api/workspace/systems/website?${new URLSearchParams({ workspaceId: businessId, systemId })}`);
      expect(reconciled.status()).toBe(200);
      const detail = (await reconciled.json()).detail;
      expect(detail.currentRevisionId).not.toBe(oldRevision);
      expect(detail.workspaceId).toBe(businessId);
      storedAfterReconciliation = stored();
      await route.fulfill({ response, body: JSON.stringify(body) });
    });
    await page.goto(`/workspace?workspaceId=${businessId}&view=system&system=${systemId}`);
    await expect.poll(() => readOnlyRefreshes).toBe(1);
    await expect(page.getByText("A System this changes moved. Review a refreshed alternative before making it real.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Make real", exact: true })).toBeDisabled();
    expect(mutations).toEqual([]);
    expect(stored()).toEqual(storedAfterReconciliation);
    expect(localSql<string>("select to_json(p.body->'changes'->0->'baseline'->>'revisionId') from public.system_possibilities p where p.business_workspace_id=:'v1'::uuid limit 1;", businessId)).toBe(oldRevision);
    await noHorizontalOverflow(page);
    await page.getByText("A System this changes moved. Review a refreshed alternative before making it real.", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`website-refresh-${role}.png`), fullPage: true });
  } finally {
    if (setup) await cleanup(admin, { tenantIds: [setup.tenantId], workspaceIds: [setup.businessId], operatorEmail: setup.operator.email, people: [setup.operator, setup.owner, ...(member ? [member] : [])] });
  }
});

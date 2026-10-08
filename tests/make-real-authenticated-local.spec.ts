import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminClient, cleanup, convertedBusinessWithOwner, decisions, journeyEnvironment, localSql, noHorizontalOverflow, person, reviewedRebuild, type Person } from "./support/journeys";

// Make real on a website Possibility, through Needs you, on real local Auth
// and Postgres. A reviewed rebuild of the converted site is the Ready
// Possibility; the owner's one tap on the System page is the Needs you
// decision for the plan (makeRealThroughNeedsYou), and the result says
// honestly that only part of it landed: it ran on an isolated copy and the
// live site is unchanged.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres (see docs/operations/testing-and-ci.md).");
test.beforeAll(() => { journeyEnvironment(); });
test.setTimeout(300_000);

test("the owner makes a website Possibility real through Needs you and sees a partial, honest result", async ({ browser }, testInfo) => {
  const admin = adminClient();
  let setup: Awaited<ReturnType<typeof convertedBusinessWithOwner>> | null = null;
  let member: Person | null = null;
  try {
    setup = await convertedBusinessWithOwner(browser, admin, "j10-makereal");
    const { owner, businessId, tenantId, workspaceName } = setup;
    const env = journeyEnvironment();
    // Conversion records the legacy implementation. The real detail route
    // reconciles its current website implementation before this draft is reviewed.
    const websiteId = localSql<string>("select to_json(id) from public.systems where business_workspace_id=:'v1'::uuid and kind='website' and origin_kind='tenant' limit 1;", businessId);
    const reconciled = await owner.context.request.get(`/api/workspace/systems/website?${new URLSearchParams({ workspaceId: businessId, systemId: websiteId })}`);
    expect(reconciled.status(), await reconciled.text()).toBe(200);
    const workId = randomUUID();
    const work = await admin.from("saved_product_work").insert({
      id: workId, workspace_id: businessId, product_id: "websites", resource_kind: "website", title: "Harbor rebuild", created_by: owner.userId, payload: reviewedRebuild(workId, tenantId, owner.userId),
    }).select("id").single();
    expect(work.error).toBeNull();
    const possibilityId = `website-rebuild:${workId}`;

    // Home: the Ready Possibility is one owner decision in Needs you.
    const home = await owner.context.newPage();
    await home.setViewportSize({ width: 1440, height: 900 });
    await home.goto(`/workspace?workspaceId=${businessId}`);
    const needsYou = home.getByRole("region", { name: "Needs you" });
    await expect(needsYou.getByText(/^Make it live: A rebuilt /)).toBeVisible();
    const open = (await decisions(admin, businessId, owner, false)).filter((row) => row.sourceLifecycle === "make_real");
    expect(open).toHaveLength(1);
    expect(open[0]!.sourceId.startsWith(`${possibilityId}@`)).toBe(true);

    // A member sees it but cannot make it real.
    member = await person(browser, admin, "j10-makereal-member");
    expect((await admin.from("workspace_memberships").insert({ workspace_id: businessId, user_id: member.userId, role: "member", created_by: owner.userId })).error).toBeNull();
    const refused = await member.context.request.post("/api/workspace/systems/make-real", { headers: { origin: env.app }, data: { workspaceId: businessId, possibilityId } });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).permission).toBe("not_owner");

    // System page: the owner taps Make real on the rebuilt site.
    const systems = home.getByRole("list", { name: `${workspaceName} systems` });
    await systems.getByRole("link", { name: /Website/ }).first().click();
    await expect(home).toHaveURL(/view=system/);
    const possibility = home.getByRole("region", { name: /^Possibilities/ }).getByRole("listitem").filter({ hasText: /A rebuilt / });
    await expect(possibility).toHaveCount(1);
    await expect(possibility).toBeVisible();
    const makeReal = possibility.getByRole("button", { name: "Make real", exact: true });
    await expect(makeReal).toBeEnabled();
    const response = home.waitForResponse((r) => new URL(r.url()).pathname === "/api/workspace/systems/make-real" && r.request().method() === "POST");
    await makeReal.click();
    const made = await response;
    expect(made.status(), await made.text()).toBe(200);
    const body = await made.json() as { result: { isolated: boolean; liveUnchanged: boolean; status: string; headline: string }; decision: string };
    expect(body.decision).toBe("done");
    // Partial and honest: an isolated copy ran; nothing live changed.
    expect(body.result).toMatchObject({ isolated: true, liveUnchanged: true });
    expect(body.result.status).not.toBe("made_real");
    const result = home.getByRole("status", { name: "Make real result" });
    await expect(result).toBeVisible();
    await expect(result.getByRole("heading", { name: body.result.headline })).toBeVisible();
    await home.screenshot({ path: testInfo.outputPath("make-real-partial-1440.png"), fullPage: true });

    // The one approval is the Needs you item: approved by the owner's session, outcome recorded.
    const closed = (await decisions(admin, businessId, owner, true)).find((row) => row.id === open[0]!.id);
    expect(closed).toMatchObject({ state: "approved", outcome: "done", decidedByKind: "owner_session" });
    expect(closed!.outcomeReason).toContain("isolated copy");

    // Tapping again changes nothing: the plan was already decided.
    const again = await owner.context.request.post("/api/workspace/systems/make-real", { headers: { origin: env.app }, data: { workspaceId: businessId, possibilityId } });
    expect([404, 409]).toContain(again.status());

    await home.goto(`/workspace?workspaceId=${businessId}`);
    await expect(home.getByRole("region", { name: "Needs you" }).getByText(/^Make it live: A rebuilt /)).toHaveCount(0);
    await home.setViewportSize({ width: 390, height: 844 });
    await noHorizontalOverflow(home);
  } finally {
    if (setup) await cleanup(admin, { tenantIds: [setup.tenantId], workspaceIds: [setup.businessId], operatorEmail: setup.operator.email, people: [setup.operator, setup.owner, ...(member ? [member] : [])] });
  }
});

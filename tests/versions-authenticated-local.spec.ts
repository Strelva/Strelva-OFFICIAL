import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createSystemVersions, type JsonObject } from "@/platform/system-versions";
import { createSupabaseConnectionOwnership, createSupabaseVersionStore, readVersionActor, type VersionsDb } from "@/platform/system-versions/supabase-store";
import { adminClient, cleanup, convertedBusinessWithOwner, decisions, designateAgency, journeyEnvironment, noHorizontalOverflow, type Admin } from "./support/journeys";

// Versions at 1.0, on real local Auth and Postgres: Strelva's agency shares a
// System as a source; the client's own Version of it goes live only when the
// owner approves it in Needs you. The agency publishes an improvement and
// "Review all" prepares it; nothing is live until the owner approves release 2.
// Shared improvements are offered, never forced. Creating the source and the
// Version has no screen yet (service calls below, the same ones the app uses).
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres (see docs/operations/testing-and-ci.md).");
test.beforeAll(() => { journeyEnvironment(); });
test.setTimeout(300_000);

const intake: JsonObject = { followUp: { message: "We'll call you back today." }, routing: { minutes: 30 } };

async function system(admin: Admin, businessId: string, name: string, createdBy: string): Promise<string> {
  const id = randomUUID();
  const inserted = await admin.from("systems").insert({
    id, business_workspace_id: businessId, name, kind: "inquiry", command_id: randomUUID(), command_digest: "a".repeat(64), created_by: createdBy, updated_by: createdBy,
  });
  expect(inserted.error).toBeNull();
  return id;
}

async function releases(admin: Admin, versionId: string): Promise<number[]> {
  const read = await admin.from("system_version_releases").select("number").eq("version_id", versionId).order("number");
  expect(read.error).toBeNull();
  return (read.data as Array<{ number: number }>).map((row) => row.number);
}

test("an agency's improvement reaches a client's Version only when the owner approves it", async ({ browser }, testInfo) => {
  const admin = adminClient();
  let setup: Awaited<ReturnType<typeof convertedBusinessWithOwner>> | null = null;
  try {
    setup = await convertedBusinessWithOwner(browser, admin, "j10-versions");
    const { owner, operator, businessId, workspaceName } = setup;
    // The operator designates Strelva's agency, which then operates the converted business.
    const { agencyId } = await designateAgency(admin, operator);

    const db = admin as unknown as VersionsDb;
    const versions = createSystemVersions({ store: createSupabaseVersionStore(db), connections: createSupabaseConnectionOwnership(db) });
    const agencyActor = await readVersionActor({ userId: operator.userId, verifiedEmail: operator.email }, db);
    const ownerActor = await readVersionActor({ userId: owner.userId, verifiedEmail: owner.email }, db);
    const sourceName = `Inquiry intake ${randomUUID().slice(0, 6)}`;
    const source = { businessId: agencyId, systemId: await system(admin, agencyId, sourceName, operator.userId) };
    const first = await versions.publishSourceRevision(agencyActor, { source, definition: intake, summary: "Intake" });
    await versions.shareSource(agencyActor, source, businessId);
    const own = await system(admin, businessId, "Inquiries", owner.userId);
    const version = await versions.createVersion(ownerActor, { source: first.source, version: { businessId, systemId: own }, context: { kind: "agency_client", label: workspaceName } });
    expect(await releases(admin, version.id)).toEqual([]);

    // 1. Release 1 is the owner's decision.
    const home = await owner.context.newPage();
    await home.setViewportSize({ width: 1440, height: 900 });
    await home.goto(`/workspace?workspaceId=${businessId}`);
    const needsYou = home.getByRole("region", { name: "Needs you" });
    const ask = `Put the updated ${workspaceName} live`;
    await expect(needsYou.getByText(ask)).toBeVisible({ timeout: 60_000 });
    let decided = home.waitForResponse((r) => new URL(r.url()).pathname === "/api/workspace/needs-you" && r.request().method() === "POST");
    await needsYou.getByRole("button", { name: `Approve: ${ask}` }).click();
    expect((await (await decided).json()).status).toBe("done");
    await expect.poll(() => releases(admin, version.id)).toEqual([1]);

    // 2. The agency publishes an improvement. Nothing changes for the client yet.
    await versions.publishSourceRevision(agencyActor, { source, definition: { ...intake, routing: { minutes: 15 } }, summary: "Faster routing" });
    await home.reload();
    await expect(home.getByRole("region", { name: "Needs you" }).getByText(ask)).toHaveCount(0);

    // 3. The agency reviews all ready Versions from its Library: prepared, not released.
    const library = await operator.context.newPage();
    await library.setViewportSize({ width: 1440, height: 900 });
    await library.goto(`/workspace?workspaceId=${agencyId}`);
    await library.getByRole("tab", { name: "Library" }).click();
    const sourceSection = library.getByRole("region", { name: sourceName });
    const row = sourceSection.getByRole("list", { name: `Versions of ${sourceName}` }).getByRole("listitem").filter({ hasText: workspaceName });
    await expect(row).toContainText("Improvement ready", { timeout: 60_000 });
    await sourceSection.getByRole("button", { name: "Review all" }).click();
    const results = sourceSection.getByRole("list", { name: "Review all results" }).getByRole("listitem").filter({ hasText: workspaceName });
    await expect(results).toContainText("Prepared. Waiting on the owner’s approval.");
    await noHorizontalOverflow(library);
    await library.screenshot({ path: testInfo.outputPath("agency-library-reviewed-1440.png"), fullPage: true });
    expect(await releases(admin, version.id)).toEqual([1]);

    // 4. The owner sees what changed and approves release 2.
    await home.setViewportSize({ width: 390, height: 844 });
    await home.reload();
    const again = home.getByRole("region", { name: "Needs you" });
    await expect(again.getByText(ask)).toBeVisible({ timeout: 60_000 });
    await expect(again.getByText(/This becomes release 2\. What changed: routing\.minutes/)).toBeVisible();
    await noHorizontalOverflow(home);
    await home.screenshot({ path: testInfo.outputPath("owner-version-release-390.png"), fullPage: true });
    decided = home.waitForResponse((r) => new URL(r.url()).pathname === "/api/workspace/needs-you" && r.request().method() === "POST");
    await again.getByRole("button", { name: `Approve: ${ask}` }).click();
    expect((await (await decided).json()).status).toBe("done");
    await expect.poll(() => releases(admin, version.id)).toEqual([1, 2]);
    const rows = (await decisions(admin, businessId, owner, true)).filter((item) => item.sourceLifecycle === "version_release" && item.sourceId === version.id);
    expect(rows.map((item) => item.state)).toEqual(["approved", "approved"]);

    // 5. The client's System page names where its Version came from.
    await home.goto(`/workspace?view=system&system=${own}&workspaceId=${businessId}`);
    const panel = home.getByRole("region", { name: /^Versions/ });
    await expect(panel.getByText("Source ·")).toBeVisible({ timeout: 60_000 });
    await noHorizontalOverflow(home);
    await home.screenshot({ path: testInfo.outputPath("version-system-page-390.png"), fullPage: true });
  } finally {
    if (setup) await cleanup(admin, { tenantIds: [setup.tenantId], workspaceIds: [setup.businessId], operatorEmail: setup.operator.email, people: [setup.operator, setup.owner] });
  }
});

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createSystemVersions, type JsonObject } from "@/platform/system-versions";
import { createSupabaseConnectionOwnership, createSupabaseVersionStore, readVersionActor, type VersionsDb } from "@/platform/system-versions/supabase-store";
import { adminClient, cleanup, convertedBusinessWithOwner, decisions, designateAgency, journeyEnvironment, localSql, noHorizontalOverflow } from "./support/journeys";

// Versions at 1.0, on real local Auth and Postgres: Strelva's agency shares a
// System as a source; the client's own Version of it goes live only when the
// owner approves it in Needs you. The agency publishes an improvement and
// "Review all" prepares it; nothing is live until the owner approves release 2.
// Shared improvements are offered, never forced. Creating the source and the
// Version uses the signed creation/preparation API and a mapped native application.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres (see docs/operations/testing-and-ci.md).");
test.beforeAll(() => { journeyEnvironment(); });
test.setTimeout(300_000);

const intake: JsonObject = { kind: "internal_app", title: "Team requests", fields: [{ id: "request", label: "Request", type: "text", required: true }], components: [{ kind: "form", fields: ["request"] }, { kind: "list", fields: ["request"] }] };

/** A System on the spine. Its rows are written through RPCs in the app, never by table grant, so directly here. */
function system(businessId: string, name: string, createdBy: string): string {
  const id = randomUUID();
  localSql("insert into public.systems(id, business_workspace_id, name, kind, command_id, command_digest, created_by, updated_by) values (:'v1'::uuid, :'v2'::uuid, :'v3', 'internal_app', gen_random_uuid(), repeat('a', 64), :'v4'::uuid, :'v4'::uuid) returning to_json(id);",
    id, businessId, name, createdBy);
  return id;
}

async function releases(versionId: string): Promise<number[]> {
  return localSql<number[]>("select coalesce(json_agg(number order by number), '[]') from public.system_version_releases where version_id = :'v1'::uuid;", versionId);
}

function nativeRelease(versionId: string): { number: number | null; title: string | null } {
  return localSql("select json_build_object('number',s.current_release_version,'title',r.spec->>'title') from public.system_version_native_applications n join public.application_states s on s.work_id=n.work_id left join public.application_releases r on r.work_id=s.work_id and r.version=s.current_release_version where n.version_id=:'v1'::uuid;", versionId);
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
    const sourceName = `Inquiry intake ${randomUUID().slice(0, 6)}`;
    const source = { businessId: agencyId, systemId: system(agencyId, sourceName, operator.userId) };
    const first = await versions.publishSourceRevision(agencyActor, { source, definition: intake, summary: "Intake" });
    await versions.shareSource(agencyActor, source, businessId);
    const env = journeyEnvironment();
    const created = await operator.context.request.post("/api/workspace/versions/manage", {
      headers: { origin: env.app },
      data: { action: "create", agencyWorkspaceId: agencyId, workspaceId: businessId, source: first.source,
        context: { kind: "agency_client", label: workspaceName }, name: "Team requests", commandId: randomUUID() },
    });
    expect(created.status(), await created.text()).toBe(201);
    const createdVersion = await created.json() as { systemId: string; versionId: string; rowRevision: number };
    const own = createdVersion.systemId;
    const version = { id: createdVersion.versionId };
    expect(localSql<number>("select count(*) from public.system_version_native_applications where version_id = :'v1'::uuid;", version.id)).toBe(1);
    expect(await releases(version.id)).toEqual([]);
    expect(nativeRelease(version.id)).toEqual({ number: null, title: null });
    const prepared = await owner.context.request.post("/api/workspace/versions/manage", {
      headers: { origin: env.app }, data: { action: "prepare_release", workspaceId: businessId, systemId: own,
        versionId: version.id, rowRevision: createdVersion.rowRevision },
    });
    expect(prepared.status(), await prepared.text()).toBe(200);
    expect((await prepared.json()).outcome).toBe("prepared");
    expect(await releases(version.id)).toEqual([]);

    // 1. Release 1 is the owner's decision.
    const home = await owner.context.newPage();
    await home.setViewportSize({ width: 1440, height: 900 });
    await home.goto(`/workspace?workspaceId=${businessId}`);
    const needsYou = home.getByRole("region", { name: /^Needs you/ });
    const ask = `Put the updated ${workspaceName} live`;
    await expect(needsYou.getByText(ask)).toBeVisible({ timeout: 60_000 });
    let decided = home.waitForResponse((r) => new URL(r.url()).pathname === "/api/workspace/needs-you" && r.request().method() === "POST");
    await needsYou.getByRole("button", { name: `Approve: ${ask}` }).click();
    expect((await (await decided).json()).status).toBe("done");
    await expect.poll(() => releases(version.id)).toEqual([1]);
    expect(nativeRelease(version.id)).toEqual({ number: 1, title: "Team requests" });

    // 2. The agency publishes an improvement. Nothing changes for the client yet.
    await versions.publishSourceRevision(agencyActor, { source, definition: { ...intake, title: "Team requests, improved" }, summary: "Clearer request title" });
    await home.reload();
    await expect(home.getByRole("region", { name: /^Needs you/ }).getByText(ask)).toHaveCount(0);

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
    expect(await releases(version.id)).toEqual([1]);
    expect(nativeRelease(version.id)).toEqual({ number: 1, title: "Team requests" });

    // 4. The owner sees what changed and approves release 2.
    await home.setViewportSize({ width: 390, height: 844 });
    await home.reload();
    const again = home.getByRole("region", { name: /^Needs you/ });
    await expect(again.getByText(ask)).toBeVisible({ timeout: 60_000 });
    await expect(again.getByText(/This becomes release 2\. What changed: title/)).toBeVisible();
    await noHorizontalOverflow(home);
    await home.screenshot({ path: testInfo.outputPath("owner-version-release-390.png"), fullPage: true });
    decided = home.waitForResponse((r) => new URL(r.url()).pathname === "/api/workspace/needs-you" && r.request().method() === "POST");
    await again.getByRole("button", { name: `Approve: ${ask}` }).click();
    expect((await (await decided).json()).status).toBe("done");
    await expect.poll(() => releases(version.id)).toEqual([1, 2]);
    const rows = (await decisions(admin, businessId, owner, true)).filter((item) => item.sourceLifecycle === "version_release" && item.sourceId === version.id);
    expect(rows.map((item) => item.state)).toEqual(["approved", "approved"]);
    expect(rows.every(item => item.decidedByKind === "owner_session" && item.outcome === "done")).toBe(true);
    expect(nativeRelease(version.id)).toEqual({ number: 2, title: "Team requests, improved" });

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

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import { websiteAuditSchema } from "../src/products/website-audit/work";
import { localEnvironment, signedInContext } from "./support/local-auth";
import { cleanup } from "./support/journeys";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Auth, Postgres, Redis and public HTTPS read access.");
test.setTimeout(300_000);

// One case in the native manifest. No routed responses, seeded audit/rebuild,
// private source, remote composer, site verification, publish or Make real.
const reportSchema = websiteAuditSchema.extend({ reportId: z.string().regex(/^audit_[a-f0-9]{32}$/) });
const rebuildSchema = z.object({ workId: z.string().uuid(), workspaceId: z.string().uuid(), rebuild: z.object({
  status: z.string(), sourceAudit: z.unknown().nullable(), lastError: z.unknown().nullable(),
  candidate: z.object({ document: z.object({ provenance: z.object({ composer: z.string() }) }) }).nullable(),
  audit: z.object({ scope: z.literal("html"), unavailable: z.array(z.string()) }).nullable(),
}) });
const systemsSchema = z.object({ systems: z.object({ status: z.literal("ready"), systems: z.array(z.object({
  ref: z.object({ systemId: z.string() }), connectedSite: z.object({ siteUrl: z.string() }).optional(),
})), possibilities: z.array(z.object({ id: z.string().uuid(), workId: z.string(), affects: z.array(z.string()), status: z.enum(["exploring", "ready"]), stored: z.literal(true), sourceSystemIds: z.array(z.string()).optional() })) }) });

function publicSource() {
  const url = new URL(process.env.STRELVA_PUBLIC_CHECK_PROOF_URL || "https://example.org/");
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("The public check proof requires a public HTTPS document without credentials or a custom port.");
  }
  // Do not weaken server DNS/SSRF checks. A fresh query keeps a prior Redis
  // audit from being mistaken for a network measurement from this run.
  url.searchParams.set("strelva_public_check_proof", randomUUID());
  return url.href;
}

test("a real anonymous URL check survives Auth and becomes private business evidence, an unverified System and a prepared Possibility", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  if (process.env.STRELVA_WEBSITE_MODEL_CALLS_ENABLED === "1" || process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Run this proof with website model calls disabled and no Blob write credential in both the runner and app server. It permits public reads and disposable local writes only.");
  }
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  // The local server has no Vercel edge. This one stable loopback attribution
  // exercises the real shared quota; never rotate addresses or reset its key.
  const anonymous = await browser.newContext({ baseURL: env.app, extraHTTPHeaders: { "x-forwarded-for": "127.0.0.1" } });
  let owner: Awaited<ReturnType<typeof signedInContext>> | null = null;
  let businessId = "";
  const sourceUrl = publicSource();
  const measurements: Record<string, unknown> = { sourceUrl, qualification: "not_completed", publicSourceControl: "not_proven", publication: "not_attempted" };
  try {
    expect((await anonymous.cookies()).some(cookie => cookie.name.startsWith("sb-"))).toBe(false);
    const publicPage = await anonymous.newPage();
    await publicPage.goto(`/audit?${new URLSearchParams({ url: sourceUrl })}`);
    await publicPage.getByLabel("Website address").fill(sourceUrl);
    const scanResponse = publicPage.waitForResponse(response => new URL(response.url()).pathname === "/api/audit/scan" && response.request().method() === "POST", { timeout: 120_000 });
    const started = Date.now();
    await publicPage.getByRole("button", { name: "Scan My Site", exact: true }).click();
    const scan = await scanResponse;
    const raw = await scan.json();
    measurements.scan = { elapsedMs: Date.now() - started, status: scan.status(), body: raw };
    // 429/503, missing retention, empty HTML or fallback-only scoring FAIL this
    // qualification. They are evidence of a limit/outage, never a green skip.
    expect(scan.status(), JSON.stringify(raw)).toBe(200);
    const report = reportSchema.parse(raw);
    expect(report.url).toBe(sourceUrl);
    expect(Date.parse(report.scannedAt)).toBeGreaterThanOrEqual(started - 1_000);
    const title = report.categories.flatMap(category => category.checks).find(check => check.name === "Title tag");
    expect(title?.score, "A numeric overall score alone does not prove the public HTML was read.").toBeGreaterThan(0);
    expect(title?.details?.trim().length).toBeGreaterThan(0);
    const publicResultPath = `/audit?${new URLSearchParams({ report: report.reportId })}`;
    await publicPage.goto(publicResultPath);
    await expect(publicPage.getByRole("link", { name: "Save to my work", exact: true })).toHaveAttribute("href", `/workspace?save=${report.reportId}`);
    const retained = await anonymous.request.get(`/api/audit/report/${report.reportId.slice(6)}`);
    expect(retained.status()).toBe(200);
    // The one-page export renders scores and priority fixes, not every check.
    // The interactive report must retain the actual measured source title.
    const titleCategory = report.categories.find(category => category.checks.some(check => check.name === "Title tag"))!;
    await publicPage.getByRole("button").filter({ has: publicPage.getByRole("heading", { name: titleCategory.name, exact: true }) }).click();
    await expect(publicPage.getByText(title!.details!, { exact: true })).toBeVisible();
    const retainedHtml = await retained.text();
    expect(retainedHtml).toContain("Site Health Report");
    expect(retainedHtml).toContain(new URL(sourceUrl).hostname);
    await publicPage.getByRole("link", { name: "Save to my work", exact: true }).click();
    await expect(publicPage.getByRole("heading", { name: "Sign in to open your private work.", exact: true })).toBeVisible();
    const signInHandoff = publicPage.getByRole("main").getByRole("link", { name: "Sign in", exact: true });
    await expect(signInHandoff).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(`/workspace?save=${report.reportId}`)}`);
    await signInHandoff.click();
    await expect(publicPage).toHaveURL(url => url.pathname === "/sign-in" && url.searchParams.get("next") === `/workspace?save=${report.reportId}`);

    owner = await signedInContext(browser, admin, "public-check-conversion"); // Real local Auth, no session stub.
    const page = await owner.context.newPage();
    await page.goto("/workspace/business/new");
    await page.getByLabel("Business name", { exact: true }).fill(`Public check proof ${randomUUID().slice(0, 8)}`);
    await page.getByRole("button", { name: "Continue with this business", exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === "/workspace" && Boolean(url.searchParams.get("workspaceId")));
    businessId = new URL(page.url()).searchParams.get("workspaceId")!;
    const membership = await admin.from("workspace_memberships").select("role").eq("workspace_id", businessId).eq("user_id", owner.userId).single();
    expect(membership.error).toBeNull(); expect(membership.data?.role).toBe("owner");
    await page.goto(`/workspace?${new URLSearchParams({ workspaceId: businessId, save: report.reportId })}`);
    const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/workspace" && response.request().method() === "POST");
    await page.getByRole("dialog").getByRole("button", { name: "Save a copy", exact: true }).click();
    const saved = await savedResponse;
    expect(saved.status(), await saved.text()).toBe(200);
    const rows = await admin.from("saved_product_work").select("id,input,payload").eq("workspace_id", businessId).eq("product_id", "website_audit");
    expect(rows.error).toBeNull(); expect(rows.data).toHaveLength(1);
    const stored = rows.data![0]!;
    expect(stored.input).toMatchObject({ sourceReportId: report.reportId });
    expect(websiteAuditSchema.parse(stored.payload)).toEqual(websiteAuditSchema.parse(report));
    const replay = await owner.context.request.post("/api/workspace", { headers: { origin: env.app }, data: { action: "save_website_audit", workspaceId: businessId, resultId: report.reportId } });
    expect(replay.status(), await replay.text()).toBe(200);
    const again = await admin.from("saved_product_work").select("id").eq("workspace_id", businessId).eq("product_id", "website_audit");
    expect(again.error).toBeNull(); expect(again.data).toEqual([{ id: stored.id }]);

    // Registration is a proposed connection, not ownership of example.org.
    // Never verify/install on this third-party public source.
    const connection = await owner.context.request.post("/api/workspace/connected-sites", { headers: { origin: env.app }, data: { action: "connect", workspaceId: businessId, siteUrl: sourceUrl, label: "Unverified public check reference" } });
    expect(connection.status(), await connection.text()).toBe(201);
    const site = z.object({ site: z.object({ systemId: z.string().uuid(), status: z.string(), verifiedAt: z.string().nullable() }) }).parse(await connection.json()).site;
    expect(site.status).toBe("active"); expect(site.verifiedAt).toBeNull();
    const buildStarted = Date.now();
    const created = await owner.context.request.post("/api/websites/rebuild", { headers: { origin: env.app }, data: { workspaceId: businessId, requestId: randomUUID(), url: sourceUrl } });
    expect([200, 202], await created.text()).toContain(created.status());
    const workId = rebuildSchema.parse(await created.json()).workId;
    let rebuild: z.infer<typeof rebuildSchema> | null = null;
    await expect.poll(async () => {
      const read = await owner!.context.request.get(`/api/websites/${workId}/rebuild?workspaceId=${businessId}`);
      expect(read.status(), await read.text()).toBe(200);
      rebuild = rebuildSchema.parse(await read.json());
      measurements.rebuild = { elapsedMs: Date.now() - buildStarted, status: rebuild.rebuild.status, lastError: rebuild.rebuild.lastError };
      if (rebuild.rebuild.status === "failed") throw new Error(`Real public crawl failed: ${JSON.stringify(rebuild.rebuild.lastError)}`);
      return rebuild.rebuild.status;
    }, { timeout: 180_000, intervals: [1_000, 2_000, 5_000] }).toBe("review_ready");
    const prepared = rebuildSchema.parse(rebuild);
    expect(prepared.rebuild.sourceAudit).not.toBeNull();
    expect(prepared.rebuild.candidate?.document.provenance.composer).toBe("rules");
    expect(prepared.rebuild.audit?.scope).toBe("html");
    expect(prepared.rebuild.audit?.unavailable).toContain("PageSpeed and Lighthouse performance");
    expect(prepared.rebuild.audit?.unavailable).toContain("Live hosted response");
    const workspace = await owner.context.request.get(`/api/workspace?workspaceId=${businessId}`);
    expect(workspace.status(), await workspace.text()).toBe(200);
    const projection = systemsSchema.parse(await workspace.json()).systems;
    expect(projection.systems.some(system => system.ref.systemId === site.systemId)).toBe(true);
    const possibility = projection.possibilities.find(item => item.workId === workId);
    expect(possibility, "A saved rebuild alone does not prove System/Possibility conversion.").toBeDefined();
    expect(possibility!.sourceSystemIds).toContain(site.systemId);
    expect(possibility!.status).toBe("exploring");
    expect(possibility!.affects, "An unverified third-party reference is not a publication target.").not.toContain(site.systemId);
    const compare = await owner.context.request.get(`/api/workspace/systems/possibilities?${new URLSearchParams({ workspaceId: businessId, possibilityId: possibility!.id })}`);
    expect(compare.status(), await compare.text()).toBe(200);
    const candidate = z.object({ possibility: z.object({
      id: z.string().uuid(), introduces: z.array(z.object({ key: z.string(), name: z.string() })),
      changes: z.array(z.object({ systemId: z.string() })),
    }) }).parse(await compare.json()).possibility;
    expect(candidate.id).toBe(possibility!.id);
    expect(candidate.introduces.length, "Public-source conversion must introduce a separately owned native website.").toBeGreaterThan(0);
    expect(candidate.changes.some(change => change.systemId === site.systemId)).toBe(false);
    const stillUnverified = await owner.context.request.get(`/api/workspace/connected-sites?workspaceId=${businessId}`);
    expect(stillUnverified.status()).toBe(200);
    const sources = z.object({ sites: z.array(z.object({ systemId: z.string(), verifiedAt: z.string().nullable() })) }).parse(await stillUnverified.json());
    expect(sources.sites.find(item => item.systemId === site.systemId)?.verifiedAt).toBeNull();
    measurements.conversion = { savedWorkId: stored.id, systemId: site.systemId, possibilityId: possibility!.id, status: possibility!.status, auditScope: prepared.rebuild.audit?.scope, unavailable: prepared.rebuild.audit?.unavailable };
    // Readiness is the owner's exact business read, not a guessed compile wait.
    const systemRead = page.waitForResponse(response => {
      const url = new URL(response.url());
      return response.request().method() === "GET"
        && url.origin === new URL(env.app).origin
        && url.pathname === "/api/workspace"
        && url.searchParams.get("workspaceId") === businessId;
    }, { timeout: 5_000 });
    const [systemResponse] = await Promise.all([
      systemRead,
      page.goto(`/workspace?${new URLSearchParams({ workspaceId: businessId, view: "system", system: site.systemId })}`, { timeout: 30_000 }),
    ]);
    expect(systemResponse.status(), "The actual owner's exact business projection must load before the System's controls.").toBe(200);
    const browserProjection = systemsSchema.parse(await systemResponse.json()).systems;
    expect(browserProjection.systems.some(system => system.ref.systemId === site.systemId)).toBe(true);
    expect(browserProjection.possibilities.find(item => item.id === possibility!.id)).toMatchObject({
      workId, status: "exploring", sourceSystemIds: expect.arrayContaining([site.systemId]),
    });
    // The count is part of the existing SystemPanel heading's accessible name.
    const possibilitiesName = /^Possibilities(?:\s*\d+)?$/;
    const possibilitiesPanel = page.getByRole("region", { name: possibilitiesName });
    await expect(possibilitiesPanel.getByRole("heading", { name: possibilitiesName })).toBeVisible();
    await expect(possibilitiesPanel.getByText("Exploring", { exact: true })).toBeVisible();
    await expect(possibilitiesPanel.getByRole("button", { name: "Make real", exact: true })).toBeDisabled();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`public-check-conversion-${width}.png`), fullPage: true });
    }
    measurements.qualification = "public_read_and_local_conversion_only";
  } finally {
    await testInfo.attach("actual-public-check-and-conversion", { body: Buffer.from(JSON.stringify(measurements, null, 2)), contentType: "application/json" });
    await anonymous.close().catch(() => undefined);
    // Native website documents/receipts are immutable and restrict their work
    // and creator. The established disposable-stack teardown preserves them
    // until stack disposal; a direct workspace delete must not mask UI failure.
    if (owner) await cleanup(admin, { workspaceIds: businessId ? [businessId] : [], people: [owner] });
  }
});

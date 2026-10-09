import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page, type Response } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";
import { ordinaryAgencyMaker, ordinaryCustomerBusiness } from "./support/ordinary-agency-maker";
import { websiteRebuildSchema, type WebsiteRebuild } from "../src/products/websites/client";
import type { WorkspaceSnapshot } from "../src/experience/workspace/contracts";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase and real local Auth.");
test.setTimeout(120_000);

async function readRebuild(request: APIRequestContext, workspaceId: string, workId: string) {
  const response = await request.get(`/api/websites/${workId}/rebuild?workspaceId=${workspaceId}`);
  expect(response.status(), await response.text()).toBe(200);
  return websiteRebuildSchema.parse((await response.json()).rebuild);
}
function mutation(page: Page, path: string) {
  return page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === "POST");
}
async function snapshot(request: APIRequestContext, workspaceId: string) {
  const response = await request.get(`/api/workspace?workspaceId=${workspaceId}`);
  expect(response.status(), await response.text()).toBe(200);
  return await response.json() as WorkspaceSnapshot;
}

async function exactPreview(page: Page, observed: Response[], href: string, contentHash: string, app: string) {
  const expectedUrl = new URL(href, app).toString();
  const matches = (response: Response) => response.url() === expectedUrl && response.request().method() === "GET" && response.request().resourceType() === "document";
  // Observe before building/navigation so a fast iframe response cannot be
  // missed; a cold or stalled exact response still has a finite phase budget.
  const response = observed.find(matches) ?? await page.waitForResponse(matches, { timeout: 20_000 });
  expect(response.status(), await response.text()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/html");
  expect(await response.text()).toContain(`content="${contentHash}"`);
  return response;
}

const contactParagraph = "Email:orders@example.test or call 716-555-0100 for orders.";
const contacts = [
  { text:"orders@example.test", href:"mailto:orders@example.test", label:"Email us" },
  { text:"716-555-0100", href:"tel:7165550100", label:"Call us" },
];
function suppliedContactFacts(rebuild: WebsiteRebuild) {
  const document = rebuild.candidate!.document;
  const claim = Object.entries(document.facts).find(([,fact]) => fact.kind === "claim" && fact.text === contactParagraph);
  expect(claim).toBeDefined(); expect(claim![1]).toMatchObject({ origin:"owner_stated",sources:[] });
  return contacts.map(contact => {
    const entry = Object.entries(document.facts).find(([,fact]) => fact.kind === "contact" && fact.text === contact.text);
    expect(entry, `The native document must retain the explicitly supplied ${contact.text}.`).toBeDefined();
    const [id,fact] = entry!;
    expect(fact).toMatchObject({ origin:"owner_stated",sources:[],verification:{ supported:true } });
    const cta = Object.values(document.nodes).find(node => node.type === "Cta" && node.factIds.includes(id));
    expect(cta?.props).toMatchObject({ cta:{ label:contact.label,href:contact.href } });
    expect(Object.values(document.nodes).some(node => node.factIds.includes(claim![0]) && node.factIds.includes(id))).toBe(true);
    return { id,fact };
  });
}
function exactContactHtml(html: string) {
  for (const contact of contacts) expect(html).toContain(`href="${contact.href}"`);
  expect(html).not.toContain('href="tel:716-555-0100"');
}

for (const width of [1440, 390]) {
  // Keep the closed full-native case identities. This now exercises the shipped
  // v2 journey rather than asking the current UI to render the old v1 labels.
  test(`website creation, preview, approval and revision persist at ${width}px`, async ({ browser }, testInfo) => {
    const env = localEnvironment();
    const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
    const owner = await signedInContext(browser, admin, "website-owner");
    const stranger = await signedInContext(browser, admin, "website-stranger");
    const maker = await signedInContext(browser, admin, "website-maker");
    let workspaceId = "";
    let agencyId = "";
    const description = "We bake sourdough bread for neighborhood pickup every Saturday.";
    const correction = "We bake sourdough bread and deliver catering boxes for local offices.";
    const descriptionWithContacts = `${description}\n\n${contactParagraph}`;
    try {
      expect(process.env.STRELVA_WEBSITE_REBUILD_RELEASE).toBe("1");
      const sitesOrigin = new URL(process.env.NEXT_PUBLIC_SITES_PATH_ORIGIN || "https://unconfigured.example.test");
      // Never follow a production/provider URL from this disposable proof.
      expect(sitesOrigin.protocol).toBe("http:");
      expect(sitesOrigin.hostname).toBe("sites.localhost");
      expect(sitesOrigin.port).toBe(new URL(env.app).port);
      const browserOrigins = new Set([env.app, new URL(env.url).origin, sitesOrigin.origin]);
      for (const person of [owner, stranger, maker]) {
        // A compatibility System frame must not turn this local journey into
        // an outside-provider or production-site read.
        await person.context.route("**/*", route => browserOrigins.has(new URL(route.request().url()).origin) ? route.continue() : route.abort());
        expect((await person.context.request.get("/api/workspace")).status()).toBe(200);
      }
      workspaceId = await ordinaryCustomerBusiness(owner, "Website creation proof");
      agencyId = (await ordinaryAgencyMaker(browser, admin, owner, workspaceId, maker)).agencyId;
      const page = await owner.context.newPage();
      const previewResponses: Response[] = [];
      page.on("response", response => {
        if (response.request().method() === "GET" && response.request().resourceType() === "document" && /^\/api\/websites\/[^/]+\/preview$/.test(new URL(response.url()).pathname)) previewResponses.push(response);
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/workspace/site?workspaceId=${workspaceId}&entry=rebuild`);
      await page.getByRole("button", { name: "No site yet? Describe your business", exact: true }).click();
      await page.getByLabel("Business name", { exact: true }).fill("Juniper Bread");
      await page.getByLabel("Describe your business", { exact: true }).fill(descriptionWithContacts);
      const creating = mutation(page, "/api/websites/rebuild");
      await page.getByRole("button", { name: "Build a private preview", exact: true }).click();
      const created = await creating;
      expect(created.status(), await created.text()).toBe(202);
      const initial = await created.json();
      const workId = String(initial.workId);
      expect(initial.workspaceId).toBe(workspaceId);
      expect(initial.rebuild).toMatchObject({ version: 2, status: "building", input: { businessName: "Juniper Bread", description:descriptionWithContacts } });
      await expect(page).toHaveURL(new RegExp(`workId=${workId}`));
      // The current start is asynchronous (202 + saved stages + 2.5s UI
      // polling). Bound this native build phase inside the unchanged case budget;
      // a failed or stalled real pipeline must fail before preview assertions.
      await expect.poll(async () => (await readRebuild(owner.context.request, workspaceId, workId)).status,
        { timeout: 30_000, intervals: [500, 1000, 2500], message: "The native website build must reach review_ready; no fixture candidate is substituted." }).toBe("review_ready");
      const first = await readRebuild(owner.context.request, workspaceId, workId);
      expect(first.status).toBe("review_ready");
      expect(first.candidate).not.toBeNull();
      expect(first.stages.filter(stage => stage.status === "completed").map(stage => stage.stage)).toEqual(expect.arrayContaining(["crawl", "extract", "write", "compose", "verify"]));
      const initialContacts = suppliedContactFacts(first);
      const initialPreview = await exactPreview(page, previewResponses, first.candidate!.previewHref, first.candidate!.contentHash, env.app);
      exactContactHtml(await initialPreview.text());
      const preview = page.frameLocator('iframe[title="Private website preview for Juniper Bread"]');
      await expect(preview.getByRole("heading", { name: "Juniper Bread", exact: true }).first()).toBeVisible();
      await expect(preview.getByText(description, { exact: true }).first()).toBeVisible();
      expect(await preview.locator('meta[name="strelva-site-hash"]').getAttribute("content")).toBe(first.candidate!.contentHash);
      for (const contact of contacts) await expect(preview.getByRole("link",{ name:contact.label,exact:true }).first()).toHaveAttribute("href",contact.href);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      const connectionResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/websites/${workId}/connections` && response.request().method() === "GET");
      await page.getByRole("button", { name: "Choose forms", exact: true }).click();
      const connectionOptions = await connectionResponse;
      expect(connectionOptions.status(), await connectionOptions.text()).toBe(200);
      await expect(page.getByText("No published forms are available from websites connected to this business.", { exact: true })).toBeVisible();

      const approving = mutation(page, `/api/websites/${workId}/approve`);
      await page.getByRole("button", { name: "Approve this preview", exact: true }).click();
      const approvedResponse = await approving;
      expect(approvedResponse.status(), await approvedResponse.text()).toBe(200);
      await expect(page.getByText("This exact preview is approved.", { exact: true }).first()).toBeVisible();
      await page.reload();
      await expect(page.getByRole("button", { name: "Publish approved website", exact: true })).toBeVisible();
      const launching = mutation(page, `/api/websites/${workId}/launch`);
      await page.getByRole("button", { name: "Publish approved website", exact: true }).click();
      const launched = await launching;
      expect(launched.status(), await launched.text()).toBe(200);
      const publication = websiteRebuildSchema.parse((await launched.json()).rebuild);
      expect(publication.status).toBe("published");
      expect(publication.launch.receipt).toMatchObject({ provider: "strelva-hosted", artifactHash: first.candidate!.contentHash, candidateRevision: first.candidate!.revision });
      expect(publication.launch.readBack?.status).toBe("verified");
      expect(new URL(publication.launch.receipt!.providerUrl).origin).toBe(sitesOrigin.origin);
      const servedSite = (url: string) => { const target = new URL(url); expect(target.origin).toBe(sitesOrigin.origin); return stranger.context.request.get(`${env.app}${target.pathname.replace(/\/$/, "")}`, { headers: { host: sitesOrigin.host }, maxRedirects: 0 }); };
      const live = await servedSite(publication.launch.receipt!.providerUrl);
      expect(live.status(), await live.text()).toBe(200);
      expect(await live.text()).toContain(`content="${first.candidate!.contentHash}"`);
      exactContactHtml(await live.text());
      await expect(page.getByText("The published document was verified.", { exact: true })).toBeVisible();

      // A real selected/staffed ordinary agency corrects the supported detail
      // through the actual UI, after publication. No owner-role overlay.
      const makerPage = await maker.context.newPage();
      await makerPage.setViewportSize({ width, height: 900 });
      await makerPage.goto(`/workspace?workspaceId=${workspaceId}&view=websites&work=${workId}`);
      await makerPage.locator("summary").filter({ hasText: "Edit website facts" }).click();
      const detail = makerPage.getByRole("article", { name: description, exact: true });
      await detail.getByRole("button", { name: "Edit fact", exact: true }).focus();
      await makerPage.keyboard.press("Enter");
      await expect(detail.getByLabel("Corrected fact", { exact: true })).toBeFocused();
      await detail.getByLabel("Corrected fact", { exact: true }).fill(correction);
      const correcting = makerPage.waitForResponse(response => new URL(response.url()).pathname.startsWith(`/api/websites/${workId}/facts/`) && response.request().method() === "POST");
      await detail.getByRole("button", { name: "Save correction", exact: true }).click();
      const correctedResponse = await correcting;
      expect(correctedResponse.status(), await correctedResponse.text()).toBe(200);
      const revised = websiteRebuildSchema.parse((await correctedResponse.json()).rebuild);
      await expect(makerPage.getByRole("article", { name: correction, exact: true }).getByRole("button", { name: "Edit fact", exact: true })).toBeFocused();
      expect(revised.status).toBe("review_ready");
      expect(revised.approvedCandidateRevision).toBeNull();
      expect(revised.candidate!.contentHash).not.toBe(first.candidate!.contentHash);
      expect(revised.input).toEqual(first.input);
      expect(suppliedContactFacts(revised)).toEqual(initialContacts);
      const oldLive = await servedSite(publication.launch.receipt!.providerUrl);
      expect(oldLive.status()).toBe(200);
      expect(await oldLive.text()).toContain(`content="${first.candidate!.contentHash}"`);
      expect(await oldLive.text()).not.toContain(correction);
      exactContactHtml(await oldLive.text());
      const staleApproval = await owner.context.request.post(`/api/websites/${workId}/approve`, {
        headers: { origin: env.app },
        data: { expectedRevision: revised.revision, candidateRevision: first.candidate!.revision, candidateContentHash: first.candidate!.contentHash },
      });
      expect(staleApproval.status()).toBe(409);

      const current = await snapshot(owner.context.request, workspaceId);
      expect(current.systems?.status).toBe("ready");
      const system = current.systems!.systems.find(item => item.savedWorkId === workId);
      expect(system?.kind).toBe("website");
      const possibility = current.systems!.possibilities.find(item => item.workId === workId);
      expect(possibility?.affects).toContain(system!.ref.systemId);
      expect(possibility?.previewHref).toBe(revised.candidate!.previewHref);
      await page.goto(`/workspace?workspaceId=${workspaceId}&view=system&system=${system!.ref.systemId}`);
      await expect(page.getByRole("heading", { name: /^Possibilities/ })).toBeVisible();
      const possibilityLink = page.locator(`a[href="${possibility!.tryHref || `/workspace?workspaceId=${workspaceId}&view=websites&work=${workId}`}"]`).first();
      await expect(possibilityLink).toBeVisible();
      await possibilityLink.click();
      const revisedPreview = await exactPreview(page, previewResponses, revised.candidate!.previewHref, revised.candidate!.contentHash, env.app);
      exactContactHtml(await revisedPreview.text());
      await expect(preview.locator('meta[name="strelva-site-hash"]')).toHaveAttribute("content", revised.candidate!.contentHash);
      await expect(preview.getByText(correction, { exact: true }).first()).toBeVisible();
      for (const contact of contacts) await expect(preview.getByRole("link",{ name:contact.label,exact:true }).first()).toHaveAttribute("href",contact.href);
      const approveRevision = mutation(page, `/api/websites/${workId}/approve`);
      await page.getByRole("button", { name: "Approve this preview", exact: true }).click();
      const finalApproval = await approveRevision;
      expect(finalApproval.status(), await finalApproval.text()).toBe(200);
      const publishRevision = mutation(page, `/api/websites/${workId}/launch`);
      await page.getByRole("button", { name: "Publish approved website", exact: true }).click();
      const finalPublication = await publishRevision;
      expect(finalPublication.status(), await finalPublication.text()).toBe(200);
      const final = websiteRebuildSchema.parse((await finalPublication.json()).rebuild);
      expect(final.launch.receipt).toMatchObject({ provider: "strelva-hosted", artifactHash: revised.candidate!.contentHash, candidateRevision: revised.candidate!.revision });
      expect(final.launch.readBack?.status).toBe("verified");
      await page.reload();
      await expect(page.getByText("The published document was verified.", { exact: true })).toBeVisible();
      const freshLive = await servedSite(final.launch.receipt!.providerUrl);
      expect(freshLive.status(), await freshLive.text()).toBe(200);
      expect(await freshLive.text()).toContain(`content="${revised.candidate!.contentHash}"`);
      expect(await freshLive.text()).toContain(correction);
      exactContactHtml(await freshLive.text());
      expect(suppliedContactFacts(final)).toEqual(initialContacts);

      const archiveHref = await page.getByRole("link", { name: "Export website and evidence", exact: true }).getAttribute("href");
      expect(archiveHref).toContain(`contentHash=${revised.candidate!.contentHash}`);
      const exported = await owner.context.request.get(archiveHref!);
      expect(exported.status(), await exported.text()).toBe(200);
      expect(exported.headers()["content-type"]).toBe("application/x-tar");
      expect((await exported.body()).toString("utf8")).toContain("site-document.json");
      expect((await stranger.context.request.get(archiveHref!)).status()).toBe(403);
      const denied = await stranger.context.request.get(`/api/websites/${workId}/rebuild?workspaceId=${workspaceId}`);
      expect(denied.status()).toBe(403);
      expect(await denied.text()).not.toContain("Juniper Bread");
      expect([401, 403, 404]).toContain((await stranger.context.request.get(revised.candidate!.previewHref)).status());
      const persisted = await admin.from("saved_product_work").select("product_id,resource_kind,payload").eq("id", workId).single();
      expect(persisted.error).toBeNull();
      expect(persisted.data).toMatchObject({ product_id: "websites", resource_kind: "website" });
      const saved = websiteRebuildSchema.parse(persisted.data!.payload);
      expect(saved.candidate!.contentHash).toBe(revised.candidate!.contentHash);
      expect(suppliedContactFacts(saved)).toEqual(initialContacts);
      await testInfo.attach("native-website-publication", { body: JSON.stringify({ workId, workspaceId, systemId: system!.ref.systemId, possibilityId: possibility!.id, contacts: contacts.map((contact,index) => ({ ...contact,factId:initialContacts[index]!.id })), initialHash: first.candidate!.contentHash, finalHash: revised.candidate!.contentHash, receipt: final.launch.receipt, readBack: final.launch.readBack, qualification: "Owned loopback native document publication; paid model, production provider and domain qualification remain separate." }), contentType: "application/json" });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/strelva-website-creation-${width}.png`, fullPage: true });
      const websiteFrame = page.locator('iframe[title="Private website preview for Juniper Bread"]');
      await websiteFrame.scrollIntoViewIfNeeded();
      await websiteFrame.screenshot({ path: `/tmp/strelva-website-rendered-${width}.png` });
    } finally {
      if (workspaceId) await admin.from("workspaces").delete().eq("id", workspaceId);
      if (agencyId) await admin.from("workspaces").delete().eq("id", agencyId);
      for (const person of [owner, stranger, maker]) {
        await person.context.close();
        await admin.auth.admin.deleteUser(person.userId);
      }
    }
  });
}

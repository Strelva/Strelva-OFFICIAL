import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase and real local Auth.");
test.setTimeout(120_000);

for (const width of [1440, 390]) {
  test(`website creation, preview, approval and revision persist at ${width}px`, async ({ browser }) => {
    const env = localEnvironment();
    const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
    const owner = await signedInContext(browser, admin, "website-owner");
    const stranger = await signedInContext(browser, admin, "website-stranger");
    let workspaceId = "";
    try {
      const workspace = await admin.from("workspaces").insert({ kind: "personal", name: "Website creation proof", created_by: owner.userId }).select("id").single();
      expect(workspace.error).toBeNull();
      workspaceId = workspace.data!.id;
      const membership = await admin.from("workspace_memberships").insert({ workspace_id: workspaceId, user_id: owner.userId, role: "owner", created_by: owner.userId });
      expect(membership.error).toBeNull();
      const page = await owner.context.newPage();
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/workspace?workspaceId=${workspaceId}&view=websites`);
      await page.getByLabel("Business name", { exact: true }).fill("Juniper Bread");
      await page.getByLabel("What does the business do?", { exact: true }).fill("We bake sourdough bread for neighborhood pickup every Saturday.");
      await page.getByLabel("Contact email (optional)", { exact: true }).fill("orders@example.test");
      const createResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/websites" && response.request().method() === "POST");
      await page.getByRole("button", { name: "Generate a private preview", exact: true }).click();
      const created = await createResponse;
      expect(created.status(), await created.text()).toBe(201);
      const record = await created.json();
      const workId = record.workId;
      expect(record.website.status).toBe("preview_ready");
      await expect(page).toHaveURL(new RegExp(`work=${workId}`));
      const preview = page.frameLocator('iframe[title="Generated website preview for Juniper Bread"]');
      await expect(preview.getByRole("heading", { name: /Juniper Bread/ }).first()).toBeVisible();
      await expect(preview.getByText(/sourdough bread/).first()).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      const connectionResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/websites/${workId}/connections`);
      await page.getByRole("button", { name: "Choose forms", exact: true }).click();
      const connectionOptions = await connectionResponse;
      expect(connectionOptions.status(), await connectionOptions.text()).toBe(200);
      await expect(page.getByText("No published forms are available from websites connected to this business.", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Approve this preview", exact: true }).click();
      await expect(page.getByText("Approved revision", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText("Approved revision", { exact: true })).toBeVisible();
      await expect(preview.getByText(/sourdough bread/).first()).toBeVisible();
      const exported = await owner.context.request.get(record.website.candidate.preview.href.replace("/preview", "/export"));
      expect(exported.status(), await exported.text()).toBe(200);
      expect(exported.headers()["content-type"]).toBe("application/x-tar");
      expect((await exported.body()).toString("utf8")).toContain("scripts/build-site.mjs");

      // Requires STRELVA_SITES_DOMAIN=sites.localhost:<port> on the app under test.
      const publishResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/websites/${workId}` && response.request().method() === "POST");
      await page.getByRole("button", { name: "Publish website", exact: true }).click();
      const publishedResponse = await publishResponse;
      expect(publishedResponse.status(), await publishedResponse.text()).toBe(200);
      const published = await publishedResponse.json();
      expect(published.website.status).toBe("published");
      expect(published.website.launch.receipt).toMatchObject({ provider: "strelva_hosted", artifactHash: record.website.candidate.contentHash });
      const siteUrl = published.website.publication.url;
      expect(siteUrl).toMatch(/^http:\/\/juniper-bread(-[a-z0-9]+)?\.sites\.localhost:\d+$/);
      await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();
      await page.reload();
      await expect(page.getByRole("button", { name: "Take website offline", exact: true })).toBeVisible();

      // Anyone can visit the live site, without a session, on its own host.
      const visitor = await browser.newContext();
      const site = await visitor.newPage();
      const visit = await site.goto(siteUrl);
      expect(visit?.status()).toBe(200);
      expect(visit?.headers()["set-cookie"]).toBeUndefined();
      await expect(site.getByRole("heading", { name: /Juniper Bread/ }).first()).toBeVisible();
      await expect(site.getByText(/sourdough bread/).first()).toBeVisible();

      await page.getByLabel("What does the business do?", { exact: true }).fill("We bake sourdough bread and deliver catering boxes for local offices.");
      await page.getByRole("button", { name: "Generate a new preview", exact: true }).click();
      await expect(page.getByText("Private preview ready", { exact: true })).toBeVisible();
      await expect(preview.getByText(/catering boxes/).first()).toBeVisible();
      const current = await owner.context.request.get(`/api/websites/${workId}?workspaceId=${workspaceId}`);
      expect(current.status()).toBe(200);
      const revised = await current.json();
      expect(revised.website.approvedCandidateRevision).toBeNull();
      expect(revised.website.launch.receipt).toBeNull();
      expect(revised.website.publication).toMatchObject({ status: "live", url: siteUrl });
      await site.reload();
      await expect(site.getByText(/sourdough bread for neighborhood pickup/).first()).toBeVisible();
      expect(await site.content()).not.toContain("catering boxes");

      const offline = await owner.context.request.post(`/api/websites/${workId}`, { headers: { origin: env.app }, data: { action: "takeOffline", expectedRevision: revised.website.revision } });
      expect(offline.status(), await offline.text()).toBe(200);
      expect((await site.goto(siteUrl))?.status()).toBe(404);
      await visitor.close();
      expect(revised.website.candidate.contentHash).not.toBe(record.website.candidate.contentHash);
      const staleApproval = await owner.context.request.post(`/api/websites/${workId}`, {
        headers: { origin: env.app },
        data: { action: "approve", expectedRevision: revised.website.revision, candidateRevision: record.website.candidate.revision, candidateContentHash: record.website.candidate.contentHash },
      });
      expect(staleApproval.status()).toBe(409);
      const denied = await stranger.context.request.get(`/api/websites/${workId}?workspaceId=${workspaceId}`);
      expect(denied.status()).toBe(403);
      expect(await denied.text()).not.toContain("Juniper Bread");
      const privatePreview = await stranger.context.request.get(revised.website.candidate.preview.href);
      expect([401, 403, 404]).toContain(privatePreview.status());
      const persisted = await admin.from("saved_product_work").select("product_id,resource_kind,payload").eq("id", workId).single();
      expect(persisted.error).toBeNull();
      expect(persisted.data?.product_id).toBe("websites");
      expect(persisted.data?.resource_kind).toBe("website");
      await page.screenshot({ path: `/tmp/strelva-website-creation-${width}.png`, fullPage: true });
      const websiteFrame = page.locator('iframe[title="Generated website preview for Juniper Bread"]');
      await websiteFrame.scrollIntoViewIfNeeded();
      await websiteFrame.screenshot({ path: `/tmp/strelva-website-rendered-${width}.png` });
    } finally {
      if (workspaceId) await admin.from("workspaces").delete().eq("id", workspaceId);
      await owner.context.close();
      await stranger.context.close();
      await admin.auth.admin.deleteUser(owner.userId);
      await admin.auth.admin.deleteUser(stranger.userId);
    }
  });
}

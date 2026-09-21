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
      const preparationResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/websites/${workId}` && response.request().method() === "POST");
      await page.getByRole("button", { name: "Prepare launch", exact: true }).click();
      const preparedResponse = await preparationResponse;
      expect(preparedResponse.status(), await preparedResponse.text()).toBe(200);
      const prepared = await preparedResponse.json();
      expect(prepared.website.launch.receipt.provider).toBe("local_export");
      expect(prepared.website.launch.receipt.artifactHash).toBe(record.website.candidate.contentHash);
      expect(prepared.website.status).not.toBe("published");
      await expect(page.getByText("Launch files ready", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText("Launch files ready", { exact: true })).toBeVisible();
      const exported = await owner.context.request.get(prepared.website.launch.receipt.providerUrl);
      expect(exported.status(), await exported.text()).toBe(200);
      expect(exported.headers()["content-type"]).toBe("application/x-tar");
      expect((await exported.body()).toString("utf8")).toContain("scripts/build-site.mjs");
      expect((await stranger.context.request.get(prepared.website.launch.receipt.providerUrl)).status()).toBe(403);
      await page.getByLabel("What does the business do?", { exact: true }).fill("We bake sourdough bread and deliver catering boxes for local offices.");
      await page.getByRole("button", { name: "Generate a new preview", exact: true }).click();
      await expect(page.getByText("Private preview ready", { exact: true })).toBeVisible();
      await expect(preview.getByText(/catering boxes/).first()).toBeVisible();
      const current = await owner.context.request.get(`/api/websites/${workId}?workspaceId=${workspaceId}`);
      expect(current.status()).toBe(200);
      const revised = await current.json();
      expect(revised.website.approvedCandidateRevision).toBeNull();
      expect(revised.website.launch.receipt).toBeNull();
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
